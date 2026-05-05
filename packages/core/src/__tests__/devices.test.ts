import { describe, expect, it } from 'vitest';
import { DEVICES, DEVICE_REGISTRY_DATA } from '../devices.js';

describe('device registry', () => {
  it('exposes the LT_200B entry keyed by stable key', () => {
    const lt = DEVICES.LT_200B;
    expect(lt.family).toBe('letratag');
    expect(lt.name).toBe('LetraTag LT-200B');
  });

  it('declares only the bluetooth-gatt transport', () => {
    const lt = DEVICES.LT_200B;
    expect(lt.transports['bluetooth-gatt']).toBeDefined();
    expect(lt.transports.usb).toBeUndefined();
  });

  it('canonical service UUID matches the be3dd650 prefix', () => {
    const ble = DEVICES.LT_200B.transports['bluetooth-gatt'];
    expect(ble?.serviceUuid.startsWith('be3dd650-')).toBe(true);
    expect(ble?.txCharacteristicUuid.startsWith('be3dd651-')).toBe(true);
    expect(ble?.rxCharacteristicUuid?.startsWith('be3dd652-')).toBe(true);
  });

  it('engine declares letratag-bt protocol with the LT geometry', () => {
    const eng = DEVICES.LT_200B.engines[0];
    expect(eng?.protocol).toBe('letratag-bt');
    expect(eng?.headDots).toBe(30);
    expect(eng?.dpi).toBe(200);
    expect(eng?.mediaCompatibility).toContain('letratag');
  });

  it('compiled registry envelope has the expected schema metadata', () => {
    expect(DEVICE_REGISTRY_DATA.schemaVersion).toBe(1);
    expect(DEVICE_REGISTRY_DATA.driver).toBe('letratag');
    expect(DEVICE_REGISTRY_DATA.devices.length).toBeGreaterThan(0);
  });
});
