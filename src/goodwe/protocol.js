// -----------------------------------------------------------------------------
// GoodWe local protocol: frame building and validation.
//
// GoodWe inverters (and their WiFi/LAN dongles) answer on UDP port 8899 with
// two protocols, depending on the generation:
//   - "AA55", the historical protocol (ES/EM/BP hybrids, and the identification
//     command every generation still answers);
//   - Modbus RTU wrapped in UDP (ET/EH/BT/BH hybrids, DT/MS/D-NS/XS grid-tied).
//     Requests are plain Modbus RTU frames; responses start with 0xAA 0x55,
//     then the Modbus address, function code, payload and CRC-16.
//
// Ported from the reference Python library `goodwe` (MIT licence,
// https://github.com/marcelblijleven/goodwe): every offset and checksum rule
// here mirrors it. This module is pure (no I/O) so it is fully unit-tested.
// -----------------------------------------------------------------------------

export const GOODWE_UDP_PORT = 8899;
export const DISCOVERY_PORT = 48899;
// Broadcast on DISCOVERY_PORT, every GoodWe dongle answers "ip,mac,name".
export const DISCOVERY_PAYLOAD = Buffer.from('WIFIKIT-214028-READ', 'ascii');

export const MODBUS_READ = 0x03;
export const MODBUS_WRITE = 0x06;
export const MODBUS_WRITE_MULTI = 0x10;

const MODBUS_FAILURES = {
  1: 'ILLEGAL FUNCTION',
  2: 'ILLEGAL DATA ADDRESS',
  3: 'ILLEGAL DATA VALUE',
  4: 'SLAVE DEVICE FAILURE',
  5: 'ACKNOWLEDGE',
  6: 'SLAVE DEVICE BUSY',
};

/** Thrown when the inverter answers a Modbus exception (e.g. unknown register). */
export class RequestRejectedError extends Error {
  constructor(reason) {
    super(`Request rejected by the inverter: ${reason}`);
    this.name = 'RequestRejectedError';
    this.reason = reason;
  }
}

// Validator verdicts: the UDP client keeps reading on PARTIAL (a long Modbus
// answer can arrive in several datagrams) and drops INVALID frames.
export const FRAME = { OK: 'ok', PARTIAL: 'partial', INVALID: 'invalid' };

const CRC_TABLE = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    table[i] = crc;
  }
  return table;
})();

/** Modbus CRC-16 (poly 0xA001, init 0xFFFF). */
export function modbusCrc(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return crc;
}

function withCrc(body) {
  const crc = modbusCrc(body);
  return Buffer.concat([body, Buffer.from([crc & 0xff, crc >>> 8])]);
}

/**
 * A command = the bytes to send + how to validate and trim the answer.
 * `payload(response)` returns the useful bytes; `offsetOf(register)` turns a
 * register number into a byte offset in that payload.
 */
function modbusCommand(request, fn, offset, value) {
  return {
    request,
    validate: (data) => validateModbusResponse(data, fn, offset, value),
    payload: (data) => data.subarray(5, data.length - 2),
    offsetOf: (register) => (register - offset) * 2,
    describe: `modbus fn=${fn} @${offset} (${value})`,
  };
}

/** Read `count` registers starting at `offset`. */
export function modbusRead(address, offset, count) {
  const body = Buffer.from([
    address,
    MODBUS_READ,
    offset >> 8,
    offset & 0xff,
    count >> 8,
    count & 0xff,
  ]);
  return modbusCommand(withCrc(body), MODBUS_READ, offset, count);
}

/** Write one 16-bit register. */
export function modbusWrite(address, register, value) {
  const raw = value & 0xffff;
  const body = Buffer.from([
    address,
    MODBUS_WRITE,
    register >> 8,
    register & 0xff,
    raw >> 8,
    raw & 0xff,
  ]);
  return modbusCommand(withCrc(body), MODBUS_WRITE, register, toSigned16(raw));
}

/** Write several consecutive registers (`values` is a Buffer of 2*n bytes). */
export function modbusWriteMulti(address, offset, values) {
  const count = values.length / 2;
  const body = Buffer.concat([
    Buffer.from([address, MODBUS_WRITE_MULTI, offset >> 8, offset & 0xff, 0, count, values.length]),
    values,
  ]);
  return modbusCommand(withCrc(body), MODBUS_WRITE_MULTI, offset, count);
}

function toSigned16(value) {
  return value > 0x7fff ? value - 0x10000 : value;
}

/**
 * Validate a Modbus-over-UDP answer:
 *   [0..1] 0xAA 0x55, [2] address, [3] function, [4] byte count (reads),
 *   payload, then the CRC-16 of everything from byte 2.
 * Throws RequestRejectedError on a Modbus exception answer.
 */
export function validateModbusResponse(data, fn, offset, value) {
  if (data.length <= 4) {
    return FRAME.PARTIAL;
  }
  if (data[0] !== 0xaa || data[1] !== 0x55) {
    return FRAME.INVALID;
  }
  let expectedLength;
  if (data[3] === MODBUS_READ) {
    if (data[4] !== value * 2) {
      return FRAME.INVALID;
    }
    expectedLength = data[4] + 7;
    if (data.length < expectedLength) {
      return FRAME.PARTIAL;
    }
  } else if (data[3] === MODBUS_WRITE || data[3] === MODBUS_WRITE_MULTI) {
    if (data.length < 10) {
      return FRAME.PARTIAL;
    }
    expectedLength = 10;
    if (data.readUInt16BE(4) !== offset || data.readInt16BE(6) !== value) {
      return FRAME.INVALID;
    }
  } else {
    // Exception answer: function code with its high bit set, then the reason.
    expectedLength = data.length;
  }
  const crcOffset = expectedLength - 2;
  const crc = modbusCrc(data.subarray(2, crcOffset));
  if (crc !== data[crcOffset] + (data[crcOffset + 1] << 8)) {
    return FRAME.INVALID;
  }
  if (data[3] !== fn) {
    throw new RequestRejectedError(MODBUS_FAILURES[data[4]] ?? 'UNKNOWN');
  }
  return FRAME.OK;
}

/** Plain 16-bit sum, the AA55 checksum. */
function aa55Checksum(bytes) {
  let sum = 0;
  for (const byte of bytes) {
    sum += byte;
  }
  return sum & 0xffff;
}

/**
 * AA55 command: header 0xAA 0x55 0xC0 0x7F, then the hex payload, then the
 * 2-byte checksum. The answer starts with 0xAA 0x55 0x7F 0xC0, [4..5] its
 * response type, [6] the payload length, payload, then the checksum.
 */
export function aa55Command(payloadHex, responseType) {
  const body = Buffer.from(`AA55C07F${payloadHex}`, 'hex');
  const sum = aa55Checksum(body);
  const request = Buffer.concat([body, Buffer.from([sum >> 8, sum & 0xff])]);
  return {
    request,
    validate: (data) => validateAa55Response(data, responseType),
    payload: (data) => data.subarray(7, data.length - 2),
    offsetOf: (byteOffset) => byteOffset,
    describe: `aa55 ${payloadHex}`,
  };
}

export function validateAa55Response(data, responseType) {
  if (data.length <= 8) {
    return FRAME.PARTIAL;
  }
  if (data[0] !== 0xaa || data[1] !== 0x55) {
    return FRAME.INVALID;
  }
  const expectedLength = data[6] + 9;
  if (data.length < expectedLength) {
    return FRAME.PARTIAL;
  }
  if (data.length > expectedLength) {
    return FRAME.INVALID;
  }
  if (responseType && data.readUInt16BE(4) !== parseInt(responseType, 16)) {
    return FRAME.INVALID;
  }
  const checksum = aa55Checksum(data.subarray(0, data.length - 2));
  return checksum === data.readUInt16BE(data.length - 2) ? FRAME.OK : FRAME.INVALID;
}

// Identification command, answered by every generation (model + serial).
export const AA55_DEVICE_INFO = () => aa55Command('010200', '0182');
// ES/EM/BP runtime data block.
export const AA55_RUNTIME_DATA = () => aa55Command('010600', '0186');
// ES/EM/BP: write one register, and set the export limit.
export const aa55WriteRegister = (register, value) =>
  aa55Command(`023905${hex(register, 4)}01${hex(value & 0xffff, 4)}`, '02B9');
export const aa55ExportLimit = (watts) => aa55Command(`033502${hex(watts, 4)}`, '03B5');

function hex(value, digits) {
  return value.toString(16).padStart(digits, '0');
}

/**
 * Parse an answer to the discovery broadcast: "192.168.1.20,289C6E05E0D4,Solar-WiFi"
 * Returns null when the datagram is not a GoodWe answer.
 */
export function parseDiscoveryReply(payload, sourceIp) {
  const text = Buffer.from(payload).toString('ascii').trim();
  const [ip, mac, name] = text.split(',');
  if (!mac || !/^[0-9A-Fa-f]{12}$/.test(mac)) {
    return null;
  }
  const host = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : sourceIp;
  return { host, mac: mac.toUpperCase(), name: (name ?? '').trim() };
}

// --- Payload readers ----------------------------------------------------------
// Each reader takes the trimmed payload and a byte offset; out-of-range reads
// resolve to null instead of throwing (a short answer must not crash a poll).

export function u16(buf, at) {
  if (at < 0 || at + 2 > buf.length) return null;
  const value = buf.readUInt16BE(at);
  return value === 0xffff ? null : value;
}

export function s16(buf, at) {
  if (at < 0 || at + 2 > buf.length) return null;
  return buf.readInt16BE(at);
}

export function u32(buf, at) {
  if (at < 0 || at + 4 > buf.length) return null;
  const value = buf.readUInt32BE(at);
  return value === 0xffffffff ? null : value;
}

export function s32(buf, at) {
  if (at < 0 || at + 4 > buf.length) return null;
  return buf.readInt32BE(at);
}

export function u8(buf, at) {
  if (at < 0 || at + 1 > buf.length) return null;
  return buf.readUInt8(at);
}

/** Decode an ASCII (or UTF-16BE, on some firmwares) fixed-length string. */
export function text(buf, from, to) {
  const slice = buf.subarray(from, to);
  if (slice.length === 0) return '';
  const hasControl = [...slice].some((byte) => byte < 32);
  const decoded = hasControl ? decodeUtf16be(slice) : slice.toString('ascii');
  return decoded.replace(/\0/g, '').trim();
}

function decodeUtf16be(slice) {
  let out = '';
  for (let i = 0; i + 1 < slice.length; i += 2) {
    out += String.fromCharCode(slice.readUInt16BE(i));
  }
  return out;
}
