// -----------------------------------------------------------------------------
// Poll pacing.
//
// Gladys polls a device at a fixed pace, read once when the device is created
// and at most once a minute (DEVICE_POLL_FREQUENCIES): the inverters declare
// that minute, and the slower interval of the config (`poll_frequency`, in
// seconds) is applied here by skipping the polls in between, so the user can
// change it at any time without re-creating the devices.
// -----------------------------------------------------------------------------

import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';

// Gladys' poll ticks drift by a few milliseconds: a read due within the next
// half-minute runs now, so a 300 s interval does not slip to 360 s.
const POLL_TOLERANCE_MS = DEVICE_POLL_FREQUENCIES.EVERY_MINUTES / 2;

/**
 * Create the `onPoll` dispatcher. Resolves `true` when the device was read,
 * `false` when the poll was skipped. A read that throws is retried at the
 * next poll.
 * @param {(device: object) => Promise<unknown>} read
 */
export function createPoller(read, now = Date.now) {
  const lastReads = new Map();
  return async function pollDevice(device, config) {
    const time = now();
    const lastRead = lastReads.get(device.external_id);
    if (
      lastRead !== undefined &&
      time - lastRead < config.poll_frequency * 1000 - POLL_TOLERANCE_MS
    ) {
      return false;
    }
    await read(device);
    lastReads.set(device.external_id, time);
    return true;
  };
}
