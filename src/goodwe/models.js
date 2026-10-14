// -----------------------------------------------------------------------------
// GoodWe families, recognized from the serial number.
//
// The 3 letters at positions 5-7 of a GoodWe serial number name the platform
// (e.g. 95000ETU... = ET hybrid). Tables taken from the `goodwe` library (MIT).
//   ET: ET / EH / BT / BH / GEH hybrids (Modbus, address 0xF7)
//   DT: DT / MS / D-NS / XS / GEP grid-tied inverters (Modbus, address 0x7F)
//   ES: ES / EM / BP older hybrids (AA55 protocol)
// -----------------------------------------------------------------------------

export const FAMILY = { ET: 'ET', DT: 'DT', ES: 'ES' };

const ET_TAGS = [
  // platform 205
  'ETU',
  'ETL',
  'ETR',
  'BHN',
  'EHU',
  'BHU',
  'EHR',
  'BTU',
  // platform 745 LV
  'ESN',
  'EBN',
  'EMN',
  'SPN',
  'ERN',
  'ESC',
  'HLB',
  'HMB',
  'HBB',
  'EOA',
  // platform 745 HV
  'ETT',
  'HTA',
  'HUB',
  'AEB',
  'SPB',
  'CUB',
  'EUB',
  'HEB',
  'ERB',
  'BTT',
  'ETF',
  'ARB',
  'URB',
  'EBR',
  'NAH',
  // platform 753
  'AES',
  'HHI',
  'ABP',
  'EHB',
  'HSB',
  'HUA',
  'CUA',
  // Qianhai
  'ETC',
  'BTC',
  'BTN',
];

const ES_TAGS = ['ESU', 'EMU', 'ESA', 'BPS', 'BPU', 'EMJ', 'IJL'];

const DT_TAGS = [
  'DTU',
  'DTS',
  'KMT',
  'MSU',
  'MST',
  'MSC',
  'DSN',
  'DTN',
  'DST',
  'NSU',
  'SSN',
  'SST',
  'SSX',
  'SSY',
  'PSB',
  'PSC',
];

const SINGLE_PHASE_TAGS = [
  'DSN',
  'DST',
  'NSU',
  'SSN',
  'SST',
  'SSX',
  'SSY',
  'MSU',
  'MST',
  'PSB',
  'PSC',
  'MSC',
  'EHB',
  'EHU',
  'EHR',
  'HSB',
  'ESN',
  'EMN',
  'ERN',
  'EBN',
  'HLB',
  'HMB',
  'HBB',
  'SPN',
  'NAH',
];

// Ordered: an ET tag must win over the ES list ('ESN' is a 745 ET platform).
const FAMILY_TAGS = [
  [FAMILY.ET, ET_TAGS],
  [FAMILY.ES, ES_TAGS],
  [FAMILY.DT, DT_TAGS],
];

/** The family of a serial number, or null when unknown. */
export function familyFromSerial(serial = '') {
  for (const [family, tags] of FAMILY_TAGS) {
    if (tags.some((tag) => serial.includes(tag))) {
      return family;
    }
  }
  return null;
}

export function isSinglePhase(serial = '') {
  return SINGLE_PHASE_TAGS.some((tag) => serial.includes(tag));
}

/** Families whose hardware can drive a battery. */
export function supportsBattery(family) {
  return family === FAMILY.ET || family === FAMILY.ES;
}
