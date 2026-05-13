import {
  DeviceIdentificationRequiredError,
  type ConnectOptions,
  type DeviceEntry,
  type PrinterAdapterMap,
  type TransportType,
} from '@thermal-label/contracts';
import {
  DEVICE_REGISTRY_DATA,
  DEVICES,
  parseAdvertisingStatus,
} from '@thermal-label/letratag-core';
import type { AdvertisingStatus } from '@thermal-label/letratag-core';
import { WebBluetoothTransport } from '@thermal-label/transport/web';
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
 * revisions or device units. `WebBluetoothTransport.request()`
 * doesn't fit because it asks for characteristics by canonical UUID
 * before it sees the actual service tail; we do the picker + service
 * resolution + characteristic derivation here, then wrap via
 * `WebBluetoothTransport.fromCharacteristics()`.
 *
 * Returns the printer adapter + diagnostic plumbing (full observed
 * UUIDs, link MTU best-effort) so the debug harness can export
 * what's actually on the wire.
 *
 * @deprecated For harness use, prefer
 *   `requestPrinters({ transport: 'bluetooth-gatt' })` — the new
 *   factory returns a `PrinterAdapterMap` matching the contracts
 *   shape. `requestPrinter()` is retained as the BLE-debug escape
 *   hatch (carries observed UUIDs / link MTU for the debug app).
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

  const transport = WebBluetoothTransport.fromCharacteristics(
    device,
    txCharacteristic,
    rxCharacteristic,
    ble.mtu ?? 500,
  );
  const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);

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
 * Unified browser-picker factory.
 *
 * The LT-200B is single-engine and BLE-GATT-only, so this is a
 * one-transport dispatch — the `transport` discriminator must be
 * `'bluetooth-gatt'`. Other values throw. Auto-identifies by service
 * UUID prefix (DECISIONS.md D4); the LT_200B is the only candidate,
 * so `deviceKey` is never required.
 *
 * Returns a 1-key `PrinterAdapterMap` keyed by the device's primary
 * engine role.
 */
export async function requestPrinters(opts: ConnectOptions): Promise<PrinterAdapterMap> {
  if (opts.transport !== 'bluetooth-gatt') {
    throw new Error(
      `letratag: transport "${opts.transport}" is not supported (LT-200B is BLE-GATT only)`,
    );
  }
  if (opts.deviceKey !== undefined && opts.deviceKey !== DEVICES.LT_200B.key) {
    throw new Error(
      `letratag: deviceKey "${opts.deviceKey}" is not in registry (only LT_200B exists)`,
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- requestPrinter is the internal picker implementation; deprecation guides harness callers, not the new factory itself
  const result = await requestPrinter();
  const engine = DEVICES.LT_200B.engines[0];
  if (!engine) {
    throw new Error(`Device ${DEVICES.LT_200B.key} has no engines.`);
  }
  return { [engine.role]: result.printer };
}

/**
 * Filter the registry to entries declaring `transport`. Used to
 * populate `DeviceIdentificationRequiredError.candidates` from the
 * harness shell.
 */
export function devicesForTransport(transport: TransportType): readonly DeviceEntry[] {
  return DEVICE_REGISTRY_DATA.devices.filter(d => transport in d.transports);
}

// Surfaces the contracts error type so harness consumers importing
// from letratag-web don't need a separate @thermal-label/contracts
// import.
export { DeviceIdentificationRequiredError };

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
