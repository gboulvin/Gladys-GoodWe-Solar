// -----------------------------------------------------------------------------
// Gladys device of a GoodWe inverter.
//
// One device per inverter, keyed by its SERIAL NUMBER: the only id that is the
// same whether the inverter is reached locally (UDP) or through the SEMS cloud,
// and that survives a DHCP lease change. External ids are forever: never key
// a device on an IP address or a label.
//
// The features depend on what the inverter reports (a grid-tied DT without
// smart meter has no grid power, only hybrids have a battery...): the device
// gets the features whose value was read at discovery time (`entry.features`).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'inverter';

// Feature keys are stored by Gladys (history, scenes, dashboards): never
// rename one. `reading` is the key of the normalized reading it publishes.
export const FEATURES = [
  {
    key: 'pv-power',
    reading: 'pv_power',
    name: 'Solar production',
    category: C.ENERGY_PRODUCTION_SENSOR,
    type: T.ENERGY_PRODUCTION_SENSOR.POWER,
    unit: U.WATT,
    min: 0,
    max: 100000,
  },
  {
    key: 'pv-energy-today',
    reading: 'pv_energy_today',
    name: 'Production today',
    category: C.ENERGY_PRODUCTION_SENSOR,
    type: T.ENERGY_PRODUCTION_SENSOR.DAILY_PRODUCTION,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: 1000,
  },
  {
    key: 'pv-energy-total',
    reading: 'pv_energy_total',
    name: 'Total production',
    category: C.ENERGY_PRODUCTION_SENSOR,
    type: T.ENERGY_PRODUCTION_SENSOR.INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: 100000000,
  },
  {
    key: 'grid-power',
    reading: 'grid_power',
    name: 'Grid power (import +, export -)',
    category: C.GRID_SENSOR,
    type: T.GRID_SENSOR.POWER,
    unit: U.WATT,
    min: -100000,
    max: 100000,
  },
  {
    key: 'grid-import-index',
    reading: 'grid_import_total',
    name: 'Grid import index',
    category: C.GRID_SENSOR,
    type: T.GRID_SENSOR.INPUT_INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: 100000000,
  },
  {
    key: 'grid-export-index',
    reading: 'grid_export_total',
    name: 'Grid export index',
    category: C.GRID_SENSOR,
    type: T.GRID_SENSOR.OUTPUT_INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: 100000000,
  },
  {
    key: 'house-consumption',
    reading: 'load_power',
    name: 'House consumption',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.POWER,
    unit: U.WATT,
    min: 0,
    max: 100000,
  },
  {
    key: 'battery-level',
    reading: 'battery_soc',
    name: 'Battery level',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.BATTERY_LEVEL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
  },
  {
    key: 'battery-charge-power',
    reading: 'battery_charge_power',
    name: 'Battery charging power',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.CHARGE_POWER,
    unit: U.WATT,
    min: 0,
    max: 50000,
  },
  {
    key: 'battery-discharge-power',
    reading: 'battery_discharge_power',
    name: 'Battery discharging power',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.DISCHARGE_POWER,
    unit: U.WATT,
    min: 0,
    max: 50000,
  },
  {
    key: 'battery-charge-index',
    reading: 'battery_charge_total',
    name: 'Battery charged energy',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.CHARGE_INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: 100000000,
  },
  {
    key: 'battery-discharge-index',
    reading: 'battery_discharge_total',
    name: 'Battery discharged energy',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.DISCHARGE_INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: 100000000,
  },
  {
    key: 'temperature',
    reading: 'temperature',
    name: 'Inverter temperature',
    category: C.DEVICE_TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -40,
    max: 120,
  },
  {
    key: 'grid-voltage',
    reading: 'grid_voltage',
    name: 'Grid voltage',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.VOLTAGE,
    unit: U.VOLT,
    min: 0,
    max: 500,
  },
];

const FEATURE_BY_KEY = new Map(FEATURES.map((feature) => [feature.key, feature]));

/**
 * Add the derived values (split battery power) to a normalized reading.
 * Gladys models the battery flow as two >= 0 values.
 */
export function withDerivedValues(reading) {
  const battery = reading.battery_power;
  return {
    ...reading,
    battery_charge_power: battery === null || battery === undefined ? null : Math.max(0, -battery),
    battery_discharge_power:
      battery === null || battery === undefined ? null : Math.max(0, battery),
  };
}

/** The feature keys a reading can feed: the values it actually carries. */
export function featureKeysOf(reading) {
  const derived = withDerivedValues(reading);
  return FEATURES.filter(
    (feature) => derived[feature.reading] !== null && derived[feature.reading] !== undefined,
  ).map((feature) => feature.key);
}

export function inverterIds(gladys, serial) {
  return gladys.externalIds(DEVICE_TYPE, serial);
}

/** The discovery payload of an inventory entry (see src/service.js). */
export function buildInverterDevice(gladys, entry) {
  const ids = inverterIds(gladys, entry.serial);
  const keys = FEATURES.map((feature) => feature.key).filter((key) => entry.features.includes(key));
  if (!keys.includes('pv-power')) {
    keys.unshift('pv-power');
  }
  const params = [
    { name: 'SERIAL_NUMBER', value: entry.serial },
    { name: 'MODEL', value: entry.model ?? '' },
  ];
  if (entry.family) params.push({ name: 'FAMILY', value: entry.family });
  if (entry.host) params.push({ name: 'IP_ADDRESS', value: entry.host });
  if (entry.stationId) params.push({ name: 'SEMS_STATION_ID', value: entry.stationId });
  return {
    name: entry.name || `GoodWe ${entry.model ?? ''} ${entry.serial}`.replace(/\s+/g, ' ').trim(),
    external_id: ids.device,
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    params,
    features: keys.map((key) => {
      const feature = FEATURE_BY_KEY.get(key);
      return {
        name: feature.name,
        external_id: ids.feature(key),
        category: feature.category,
        type: feature.type,
        unit: feature.unit,
        min: feature.min,
        max: feature.max,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      };
    }),
  };
}

/**
 * The states to publish for a reading, limited to the features of the device.
 * @returns {{ device_feature_external_id: string, state: number }[]}
 */
export function buildStates(gladys, entry, reading) {
  const ids = inverterIds(gladys, entry.serial);
  const derived = withDerivedValues(reading);
  const states = [];
  for (const feature of FEATURES) {
    if (!entry.features.includes(feature.key)) continue;
    const value = derived[feature.reading];
    if (typeof value === 'number' && Number.isFinite(value)) {
      states.push({ device_feature_external_id: ids.feature(feature.key), state: value });
    }
  }
  return states;
}
