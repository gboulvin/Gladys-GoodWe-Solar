// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults
// (which MUST match the manifest `default` values, see test/manifest.test.js)
// and normalizes the received object so the rest of the code never deals
// with `undefined` or numbers typed as strings.
// -----------------------------------------------------------------------------

export const DEFAULT_CONFIG = {
  // Comma/space/semicolon separated IP addresses (or host names) of inverters.
  inverter_hosts: '',
  // Ask the Gladys core to broadcast the GoodWe discovery request on the LAN.
  network_scan: true,
  // SEMS / SEMS+ account (cloud). Empty = local only.
  sems_account: '',
  sems_password: '',
  // Seconds between two reads of an inverter (one minute minimum: the
  // fastest Gladys polls a device). The cloud is read at most every 5 minutes.
  poll_frequency: 60,
  // Exported power (W) above which the "surplus started" scene trigger fires.
  surplus_threshold: 500,
  // Reserved key (NOT in config_schema): the manifest declares both 'local'
  // and 'cloud' transports, so Gladys shows a standard "Prefer the local
  // connection" toggle and sends the user's choice here. Default true.
  GLADYS_PREFER_LOCAL: true,
};

/** Split the free-text host list into unique, trimmed entries. */
export function parseHosts(value) {
  return [
    ...new Set(
      String(value ?? '')
        .split(/[\s,;]+/)
        .map((host) => host.trim())
        .filter(Boolean),
    ),
  ];
}

function toNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    inverter_hosts: String(raw.inverter_hosts ?? DEFAULT_CONFIG.inverter_hosts),
    hosts: parseHosts(raw.inverter_hosts),
    network_scan: raw.network_scan !== false,
    sems_account: String(raw.sems_account ?? '').trim(),
    sems_password: String(raw.sems_password ?? ''),
    poll_frequency: toNumber(raw.poll_frequency, DEFAULT_CONFIG.poll_frequency, 60, 3600),
    surplus_threshold: toNumber(raw.surplus_threshold, DEFAULT_CONFIG.surplus_threshold, 0, 100000),
    // The preference is a boolean; anything but an explicit false means true.
    GLADYS_PREFER_LOCAL: raw.GLADYS_PREFER_LOCAL !== false,
  };
}

export function hasCloud(config) {
  return Boolean(config.sems_account && config.sems_password);
}
