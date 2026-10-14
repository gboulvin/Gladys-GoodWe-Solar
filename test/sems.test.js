import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSemsClient,
  flattenFactors,
  hashPassword,
  normalizeFlow,
  SemsError,
  signature,
} from '../src/sems/client.js';
import { createFakeSems } from './helpers/fakeSems.js';

test('the password is sent as base64(md5) and every call is signed', async () => {
  assert.equal(hashPassword('password'), 'NWY0ZGNjM2I1YWE3NjVkNjFkODMyN2RlYjg4MmNmOTk=');
  const sig = Buffer.from(signature({ uid: 'u', token: 't' }, 1000), 'base64').toString();
  assert.match(sig, /^[0-9a-f]{64}@1000$/);

  const fake = createFakeSems();
  const client = createSemsClient({
    account: 'me@x.com',
    password: 'secret',
    fetchImpl: fake.fetchImpl,
  });
  await client.listStations();
  const [login, call] = fake.requests;
  assert.deepEqual(JSON.parse(login.body).pwd, hashPassword('secret'));
  assert.equal(JSON.parse(call.headers.Token).token, 'token-1');
  assert.ok(call.headers['X-Signature']);
  assert.ok(call.url.startsWith('https://eu-gateway.semsportal.com/web/sems/sems-plant/'));
});

test('stations, inverters and flow are normalized', async () => {
  const fake = createFakeSems();
  const client = createSemsClient({ account: 'a', password: 'b', fetchImpl: fake.fetchImpl });
  assert.deepEqual(await client.listStations(), [{ id: 'station-1', name: 'Home' }]);
  assert.deepEqual(await client.listInverters('station-1'), [
    { serial: '9010KETU000W0000', name: 'Roof', deviceType: 'INVERTER' },
  ]);
  // pGrid -0.5 kW = importing 500 W; pBat -1.1 kW = charging 1100 W.
  assert.deepEqual(await client.getStationFlow('station-1'), {
    pv_power: 2400,
    grid_power: 500,
    load_power: 1800,
    battery_power: -1100,
    battery_soc: 62,
    has_battery: true,
  });
  const telemetry = await client.getInverterTelemetry('station-1', '9010KETU000W0000');
  assert.equal(telemetry.pv_power, 1500);
  assert.equal(telemetry.temperature, 41.5);
});

test('flow values that are not numbers are ignored', () => {
  assert.deepEqual(normalizeFlow({ pAc: 'n/a', pGrid: null, pConsum: -0.5 }), {
    pv_power: null,
    grid_power: null,
    load_power: 500,
    battery_power: null,
    battery_soc: null,
    has_battery: false,
  });
  assert.deepEqual(flattenFactors([{ factors: [{ code: 'a', data: 1 }, { code: 'b' }] }]), {
    a: 1,
  });
});

test('an expired token logs in again, once', async () => {
  const fake = createFakeSems();
  const client = createSemsClient({ account: 'a', password: 'b', fetchImpl: fake.fetchImpl });
  await client.listStations();
  fake.state.expireNext = true;
  await client.listStations();
  assert.equal(fake.count('cross-login'), 2);
});

test('bad credentials are an auth error', async () => {
  const fake = createFakeSems({ loginCode: 'C0601' });
  const client = createSemsClient({ account: 'a', password: 'b', fetchImpl: fake.fetchImpl });
  await assert.rejects(
    client.listStations(),
    (err) => err instanceof SemsError && err.kind === 'auth',
  );
});

test('a rate limit pauses the requests for 5 minutes', async () => {
  let time = 1_000_000;
  const fake = createFakeSems();
  const client = createSemsClient({
    account: 'a',
    password: 'b',
    fetchImpl: fake.fetchImpl,
    now: () => time,
  });
  fake.state.rateLimitNext = true;
  await assert.rejects(client.listStations(), (err) => err.kind === 'rate_limit');
  const before = fake.requests.length;
  await assert.rejects(client.listStations(), (err) => err.kind === 'rate_limit');
  assert.equal(fake.requests.length, before, 'no request while paused');
  time += 5 * 60 * 1000;
  assert.equal((await client.listStations()).length, 1);
});
