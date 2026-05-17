/* eslint-disable @typescript-eslint/no-deprecated -- these tests exercise
   `requestPrinter` on purpose; it is the supported BLE-debug escape hatch,
   only soft-deprecated to steer harness callers toward `requestPrinters`. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as LetratagCore from '@thermal-label/letratag-core';

// discovery.ts carries defensive guards against a malformed device
// registry — a missing `bluetooth-gatt` transport, absent `namePrefix`
// / `mtu`, or an engine-less device. The real frozen registry never
// trips these, so we mock `@thermal-label/letratag-core` with
// degenerate registry shapes to exercise the guard branches.

const SERVICE_UUID = 'be3dd650-2b3d-42f1-99c1-f0f749dd0678';

interface FakeCharacteristic {
  uuid: string;
  startNotifications: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function installFakeBluetooth(): ReturnType<typeof vi.fn> {
  const characteristics = new Map<string, FakeCharacteristic>();
  const getCharacteristic = (uuid: string): Promise<FakeCharacteristic> => {
    let c = characteristics.get(uuid);
    if (!c) {
      c = {
        uuid,
        startNotifications: vi.fn(() => Promise.resolve()),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      characteristics.set(uuid, c);
    }
    return Promise.resolve(c);
  };
  const service = { uuid: SERVICE_UUID, getCharacteristic };
  const server = {
    connect: vi.fn(function connect(this: unknown) {
      return Promise.resolve(server);
    }),
    getPrimaryServices: vi.fn().mockResolvedValue([service]),
  };
  const device = {
    name: 'Letratag 1',
    gatt: server,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const requestDevice = vi.fn().mockResolvedValue(device);
  vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
  return requestDevice;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock('@thermal-label/letratag-core');
});

describe('requestPrinter — registry guard: missing bluetooth-gatt transport', () => {
  it('throws when LT_200B has no bluetooth-gatt transport', async () => {
    vi.doMock('@thermal-label/letratag-core', async () => {
      const actual = await vi.importActual<typeof LetratagCore>('@thermal-label/letratag-core');
      return {
        ...actual,
        DEVICES: { LT_200B: { ...actual.DEVICES.LT_200B, transports: {} } },
      };
    });
    installFakeBluetooth();
    const { requestPrinter } = await import('../discovery.js');
    await expect(requestPrinter()).rejects.toThrow(/missing the bluetooth-gatt transport/);
  });
});

describe('requestPrinter — registry guard: transport without namePrefix / mtu', () => {
  it('pairs with a service-only filter and the default MTU fallback', async () => {
    vi.doMock('@thermal-label/letratag-core', async () => {
      const actual = await vi.importActual<typeof LetratagCore>('@thermal-label/letratag-core');
      return {
        ...actual,
        DEVICES: {
          LT_200B: {
            ...actual.DEVICES.LT_200B,
            // No namePrefix → '' fallback (service-only filter);
            // no mtu → 500 fallback.
            transports: { 'bluetooth-gatt': { serviceUuid: SERVICE_UUID } },
          },
        },
      };
    });
    const requestDevice = installFakeBluetooth();
    const { requestPrinter } = await import('../discovery.js');
    const result = await requestPrinter();
    expect(result.printer).toBeDefined();
    const arg = requestDevice.mock.calls[0]?.[0] as {
      filters: { namePrefix?: string }[];
    };
    expect(arg.filters[0]?.namePrefix).toBeUndefined();
  });
});

describe('requestPrinters — registry guard: engine-less device', () => {
  it('throws when LT_200B has no engines', async () => {
    vi.doMock('@thermal-label/letratag-core', async () => {
      const actual = await vi.importActual<typeof LetratagCore>('@thermal-label/letratag-core');
      return {
        ...actual,
        DEVICES: { LT_200B: { ...actual.DEVICES.LT_200B, engines: [] } },
      };
    });
    installFakeBluetooth();
    const { requestPrinters } = await import('../discovery.js');
    await expect(requestPrinters({ transport: 'bluetooth-gatt' })).rejects.toThrow(
      /has no engines/,
    );
  });
});
