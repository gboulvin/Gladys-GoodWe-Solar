// -----------------------------------------------------------------------------
// GoodWe inverter driver (local, UDP 8899).
//
//   probeInverter(client, host)      -> identity { serial, model, family, ... }
//   readInverter(client, identity)   -> normalized reading (see below)
//   setOperationMode / setExportLimit / setBatteryDod -> writes (scene actions)
//
// Every family is mapped to the SAME normalized reading, in W, kWh, %, V, Hz,
// °C, with the Gladys sign conventions:
//   grid_power     > 0 when importing from the grid, < 0 when exporting;
//   battery_power  > 0 when discharging, < 0 when charging.
// A value the inverter does not provide is null (never published).
//
// Register map and formulas ported from the `goodwe` library (MIT licence).
// -----------------------------------------------------------------------------

import {
  AA55_DEVICE_INFO,
  AA55_RUNTIME_DATA,
  aa55ExportLimit,
  aa55WriteRegister,
  modbusRead,
  modbusWrite,
  modbusWriteMulti,
  s16,
  s32,
  text,
  u16,
  u32,
  u8,
} from './protocol.js';
import { FAMILY, familyFromSerial, isSinglePhase } from './models.js';

const ET_ADDRESS = 0xf7;
const DT_ADDRESS = 0x7f;

export const OPERATION_MODES = {
  general: 0,
  backup: 2,
  eco: 3,
  peak_shaving: 4,
  self_use: 5,
};

export const STATUS = {
  WAITING: 'waiting',
  NORMAL: 'normal',
  OFF_GRID: 'off-grid',
  FAULT: 'fault',
  CHECKING: 'checking',
  UNKNOWN: 'unknown',
};

/** Raised for an operation the family cannot do (shown as an action output). */
export class UnsupportedOperationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedOperationError';
  }
}

const scale = (value, divisor) => (value === null ? null : value / divisor);
const round = (value, digits = 1) =>
  value === null || value === undefined || Number.isNaN(value)
    ? null
    : Math.round(value * 10 ** digits) / 10 ** digits;

// --- Identification ----------------------------------------------------------

async function readEtIdentity(client, host) {
  const { payload } = await client.execute(host, modbusRead(ET_ADDRESS, 35000, 0x21));
  return {
    serial: text(payload, 6, 22),
    model: text(payload, 22, 32),
    ratedPower: u16(payload, 2),
    firmware: text(payload, 42, 54),
  };
}

async function readDtIdentity(client, host) {
  const { payload } = await client.execute(host, modbusRead(DT_ADDRESS, 30001, 0x28));
  const dsp1 = u16(payload, 66) ?? 0;
  const dsp2 = u16(payload, 68) ?? 0;
  const arm = u16(payload, 70) ?? 0;
  return {
    serial: text(payload, 6, 22),
    model: text(payload, 22, 32),
    ratedPower: null,
    firmware: `${dsp1}.${dsp2}.${arm.toString(16).padStart(2, '0')}`,
  };
}

/**
 * Identify the inverter at `host`. Tries the AA55 identification first (any
 * generation answers it), then the Modbus identification of each family.
 * Throws when nothing answers.
 */
export async function probeInverter(client, host) {
  let serial = null;
  let model = null;
  let firmware = null;
  try {
    const { payload } = await client.execute(host, AA55_DEVICE_INFO());
    firmware = text(payload, 0, 5);
    model = text(payload, 5, 15);
    serial = text(payload, 31, 47);
  } catch {
    // Newer firmwares only speak Modbus: fall through.
  }

  let family = familyFromSerial(serial ?? '');
  if (family === FAMILY.ES) {
    return identity({ host, serial, model, family, firmware, ratedPower: null });
  }
  if (family === FAMILY.ET || family === null) {
    try {
      const et = await readEtIdentity(client, host);
      return identity({ host, family: FAMILY.ET, ...et, model: et.model || model });
    } catch (err) {
      if (family === FAMILY.ET) throw err;
    }
  }
  const dt = await readDtIdentity(client, host);
  family = FAMILY.DT;
  return identity({ host, family, ...dt, model: dt.model || model });
}

function identity({ host, serial, model, family, firmware, ratedPower }) {
  if (!serial) {
    throw new Error(`The inverter at ${host} did not report a serial number`);
  }
  return {
    host,
    serial,
    model: model || `GoodWe ${family}`,
    family,
    firmware: firmware || null,
    ratedPower: ratedPower ?? null,
    singlePhase: isSinglePhase(serial),
  };
}

// --- Runtime data -------------------------------------------------------------

const ET_STATUS = {
  0: STATUS.WAITING,
  1: STATUS.NORMAL,
  2: STATUS.OFF_GRID,
  3: STATUS.FAULT,
  4: STATUS.CHECKING,
  5: STATUS.CHECKING,
};
const DT_STATUS = { 0: STATUS.WAITING, 1: STATUS.NORMAL, 2: STATUS.FAULT, 4: STATUS.CHECKING };
const ES_STATUS = { 0: STATUS.WAITING, 1: STATUS.NORMAL, 2: STATUS.FAULT, 3: STATUS.FAULT };

async function readEt(client, inv) {
  const runtime = await client.execute(inv.host, modbusRead(ET_ADDRESS, 35100, 0x7d));
  const p = runtime.payload;
  const at = runtime.offsetOf;

  const pvPower = [35105, 35109, 35113, 35117].reduce(
    (sum, reg) => sum + Math.max(0, u32(p, at(reg)) ?? 0),
    0,
  );
  // 35140: grid-port power, > 0 when exporting.
  const activePower = s16(p, at(35140));
  // 35182: battery power, > 0 when discharging.
  const batteryPower = s32(p, at(35182));
  const batteryMode = u16(p, at(35184)) ?? 0;
  const hasBattery = batteryMode !== 0;

  const reading = {
    pv_power: pvPower,
    pv_energy_today: scale(u32(p, at(35193)), 10),
    pv_energy_total: scale(u32(p, at(35191)), 10),
    grid_power: activePower === null ? null : -activePower,
    grid_import_total: scale(u32(p, at(35200)), 10),
    grid_export_total: scale(u32(p, at(35195)), 10),
    grid_import_today: scale(u16(p, at(35202)), 10),
    grid_export_today: scale(u16(p, at(35199)), 10),
    load_power:
      activePower === null ? null : Math.max(0, pvPower + (batteryPower ?? 0) - activePower),
    battery_soc: null,
    battery_power: hasBattery ? batteryPower : null,
    battery_charge_total: hasBattery ? scale(u32(p, at(35206)), 10) : null,
    battery_discharge_total: hasBattery ? scale(u32(p, at(35209)), 10) : null,
    temperature: tempOrNull(s16(p, at(35176))),
    grid_voltage: scale(u16(p, at(35121)), 10),
    grid_frequency: scale(s16(p, at(35123)), 100),
    status: ET_STATUS[u16(p, at(35187))] ?? STATUS.UNKNOWN,
    error_codes: u32(p, at(35189)),
    has_battery: hasBattery,
  };

  if (hasBattery) {
    try {
      const battery = await client.execute(inv.host, modbusRead(ET_ADDRESS, 37000, 0x18));
      reading.battery_soc = u16(battery.payload, battery.offsetOf(37007));
    } catch {
      // BMS block unavailable on some firmwares: keep the rest of the reading.
    }
  }
  return reading;
}

async function readDt(client, inv) {
  const runtime = await client.execute(inv.host, modbusRead(DT_ADDRESS, 30100, 0x49));
  const p = runtime.payload;
  const at = runtime.offsetOf;

  // Per-string power = voltage x current (0xFFFF reads as 0, absent string).
  const pvPower = [
    [30103, 30104],
    [30105, 30106],
    [30107, 30108],
    [30109, 30110],
  ].reduce(
    (sum, [v, i]) => sum + Math.round(((u16(p, at(v)) ?? 0) / 10) * ((u16(p, at(i)) ?? 0) / 10)),
    0,
  );

  const reading = {
    pv_power: pvPower,
    pv_energy_today: scale(u16(p, at(30144)), 10),
    pv_energy_total: scale(u32(p, at(30145)), 10),
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
    temperature: tempOrNull(s16(p, at(30141))),
    grid_voltage: scale(u16(p, at(30118)), 10),
    grid_frequency: scale(s16(p, at(30124)), 100),
    status: DT_STATUS[u16(p, at(30129))] ?? STATUS.UNKNOWN,
    error_codes: u32(p, at(30130)),
    has_battery: false,
  };

  // Smart meter block: absent (rejected) on installations without a meter.
  if (inv.hasMeter !== false) {
    try {
      const meter = await client.execute(inv.host, modbusRead(DT_ADDRESS, 30195, 0x0f));
      const m = meter.payload;
      const mat = meter.offsetOf;
      const meterPower = s32(m, mat(30195)); // > 0 when exporting
      if (meterPower !== null && u16(m, mat(30209)) === 1) {
        reading.grid_power = -meterPower;
        reading.load_power = Math.max(0, pvPower - meterPower);
        reading.grid_export_total = scale(u32(m, mat(30197)), 1000);
        reading.grid_import_total = scale(u32(m, mat(30199)), 1000);
      }
      inv.hasMeter = true;
    } catch (err) {
      if (err?.name === 'RequestRejectedError') inv.hasMeter = false;
    }
  }
  return reading;
}

async function readEs(client, inv) {
  const { payload: p } = await client.execute(inv.host, AA55_RUNTIME_DATA());
  const pv = (v, i) => Math.round(((u16(p, v) ?? 0) / 10) * ((u16(p, i) ?? 0) / 10));
  const pvPower = pv(0, 2) + pv(5, 7);

  const batteryMode = u8(p, 30) ?? 0;
  const batteryMagnitude = Math.abs(pv(10, 18));
  const batteryPower = batteryMode === 3 ? -batteryMagnitude : batteryMagnitude;
  // Byte 80: 1 exporting, 2 importing; bytes 38-39 the magnitude.
  const exportPower = Math.abs(s16(p, 38) ?? 0) * (u8(p, 80) === 2 ? -1 : 1);
  const hasBattery = batteryMode !== 0;

  return {
    pv_power: pvPower,
    pv_energy_today: scale(u16(p, 67), 10),
    pv_energy_total: scale(u32(p, 59), 10),
    grid_power: -exportPower,
    grid_import_total: null,
    grid_export_total: null,
    grid_import_today: null,
    grid_export_today: null,
    load_power: Math.max(0, pvPower + (hasBattery ? batteryPower : 0) - exportPower),
    battery_soc: hasBattery ? u8(p, 26) : null,
    battery_power: hasBattery ? batteryPower : null,
    battery_charge_total: null,
    battery_discharge_total: null,
    temperature: tempOrNull(s16(p, 53)),
    grid_voltage: scale(u16(p, 34), 10),
    grid_frequency: scale(s16(p, 40), 100),
    status: ES_STATUS[u8(p, 42)] ?? STATUS.UNKNOWN,
    error_codes: u32(p, 55),
    has_battery: hasBattery,
  };
}

function tempOrNull(raw) {
  // -1 and 32767 are the "no probe" markers.
  if (raw === null || raw === -1 || raw === 32767) return null;
  return raw / 10;
}

const READERS = { [FAMILY.ET]: readEt, [FAMILY.DT]: readDt, [FAMILY.ES]: readEs };

/** Read the live values of an identified inverter. */
export async function readInverter(client, inv) {
  const reader = READERS[inv.family];
  if (!reader) {
    throw new UnsupportedOperationError(`Unknown GoodWe family ${inv.family}`);
  }
  const reading = await reader(client, inv);
  for (const key of ['grid_voltage', 'grid_frequency', 'temperature']) {
    reading[key] = round(reading[key], key === 'grid_frequency' ? 2 : 1);
  }
  return reading;
}

// --- Settings (scene actions) ---------------------------------------------------

/** Switch the energy management mode of an ET-family hybrid. */
export async function setOperationMode(client, inv, mode) {
  if (inv.family !== FAMILY.ET) {
    throw new UnsupportedOperationError(
      'Changing the operation mode is supported on ET/EH/BT/BH hybrids only',
    );
  }
  const value = OPERATION_MODES[mode];
  if (value === undefined) {
    throw new UnsupportedOperationError(`Unknown operation mode "${mode}"`);
  }
  await client.execute(inv.host, modbusWrite(ET_ADDRESS, 47000, value));
  // Back on-grid (the off-grid flag stays cleared), as the GoodWe app does.
  await client.execute(
    inv.host,
    modbusWriteMulti(ET_ADDRESS, 0xb997, Buffer.from('00010000', 'hex')),
  );
  if (mode !== 'eco') {
    // Clear the battery mode parameters of a previous eco schedule.
    await client.execute(inv.host, modbusWrite(ET_ADDRESS, 0xb9ad, 1));
  }
}

/** Cap the power exported to the grid, in W. */
export async function setExportLimit(client, inv, watts) {
  const limit = Math.round(Number(watts));
  if (!Number.isFinite(limit) || limit < 0 || limit > 0xffff) {
    throw new UnsupportedOperationError('The export limit must be between 0 and 65535 W');
  }
  if (inv.family === FAMILY.ET) {
    await client.execute(inv.host, modbusWrite(ET_ADDRESS, 47510, limit));
    return;
  }
  if (inv.family === FAMILY.ES) {
    await client.execute(inv.host, aa55ExportLimit(limit));
    return;
  }
  if (inv.family === FAMILY.DT && inv.singlePhase) {
    const value = Buffer.alloc(4);
    value.writeUInt32BE(limit);
    await client.execute(inv.host, modbusWriteMulti(DT_ADDRESS, 40328, value));
    return;
  }
  throw new UnsupportedOperationError(
    'Three-phase DT inverters take their export limit in percent: set it in the GoodWe app',
  );
}

/** Set the depth of discharge of the battery (on-grid), in %. */
export async function setBatteryDod(client, inv, dod) {
  const value = Math.round(Number(dod));
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new UnsupportedOperationError('The depth of discharge must be between 0 and 100 %');
  }
  if (inv.family === FAMILY.ET) {
    await client.execute(inv.host, modbusWrite(ET_ADDRESS, 45356, 100 - value));
    return;
  }
  if (inv.family === FAMILY.ES) {
    await client.execute(inv.host, aa55WriteRegister(0x560, 100 - value));
    return;
  }
  throw new UnsupportedOperationError('This inverter has no battery');
}
