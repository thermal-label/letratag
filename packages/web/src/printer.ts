import { renderImage, rotateBitmap, type RawImageData } from '@mbtech-nl/bitmap';
import {
  pickRotation,
  type MediaDescriptor,
  type PreviewOptions,
  type PreviewResult,
  type PrinterAdapter,
  type PrinterStatus,
  type Transport,
} from '@thermal-label/contracts';
import {
  DEFAULT_MEDIA,
  ROTATE_DIRECTION,
  STATUS_NOTIFICATION_LENGTH,
  advertisingToPrinterStatus,
  createPreviewOffline,
  encodeLabel,
  parseAdvertisingStatus,
  parseStatus,
  type AdvertisingStatus,
  type LetraTagDevice,
  type LetraTagMedia,
  type LetraTagPrintOptions,
} from '@thermal-label/letratag-core';

const STATUS_READ_TIMEOUT_MS = 5000;

const EMPTY_STATUS: PrinterStatus = {
  ready: true,
  mediaLoaded: true,
  errors: [],
  rawBytes: new Uint8Array(),
};

/**
 * `PrinterAdapter` for the LT-200B over Web Bluetooth.
 *
 * Constructed indirectly via `requestPrinter()` / `requestPrinters()`;
 * the constructor is exported so the harness can inject a `MockTransport`
 * with a real device entry, mirroring the labelmanager-web /
 * labelwriter-web shape.
 *
 * Two channels of status are wired in:
 *
 * 1. **Post-print notification** — the printer emits a 3-byte
 *    `[1B 52 code]` reply after each job, parsed via `parseStatus`.
 *    The driver stores this as the last-known status.
 * 2. **Advertising data** — the BLE advertising packets carry a
 *    3-byte payload with cassette presence + battery + busy +
 *    error flags. The discovery layer collects this when the device
 *    is scanned; the driver folds the latest snapshot into
 *    `getStatus()` so callers get a recent view between print jobs.
 */
export class LetraTagPrinter implements PrinterAdapter {
  readonly family = 'letratag';
  readonly device: LetraTagDevice;

  private readonly transport: Transport;
  private lastStatus: PrinterStatus = EMPTY_STATUS;
  private lastAdvertising: AdvertisingStatus | null = null;
  /**
   * `onStatus` subscribers. Both status sources (post-print
   * notifications and BLE advertising frames) push into this set —
   * unifying the two streams behind a single subscription API per
   * plan 11.
   */
  private readonly statusListeners = new Set<(status: PrinterStatus) => void>();
  /** Bound advertisement handler — captured so removeEventListener works. */
  private advertisementHandler: ((event: Event) => void) | null = null;
  /** The device we're watching advertisements on (held for `close()` teardown). */
  private watchedDevice: BluetoothDevice | null = null;

  constructor(device: LetraTagDevice, transport: Transport) {
    this.device = device;
    this.transport = transport;
  }

  get model(): string {
    return this.device.name;
  }

  get connected(): boolean {
    return this.transport.connected;
  }

  /**
   * Update the printer's known advertising state. Called by the
   * discovery layer with the most recent manufacturer-data payload.
   * Use {@link parseAdvertisingStatus} to construct the argument.
   *
   * Per plan 11: also fans out to `onStatus` subscribers so the
   * harness shell sees cassette / battery / busy changes without
   * polling. Subscribers receive the
   * `advertisingToPrinterStatus(adv)` projection — same shape they'd
   * see from `getStatus()`.
   */
  setAdvertisingStatus(adv: AdvertisingStatus | null): void {
    this.lastAdvertising = adv;
    if (adv !== null && this.statusListeners.size > 0) {
      this.notifyListeners(advertisingToPrinterStatus(adv));
    }
  }

  async print(
    image: RawImageData,
    media?: MediaDescriptor,
    options?: LetraTagPrintOptions,
  ): Promise<void> {
    const resolved = (media ?? DEFAULT_MEDIA) as LetraTagMedia;
    const rotate = pickRotation(image, resolved, ROTATE_DIRECTION, options?.rotate);
    const headAligned = renderImage(image, { dither: true, rotate });
    // encodeBitmap's input contract: widthPx = feed axis, heightPx = across head.
    // renderImage produces the user-facing head-aligned bitmap (widthPx = across head,
    // heightPx = feed), matching the d1-core convention. Swap axes for the LT-200B
    // encoder so the full feed length prints instead of just the first heightPx rows.
    const bitmap = rotateBitmap(headAligned, 270);

    const engine = this.device.engines[0];
    // Pull the BLE link MTU from the registry so the encoder sizes
    // its chunks to single-write fits. Without this, multi-chunk
    // payloads exceed the link MTU and Chrome's writeValueWithoutResponse
    // path doesn't auto-fragment — the first oversized chunk fails
    // with "GATT operation failed for unknown reason."
    const mtu = this.device.transports['bluetooth-gatt']?.mtu;
    const context = {
      ...(engine ? { engine } : {}),
      media: resolved,
      ...(mtu !== undefined ? { mtu } : {}),
    };
    const writes = encodeLabel(bitmap, options, undefined, context);
    for (const chunk of writes) {
      await this.transport.write(chunk);
      // Yield to the event loop between protocol chunks so the
      // browser can drain its BLE write queue.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    // Best-effort status read. The printer emits a 3-byte status
    // notification at the end of the job; on timeout we still
    // resolve, but the lastStatus stays as the previous value.
    try {
      const bytes = await this.transport.read(STATUS_NOTIFICATION_LENGTH, STATUS_READ_TIMEOUT_MS);
      const postPrint = parseStatus(bytes);
      this.lastStatus = postPrint;
      // Fan out to `onStatus` subscribers — post-print notification
      // is one of two real push sources on this driver (the other
      // being advertising-data; see `startAdvertisementWatch`).
      //
      // `parseStatus` (the 3-byte RX-notification parser) carries no
      // `battery` / `details` — only `advertisingToPrinterStatus`
      // does. Pushing the bare post-print status would overwrite the
      // rich advertising-derived status in the harness shell, dropping
      // the battery glyph + detail rows at the print step. So when an
      // advertising snapshot is known, push a *merged* status: the
      // advertising projection (battery / details / mediaLoaded) with
      // the post-print result's `errors` + `ready` overlaid. With no
      // advertising known, fall back to the bare post-print status.
      if (this.statusListeners.size > 0) {
        const pushed: PrinterStatus = this.lastAdvertising
          ? {
              ...advertisingToPrinterStatus(this.lastAdvertising),
              errors: postPrint.errors,
              ready: postPrint.ready,
              rawBytes: postPrint.rawBytes,
            }
          : postPrint;
        this.notifyListeners(pushed);
      }
    } catch {
      // Timeout / closed transport — leave lastStatus untouched.
    }

    if (!this.lastStatus.ready) {
      const fatal = this.lastStatus.errors[0];
      if (fatal) throw new Error(fatal.message);
    }
  }

  createPreview(image: RawImageData, options?: PreviewOptions): Promise<PreviewResult> {
    const media = (options?.media ?? DEFAULT_MEDIA) as LetraTagMedia;
    const result = createPreviewOffline(image, media);
    return Promise.resolve(options?.media ? result : { ...result, assumed: true });
  }

  /**
   * Return the printer's last-known status. Prefers the advertising-data
   * snapshot when available (it covers cassette + battery + errors and
   * updates continuously without a print job); falls back to the most
   * recent post-print notification, then to a default empty status.
   */
  getStatus(): Promise<PrinterStatus> {
    if (this.lastAdvertising) {
      return Promise.resolve(advertisingToPrinterStatus(this.lastAdvertising));
    }
    return Promise.resolve(this.lastStatus);
  }

  /**
   * Subscribe to status updates. Two real push sources feed the
   * subscriber:
   *
   * 1. Post-print notification — the 3-byte `[1B 52 code]` reply on
   *    the RX characteristic at the end of each print job, parsed
   *    via {@link parseStatus}.
   * 2. BLE advertising data — continuous cassette / battery / busy
   *    / error flags, parsed via {@link parseAdvertisingStatus}. Only
   *    forwarded when {@link startAdvertisementWatch} has been
   *    called.
   *
   * The current cached status is replayed immediately on subscribe
   * so the harness shell's status pill resolves quickly without
   * waiting for the next event. Returns an unsubscribe function.
   *
   * Per plan 11 §`onStatus` parity + §Letratag specifics — letratag
   * has real push so this is not a polling shim.
   */
  onStatus(cb: (status: PrinterStatus) => void): () => void {
    this.statusListeners.add(cb);
    // Replay current cached status synchronously on subscribe.
    void Promise.resolve().then(() => {
      void this.getStatus().then(status => {
        if (this.statusListeners.has(cb)) cb(status);
      });
    });
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  /**
   * Subscribe to the LT-200B's BLE advertising packets and fold
   * each parsed `AdvertisingStatus` into the driver's status state
   * (via {@link setAdvertisingStatus}). The 3-byte payload covers
   * cassette presence, battery, busy, and error flags — and the
   * printer keeps advertising while idle, so the harness gets
   * continuous status without forcing a print first.
   *
   * Feature-checked: Web Bluetooth's `watchAdvertisements` is behind
   * a Chrome flag in some versions. When the method is missing on
   * the picked `BluetoothDevice`, this no-ops — `getStatus()` still
   * works from the post-print notification path, just without the
   * continuous update.
   *
   * Calls `device.watchAdvertisements()` and registers an
   * `advertisementreceived` listener. Both are torn down on
   * `close()`.
   *
   * @param device — the same `BluetoothDevice` returned by
   *   `requestPrinter()` / `requestPrinters()`. The driver holds a
   *   reference for teardown; pass the device once per connect.
   * @returns `true` if the watch was started, `false` if
   *   `watchAdvertisements` is unavailable in this browser.
   */
  async startAdvertisementWatch(device: BluetoothDevice): Promise<boolean> {
    // Feature check — Chrome ships `watchAdvertisements` under
    // chrome://flags/#enable-experimental-web-platform-features in
    // some versions. Type cast through unknown because the global
    // BluetoothDevice typings may not declare it.
    const dev = device as BluetoothDevice & {
      watchAdvertisements?: () => Promise<void>;
    };
    if (typeof dev.watchAdvertisements !== 'function') {
      return false;
    }
    if (this.advertisementHandler !== null) {
      // Already watching — idempotent.
      return true;
    }

    this.advertisementHandler = (event: Event): void => {
      // BluetoothAdvertisingEvent.manufacturerData is a
      // `Map<number, DataView>`. Read the first entry's bytes and
      // parse to an AdvertisingStatus, then fold via the existing
      // setAdvertisingStatus path (which fans out to subscribers).
      const advEvent = event as Event & {
        manufacturerData?: Map<number, DataView>;
      };
      const map = advEvent.manufacturerData;
      if (!map || map.size === 0) return;
      const first = map.values().next();
      if (first.done) return;
      const view = first.value;
      const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      const parsed = parseAdvertisingStatus(bytes);
      if (parsed) this.setAdvertisingStatus(parsed);
    };
    device.addEventListener('advertisementreceived', this.advertisementHandler);
    this.watchedDevice = device;
    try {
      await dev.watchAdvertisements();
    } catch {
      // `watchAdvertisements` can reject if the browser blocks the
      // permission or the device disconnected. Roll back the
      // listener registration so a retry can succeed.
      device.removeEventListener('advertisementreceived', this.advertisementHandler);
      this.advertisementHandler = null;
      this.watchedDevice = null;
      return false;
    }
    return true;
  }

  /**
   * Fan-out helper — clones the listener set before iterating so an
   * unsubscribe inside a callback doesn't skip siblings.
   */
  private notifyListeners(status: PrinterStatus): void {
    const snapshot = Array.from(this.statusListeners);
    for (const cb of snapshot) {
      try {
        cb(status);
      } catch {
        // Listener errors are swallowed — one bad subscriber
        // shouldn't poison the broadcast.
      }
    }
  }

  async close(): Promise<void> {
    if (this.advertisementHandler !== null && this.watchedDevice !== null) {
      this.watchedDevice.removeEventListener(
        'advertisementreceived',
        this.advertisementHandler,
      );
      const dev = this.watchedDevice as BluetoothDevice & {
        unwatchAdvertisements?: () => void;
      };
      try {
        dev.unwatchAdvertisements?.();
      } catch {
        // Best-effort.
      }
      this.advertisementHandler = null;
      this.watchedDevice = null;
    }
    this.statusListeners.clear();
    await this.transport.close();
  }
}
