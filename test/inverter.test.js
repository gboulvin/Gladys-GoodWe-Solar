// The driver against fake inverters answering with frames captured on real
// GW10K-ET, GW17KT-DT and GW5048D-ES units. The expected values are the ones
// the reference `goodwe` library decodes from the same frames.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUdpClient, NoResponseError } from '../src/goodwe/udpClient.js';
import {
  probeInverter,
  readInverter,
  setBatteryDod,
  setExportLimit,
  setOperationMode,
  UnsupportedOperationError,
} from '../src/goodwe/inverter.js';
import { DT_ANSWERS, ES_ANSWERS, ET_ANSWERS, startFakeInverter } from './helpers/fakeInverter.js';

async function withInverter(answers, run) {
  const fake = await startFakeInverter(answers);
  const client = createUdpClient({ port: fake.port, timeoutMs: 150, retries: 0 });
  try {
    await run(client, fake);
  } finally {
    await fake.close();
  }
}

test('ET hybrid: identity and live values', async () => {
  await withInverter(ET_ANSWERS(), async (client) => {
    const inv = await probeInverter(client, '127.0.0.1');
    assert.equal(inv.family, 'ET');
    assert.equal(inv.serial, '9010KETU000W0000');
    assert.equal(inv.model, 'GW10K-ET');
    assert.equal(inv.ratedPower, 10000);

    const reading = await readInverter(client, inv);
    assert.equal(reading.pv_power, 3456);
    assert.equal(reading.pv_energy_today, 12.5);
    assert.equal(reading.pv_energy_total, 6085.3);
    // active power -3 W (importing) -> +3 in the Gladys convention
    assert.equal(reading.grid_power, 3);
    assert.equal(reading.grid_import_total, 58);
    assert.equal(reading.grid_export_total, 4718.6);
    assert.equal(reading.grid_export_today, 9.8);
    assert.equal(reading.load_power, 947);
    assert.equal(reading.battery_soc, 68);
    // charging 2512 W
    assert.equal(reading.battery_power, -2512);
    assert.equal(reading.battery_charge_total, 2758.1);
    assert.equal(reading.battery_discharge_total, 2442.1);
    assert.equal(reading.temperature, 58.7);
    assert.equal(reading.grid_voltage, 239.3);
    assert.equal(reading.grid_frequency, 49.99);
    assert.equal(reading.status, 'normal');
    assert.equal(reading.error_codes, 0);
    assert.equal(reading.has_battery, true);
  });
});

test('DT grid-tied: identity and live values, no meter', async () => {
  await withInverter(DT_ANSWERS(), async (client, fake) => {
    const inv = await probeInverter(client, '127.0.0.1');
    assert.equal(inv.family, 'DT');
    assert.equal(inv.serial, '5017KDTT00BW0000');
    assert.equal(inv.model, 'GW17KT-DT');

    const reading = await readInverter(client, inv);
    assert.equal(reading.pv_power, 12707);
    assert.equal(reading.pv_energy_today, 29.3);
    assert.equal(reading.pv_energy_total, 29984.4);
    assert.equal(reading.temperature, 45.7);
    assert.equal(reading.grid_voltage, 236.7);
    assert.equal(reading.grid_frequency, 50.02);
    assert.equal(reading.status, 'normal');
    assert.equal(reading.grid_power, null);
    assert.equal(reading.has_battery, false);
    // The meter block was rejected: not asked again.
    assert.equal(inv.hasMeter, false);
    const meterReads = () => fake.requests.filter((r) => r.startsWith('7f0375f3')).length;
    const before = meterReads();
    await readInverter(client, inv);
    assert.equal(meterReads(), before);
  });
});

test('ES hybrid (AA55 protocol): identity and live values', async () => {
  await withInverter(ES_ANSWERS(), async (client) => {
    const inv = await probeInverter(client, '127.0.0.1');
    assert.equal(inv.family, 'ES');
    assert.equal(inv.serial, '95048ESU227W0000');
    assert.equal(inv.model, 'GW5048D-ES');

    const reading = await readInverter(client, inv);
    assert.equal(reading.pv_power, 0);
    assert.equal(reading.pv_energy_today, 12.3);
    assert.equal(reading.pv_energy_total, 22963.2);
    // exporting 2 W
    assert.equal(reading.grid_power, -2);
    assert.equal(reading.load_power, 467);
    assert.equal(reading.battery_soc, 60);
    // discharging 469 W
    assert.equal(reading.battery_power, 469);
    assert.equal(reading.temperature, 22.9);
    assert.equal(reading.grid_voltage, 228.3);
    assert.equal(reading.grid_frequency, 49.83);
    assert.equal(reading.status, 'normal');
  });
});

test('nothing answering -> NoResponseError', async () => {
  await withInverter({}, async (client) => {
    await assert.rejects(probeInverter(client, '127.0.0.1'), NoResponseError);
  });
});

test('ET settings are written to the expected registers', async () => {
  await withInverter(ET_ANSWERS(), async (client, fake) => {
    const inv = await probeInverter(client, '127.0.0.1');
    await setOperationMode(client, inv, 'backup');
    await setExportLimit(client, inv, 3000);
    await setBatteryDod(client, inv, 80);
    assert.deepEqual(
      fake.writes.map((hex) => hex.slice(0, 12)),
      [
        'f706b7980002', // 47000 = 2 (backup)
        'f710b9970002', // off-grid flag cleared
        'f706b9ad0001', // battery mode parameters cleared
        'f706b9960bb8', // 47510 = 3000 W
        'f706b12c0014', // 45356 = 100 - 80
      ],
    );
  });
});

test('ES settings use the AA55 commands, DT refuses the battery', async () => {
  await withInverter(ES_ANSWERS(), async (client, fake) => {
    const inv = await probeInverter(client, '127.0.0.1');
    await setExportLimit(client, inv, 3000);
    await setBatteryDod(client, inv, 80);
    assert.equal(fake.writes[0], 'aa55c07f0335020bb8033b');
    assert.equal(fake.writes[1].slice(0, 24), 'aa55c07f0239050560010014');
    await assert.rejects(setOperationMode(client, inv, 'eco'), UnsupportedOperationError);
  });
  await assert.rejects(
    setBatteryDod(null, { family: 'DT', host: 'x' }, 50),
    UnsupportedOperationError,
  );
  await assert.rejects(
    setExportLimit(null, { family: 'DT', host: 'x', singlePhase: false }, 50),
    UnsupportedOperationError,
  );
});
