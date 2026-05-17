/* eslint-disable @typescript-eslint/no-deprecated -- these tests exercise
   `requestPrinter` on purpose; it is the supported BLE-debug escape hatch,
   only soft-deprecated to steer harness callers toward `requestPrinters`. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPrinter, requestPrinters } from '../discovery.js';

// `requestPrinter` / `requestPrinters` drive the Web Bluetooth picker.
// jsdom/node has no `navigator.bluetooth`, so we install a minimal
// fake GATT stack and assert the discovery + UUID-derivation flow
// (DECISIONS.md D4) without real hardware.

const SERVICE_UUID = 'be3dd650-2b3d-42f1-99c1-f0f749dd0678';
/** UUID tail shared by every characteristic on the service. */
const TAIL = SERVICE_UUID.slice(8); // '-2b3d-42f1-99c1-f0f749dd0678'

interface FakeCharacteristic {
  uuid: string;
  startNotifications: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

/**
 * Build a fake `navigator.bluetooth` whose picker resolves to a
 * device exposing one GATT service starting with `be3dd650-`.
 *
 * @param opts.servicePrefixUuid override the service UUID (use a
 *   non-matching prefix to exercise the "no service" error path).
 * @param opts.noGatt resolve a device with `gatt: undefined`.
 */
function installFakeBluetooth(opts?: { servicePrefixUuid?: string; noGatt?: boolean }): {
  requestDevice: ReturnType<typeof vi.fn>;
  characteristics: Map<string, FakeCharacteristic>;
} {
  const serviceUuid = opts?.servicePrefixUuid ?? SERVICE_UUID;
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

  const service = { uuid: serviceUuid, getCharacteristic };
  const server = {
    connect: vi.fn(function connect(this: unknown) {
      return Promise.resolve(server);
    }),
    getPrimaryServices: vi.fn().mockResolvedValue([service]),
  };
  const device = {
    name: 'Letratag 1234',
    gatt: opts?.noGatt ? undefined : server,
    // WebBluetoothTransport registers a `gattserverdisconnected`
    // listener in its constructor.
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  const requestDevice = vi.fn().mockResolvedValue(device);
  vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
  return { requestDevice, characteristics };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestPrinter (BLE picker + UUID derivation)', () => {
  it('pairs, derives TX/RX/short-command UUIDs from the service tail', async () => {
    const { requestDevice, characteristics } = installFakeBluetooth();

    const result = await requestPrinter();

    expect(requestDevice).toHaveBeenCalledOnce();
    expect(result.serviceUuidObserved).toBe(SERVICE_UUID);
    expect(result.txUuidDerived).toBe(`be3dd651${TAIL}`);
    expect(result.rxUuidDerived).toBe(`be3dd652${TAIL}`);
    expect(result.shortCommandUuidDerived).toBe(`be3dd653${TAIL}`);
    expect(result.linkMtu).toBeNull();
    expect(result.printer).toBeDefined();
    expect(result.device.name).toBe('Letratag 1234');

    // RX characteristic must have notifications started.
    const rx = characteristics.get(`be3dd652${TAIL}`);
    expect(rx?.startNotifications).toHaveBeenCalledOnce();
  });

  it('passes the registry namePrefix to the picker filter by default', async () => {
    const { requestDevice } = installFakeBluetooth();
    await requestPrinter();
    const arg = requestDevice.mock.calls[0]?.[0] as {
      filters: { namePrefix?: string; services: string[] }[];
    };
    expect(arg.filters[0]?.namePrefix).toBe('Letratag ');
    expect(arg.filters[0]?.services).toContain(SERVICE_UUID);
  });

  it('honours an explicit namePrefix override', async () => {
    const { requestDevice } = installFakeBluetooth();
    await requestPrinter({ namePrefix: 'MyTag' });
    const arg = requestDevice.mock.calls[0]?.[0] as {
      filters: { namePrefix?: string }[];
    };
    expect(arg.filters[0]?.namePrefix).toBe('MyTag');
  });

  it('uses a service-only filter when namePrefix is empty', async () => {
    const { requestDevice } = installFakeBluetooth();
    await requestPrinter({ namePrefix: '' });
    const arg = requestDevice.mock.calls[0]?.[0] as {
      filters: { namePrefix?: string; services: string[] }[];
    };
    expect(arg.filters[0]?.namePrefix).toBeUndefined();
    expect(arg.filters[0]?.services).toContain(SERVICE_UUID);
  });

  it('throws when the selected device exposes no GATT server', async () => {
    installFakeBluetooth({ noGatt: true });
    await expect(requestPrinter()).rejects.toThrow(/no GATT server/);
  });

  it('throws when no service matches the be3dd650- prefix', async () => {
    installFakeBluetooth({ servicePrefixUuid: 'ffffffff-2b3d-42f1-99c1-f0f749dd0678' });
    await expect(requestPrinter()).rejects.toThrow(/No GATT service starting with/);
  });
});

describe('requestPrinters (generic factory) — happy path', () => {
  it('resolves a 1-key PrinterAdapterMap keyed by the engine role', async () => {
    installFakeBluetooth();
    const map = await requestPrinters({ transport: 'bluetooth-gatt' });
    const keys = Object.keys(map);
    expect(keys).toHaveLength(1);
    expect(map[keys[0]!]).toBeDefined();
  });

  it('accepts the matching deviceKey explicitly', async () => {
    installFakeBluetooth();
    const map = await requestPrinters({ transport: 'bluetooth-gatt', deviceKey: 'LT_200B' });
    expect(Object.keys(map)).toHaveLength(1);
  });
});
