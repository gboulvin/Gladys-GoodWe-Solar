// -----------------------------------------------------------------------------
// GoodWe SEMS+ cloud client (the SEMS Portal / SEMS+ app account).
//
// GoodWe publishes no official public API: this follows the SEMS+ Web API the
// SEMS+ web portal itself uses, as documented by the community
// (https://github.com/TimSoethout/goodwe-sems-home-assistant):
//   - login: POST <login>/auth/cross-login, password = base64(md5(password));
//   - every call: a `Token` header (the login data, JSON) and an
//     `X-Signature` header = base64(sha256("<ms>@<uid>@<token>") + "@<ms>");
//   - success codes 0 / "00000", expired token 100002 / C0602, rate limit
//     GY0429 (or HTTP 429): back off 5 minutes.
// Read-only on purpose: the remote-control endpoints need permissions most
// end-user accounts do not have, and local control is the reliable path.
//
// `fetch` is injectable so the tests never touch the network.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

export const LOGIN_URL = 'https://semsplus.goodwe.com/web/sems/sems-user/api/v1/auth/cross-login';
export const FALLBACK_API = 'https://eu-gateway.semsportal.com/web/sems';

const SUCCESS_CODES = new Set(['0', '00000']);
const AUTH_EXPIRED_CODES = new Set(['100002', 'C0602']);
const RATE_LIMIT_CODE = 'GY0429';
const RATE_LIMIT_PAUSE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;

const INVERTER_DEVICE_TYPES = new Set(['INVERTER', 'ENERGY_STORAGE_INTEGRATED_CABINET']);

export class SemsError extends Error {
  constructor(message, { code, kind = 'api' } = {}) {
    super(message);
    this.name = 'SemsError';
    this.code = code;
    // 'auth' (bad credentials), 'rate_limit', 'api' (anything else)
    this.kind = kind;
  }
}

export function hashPassword(password) {
  const md5 = createHash('md5').update(password, 'utf8').digest('hex');
  return Buffer.from(md5, 'utf8').toString('base64');
}

export function signature(token, now = Date.now()) {
  const digest = createHash('sha256')
    .update(`${now}@${token?.uid ?? ''}@${token?.token ?? ''}`)
    .digest('hex');
  return Buffer.from(`${digest}@${now}`).toString('base64');
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const kw = (value) => {
  const number = toNumber(value);
  return number === null ? null : Math.round(number * 1000);
};

/**
 * Normalize a station power flow (kW, pGrid > 0 when exporting, pBat > 0 when
 * discharging) to the reading format of the local driver (W, grid > 0 when
 * importing).
 */
export function normalizeFlow(flow = {}) {
  const pv = kw(flow.pSystem ?? flow.pAc);
  const grid = kw(flow.pGrid);
  const load = kw(flow.pConsum);
  const battery = kw(flow.pBat);
  return {
    pv_power: pv === null ? null : Math.max(0, pv),
    grid_power: grid === null ? null : -grid,
    // SEMS+ may sign the consumption with the flow direction.
    load_power: load === null ? null : Math.abs(load),
    battery_power: battery,
    battery_soc: toNumber(flow.soc),
    has_battery: battery !== null || toNumber(flow.soc) !== null,
  };
}

/** Flatten SEMS+ telemetry groups `[{ factors: [{ code, data }] }]` by code. */
export function flattenFactors(groups) {
  const factors = {};
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const factor of group?.factors ?? []) {
      if (typeof factor?.code === 'string' && factor.data !== null && factor.data !== undefined) {
        factors[factor.code] = factor.data;
      }
    }
  }
  return factors;
}

export function createSemsClient({
  account,
  password,
  fetchImpl = globalThis.fetch,
  now = Date.now,
}) {
  let token = null;
  let pausedUntil = 0;

  function ensureNotPaused() {
    if (now() < pausedUntil) {
      throw new SemsError('SEMS rate limit: requests paused', { kind: 'rate_limit' });
    }
  }

  async function http(url, { method = 'GET', headers = {}, body } = {}) {
    ensureNotPaused();
    const response = await fetchImpl(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 429) {
      pausedUntil = now() + RATE_LIMIT_PAUSE_MS;
      throw new SemsError('SEMS rate limit (HTTP 429)', { kind: 'rate_limit' });
    }
    if (!response.ok) {
      throw new SemsError(`SEMS HTTP ${response.status}`);
    }
    const json = await response.json();
    const code = String(json?.code ?? '');
    if (code === RATE_LIMIT_CODE) {
      pausedUntil = now() + RATE_LIMIT_PAUSE_MS;
      throw new SemsError('SEMS rate limit', { code, kind: 'rate_limit' });
    }
    return json;
  }

  async function login() {
    if (!account || !password) {
      throw new SemsError('No SEMS account configured', { kind: 'auth' });
    }
    const anonymous = {
      uid: '',
      timestamp: 0,
      token: '',
      client: 'semsPlusWeb',
      version: '',
      language: 'en',
    };
    const json = await http(LOGIN_URL, {
      method: 'POST',
      headers: {
        Origin: 'https://semsplus.goodwe.com',
        Referer: 'https://semsplus.goodwe.com/',
        Token: JSON.stringify(anonymous),
        'X-Signature': signature(anonymous, now()),
      },
      body: {
        account,
        pwd: hashPassword(password),
        agreement: 1,
        isChinese: false,
        isLocal: false,
      },
    });
    const code = String(json?.code ?? '');
    if (!SUCCESS_CODES.has(code) || !json?.data?.token) {
      throw new SemsError(json?.msg || json?.description || 'SEMS login refused', {
        code,
        kind: AUTH_EXPIRED_CODES.has(code) ? 'api' : 'auth',
      });
    }
    const api = json.api || json.data.api || FALLBACK_API;
    token = { client: 'semsPlusWeb', version: '', language: 'en', ...json.data, api };
    return token;
  }

  async function call(path, { method = 'GET', body } = {}, retry = true) {
    if (!token) await login();
    const { api, ...tokenData } = token;
    const json = await http(`${api.replace(/\/$/, '')}${path}`, {
      method,
      body,
      headers: {
        Token: JSON.stringify(tokenData),
        'X-Signature': signature(tokenData, now()),
      },
    });
    const code = String(json?.code ?? '');
    if (AUTH_EXPIRED_CODES.has(code) && retry) {
      token = null;
      return call(path, { method, body }, false);
    }
    if (!SUCCESS_CODES.has(code)) {
      throw new SemsError(json?.msg || json?.description || `SEMS error ${code}`, { code });
    }
    return json.data;
  }

  return {
    login,

    /** The power stations of the account: [{ id, name }]. */
    async listStations() {
      const data = await call('/sems-plant/api/portal/stations/page', {
        method: 'POST',
        body: { current: 1, size: 100 },
      });
      return (data?.dataList ?? [])
        .filter((station) => typeof station?.id === 'string')
        .map((station) => ({
          id: station.id,
          name: station.stationName || station.name || station.id,
        }));
    },

    /** The inverters of a station: [{ serial, name, deviceType }]. */
    async listInverters(stationId) {
      const data = await call(
        `/sems-plant/api/stations/device/all-status?stationId=${encodeURIComponent(stationId)}`,
      );
      const inverters = [];
      for (const group of data?.deviceDetailList ?? []) {
        if (!INVERTER_DEVICE_TYPES.has(group?.deviceType)) continue;
        for (const statusGroup of group.statusDetailList ?? []) {
          for (const serial of statusGroup.snList ?? []) {
            if (typeof serial !== 'string') continue;
            const detail = statusGroup.detailMap?.[serial] ?? {};
            inverters.push({ serial, name: detail.name || serial, deviceType: group.deviceType });
          }
        }
      }
      return inverters;
    },

    /** Live power flow of a station, normalized (see normalizeFlow). */
    async getStationFlow(stationId) {
      const data = await call(
        `/sems-plant/api/stations/flow?stationId=${encodeURIComponent(stationId)}`,
      );
      return normalizeFlow(data ?? {});
    },

    /** Live telemetry of one inverter: AC power, temperature, grid voltage and frequency. */
    async getInverterTelemetry(stationId, serial, deviceType = 'INVERTER') {
      const data = await call(
        `/sems-plant/api/equipments/${encodeURIComponent(serial)}/telemetry` +
          `?deviceType=${encodeURIComponent(deviceType)}&pwId=${encodeURIComponent(stationId)}`,
      );
      const factors = flattenFactors(data);
      const pac = kw(factors.pAc);
      return {
        pv_power: pac === null ? null : Math.max(0, pac),
        temperature: toNumber(factors.Temperature),
        grid_voltage: toNumber(factors.Vac ?? factors['PHASE-A:Vac']),
        grid_frequency: toNumber(factors.Fac),
      };
    },
  };
}
