import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, hasCloud, normalizeConfig, parseHosts } from '../src/config.js';
import { createPoller } from '../src/poller.js';
import { LANGUAGES, MESSAGE_KEYS, joinLines, t } from '../src/i18n.js';

test('the defaults apply to an empty configuration', () => {
  const config = normalizeConfig();
  assert.equal(config.poll_frequency, DEFAULT_CONFIG.poll_frequency);
  assert.equal(config.network_scan, true);
  assert.equal(config.GLADYS_PREFER_LOCAL, true);
  assert.deepEqual(config.hosts, []);
  assert.equal(hasCloud(config), false);
});

test('values typed as strings are converted and bounded', () => {
  const config = normalizeConfig({
    poll_frequency: '10',
    surplus_threshold: '1500',
    network_scan: false,
    sems_account: '  me@x.com ',
    sems_password: 'pw',
    GLADYS_PREFER_LOCAL: false,
  });
  assert.equal(config.poll_frequency, 60, 'one minute minimum');
  assert.equal(config.surplus_threshold, 1500);
  assert.equal(config.network_scan, false);
  assert.equal(config.sems_account, 'me@x.com');
  assert.equal(hasCloud(config), true);
  assert.equal(config.GLADYS_PREFER_LOCAL, false);
});

test('the host list accepts commas, spaces and semicolons', () => {
  assert.deepEqual(parseHosts('192.168.1.50, 192.168.1.51;inverter.lan  192.168.1.50'), [
    '192.168.1.50',
    '192.168.1.51',
    'inverter.lan',
  ]);
});

test('the poller applies the refresh interval of the configuration', async () => {
  let time = 0;
  const reads = [];
  const poll = createPoller(
    async (device) => reads.push(device.external_id),
    () => time,
  );
  const device = { external_id: 'a' };
  const config = { poll_frequency: 300 };
  assert.equal(await poll(device, config), true);
  time += 60_000;
  assert.equal(await poll(device, config), false);
  time += 230_000; // 290 s: due within the tolerance
  assert.equal(await poll(device, config), true);
  assert.deepEqual(reads, ['a', 'a']);
});

test('every message exists in the four languages, placeholders included', () => {
  for (const key of MESSAGE_KEYS) {
    const english = t(key);
    const placeholders = (english.en.match(/\{\w+\}/g) ?? []).sort();
    for (const lang of LANGUAGES) {
      assert.ok(english[lang], `${key}.${lang}`);
      assert.deepEqual(
        (english[lang].match(/\{\w+\}/g) ?? []).sort(),
        placeholders,
        `${key}.${lang}`,
      );
    }
  }
  assert.equal(
    t('test_local_failed', { host: '10.0.0.2' }).de,
    '10.0.0.2: keine GoodWe-Antwort auf UDP-Port 8899.',
  );
  assert.deepEqual(joinLines([t('w_grid'), t('w_battery')]).es, 'Red\nBatería');
  assert.throws(() => t('nope'));
});
