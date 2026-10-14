import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AA55_DEVICE_INFO,
  AA55_RUNTIME_DATA,
  FRAME,
  RequestRejectedError,
  aa55ExportLimit,
  aa55WriteRegister,
  modbusRead,
  modbusWrite,
  modbusWriteMulti,
  parseDiscoveryReply,
  text,
} from '../src/goodwe/protocol.js';
import { fixture, modbusException } from './helpers/fakeInverter.js';
import { FAMILY, familyFromSerial, isSinglePhase } from '../src/goodwe/models.js';

// Reference requests, as built by the `goodwe` Python library.
test('requests are byte-identical to the reference library', () => {
  const hex = (command) => command.request.toString('hex');
  assert.equal(hex(modbusRead(0xf7, 0x88b8, 0x21)), 'f70388b800213ac1');
  assert.equal(hex(modbusRead(0xf7, 0x891c, 0x7d)), 'f703891c007d7ae7');
  assert.equal(hex(modbusRead(0x7f, 0x7594, 0x49)), '7f0375940049d5c2');
  assert.equal(hex(modbusWrite(0xf7, 47000, 3)), 'f706b79800037b06');
  assert.equal(
    hex(modbusWriteMulti(0xf7, 0xb997, Buffer.from('00010000', 'hex'))),
    'f710b99700020400010000a8f9',
  );
  assert.equal(hex(AA55_DEVICE_INFO()), 'aa55c07f0102000241');
  assert.equal(hex(AA55_RUNTIME_DATA()), 'aa55c07f0106000245');
  assert.equal(hex(aa55WriteRegister(0x560, 80)), 'aa55c07f02390505600100500334');
  assert.equal(hex(aa55ExportLimit(3000)), 'aa55c07f0335020bb8033b');
});

test('captured answers validate, a truncated one asks for more', () => {
  const runtime = fixture('et_running_data');
  const command = modbusRead(0xf7, 35100, 0x7d);
  assert.equal(command.validate(runtime), FRAME.OK);
  assert.equal(command.validate(runtime.subarray(0, 100)), FRAME.PARTIAL);
  assert.equal(command.payload(runtime).length, 0x7d * 2);
  assert.equal(command.offsetOf(35101), 2);

  const es = fixture('es_running_data');
  assert.equal(AA55_RUNTIME_DATA().validate(es), FRAME.OK);
  assert.equal(AA55_RUNTIME_DATA().validate(es.subarray(0, 20)), FRAME.PARTIAL);
});

test('a corrupted answer is invalid', () => {
  const runtime = Buffer.from(fixture('et_running_data'));
  runtime[50] ^= 0xff;
  assert.equal(modbusRead(0xf7, 35100, 0x7d).validate(runtime), FRAME.INVALID);
  // Answer to another request (wrong length).
  assert.equal(modbusRead(0xf7, 35100, 0x10).validate(fixture('et_running_data')), FRAME.INVALID);
});

test('a Modbus exception rejects the request', () => {
  assert.throws(
    () => modbusRead(0x7f, 30195, 0x0f).validate(modbusException(0x7f, 0x03)),
    (err) => err instanceof RequestRejectedError && err.reason === 'ILLEGAL DATA ADDRESS',
  );
});

test('discovery replies are parsed, foreign datagrams ignored', () => {
  assert.deepEqual(
    parseDiscoveryReply(Buffer.from('192.168.1.20,289C6E05E0D4,Solar-WiFi222W0000'), '10.0.0.1'),
    { host: '192.168.1.20', mac: '289C6E05E0D4', name: 'Solar-WiFi222W0000' },
  );
  assert.equal(parseDiscoveryReply(Buffer.from('hello'), '10.0.0.1'), null);
  // A reply without IP falls back to the datagram source.
  assert.equal(parseDiscoveryReply(Buffer.from('x,289C6E05E0D4,a'), '10.0.0.9').host, '10.0.0.9');
});

test('strings are decoded in ASCII or UTF-16', () => {
  assert.equal(text(Buffer.from('GW10K-ET  '), 0, 10), 'GW10K-ET');
  assert.equal(text(Buffer.from('\0G\0W', 'latin1'), 0, 4), 'GW');
});

test('the family is recognized from the serial number', () => {
  assert.equal(familyFromSerial('9010KETU000W0000'), FAMILY.ET);
  assert.equal(familyFromSerial('95048ESU227W0000'), FAMILY.ES);
  assert.equal(familyFromSerial('5010KDTS00BW0000'), FAMILY.DT);
  assert.equal(familyFromSerial('UNKNOWN'), null);
  assert.equal(isSinglePhase('5000MSU000000000'), true);
  assert.equal(isSinglePhase('9010KETU000W0000'), false);
});
