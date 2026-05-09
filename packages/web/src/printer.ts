import { renderImage, type RawImageData } from '@mbtech-nl/bitmap';
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
   */
  setAdvertisingStatus(adv: AdvertisingStatus | null): void {
    this.lastAdvertising = adv;
  }

  async print(
    image: RawImageData,
    media?: MediaDescriptor,
    options?: LetraTagPrintOptions,
  ): Promise<void> {
    const resolved = (media ?? DEFAULT_MEDIA) as LetraTagMedia;
    const rotate = pickRotation(image, resolved, ROTATE_DIRECTION, options?.rotate);
    const bitmap = renderImage(image, { dither: true, rotate });

    const engine = this.device.engines[0];
    const writes = encodeLabel(
      bitmap,
      options,
      undefined,
      engine ? { engine, media: resolved } : { media: resolved },
    );
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
      this.lastStatus = parseStatus(bytes);
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

  async close(): Promise<void> {
    await this.transport.close();
  }
}
