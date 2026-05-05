import { DEVICES, parseAdvertisingStatus } from '@thermal-label/letratag-core';
import type { AdvertisingStatus } from '@thermal-label/letratag-core';
import {
  TransportClosedError,
  TransportTimeoutError,
  type Transport,
} from '@thermal-label/contracts';
import { LetraTagPrinter } from './printer.js';

const SERVICE_PREFIX = 'be3dd650-';

/**
 * Result of a successful pairing — the printer adapter plus the
 * BLE plumbing the debug harness needs (observed full UUIDs, link
 * MTU, raw `BluetoothDevice` for diagnostics export).
 */
export interface PairResult {
  printer: LetraTagPrinter;
  device: BluetoothDevice;
  serviceUuidObserved: string;
  txUuidDerived: string;
  /** RX (notify) characteristic — `printReplyUUID`. */
  rxUuidDerived: string;
  /** Short-command characteristic — `printShortCommandUUID`. */
  shortCommandUuidDerived: string;
  /** Best-effort link MTU; `null` when the browser doesn't expose it. */
  linkMtu: number | null;
  /**
   * Most recent advertising-data status snapshot captured during the
   * scan that found the device, when available. The driver also
   * holds this internally — see `LetraTagPrinter.setAdvertisingStatus`.
   */
  advertisingStatus: AdvertisingStatus | null;
}

export interface RequestPrinterOptions {
  /**
   * Override the device-name filter passed to
   * `navigator.bluetooth.requestDevice`. Useful when the friend's
   * unit advertises a non-default name. Falls back to the
   * registry's `namePrefix` when omitted.
   */
  namePrefix?: string;
}

/**
 * Open the browser BLE picker, pair with an LT-200B, and resolve
 * the GATT service / characteristics.
 *
 * Discovery follows DECISIONS.md D4 — the registry's canonical
 * UUIDs filter the picker, but the actual TX / RX / aux UUIDs are
 * **derived from the observed service UUID's tail** (alexhorn's
 * convention). This tolerates UUID-body variance across firmware
 * revisions or device units.
 *
 * Returns the printer adapter + diagnostic plumbing (full observed
 * UUIDs, link MTU best-effort) so the debug harness can export
 * what's actually on the wire.
 */
export async function requestPrinter(options?: RequestPrinterOptions): Promise<PairResult> {
  const ble = DEVICES.LT_200B.transports['bluetooth-gatt'];
  if (!ble) throw new Error('LT_200B registry entry is missing the bluetooth-gatt transport');

  const namePrefix = options?.namePrefix ?? ble.namePrefix ?? '';
  const filter: BluetoothLEScanFilter =
    namePrefix.length === 0
      ? { services: [ble.serviceUuid] }
      : { namePrefix, services: [ble.serviceUuid] };

  const device = await navigator.bluetooth.requestDevice({
    filters: [filter],
    optionalServices: [ble.serviceUuid],
  });
  if (!device.gatt) throw new Error('Selected Bluetooth device has no GATT server');

  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();
  const matched = services.find(s => s.uuid.startsWith(SERVICE_PREFIX));
  if (!matched) {
    throw new Error(
      `No GATT service starting with "${SERVICE_PREFIX}" on the connected device`,
    );
  }
  const serviceUuid = matched.uuid;
  const tail = serviceUuid.slice(8);
  const txUuid = `be3dd651${tail}`;
  const rxUuid = `be3dd652${tail}`;
  const shortCmdUuid = `be3dd653${tail}`;

  const txCharacteristic = await matched.getCharacteristic(txUuid);
  const rxCharacteristic = await matched.getCharacteristic(rxUuid);
  await rxCharacteristic.startNotifications();

  const transport = new BleTransport(device, txCharacteristic, rxCharacteristic, ble.mtu ?? 500);
  const printer = new LetraTagPrinter(transport, device.name ?? DEVICES.LT_200B.name);

  return {
    printer,
    device,
    serviceUuidObserved: serviceUuid,
    txUuidDerived: txUuid,
    rxUuidDerived: rxUuid,
    shortCommandUuidDerived: shortCmdUuid,
    linkMtu: null,
    // The Web Bluetooth `requestDevice` flow does not expose the
    // scan-time advertisement bytes to us. Callers that want the
    // advertising-data snapshot should use the `scan()` helper
    // below instead, which surfaces it explicitly.
    advertisingStatus: null,
  };
}

/**
 * Helper to decode an advertisement event's manufacturer data into a
 * structured `AdvertisingStatus`. Web Bluetooth's
 * `BluetoothAdvertisingEvent` exposes `manufacturerData` as a
 * `Map<number, DataView>` — the LT-200B's payload is the value of
 * any entry. We read bytes 0..2 of the first entry's value, the
 * layout established in
 * [`status.ts`'s `parseAdvertisingStatus`](../core/src/status.ts).
 */
export function decodeAdvertisementManufacturerData(
  manufacturerData: Map<number, DataView> | undefined,
): AdvertisingStatus | null {
  if (!manufacturerData || manufacturerData.size === 0) return null;
  const first = manufacturerData.values().next();
  if (first.done) return null;
  const view = first.value;
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return parseAdvertisingStatus(bytes);
}

/**
 * BLE Transport implementation tailored for the LT-200B. Mirrors
 * `@thermal-label/transport/web`'s `WebBluetoothTransport` but
 * accepts pre-resolved characteristics so the picker / service-
 * prefix matching can stay in this package.
 *
 * The protocol writes payloads in pre-chunked form (each protocol
 * chunk is up to ~501 bytes); the link-layer MTU is left to the
 * browser to honor via its own internal write fragmentation.
 */
class BleTransport implements Transport {
  private readonly rxBuffer: number[] = [];
  private waiter: {
    resolve: (data: Uint8Array) => void;
    reject: (err: Error) => void;
    needed: number;
    timer: ReturnType<typeof setTimeout> | undefined;
  } | null = null;
  private _connected = true;

  private readonly onValueChanged = (event: Event): void => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const view = target.value;
    if (!view) return;
    for (let i = 0; i < view.byteLength; i += 1) {
      this.rxBuffer.push(view.getUint8(i));
    }
    this.satisfyWaiter();
  };

  private readonly onDisconnected = (): void => {
    this._connected = false;
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = null;
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(new TransportClosedError('bluetooth-gatt'));
    }
  };

  constructor(
    private readonly device: BluetoothDevice,
    private readonly txCharacteristic: BluetoothRemoteGATTCharacteristic,
    private readonly rxCharacteristic: BluetoothRemoteGATTCharacteristic,
    private readonly mtu: number,
  ) {
    device.addEventListener('gattserverdisconnected', this.onDisconnected);
    rxCharacteristic.addEventListener('characteristicvaluechanged', this.onValueChanged);
  }

  get connected(): boolean {
    return this._connected;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this._connected) throw new TransportClosedError('bluetooth-gatt');
    for (let offset = 0; offset < data.length; offset += this.mtu) {
      const chunk = data.subarray(offset, offset + this.mtu);
      await this.txCharacteristic.writeValueWithoutResponse(chunk);
      if (offset + this.mtu < data.length) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  }

  async read(length: number, timeout?: number): Promise<Uint8Array> {
    if (!this._connected) throw new TransportClosedError('bluetooth-gatt');
    if (this.rxBuffer.length >= length) return this.drainBuffer(length);
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer =
        timeout === undefined
          ? undefined
          : setTimeout(() => {
              if (this.waiter?.timer === timer) this.waiter = null;
              reject(new TransportTimeoutError('bluetooth-gatt', timeout));
            }, timeout);
      this.waiter = { resolve, reject, needed: length, timer };
    });
  }

  async close(): Promise<void> {
    if (!this._connected) return;
    this._connected = false;
    this.rxCharacteristic.removeEventListener('characteristicvaluechanged', this.onValueChanged);
    this.device.removeEventListener('gattserverdisconnected', this.onDisconnected);
    try {
      await this.rxCharacteristic.stopNotifications();
    } catch {
      // Stopping notifications can fail if the device disconnected first.
    }
    if (this.device.gatt?.connected) this.device.gatt.disconnect();
  }

  private drainBuffer(length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) out[i] = this.rxBuffer[i] ?? 0;
    this.rxBuffer.splice(0, length);
    return out;
  }

  private satisfyWaiter(): void {
    const waiter = this.waiter;
    if (!waiter) return;
    if (this.rxBuffer.length < waiter.needed) return;
    this.waiter = null;
    if (waiter.timer) clearTimeout(waiter.timer);
    waiter.resolve(this.drainBuffer(waiter.needed));
  }
}
