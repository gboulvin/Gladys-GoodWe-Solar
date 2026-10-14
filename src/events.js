// -----------------------------------------------------------------------------
// Scene triggers (manifest `scene_triggers`, Gladys 5.1+).
//
// The values themselves (production, grid power, battery level) are device
// features: a scene can already react to "production > 2000 W" with the core
// "device state" trigger. The triggers below are EVENTS a single state cannot
// express — a transition, with its details as scene variables:
//
//   production_started   sunrise: production went from ~0 to > 50 W
//   production_stopped   sunset: production back to ~0 (variable: energy of the day)
//   surplus_started      export above the configured threshold (variable: W)
//   surplus_stopped      export back under half the threshold
//   inverter_fault       the inverter reports a new error code
//   inverter_unreachable neither the LAN nor the SEMS cloud answers anymore
//   inverter_reachable   it answers again
//
// One event per TRANSITION (with hysteresis so a cloud passing over the panels
// does not fire ten events), never on the first reading after a start: the
// integration does not know what happened while it was stopped.
// -----------------------------------------------------------------------------

export const TRIGGERS = {
  PRODUCTION_STARTED: 'production_started',
  PRODUCTION_STOPPED: 'production_stopped',
  SURPLUS_STARTED: 'surplus_started',
  SURPLUS_STOPPED: 'surplus_stopped',
  INVERTER_FAULT: 'inverter_fault',
  INVERTER_UNREACHABLE: 'inverter_unreachable',
  INVERTER_REACHABLE: 'inverter_reachable',
};

export const SCENE_TRIGGER_KEYS = Object.values(TRIGGERS);

const PRODUCTION_ON_W = 50;
const PRODUCTION_OFF_W = 5;

// ET-family error bitmap (register 35189), bit -> label.
const ERROR_BITS = {
  31: 'Internal Communication Failure',
  30: 'EEPROM R/W Failure',
  29: 'Fac Failure',
  28: 'DSP communication failure',
  27: 'PhaseAngleFailure',
  25: 'Relay Check Failure',
  23: 'Vac Consistency Failure',
  22: 'Fac Consistency Failure',
  20: 'Back-Up Over Load',
  19: 'DC Injection High',
  18: 'Isolation Failure',
  17: 'Vac Failure',
  16: 'External Fan Failure',
  15: 'PV Over Voltage',
  14: 'Utility Phase Failure',
  13: 'Over Temperature',
  12: 'InternalFan Failure',
  11: 'DC Bus High',
  10: 'Ground I Failure',
  9: 'Utility Loss',
  8: 'AC HCT Failure',
  7: 'Relay Device Failure',
  6: 'GFCI Device Failure',
  4: 'GFCI Consistency Failure',
  3: 'DCI Consistency Failure',
  1: 'AC HCT Check Failure',
  0: 'GFCI Device Check Failure',
};

export function describeErrors(code, family) {
  if (!code) return '';
  if (family !== 'ET') return `Error code ${code}`;
  const labels = [];
  for (let bit = 31; bit >= 0; bit -= 1) {
    if ((code >>> bit) & 1) {
      labels.push(ERROR_BITS[bit] ?? `Error bit ${bit}`);
    }
  }
  return labels.join(', ');
}

/**
 * Per-inverter transition tracker. `update()` takes the new reading and
 * returns the scene events to publish: `[{ key, data }]`.
 */
export function createEventTracker() {
  const memory = new Map();

  return {
    /**
     * @param {object} entry inventory entry (serial, family)
     * @param {string} deviceExternalId value of the `device` filter
     * @param {object} reading normalized reading
     * @param {{ surplusThreshold: number }} options
     */
    update(entry, deviceExternalId, reading, { surplusThreshold }) {
      const previous = memory.get(entry.serial);
      const events = [];
      const exportPower = reading.grid_power === null ? null : Math.max(0, -reading.grid_power);

      const producing =
        reading.pv_power === null
          ? previous?.producing
          : reading.pv_power > PRODUCTION_ON_W
            ? true
            : reading.pv_power <= PRODUCTION_OFF_W
              ? false
              : previous?.producing;
      const surplus =
        exportPower === null
          ? previous?.surplus
          : exportPower >= surplusThreshold && surplusThreshold > 0
            ? true
            : exportPower < surplusThreshold / 2
              ? false
              : previous?.surplus;
      const errorCode = reading.error_codes ?? 0;

      if (previous && previous.reachable !== false) {
        if (producing === true && previous.producing === false) {
          events.push({
            key: TRIGGERS.PRODUCTION_STARTED,
            data: { device: deviceExternalId, power: reading.pv_power },
          });
        }
        if (producing === false && previous.producing === true) {
          events.push({
            key: TRIGGERS.PRODUCTION_STOPPED,
            data: { device: deviceExternalId, energy_today: reading.pv_energy_today ?? null },
          });
        }
        if (surplus === true && previous.surplus === false) {
          events.push({
            key: TRIGGERS.SURPLUS_STARTED,
            data: { device: deviceExternalId, power: exportPower },
          });
        }
        if (surplus === false && previous.surplus === true) {
          events.push({
            key: TRIGGERS.SURPLUS_STOPPED,
            data: { device: deviceExternalId, power: exportPower },
          });
        }
        if (errorCode !== 0 && errorCode !== previous.errorCode) {
          events.push({
            key: TRIGGERS.INVERTER_FAULT,
            data: {
              device: deviceExternalId,
              error_code: errorCode,
              error: describeErrors(errorCode, entry.family),
            },
          });
        }
      }
      // Back online, unless it was never reachable since the start.
      if (previous?.reachable === false && !previous.neverRead) {
        events.push({ key: TRIGGERS.INVERTER_REACHABLE, data: { device: deviceExternalId } });
      }

      memory.set(entry.serial, { producing, surplus, errorCode, reachable: true });
      return events;
    },

    /** The inverter could not be read on any channel. */
    unreachable(entry, deviceExternalId) {
      const previous = memory.get(entry.serial);
      if (!previous) {
        memory.set(entry.serial, { reachable: false, neverRead: true });
        return [];
      }
      if (previous.reachable === false) {
        return [];
      }
      memory.set(entry.serial, { ...previous, reachable: false });
      return [{ key: TRIGGERS.INVERTER_UNREACHABLE, data: { device: deviceExternalId } }];
    },
  };
}
