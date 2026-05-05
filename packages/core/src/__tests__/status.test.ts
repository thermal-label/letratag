import { describe, expect, it } from 'vitest';
import {
  advertisingToPrinterStatus,
  parseAdvertisingStatus,
  parseStatus,
} from '../status.js';

function frame(code: number): Uint8Array {
  return new Uint8Array([0x1b, 0x52, code]);
}

describe('parseStatus (RX notification)', () => {
  it('rejects frames that are too short', () => {
    const s = parseStatus(new Uint8Array([0x1b]));
    expect(s.ready).toBe(false);
    expect(s.errors[0]?.code).toBe('protocol');
  });

  it('rejects frames missing the 0x1B 0x52 prefix', () => {
    const s = parseStatus(new Uint8Array([0xff, 0xff, 0x00]));
    expect(s.errors[0]?.code).toBe('protocol');
  });

  it('code 0 → success, no errors, ready', () => {
    const s = parseStatus(frame(0));
    expect(s.ready).toBe(true);
    expect(s.errors.length).toBe(0);
    expect(s.mediaLoaded).toBe(true);
  });

  it('code 1 aliases to 0 (success)', () => {
    expect(parseStatus(frame(1)).ready).toBe(true);
  });

  it('codes 2 and 5 → unknown_failure', () => {
    expect(parseStatus(frame(2)).errors[0]?.code).toBe('unknown_failure');
    expect(parseStatus(frame(5)).errors[0]?.code).toBe('unknown_failure');
  });

  it('code 3 → low_battery warning, still ready', () => {
    const s = parseStatus(frame(3));
    expect(s.ready).toBe(true);
    expect(s.errors[0]?.code).toBe('low_battery');
  });

  it('code 4 → cancelled', () => {
    expect(parseStatus(frame(4)).errors[0]?.code).toBe('cancelled');
  });

  it('code 6 → battery_too_low', () => {
    expect(parseStatus(frame(6)).errors[0]?.code).toBe('battery_too_low');
  });

  it('code 7 → cassette_missing', () => {
    expect(parseStatus(frame(7)).errors[0]?.code).toBe('cassette_missing');
  });

  it('mediaLoaded is always true (cassette signal lives in advertising data)', () => {
    for (const code of [0, 1, 2, 3, 4, 5, 6, 7]) {
      expect(parseStatus(frame(code)).mediaLoaded).toBe(true);
    }
  });
});

describe('parseAdvertisingStatus (manufacturer-data)', () => {
  it('rejects frames shorter than 3 bytes', () => {
    expect(parseAdvertisingStatus(new Uint8Array([0x10, 0x03]))).toBeNull();
  });

  it('idle 12mm cassette, full battery, not charging', () => {
    // byte 0 = 0x10 (revision = 1, low nibble reserved)
    // byte 1 = 0x03 (cassetteId = 3 = 12mm; carbonType=0; busyLocked=0)
    // byte 2 = 0x30 (batteryLevel = 3 (bits 4-5), no errors, charging=0)
    const s = parseAdvertisingStatus(new Uint8Array([0x10, 0x03, 0x30]));
    expect(s).not.toBeNull();
    expect(s!.revision).toBe(1);
    expect(s!.cassetteId).toBe(3);
    expect(s!.cassetteWidthMm).toBe(12);
    expect(s!.busyLocked).toBe(false);
    expect(s!.carbonType).toBe(false);
    expect(s!.batteryLevel).toBe(3);
    expect(s!.charging).toBe(false);
    expect(s!.errors.length).toBe(0);
  });

  it('printer busy with 9mm cassette, low battery warning', () => {
    // byte 0 = 0x20 (revision = 2)
    // byte 1 = 0x22 (cassetteId = 2 = 9mm; busyLocked = bit 5 set)
    // byte 2 = 0x18 (BATTERY_LOW bit 3 set; batteryLevel = 1 (bits 4-5 = 01))
    const s = parseAdvertisingStatus(new Uint8Array([0x20, 0x22, 0x18]));
    expect(s).not.toBeNull();
    expect(s!.revision).toBe(2);
    expect(s!.cassetteId).toBe(2);
    expect(s!.cassetteWidthMm).toBe(9);
    expect(s!.busyLocked).toBe(true);
    expect(s!.batteryLevel).toBe(1);
    expect(s!.errors.find(e => e.code === 'low_battery')).toBeDefined();
  });

  it('tape jam + cutter jam are surfaced as errors', () => {
    // byte 2 = 0x03 = tape jam (bit 0) + cutter jam (bit 1)
    const s = parseAdvertisingStatus(new Uint8Array([0x10, 0x03, 0x03]));
    const codes = s!.errors.map(e => e.code);
    expect(codes).toContain('tape_jam');
    expect(codes).toContain('cutter_jam');
  });

  it('battery too low is fatal in advertisingToPrinterStatus', () => {
    // byte 2 = 0x04 = BATTERY_TOO_LOW (bit 2)
    const adv = parseAdvertisingStatus(new Uint8Array([0x10, 0x03, 0x04]))!;
    const ps = advertisingToPrinterStatus(adv);
    expect(ps.ready).toBe(false);
    expect(ps.mediaLoaded).toBe(true); // cassetteId !== 0
  });

  it('cassetteId 0 → mediaLoaded false', () => {
    const adv = parseAdvertisingStatus(new Uint8Array([0x10, 0x00, 0x30]))!;
    const ps = advertisingToPrinterStatus(adv);
    expect(ps.mediaLoaded).toBe(false);
  });

  it('charging flag', () => {
    // byte 2 = 0x40 = bit 6 set
    const s = parseAdvertisingStatus(new Uint8Array([0x10, 0x03, 0x40]))!;
    expect(s.charging).toBe(true);
  });
});
