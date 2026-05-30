import { renderImage, rotateBitmap, type RawImageData } from '@mbtech-nl/bitmap';
import {
  pickRotation,
  WriteSerializer,
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
  createPreviewOffline,
  encodeLabel,
  parseStatus,
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
 * Status has a single real source — the post-print `[1B 52 code]`
 * reply; the LT-200B has no out-of-job status channel (DECISIONS.md D5).
 */
export class LetraTagPrinter implements PrinterAdapter {
  readonly family = 'letratag';
  readonly device: LetraTagDevice;

  private readonly transport: Transport;
  private lastStatus: PrinterStatus = EMPTY_STATUS;
  /**
   * `onStatus` subscribers. The post-print notification pushes into
   * this set — the single real status source on this driver.
   */
  private readonly statusListeners = new Set<(status: PrinterStatus) => void>();
  /**
   * Serialises `print()` — the only transport-touching method here.
   * `getStatus()` is a pure cache read (no transport I/O) so there's
   * no live collision today, but `print()` writes, and wrapping it
   * keeps letratag uniform with the other drivers and future-proofs
   * against a status path that gains transport I/O later (plan 15
   * A3). See `WriteSerializer` in `@thermal-label/contracts`.
   */
  private readonly serializer = new WriteSerializer();

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

  print(
    image: RawImageData,
    media?: MediaDescriptor,
    options?: LetraTagPrintOptions,
  ): Promise<void> {
    // Whole-method wrap (plan 15 A3) — encoding is cheap relative to
    // print time, so a held lock during encode is harmless.
    return this.serializer.run(() => this.doPrint(image, media, options));
  }

  private async doPrint(
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
    // Without this, multi-chunk payloads exceed the link MTU and Chrome's
    // writeValueWithoutResponse path doesn't auto-fragment — the first
    // oversized chunk fails with "GATT operation failed for unknown reason."
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
      if (this.statusListeners.size > 0) {
        this.notifyListeners(postPrint);
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
   * Return the printer's last-known status — the most recent post-print
   * notification, or a default empty status before the first print.
   */
  getStatus(): Promise<PrinterStatus> {
    return Promise.resolve(this.lastStatus);
  }

  /**
   * Subscribe to status updates; returns an unsubscribe function. The
   * only push source is the post-print notification (see
   * {@link parseStatus}). The current cached status is replayed
   * immediately on subscribe so the harness status pill resolves
   * without waiting for the next print.
   *
   * Letratag has real push (plan 11), so this is not a polling shim.
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
    this.statusListeners.clear();
    await this.transport.close();
  }
}
