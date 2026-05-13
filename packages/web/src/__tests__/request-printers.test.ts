import { describe, expect, it } from 'vitest';
import { DeviceIdentificationRequiredError } from '@thermal-label/contracts';
import { DEVICES } from '@thermal-label/letratag-core';
import { devicesForTransport, requestPrinters } from '../discovery.js';

// LT-200B is single-device, single-transport (BLE-GATT). Web
// Bluetooth doesn't exist in jsdom, so the happy-path picker flow
// can't be exercised here; we test the deterministic branches.

describe('requestPrinters(opts) — letratag generic factory', () => {
  it('rejects non-bluetooth-gatt transport', async () => {
    await expect(requestPrinters({ transport: 'usb' })).rejects.toThrow(/not supported/);
    await expect(requestPrinters({ transport: 'serial' })).rejects.toThrow(/not supported/);
    await expect(requestPrinters({ transport: 'bluetooth-spp' })).rejects.toThrow(/not supported/);
  });

  it('rejects an unknown deviceKey on bluetooth-gatt', async () => {
    await expect(
      requestPrinters({ transport: 'bluetooth-gatt', deviceKey: 'NOT_A_KEY' }),
    ).rejects.toThrow(/not in registry/);
  });
});

describe('devicesForTransport — letratag', () => {
  it('returns LT_200B for bluetooth-gatt', () => {
    const candidates = devicesForTransport('bluetooth-gatt');
    expect(candidates.some(d => d.key === DEVICES.LT_200B.key)).toBe(true);
  });

  it('returns no entries for transports the LT-200B does not support', () => {
    expect(devicesForTransport('usb')).toHaveLength(0);
    expect(devicesForTransport('serial')).toHaveLength(0);
    expect(devicesForTransport('bluetooth-spp')).toHaveLength(0);
  });
});

describe('DeviceIdentificationRequiredError shape', () => {
  // Letratag's own factory never throws this (single device, no
  // ambiguity), but contracts is re-exported through letratag-web so
  // harness code can rely on a single import.
  it('is constructible and carries candidates + continueWith', () => {
    const err = new DeviceIdentificationRequiredError(
      devicesForTransport('bluetooth-gatt'),
      () => Promise.resolve({}),
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.candidates.length).toBeGreaterThan(0);
    expect(typeof err.continueWith).toBe('function');
  });
});
