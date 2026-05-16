import { describe, expect, it } from 'vitest';
import { parseStatus } from '../status.js';

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

  it('mediaLoaded is always true (cassette absence surfaces via code 7, not this field)', () => {
    for (const code of [0, 1, 2, 3, 4, 5, 6, 7]) {
      expect(parseStatus(frame(code)).mediaLoaded).toBe(true);
    }
  });
});
