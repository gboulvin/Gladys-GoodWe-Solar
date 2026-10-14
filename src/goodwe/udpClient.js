// -----------------------------------------------------------------------------
// UDP request/response client for the GoodWe local protocol.
//
// UDP is unreliable by design and the WiFi dongles are slow and single-minded:
//   - one request at a time per inverter (a queue per host), a second request
//     sent while the first is in flight gets both answers mixed up;
//   - a lost datagram is retried (`retries`), a long answer may arrive in
//     several datagrams and is reassembled until the validator says OK.
//
// Unicast UDP crosses the Docker bridge NAT in both directions, so the
// container reaches the inverter directly once its IP is known (discovery
// itself is a broadcast, mediated by the Gladys core: see discovery.js).
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';
import { FRAME, GOODWE_UDP_PORT } from './protocol.js';

/** Raised when the inverter did not answer (validly) after every retry. */
export class NoResponseError extends Error {
  constructor(host, describe) {
    super(`No valid response from ${host} to ${describe}`);
    this.name = 'NoResponseError';
    this.host = host;
  }
}

const queues = new Map();

/** Serialize the calls per host: the next one starts when the previous settles. */
function enqueue(host, task) {
  const previous = queues.get(host) ?? Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => {});
  queues.set(host, tail);
  tail.then(() => {
    if (queues.get(host) === tail) queues.delete(host);
  });
  return run;
}

/**
 * Send one datagram and resolve with the full validated answer (a Buffer).
 * Throws NoResponseError after `retries + 1` attempts, or the validator's
 * RequestRejectedError when the inverter refuses the request.
 */
function attempt(host, port, command, timeoutMs, createSocket) {
  return new Promise((resolve, reject) => {
    const socket = createSocket();
    let buffer = Buffer.alloc(0);
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // already closed
      }
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(null, null), timeoutMs);
    socket.on('error', (err) => finish(err));
    socket.on('message', (message) => {
      buffer = Buffer.concat([buffer, message]);
      let verdict;
      try {
        verdict = command.validate(buffer);
      } catch (err) {
        finish(err);
        return;
      }
      if (verdict === FRAME.OK) {
        finish(null, buffer);
      } else if (verdict === FRAME.INVALID) {
        // Garbage or a late answer to a previous request: start over.
        buffer = Buffer.alloc(0);
      }
    });
    socket.send(command.request, port, host, (err) => {
      if (err) finish(err);
    });
  });
}

export function createUdpClient({
  port = GOODWE_UDP_PORT,
  timeoutMs = 2000,
  retries = 3,
  createSocket = () => dgram.createSocket('udp4'),
} = {}) {
  return {
    port,
    /**
     * Execute a command (see protocol.js) against `host` and resolve with
     * `{ raw, payload, offsetOf }`.
     */
    execute(host, command) {
      return enqueue(host, async () => {
        for (let i = 0; i <= retries; i += 1) {
          let raw;
          try {
            raw = await attempt(host, port, command, timeoutMs, createSocket);
          } catch (err) {
            if (err?.name === 'RequestRejectedError') throw err;
            raw = null;
          }
          if (raw) {
            return { raw, payload: command.payload(raw), offsetOf: command.offsetOf };
          }
        }
        throw new NoResponseError(host, command.describe);
      });
    },
  };
}
