// -----------------------------------------------------------------------------
// A fake GoodWe inverter: a real UDP server on 127.0.0.1 answering the requests
// with the frames captured on real inverters (test/fixtures). The driver under
// test goes through real sockets; nothing leaves the machine.
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';
import { readFileSync } from 'node:fs';
import { modbusCrc } from '../../src/goodwe/protocol.js';

export const fixture = (name) =>
  Buffer.from(
    readFileSync(new URL(`../fixtures/${name}.hex`, import.meta.url), 'utf8').trim(),
    'hex',
  );

// Request bytes (hex) -> answer name, as built by the driver.
export const REQUESTS = {
  AA55_INFO: 'aa55c07f0102000241',
  AA55_RUNTIME: 'aa55c07f0106000245',
  ET_INFO: 'f70388b800213ac1',
  ET_RUNTIME: 'f703891c007d7ae7',
  DT_RUNTIME: '7f0375940049d5c2',
};

/** A Modbus exception answer (`ILLEGAL DATA ADDRESS` by default). */
export function modbusException(address, fn, reason = 2) {
  const body = Buffer.from([address, fn | 0x80, reason]);
  const crc = modbusCrc(body);
  return Buffer.concat([Buffer.from([0xaa, 0x55]), body, Buffer.from([crc & 0xff, crc >> 8])]);
}

/** The answer of an inverter to a Modbus write: the request echoed back. */
function writeEcho(request) {
  const echo = request.subarray(0, 6);
  const crc = modbusCrc(echo);
  return Buffer.concat([Buffer.from([0xaa, 0x55]), echo, Buffer.from([crc & 0xff, crc >> 8])]);
}

/** The answer of an inverter to an AA55 write: an empty payload. */
function aa55Ack(request) {
  const type = Buffer.from([request[4] | 0x00, request[5] | 0x80]);
  const body = Buffer.concat([Buffer.from([0xaa, 0x55, 0x7f, 0xc0]), type, Buffer.from([0])]);
  let sum = 0;
  for (const byte of body) sum += byte;
  return Buffer.concat([body, Buffer.from([(sum >> 8) & 0xff, sum & 0xff])]);
}

/**
 * Start a fake inverter.
 * @param {Record<string, Buffer|null>} answers request hex -> answer (null = silence)
 * @returns {Promise<{ port, requests, writes, close, answers }>}
 */
export async function startFakeInverter(answers) {
  const socket = dgram.createSocket('udp4');
  const requests = [];
  const writes = [];
  socket.on('message', (message, remote) => {
    const hex = message.toString('hex');
    requests.push(hex);
    let answer = answers[hex];
    if (answer === undefined) {
      if (message[1] === 0x06 || message[1] === 0x10) {
        writes.push(hex);
        answer = writeEcho(message);
      } else if (hex.startsWith('aa55c07f02') || hex.startsWith('aa55c07f03')) {
        writes.push(hex);
        answer = aa55Ack(message);
      }
    }
    if (answer) socket.send(answer, remote.port, remote.address);
  });
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve));
  return {
    port: socket.address().port,
    requests,
    writes,
    answers,
    close: () => new Promise((resolve) => socket.close(resolve)),
  };
}

export const ET_ANSWERS = () => ({
  [REQUESTS.ET_INFO]: fixture('et_device_info'),
  [REQUESTS.ET_RUNTIME]: fixture('et_running_data'),
  // 37000 x 24
  f70390880018fc7c: fixture('et_battery_info'),
});

export const DT_ANSWERS = () => ({
  // 30001 x 40
  '7f03753100280409': fixture('dt_device_info'),
  [REQUESTS.DT_RUNTIME]: fixture('dt_running_data'),
  // 30195 x 15: no smart meter on this installation
  '7f0375f3000fe5ef': modbusException(0x7f, 0x03),
});

export const ES_ANSWERS = () => ({
  [REQUESTS.AA55_INFO]: fixture('es_device_info'),
  [REQUESTS.AA55_RUNTIME]: fixture('es_running_data'),
});
