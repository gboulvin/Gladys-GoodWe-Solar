// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+).
//
//   goodwe_overview    live tiles of one inverter (solar, house, grid,
//                      battery), its state and connection, a Refresh button
//   goodwe_production  production/consumption chart over a chosen period, and
//                      the energy balance of the day
//
// Both are bound to one inverter by a `"source": "devices"` setting. The
// tiles and the chart are DEVICE-BOUND (`device_feature`): they follow the
// published states live, nothing to refresh. The status rows are computed
// from the last reading, so the TTL stays short.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { inverterIds } from './devices/inverter.js';
import { t } from './i18n.js';

const logger = createLogger({ name: 'widgets' });

export const OVERVIEW_WIDGET = 'goodwe_overview';
export const PRODUCTION_WIDGET = 'goodwe_production';

const ACTIONS = { REFRESH: 'refresh' };
export const CHART_PERIODS = ['last-day', 'last-three-days', 'last-week', 'last-month'];

const STATUS_COLORS = {
  normal: WIDGET_COLORS.SUCCESS,
  waiting: WIDGET_COLORS.NEUTRAL,
  'off-grid': WIDGET_COLORS.WARNING,
  checking: WIDGET_COLORS.INFO,
  fault: WIDGET_COLORS.DANGER,
  unknown: WIDGET_COLORS.NEUTRAL,
};

const TRANSPORT_COLORS = {
  local: WIDGET_COLORS.SUCCESS,
  cloud: WIDGET_COLORS.INFO,
  unreachable: WIDGET_COLORS.DANGER,
};

const kwh = (value) => `${Math.round(value * 10) / 10} kWh`;

function pickDevice(service, gladys, settings) {
  const snapshot = settings?.device ? service.snapshot(settings.device) : null;
  if (!snapshot) return null;
  const ids = inverterIds(gladys, snapshot.entry.serial);
  const has = (key) => snapshot.entry.features.includes(key);
  return { ...snapshot, ids, has };
}

function pickDeviceMessage() {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', text: t('w_pick_device'), variant: 'body' }],
  };
}

function statusRows(snapshot) {
  const items = [];
  const reading = snapshot.reading;
  const transport = snapshot.transport;
  if (reading?.status) {
    items.push({
      label: t('w_state'),
      icon: 'sun',
      value: t(`state_${reading.status}`),
      color: STATUS_COLORS[reading.status] ?? WIDGET_COLORS.NEUTRAL,
    });
  }
  if (transport) {
    items.push({
      label: t('w_connection'),
      icon: transport.transport === 'unreachable' ? 'wifi-off' : 'wifi',
      value: t(`transport_${transport.transport}`),
      color: transport.degraded
        ? WIDGET_COLORS.WARNING
        : (TRANSPORT_COLORS[transport.transport] ?? WIDGET_COLORS.NEUTRAL),
    });
  }
  if (typeof reading?.grid_power === 'number') {
    const power = reading.grid_power;
    const key = power > 20 ? 'w_importing' : power < -20 ? 'w_exporting' : 'w_balanced';
    items.push({
      label: t('w_flow'),
      icon: 'activity',
      value: t(key),
      color:
        key === 'w_exporting'
          ? WIDGET_COLORS.SUCCESS
          : key === 'w_importing'
            ? WIDGET_COLORS.WARNING
            : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (typeof reading?.pv_energy_today === 'number') {
    items.push({
      label: t('w_today'),
      icon: 'sunrise',
      value: kwh(reading.pv_energy_today),
      color: WIDGET_COLORS.PRIMARY,
    });
  }
  return items;
}

/** Daily energy balance rows (local readings only carry the daily counters). */
function balanceRows(reading) {
  if (!reading) return [];
  const items = [];
  const produced = reading.pv_energy_today;
  const imported = reading.grid_import_today;
  const exported = reading.grid_export_today;
  if (typeof produced === 'number') {
    items.push({
      label: t('w_today'),
      icon: 'sun',
      value: kwh(produced),
      color: WIDGET_COLORS.PRIMARY,
    });
  }
  if (typeof imported === 'number') {
    items.push({
      label: t('w_imported_today'),
      icon: 'download',
      value: kwh(imported),
      color: WIDGET_COLORS.WARNING,
    });
  }
  if (typeof exported === 'number') {
    items.push({
      label: t('w_exported_today'),
      icon: 'upload',
      value: kwh(exported),
      color: WIDGET_COLORS.SUCCESS,
    });
  }
  if ([produced, imported, exported].every((value) => typeof value === 'number')) {
    const consumed = produced + imported - exported;
    if (consumed > 0) {
      const ratio = Math.min(100, Math.max(0, Math.round((1 - imported / consumed) * 100)));
      items.push({
        label: t('w_self_sufficiency'),
        icon: 'home',
        value: `${ratio} %`,
        color: ratio >= 50 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.INFO,
      });
    }
  }
  return items;
}

export function createWidgets(service, gladys) {
  return {
    [OVERVIEW_WIDGET]: {
      async get({ settings }) {
        logger.debug(`onWidgetGet <- ${OVERVIEW_WIDGET}`);
        const device = pickDevice(service, gladys, settings);
        if (!device) return pickDeviceMessage();
        const { ids, has } = device;
        const components = [
          {
            type: 'value',
            label: t('w_production'),
            icon: 'sun',
            device_feature: ids.feature('pv-power'),
          },
        ];
        if (has('house-consumption')) {
          components.push({
            type: 'value',
            label: t('w_consumption'),
            icon: 'home',
            device_feature: ids.feature('house-consumption'),
          });
        }
        if (has('grid-power')) {
          components.push({
            type: 'value',
            label: t('w_grid'),
            icon: 'zap',
            device_feature: ids.feature('grid-power'),
          });
        }
        if (has('battery-level')) {
          components.push({
            type: 'gauge',
            label: t('w_battery'),
            device_feature: ids.feature('battery-level'),
          });
        }
        const items = statusRows(device);
        if (items.length > 0) components.push({ type: 'status', items });
        components.push({
          type: 'button',
          label: t('w_refresh'),
          icon: 'refresh-cw',
          style: 'secondary',
          action: { key: ACTIONS.REFRESH, params: { device: ids.device } },
        });
        return { ttl_seconds: 60, components };
      },

      // After a successful action the core refetches the content: the status
      // rows show the fresh reading without any nudge.
      async action({ actionKey, params }) {
        logger.info(`onWidgetAction <- ${OVERVIEW_WIDGET}.${actionKey}`);
        if (actionKey !== ACTIONS.REFRESH) {
          throw new Error(`Unknown widget action: ${actionKey}`);
        }
        const reading = await service.refresh(params.device);
        return reading ? t('refreshed') : t('refresh_failed');
      },
    },

    [PRODUCTION_WIDGET]: {
      async get({ settings }) {
        logger.debug(`onWidgetGet <- ${PRODUCTION_WIDGET}`);
        const device = pickDevice(service, gladys, settings);
        if (!device) return pickDeviceMessage();
        const { ids, has } = device;
        const features = [ids.feature('pv-power')];
        if (has('house-consumption')) features.push(ids.feature('house-consumption'));
        const interval = CHART_PERIODS.includes(settings.period) ? settings.period : 'last-day';
        const components = [
          {
            type: 'chart',
            title: t('w_chart_title'),
            chart_type: 'area',
            device_features: features,
            interval,
          },
        ];
        const items = balanceRows(device.reading);
        if (items.length > 0) components.push({ type: 'status', items });
        return { ttl_seconds: 300, components };
      },
    },
  };
}

/**
 * Freshness nudge: re-pull every widget now (after a (re)connection or a
 * discovery, which change the computed rows). Rate-limited core-side to one
 * per 10 s per widget, dropped silently while disconnected.
 */
export function refreshWidgets(gladys, widgets) {
  for (const key of Object.keys(widgets)) {
    gladys.requestWidgetRefresh(key);
  }
}
