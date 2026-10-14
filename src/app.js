// -----------------------------------------------------------------------------
// SDK wiring: registers every handler on a GladysIntegration instance.
//
// Kept out of index.js so the tests run the real wiring against the fake
// Gladys of the SDK (`createFakeGladys`), with a fake UDP client and a fake
// SEMS client injected in place of the network.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { createGoodWeService } from './service.js';
import { createPoller } from './poller.js';
import { SCENE_ACTIONS } from './scenes.js';
import { createWidgets, refreshWidgets } from './widgets.js';
import { joinLines, t } from './i18n.js';

const logger = createLogger({ name: 'app' });

export function createApp(gladys, serviceOptions = {}) {
  let config = normalizeConfig();
  const service = createGoodWeService({ gladys, ...serviceOptions });
  const widgets = createWidgets(service, gladys);
  const pollDevice = createPoller((device) => service.pollDevice(device));
  let started = false;

  async function publishDevices() {
    const { devices } = await service.discover();
    await gladys.publishDiscoveredDevices(devices);
    const transports = service.transports();
    if (transports.length > 0) {
      await gladys.publishTransports(transports);
    }
    refreshWidgets(gladys, widgets);
  }

  async function reportConnectionStatus() {
    const problem = service.connectionProblem();
    await gladys.setConnectionStatus(problem === null, problem ?? undefined);
  }

  // --- Discovery: Gladys asks for the list of devices ------------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> scanning the LAN and the SEMS account');
    await publishDevices();
    await reportConnectionStatus();
  });

  // --- Polling: Gladys asks to refresh a device ------------------------------
  gladys.onPoll(async (device) => {
    if (!(await pollDevice(device, config))) {
      logger.debug(`onPoll skipped (not due) for ${device.external_id}`);
    }
  });

  // Every feature is a read-only measurement: nothing to set.
  gladys.onSetValue(async (device) => {
    throw new Error(`${device.external_id} has no controllable feature`);
  });

  // --- Manifest action: "Test the connection" --------------------------------
  gladys.onAction('test_connection', async () => {
    const lines = await service.test();
    await gladys.publishDiscoveredDevices(service.devices());
    await reportConnectionStatus();
    return lines.length > 0 ? joinLines(lines) : t('nothing_configured');
  });

  // --- Scene actions ----------------------------------------------------------
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(service, { fields, config }));
  }

  // --- Dashboard widgets --------------------------------------------------------
  for (const [key, widget] of Object.entries(widgets)) {
    gladys.onWidgetGet(key, (request) => widget.get({ ...request, config }));
    if (typeof widget.action === 'function') {
      gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
        widget.action({ actionKey, params, settings, config }),
      );
    }
  }

  // --- Configuration updated by the user ----------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    config = normalizeConfig(newConfig);
    service.setConfig(config);
    await publishDevices();
    await reportConnectionStatus();
  });

  // --- Connection lifecycle -------------------------------------------------------
  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      if (!started) {
        await service.start(config);
        started = true;
      } else {
        service.setConfig(config);
      }
      await publishDevices();
      await reportConnectionStatus();
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys.setConnectionStatus(false, t('init_failed')).catch(() => {});
    }
  });

  return { service, widgets, getConfig: () => config };
}
