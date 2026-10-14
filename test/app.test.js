// End to end: the real wiring (src/app.js) against the fake Gladys of the SDK,
// a fake inverter on a local UDP port and a fake SEMS portal.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { createUdpClient } from '../src/goodwe/udpClient.js';
import { createSemsClient } from '../src/sems/client.js';
import { OVERVIEW_WIDGET, PRODUCTION_WIDGET } from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import { DT_ANSWERS, ET_ANSWERS, startFakeInverter } from './helpers/fakeInverter.js';
import { createFakeSems } from './helpers/fakeSems.js';

const ET_SERIAL = '9010KETU000W0000';

async function setup({
  config = {},
  answers = ET_ANSWERS(),
  sems = createFakeSems(),
  scanResults,
  storagePath = null,
  inverter: existing,
} = {}) {
  const inverter = existing ?? (answers ? await startFakeInverter(answers) : null);
  const gladys = createFakeGladys({
    config: { network_scan: false, ...config },
    scanResults,
  });
  const app = createApp(gladys, {
    udpClient: createUdpClient({ port: inverter?.port ?? 9, timeoutMs: 150, retries: 0 }),
    semsFactory: (options) => createSemsClient({ ...options, fetchImpl: sems.fetchImpl }),
    storagePath,
  });
  await gladys.connect();
  const close = async () => {
    await gladys.disconnect();
    await inverter?.close();
  };
  return { gladys, app, inverter, sems, close };
}

const featureId = (device, key) => `${device.external_id}:${key}`;

test('a local ET inverter becomes one device with live values', async () => {
  const ctx = await setup({ config: { inverter_hosts: '127.0.0.1' } });
  try {
    const { gladys } = ctx;
    const [device] = gladys.fake.discoveredDevices;
    assert.equal(gladys.fake.discoveredDevices.length, 1);
    assert.equal(device.external_id, `ext:test-integration:inverter:${ET_SERIAL}`);
    const keys = device.features.map((feature) => feature.external_id.split(':').pop());
    for (const key of [
      'pv-power',
      'grid-power',
      'house-consumption',
      'battery-level',
      'temperature',
    ]) {
      assert.ok(keys.includes(key), `${key} published`);
    }
    assert.equal(gladys.fake.connectionStatus.connected, true);
    assert.equal(gladys.fake.transports.at(-1).transport, 'local');

    assert.deepEqual(await gladys.fake.poll(device), { success: true });
    assert.equal(gladys.fake.lastState(featureId(device, 'pv-power')), 3456);
    assert.equal(gladys.fake.lastState(featureId(device, 'grid-power')), 3);
    assert.equal(gladys.fake.lastState(featureId(device, 'house-consumption')), 947);
    assert.equal(gladys.fake.lastState(featureId(device, 'battery-level')), 68);
    assert.equal(gladys.fake.lastState(featureId(device, 'battery-charge-power')), 2512);
    assert.equal(gladys.fake.lastState(featureId(device, 'battery-discharge-power')), 0);
    assert.equal(gladys.fake.lastState(featureId(device, 'pv-energy-today')), 12.5);
  } finally {
    await ctx.close();
  }
});

test('the network scan finds the inverter through the Gladys core', async () => {
  const payload = Buffer.from('127.0.0.1,289C6E05E0D4,Solar-WiFi').toString('base64');
  const ctx = await setup({
    config: { network_scan: true },
    scanResults: {
      'udp-active-broadcast': [
        { source_ip: '127.0.0.1', source_port: 48899, payload_base64: payload },
      ],
    },
  });
  try {
    const [scan] = ctx.gladys.fake.scans;
    assert.equal(scan.type, 'udp-active-broadcast');
    assert.equal(scan.port, 48899);
    assert.equal(Buffer.from(scan.payload_base64, 'base64').toString(), 'WIFIKIT-214028-READ');
    assert.equal(ctx.gladys.fake.discoveredDevices.length, 1);
  } finally {
    await ctx.close();
  }
});

test('a SEMS-only inverter is read from the cloud, at most every 5 minutes', async () => {
  const ctx = await setup({
    answers: null,
    config: { sems_account: 'me@x.com', sems_password: 'pw' },
  });
  try {
    const { gladys, sems } = ctx;
    const [device] = gladys.fake.discoveredDevices;
    assert.equal(device.name, 'Roof');
    const keys = device.features.map((feature) => feature.external_id.split(':').pop());
    assert.deepEqual(keys.sort(), [
      'battery-charge-power',
      'battery-discharge-power',
      'battery-level',
      'grid-power',
      'house-consumption',
      'pv-power',
    ]);
    const flowCalls = sems.count('/stations/flow');
    await gladys.fake.poll(device);
    assert.equal(sems.count('/stations/flow'), flowCalls, 'served from the 5-minute cache');
    assert.equal(gladys.fake.lastState(featureId(device, 'pv-power')), 2400);
    assert.equal(gladys.fake.lastState(featureId(device, 'grid-power')), 500);
    assert.equal(gladys.fake.lastState(featureId(device, 'battery-charge-power')), 1100);
    assert.equal(gladys.fake.transports.at(-1).transport, 'cloud');
  } finally {
    await ctx.close();
  }
});

test('local + cloud: one device, cloud fallback flagged degraded, then unreachable', async () => {
  const ctx = await setup({
    config: { inverter_hosts: '127.0.0.1', sems_account: 'me@x.com', sems_password: 'pw' },
  });
  try {
    const { gladys, inverter, sems } = ctx;
    assert.equal(gladys.fake.discoveredDevices.length, 1, 'same serial, one device');
    const [device] = gladys.fake.discoveredDevices;
    const params = Object.fromEntries(device.params.map((p) => [p.name, p.value]));
    assert.equal(params.IP_ADDRESS, '127.0.0.1');
    assert.equal(params.SEMS_STATION_ID, 'station-1');

    // The LAN answers no more: the cloud takes over, with an orange dot.
    for (const key of Object.keys(inverter.answers)) inverter.answers[key] = null;
    await gladys.fake.sceneAction('read_inverter', { device: device.external_id });
    const transport = gladys.fake.transports.at(-1);
    assert.equal(transport.transport, 'cloud');
    assert.equal(transport.degraded, true);
    assert.equal(gladys.fake.lastState(featureId(device, 'pv-power')), 2400);

    // Nothing answers: unreachable, and the scene trigger fires once.
    // (the cloud flow is cached 5 minutes: a station the portal no longer knows)
    sems.state.failAll = true;
    gladys.fake.sceneEvents.length = 0;
    await ctx.app.service.refresh(device.external_id);
    ctx.app.service.snapshot(device.external_id).entry.stationId = 'gone';
    await ctx.app.service.refresh(device.external_id);
    assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
    const unreachable = gladys.fake.sceneEvents.filter((e) => e.key === 'inverter_unreachable');
    assert.equal(unreachable.length, 1);
    assert.equal(unreachable[0].data.device, device.external_id);
  } finally {
    await ctx.close();
  }
});

test('scene actions read and set the inverter', async () => {
  const ctx = await setup({ config: { inverter_hosts: '127.0.0.1' } });
  try {
    const { gladys, inverter } = ctx;
    const [device] = gladys.fake.discoveredDevices;
    const read = await gladys.fake.sceneAction('read_inverter', { device: device.external_id });
    assert.equal(read.success, true);
    assert.deepEqual(read.data.outputs, {
      reachable: true,
      pv_power: 3456,
      grid_power: 3,
      load_power: 947,
      battery_soc: 68,
      pv_energy_today: 12.5,
    });
    const limit = await gladys.fake.sceneAction('set_export_limit', {
      device: device.external_id,
      limit: 0,
    });
    assert.deepEqual(limit.data.outputs, { applied: true });
    assert.ok(inverter.writes.some((hex) => hex.startsWith('f706b9960000')));
    const mode = await gladys.fake.sceneAction('set_operation_mode', {
      device: device.external_id,
      mode: 'eco',
    });
    assert.deepEqual(mode.data.outputs, { applied: true });
    const dod = await gladys.fake.sceneAction('set_battery_dod', {
      device: device.external_id,
      dod: 70,
    });
    assert.deepEqual(dod.data.outputs, { applied: true });
    const unknown = await gladys.fake.sceneAction('set_battery_dod', { device: 'nope', dod: 70 });
    assert.equal(unknown.success, false);
  } finally {
    await ctx.close();
  }
});

test('settings are not applied on a cloud-only or battery-less inverter', async () => {
  const cloud = await setup({ answers: null, config: { sems_account: 'a', sems_password: 'b' } });
  try {
    const [device] = cloud.gladys.fake.discoveredDevices;
    const result = await cloud.gladys.fake.sceneAction('set_export_limit', {
      device: device.external_id,
      limit: 100,
    });
    assert.deepEqual(result.data.outputs, { applied: false });
  } finally {
    await cloud.close();
  }
  const dt = await setup({ answers: DT_ANSWERS(), config: { inverter_hosts: '127.0.0.1' } });
  try {
    const [device] = dt.gladys.fake.discoveredDevices;
    const keys = device.features.map((feature) => feature.external_id.split(':').pop());
    assert.ok(!keys.includes('battery-level') && !keys.includes('grid-power'));
    const result = await dt.gladys.fake.sceneAction('set_battery_dod', {
      device: device.external_id,
      dod: 50,
    });
    assert.deepEqual(result.data.outputs, { applied: false });
  } finally {
    await dt.close();
  }
});

test('widgets render exactly as sent, in every state', async () => {
  const ctx = await setup({ config: { inverter_hosts: '127.0.0.1' } });
  try {
    const { gladys } = ctx;
    const [device] = gladys.fake.discoveredDevices;
    const featureIds = new Set(device.features.map((feature) => feature.external_id));
    for (const key of [OVERVIEW_WIDGET, PRODUCTION_WIDGET]) {
      for (const settings of [{ device: device.external_id, period: 'last-week' }, {}]) {
        const ack = await gladys.fake.widgetGet(key, { settings, language: 'fr' });
        assert.equal(ack.success, true);
        const content = ack.data.content;
        assert.deepEqual(validateWidgetContent(content), [], `${key} ${JSON.stringify(settings)}`);
        for (const component of content.components) {
          for (const id of [component.device_feature, ...(component.device_features ?? [])]) {
            if (id) assert.ok(featureIds.has(id), `${id} is a published feature`);
          }
        }
      }
    }
    const content = (
      await gladys.fake.widgetGet(OVERVIEW_WIDGET, { settings: { device: device.external_id } })
    ).data.content;
    const button = content.components.find((component) => component.type === 'button');
    const ack = await gladys.fake.widgetAction(
      OVERVIEW_WIDGET,
      button.action.key,
      button.action.params,
      {
        settings: { device: device.external_id },
      },
    );
    assert.equal(ack.success, true);
    assert.equal(ack.data.message.en, 'Values refreshed.');
  } finally {
    await ctx.close();
  }
});

test('the test action answers in the four languages', async () => {
  const ctx = await setup({
    config: { inverter_hosts: '127.0.0.1', sems_account: 'a', sems_password: 'b' },
  });
  try {
    const ack = await ctx.gladys.fake.action('test_connection', {});
    assert.equal(ack.success, true);
    for (const lang of LANGUAGES) {
      const message = ack.data.message[lang];
      assert.ok(message.includes('9010KETU000W0000'), `${lang}: ${message}`);
      assert.ok(message.includes('SEMS'), lang);
    }
  } finally {
    await ctx.close();
  }
});

test('nothing configured: the Configuration screen says what to do', async () => {
  const ctx = await setup({ answers: null });
  try {
    const status = ctx.gladys.fake.connectionStatus;
    assert.equal(status.connected, false);
    assert.match(status.message.fr, /adresse IP/);
  } finally {
    await ctx.close();
  }
});

test('bad SEMS credentials are reported', async () => {
  const ctx = await setup({
    answers: null,
    sems: createFakeSems({ loginCode: 'C0601' }),
    config: { sems_account: 'a', sems_password: 'wrong' },
  });
  try {
    const status = ctx.gladys.fake.connectionStatus;
    assert.equal(status.connected, false);
    assert.match(status.message.en, /SEMS login refused/);
  } finally {
    await ctx.close();
  }
});

test('a restart polls the known inverters without a new scan', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'goodwe-'));
  const storagePath = join(dir, 'inventory.json');
  const inverter = await startFakeInverter(ET_ANSWERS());
  try {
    const first = await setup({ inverter, storagePath, config: { inverter_hosts: '127.0.0.1' } });
    await first.gladys.disconnect();
    const saved = JSON.parse(await readFile(storagePath, 'utf8'));
    assert.equal(saved.inverters[0].serial, ET_SERIAL);
    assert.equal(saved.inverters[0].host, '127.0.0.1');
    assert.ok(!JSON.stringify(saved).includes('password'));

    // The address was removed from the configuration: the inventory remembers it.
    inverter.requests.length = 0;
    const second = await setup({ inverter, storagePath });
    try {
      assert.equal(second.gladys.fake.discoveredDevices.length, 1);
      assert.ok(!inverter.requests.includes('aa55c07f0102000241'), 'no identification probe');
    } finally {
      await second.gladys.disconnect();
    }
  } finally {
    await inverter.close();
    await rm(dir, { recursive: true, force: true });
  }
});
