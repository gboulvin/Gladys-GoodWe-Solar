// -----------------------------------------------------------------------------
// GoodWe service: the inventory of inverters and the two ways to reach them.
//
//   LOCAL  UDP 8899 on the LAN (src/goodwe/): every 60 s if wanted, detailed
//          values (daily energy, indexes, temperature...), settings writable.
//   CLOUD  the SEMS+ portal (src/sems/): works from anywhere, slower (read at
//          most every 5 minutes, the portal throttles), station-level values.
//
// An inverter is ONE Gladys device whatever the channel, keyed by its serial
// number: a user with both gets one device, read locally, which falls back to
// the cloud when the LAN session fails (orange "degraded" badge), and back.
// The "Prefer the local connection" toggle (GLADYS_PREFER_LOCAL) picks the
// channel tried first.
//
// The inventory is saved under /data (the only writable path of the
// container) so a restart polls the known inverters without a new scan.
// -----------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises';
import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { createUdpClient } from './goodwe/udpClient.js';
import { DISCOVERY_PAYLOAD, DISCOVERY_PORT, parseDiscoveryReply } from './goodwe/protocol.js';
import {
  probeInverter,
  readInverter,
  setBatteryDod,
  setExportLimit,
  setOperationMode,
} from './goodwe/inverter.js';
import { createSemsClient } from './sems/client.js';
import {
  buildInverterDevice,
  buildStates,
  featureKeysOf,
  inverterIds,
} from './devices/inverter.js';
import { createEventTracker } from './events.js';
import { hasCloud } from './config.js';
import { t } from './i18n.js';

const logger = createLogger({ name: 'goodwe' });

export const CLOUD_MIN_INTERVAL_MS = 5 * 60 * 1000;
const STATES_HEARTBEAT_MS = 30 * 60 * 1000;
const SCAN_TIMEOUT_SECONDS = 3;

// Every key a reading can hold: a channel that lacks one leaves it null.
const EMPTY_READING = {
  pv_power: null,
  pv_energy_today: null,
  pv_energy_total: null,
  grid_power: null,
  grid_import_total: null,
  grid_export_total: null,
  grid_import_today: null,
  grid_export_today: null,
  load_power: null,
  battery_soc: null,
  battery_power: null,
  battery_charge_total: null,
  battery_discharge_total: null,
  temperature: null,
  grid_voltage: null,
  grid_frequency: null,
  status: null,
  error_codes: null,
  has_battery: false,
};

/** Raised by a write that needs the LAN (cloud-only inverter). */
export class NeedsLocalError extends Error {
  constructor() {
    super('This operation needs the local connection to the inverter');
    this.name = 'NeedsLocalError';
  }
}

export class UnknownInverterError extends Error {
  constructor(externalId) {
    super(`Unknown GoodWe inverter ${externalId}`);
    this.name = 'UnknownInverterError';
  }
}

export function createGoodWeService({
  gladys,
  udpClient = createUdpClient(),
  semsFactory = createSemsClient,
  storagePath = '/data/inventory.json',
  now = Date.now,
}) {
  let config = null;
  let sems = null;
  let semsError = null;
  const inventory = new Map(); // serial -> entry
  const runtime = new Map(); // serial -> { reading, readAt, source, transport }
  const stations = new Map(); // stationId -> { name, inverters: [serial], flow, flowAt }
  const telemetry = new Map(); // serial -> { value, at }
  const events = createEventTracker();
  // Serials read on the LAN by the last local discovery.
  const readLocally = new Set();

  // --- Inventory ---------------------------------------------------------------

  // Entries are updated IN PLACE: the driver keeps state on them (hasMeter)
  // and a poll in flight holds a reference.
  function upsert(serial, patch) {
    const entry = inventory.get(serial) ?? { serial, features: [] };
    const features = [...new Set([...entry.features, ...(patch.features ?? [])])];
    Object.assign(entry, stripUndefined(patch), { features });
    inventory.set(serial, entry);
    return entry;
  }

  async function loadInventory() {
    if (!storagePath) return;
    try {
      const saved = JSON.parse(await readFile(storagePath, 'utf8'));
      for (const entry of saved.inverters ?? []) {
        if (entry?.serial) upsert(entry.serial, entry);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') logger.warn(`Could not read ${storagePath}: ${err.message}`);
    }
  }

  async function saveInventory() {
    if (!storagePath) return;
    try {
      await writeFile(
        storagePath,
        JSON.stringify({ inverters: [...inventory.values()] }, null, 2),
        'utf8',
      );
    } catch (err) {
      logger.warn(`Could not write ${storagePath}: ${err.message}`);
    }
  }

  function deviceExternalId(serial) {
    return inverterIds(gladys, serial).device;
  }

  /**
   * The inventory entry of a Gladys device. A device created before a
   * container reset (empty /data) is rebuilt from its params.
   */
  function entryOf(deviceOrExternalId) {
    const externalId =
      typeof deviceOrExternalId === 'string' ? deviceOrExternalId : deviceOrExternalId?.external_id;
    for (const entry of inventory.values()) {
      if (deviceExternalId(entry.serial) === externalId) return entry;
    }
    const params = Object.fromEntries(
      (deviceOrExternalId?.params ?? []).map((param) => [param.name, param.value]),
    );
    if (params.SERIAL_NUMBER && deviceExternalId(params.SERIAL_NUMBER) === externalId) {
      const prefix = inverterIds(gladys, params.SERIAL_NUMBER).feature('');
      return upsert(params.SERIAL_NUMBER, {
        model: params.MODEL || undefined,
        family: params.FAMILY || undefined,
        host: params.IP_ADDRESS || undefined,
        stationId: params.SEMS_STATION_ID || undefined,
        features: (deviceOrExternalId.features ?? [])
          .map((feature) => feature.external_id?.slice(prefix.length))
          .filter(Boolean),
      });
    }
    return null;
  }

  // --- Discovery ---------------------------------------------------------------

  /** Ask the Gladys core to broadcast the GoodWe discovery request. */
  async function scanLan() {
    if (!config.network_scan) return [];
    try {
      const replies = await gladys.scanNetwork('udp-active-broadcast', {
        port: DISCOVERY_PORT,
        payload: DISCOVERY_PAYLOAD,
        timeoutSeconds: SCAN_TIMEOUT_SECONDS,
      });
      return replies
        .map((reply) =>
          parseDiscoveryReply(Buffer.from(reply.payload_base64, 'base64'), reply.source_ip),
        )
        .filter(Boolean);
    } catch (err) {
      // Older core, scan refused or rate-limited (1 per 10 s): the configured
      // and already known addresses still work.
      logger.warn(`Network scan unavailable: ${err.message}`);
      return [];
    }
  }

  async function discoverLocal() {
    readLocally.clear();
    const scanned = await scanLan();
    // Addresses the user typed or the scan just found: worth a full probe.
    const fresh = new Set([...config.hosts, ...scanned.map((reply) => reply.host)]);
    const hosts = new Set([
      ...fresh,
      ...[...inventory.values()].map((entry) => entry.host).filter(Boolean),
    ]);
    const results = [];
    for (const host of hosts) {
      try {
        let entry = [...inventory.values()].find((known) => known.host === host && known.family);
        let reading = null;
        if (entry) {
          // Known inverter: one read instead of a probe of every protocol.
          try {
            reading = await readInverter(udpClient, entry);
          } catch (err) {
            if (!fresh.has(host)) throw err;
          }
        }
        if (!reading) {
          const identity = await probeInverter(udpClient, host);
          // A host now answering with another serial: the old entry moved.
          for (const known of inventory.values()) {
            if (known.host === host && known.serial !== identity.serial) known.host = undefined;
          }
          entry = upsert(identity.serial, identity);
          reading = await readInverter(udpClient, entry);
        }
        upsert(entry.serial, { features: featureKeysOf(reading), hasMeter: entry.hasMeter });
        readLocally.add(entry.serial);
        record(entry.serial, { ...EMPTY_READING, ...reading }, 'local', {
          transport: DEVICE_TRANSPORTS.LOCAL,
        });
        results.push({ host, ok: true, identity: inventory.get(entry.serial) });
      } catch (err) {
        logger.warn(`No GoodWe inverter found at ${host}: ${err.message}`);
        results.push({ host, ok: false, error: err });
      }
    }
    return { scanned, results };
  }

  function semsClient() {
    if (!hasCloud(config)) return null;
    if (!sems) {
      sems = semsFactory({ account: config.sems_account, password: config.sems_password });
    }
    return sems;
  }

  async function discoverCloud() {
    const client = semsClient();
    if (!client) {
      stations.clear();
      return null;
    }
    try {
      const list = await client.listStations();
      stations.clear();
      let inverterCount = 0;
      for (const station of list) {
        const inverters = await client.listInverters(station.id);
        stations.set(station.id, {
          name: station.name,
          inverters: inverters.map((inverter) => inverter.serial),
          flow: null,
          flowAt: 0,
        });
        for (const inverter of inverters) {
          inverterCount += 1;
          const existing = inventory.get(inverter.serial);
          upsert(inverter.serial, {
            stationId: station.id,
            deviceType: inverter.deviceType,
            name: existing?.name ?? inverter.name,
          });
        }
        for (const inverter of inverters) {
          const entry = inventory.get(inverter.serial);
          const reading = await readCloud(entry);
          upsert(inverter.serial, { features: featureKeysOf(reading) });
          // Just read on the LAN: the LAN stays the source.
          if (!readLocally.has(entry.serial)) {
            const failures = entry.host ? ['local'] : [];
            record(entry.serial, reading, 'cloud', transportFor(entry, 'cloud', failures));
          }
        }
      }
      semsError = null;
      return { stations: list.length, inverters: inverterCount };
    } catch (err) {
      semsError = err;
      logger.warn(`SEMS discovery failed: ${err.message}`);
      return null;
    }
  }

  // --- Reading -----------------------------------------------------------------

  async function readCloud(entry) {
    const client = semsClient();
    if (!client || !entry?.stationId) {
      throw new Error('No SEMS station for this inverter');
    }
    let station = stations.get(entry.stationId);
    if (!station) {
      // Known from the saved inventory, but the SEMS discovery of this run
      // failed (portal down, rate limit): load just this station.
      const inverters = await client.listInverters(entry.stationId);
      station = {
        name: entry.stationId,
        inverters: inverters.map((inverter) => inverter.serial),
        flow: null,
        flowAt: 0,
      };
      stations.set(entry.stationId, station);
    }
    if (station.inverters.length <= 1) {
      // Single-inverter plant: the station flow IS the inverter's.
      if (!station.flow || now() - station.flowAt >= CLOUD_MIN_INTERVAL_MS) {
        station.flow = await client.getStationFlow(entry.stationId);
        station.flowAt = now();
      }
      return { ...EMPTY_READING, ...station.flow };
    }
    // Several inverters: the station flow mixes them, read this one's AC power.
    const cached = telemetry.get(entry.serial);
    if (!cached || now() - cached.at >= CLOUD_MIN_INTERVAL_MS) {
      const value = await client.getInverterTelemetry(
        entry.stationId,
        entry.serial,
        entry.deviceType,
      );
      telemetry.set(entry.serial, { value, at: now() });
    }
    return { ...EMPTY_READING, ...telemetry.get(entry.serial).value };
  }

  /**
   * Remember the last reading. The transport is only stored here (discovery):
   * the app publishes every badge at once after a discovery.
   */
  function record(serial, reading, source, transport) {
    const state = runtime.get(serial) ?? {};
    runtime.set(serial, {
      ...state,
      reading,
      readAt: now(),
      source,
      ...(transport ? { transport } : {}),
    });
  }

  function channelsFor(entry) {
    const local = Boolean(entry.host);
    const cloud = Boolean(entry.stationId && semsClient());
    if (local && cloud) {
      return config.GLADYS_PREFER_LOCAL ? ['local', 'cloud'] : ['cloud', 'local'];
    }
    return [local && 'local', cloud && 'cloud'].filter(Boolean);
  }

  function transportFor(entry, source, failures) {
    if (!source) {
      return { transport: DEVICE_TRANSPORTS.UNREACHABLE };
    }
    if (source === 'cloud' && entry.host && failures.includes('local')) {
      return {
        transport: DEVICE_TRANSPORTS.CLOUD,
        degraded: true,
        message: t('local_unreachable_cloud_fallback'),
      };
    }
    return { transport: source === 'local' ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.CLOUD };
  }

  async function publishTransport(entry, transport) {
    const state = runtime.get(entry.serial) ?? {};
    const changed = JSON.stringify(state.transport) !== JSON.stringify(transport);
    runtime.set(entry.serial, { ...state, transport });
    if (changed) {
      await gladys.publishTransports([
        { external_id: deviceExternalId(entry.serial), ...transport },
      ]);
    }
  }

  async function publishEvents(list) {
    for (const event of list) {
      try {
        await gladys.publishSceneEvent(event.key, event.data);
      } catch (err) {
        logger.warn(`Scene event ${event.key} refused: ${err.message}`);
      }
    }
  }

  /**
   * Read an inverter on the best available channel, publish its states, its
   * transport badge and the scene events. Resolves the reading, or null.
   */
  async function poll(entry) {
    const failures = [];
    let reading = null;
    let source = null;
    for (const channel of channelsFor(entry)) {
      try {
        reading =
          channel === 'local'
            ? { ...EMPTY_READING, ...(await readInverter(udpClient, entry)) }
            : await readCloud(entry);
        source = channel;
        break;
      } catch (err) {
        failures.push(channel);
        logger.debug(`${entry.serial}: ${channel} read failed (${err.message})`);
        if (channel === 'cloud') semsError = err;
      }
    }

    await publishTransport(entry, transportFor(entry, source, failures));
    const externalId = deviceExternalId(entry.serial);
    if (!reading) {
      await publishEvents(events.unreachable(entry, externalId));
      return null;
    }
    if (source === 'cloud') semsError = null;
    record(entry.serial, reading, source);
    await gladys.publishChangedStates(buildStates(gladys, entry, reading), {
      heartbeat: STATES_HEARTBEAT_MS,
    });
    await publishEvents(
      events.update(entry, externalId, reading, { surplusThreshold: config.surplus_threshold }),
    );
    return reading;
  }

  async function localWrite(externalId, operation) {
    const entry = entryOf(externalId);
    if (!entry) throw new UnknownInverterError(externalId);
    if (!entry.host || !entry.family) throw new NeedsLocalError();
    await operation(udpClient, entry);
    return entry;
  }

  return {
    async start(newConfig) {
      config = newConfig;
      await loadInventory();
    },

    /** New configuration: drop the cloud session when the account changed. */
    setConfig(newConfig) {
      const accountChanged =
        !config ||
        newConfig.sems_account !== config.sems_account ||
        newConfig.sems_password !== config.sems_password;
      config = newConfig;
      if (accountChanged) {
        sems = null;
        semsError = null;
        stations.clear();
      }
    },

    /** Find the inverters (LAN + SEMS), save the inventory, return the devices. */
    async discover() {
      const local = await discoverLocal();
      const cloud = await discoverCloud();
      await saveInventory();
      return { local, cloud, devices: this.devices() };
    },

    devices() {
      return [...inventory.values()]
        .filter((entry) => entry.host || entry.stationId)
        .map((entry) => buildInverterDevice(gladys, entry));
    },

    /** The transport badge of every inverter, for publishTransports. */
    transports() {
      return [...inventory.values()]
        .map((entry) => {
          const transport = runtime.get(entry.serial)?.transport;
          return transport && { external_id: deviceExternalId(entry.serial), ...transport };
        })
        .filter(Boolean);
    },

    /** onPoll: read the inverter of a Gladys device. */
    async pollDevice(device) {
      const entry = entryOf(device);
      if (!entry) {
        logger.warn(`Poll of an unknown device ${device?.external_id}`);
        return null;
      }
      return poll(entry);
    },

    async refresh(externalId) {
      const entry = entryOf(externalId);
      if (!entry) throw new UnknownInverterError(externalId);
      return poll(entry);
    },

    entryOf,
    snapshot(externalId) {
      const entry = entryOf(externalId);
      if (!entry) return null;
      return { entry, ...(runtime.get(entry.serial) ?? {}) };
    },

    setOperationMode: (externalId, mode) =>
      localWrite(externalId, (client, entry) => setOperationMode(client, entry, mode)),
    setExportLimit: (externalId, watts) =>
      localWrite(externalId, (client, entry) => setExportLimit(client, entry, watts)),
    setBatteryDod: (externalId, dod) =>
      localWrite(externalId, (client, entry) => setBatteryDod(client, entry, dod)),

    /** Probe the configured addresses and the SEMS account (Configuration screen). */
    async test() {
      const lines = [];
      const { scanned, results } = await discoverLocal();
      if (config.network_scan) lines.push(t('test_scan', { count: scanned.length }));
      for (const result of results) {
        lines.push(
          result.ok
            ? t('test_local_ok', {
                host: result.host,
                model: result.identity.model,
                serial: result.identity.serial,
              })
            : t('test_local_failed', { host: result.host }),
        );
      }
      if (hasCloud(config)) {
        sems = null;
        const cloud = await discoverCloud();
        lines.push(cloud ? t('test_cloud_ok', cloud) : (cloudProblem() ?? t('sems_unreachable')));
      }
      await saveInventory();
      return lines;
    },

    /** The problem to show in the Configuration screen, or null when all is well. */
    connectionProblem() {
      if (inventory.size === 0) return cloudProblem() ?? t('nothing_configured');
      // Bad credentials need the user; a slow portal fixes itself.
      return semsError?.kind === 'auth' ? t('sems_auth_failed') : null;
    },
  };

  function cloudProblem() {
    if (!semsError) return null;
    if (semsError.kind === 'auth') return t('sems_auth_failed');
    if (semsError.kind === 'rate_limit') return t('sems_rate_limited');
    return t('sems_unreachable');
  }
}

function stripUndefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}
