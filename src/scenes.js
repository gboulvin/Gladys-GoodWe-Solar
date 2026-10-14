// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
//   read_inverter        read the inverter now, expose the values as outputs
//                        ({{action.pv_power}}...) to the following actions
//   set_operation_mode   ET/EH/BT/BH hybrids: general, backup, eco...
//   set_export_limit     cap the power injected into the grid, in W
//   set_battery_dod      on-grid depth of discharge of the battery, in %
//
// Rules (SDK): `fields` arrive RESOLVED (`device` = the device external_id);
// resolve the declared `outputs` only. "This inverter cannot do it" is an
// output (`applied: false`), not a failure: the scene author gates on it. A
// network error throws, which fails THIS action only (the scene continues).
// The writes need the LAN: the SEMS cloud is read-only.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { UnsupportedOperationError } from './goodwe/inverter.js';
import { NeedsLocalError } from './service.js';

const logger = createLogger({ name: 'scenes' });

async function applySetting(name, operation) {
  try {
    await operation();
    logger.info(`Scene action ${name} applied`);
    return { applied: true };
  } catch (err) {
    if (err instanceof UnsupportedOperationError || err instanceof NeedsLocalError) {
      logger.warn(`Scene action ${name} not applied: ${err.message}`);
      return { applied: false };
    }
    throw err;
  }
}

export const SCENE_ACTIONS = {
  async read_inverter(service, { fields }) {
    const reading = await service.refresh(fields.device);
    if (!reading) {
      return { reachable: false };
    }
    const outputs = { reachable: true };
    for (const key of ['pv_power', 'grid_power', 'load_power', 'battery_soc', 'pv_energy_today']) {
      if (typeof reading[key] === 'number') outputs[key] = reading[key];
    }
    return outputs;
  },

  async set_operation_mode(service, { fields }) {
    return applySetting('set_operation_mode', () =>
      service.setOperationMode(fields.device, fields.mode),
    );
  },

  async set_export_limit(service, { fields }) {
    return applySetting('set_export_limit', () =>
      service.setExportLimit(fields.device, fields.limit),
    );
  },

  async set_battery_dod(service, { fields }) {
    return applySetting('set_battery_dod', () => service.setBatteryDod(fields.device, fields.dod));
  },
};
