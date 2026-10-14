import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventTracker, describeErrors, TRIGGERS } from '../src/events.js';

const entry = { serial: 'SN1', family: 'ET' };
const DEVICE = 'ext:goodwe:inverter:SN1';
const options = { surplusThreshold: 500 };
const reading = (patch) => ({
  pv_power: 0,
  grid_power: 300,
  pv_energy_today: 0,
  error_codes: 0,
  ...patch,
});

function run(tracker, patch) {
  return tracker.update(entry, DEVICE, reading(patch), options).map((event) => event.key);
}

test('no event on the first reading after a start', () => {
  const tracker = createEventTracker();
  assert.deepEqual(run(tracker, { pv_power: 3000, grid_power: -2000, error_codes: 4 }), []);
});

test('a sunny day: production and surplus, with hysteresis', () => {
  const tracker = createEventTracker();
  run(tracker, { pv_power: 0 });
  assert.deepEqual(run(tracker, { pv_power: 30 }), [], 'under 50 W: not started yet');
  assert.deepEqual(run(tracker, { pv_power: 120 }), [TRIGGERS.PRODUCTION_STARTED]);
  assert.deepEqual(run(tracker, { pv_power: 2000, grid_power: -600 }), [TRIGGERS.SURPLUS_STARTED]);
  assert.deepEqual(
    run(tracker, { pv_power: 1500, grid_power: -300 }),
    [],
    'above half the threshold',
  );
  assert.deepEqual(run(tracker, { pv_power: 900, grid_power: -100 }), [TRIGGERS.SURPLUS_STOPPED]);
  assert.deepEqual(run(tracker, { pv_power: 20 }), [], 'over 5 W: still producing');
  const events = tracker.update(
    entry,
    DEVICE,
    reading({ pv_power: 0, pv_energy_today: 18.4 }),
    options,
  );
  assert.deepEqual(events, [
    { key: TRIGGERS.PRODUCTION_STOPPED, data: { device: DEVICE, energy_today: 18.4 } },
  ]);
});

test('a new error code fires once, with its description', () => {
  const tracker = createEventTracker();
  run(tracker, {});
  const events = tracker.update(entry, DEVICE, reading({ error_codes: 1 << 9 }), options);
  assert.deepEqual(events, [
    {
      key: TRIGGERS.INVERTER_FAULT,
      data: { device: DEVICE, error_code: 512, error: 'Utility Loss' },
    },
  ]);
  assert.deepEqual(run(tracker, { error_codes: 1 << 9 }), [], 'same code: no new event');
});

test('unreachable then reachable fire once each', () => {
  const tracker = createEventTracker();
  run(tracker, {});
  assert.deepEqual(
    tracker.unreachable(entry, DEVICE).map((e) => e.key),
    [TRIGGERS.INVERTER_UNREACHABLE],
  );
  assert.deepEqual(tracker.unreachable(entry, DEVICE), []);
  assert.deepEqual(run(tracker, {}), [TRIGGERS.INVERTER_REACHABLE]);
});

test('an inverter unreachable since the start does not fire "back online"', () => {
  const tracker = createEventTracker();
  assert.deepEqual(tracker.unreachable(entry, DEVICE), []);
  assert.deepEqual(run(tracker, {}), []);
});

test('error codes of the other families are not decoded', () => {
  assert.equal(describeErrors(0, 'ET'), '');
  assert.equal(describeErrors(5, 'DT'), 'Error code 5');
  assert.equal(describeErrors(0b11, 'ET'), 'AC HCT Check Failure, GFCI Device Check Failure');
});
