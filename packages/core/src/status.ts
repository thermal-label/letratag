import type { PrinterError, PrinterStatus } from '@thermal-label/contracts';

/** Length in bytes of a well-formed RX status notification frame. */
export const STATUS_NOTIFICATION_LENGTH = 3;

/**
 * Status request directive — `[0x1B, 0x41]`. Embedded in every print
 * payload between `CUT` and `END`; on-the-wire observation does not
 * show it sent stand-alone (the host instead reads BLE advertising
 * data for out-of-job state — see {@link parseAdvertisingStatus}).
 */
export const STATUS_REQUEST: Uint8Array = new Uint8Array([0x1b, 0x41]);

// ─── RX notification (post-print) ───────────────────────────────────

/**
 * Parse a 3-byte status notification frame from the printer.
 *
 * Frame layout: `[0x1B, 0x52, code]` — `code` is at byte index 2.
 * The value-to-meaning mapping in this function is **carried over
 * from `ysfchn/dymo-bluetooth`'s `Result.from_bytes`** and has not
 * been confirmed by direct observation, which has only positively
 * established `code === 0` (success). Treat the table as a
 * best-effort enum pending hardware confirmation.
 *
 *   0 → success.
 *   1 → success (alternate; aliased to 0).
 *   2 → unknown failure.
 *   3 → low battery (printed anyway; warning, `ready: true`).
 *   4 → cancelled.
 *   5 → unknown failure (alternate; aliased to 2).
 *   6 → battery too low to print.
 *   7 → cassette missing — **prefer the advertising-data
 *        cassetteId field for cassette-presence checks**.
 *
 * `mediaLoaded` is always `true` — the cassette signal lives in
 * advertising data, not in this frame. `detectedMedia` is always
 * `undefined`. A malformed frame returns a `PrinterStatus` with a
 * `'protocol'` error rather than throwing.
 */
export function parseStatus(bytes: Uint8Array): PrinterStatus {
  if (
    bytes.length < STATUS_NOTIFICATION_LENGTH ||
    bytes[0] !== 0x1b ||
    bytes[1] !== 0x52
  ) {
    return {
      ready: false,
      mediaLoaded: true,
      errors: [{ code: 'protocol', message: 'Invalid status frame' }],
      rawBytes: bytes,
    };
  }

  const code = bytes[2] ?? 0;
  const errors: PrinterError[] = [];
  let ready = true;

  switch (code) {
    case 0:
    case 1:
      break;
    case 2:
    case 5:
      errors.push({ code: 'unknown_failure', message: 'Print failed' });
      ready = false;
      break;
    case 3:
      errors.push({
        code: 'low_battery',
        message: 'Battery low; printed anyway',
      });
      break;
    case 4:
      errors.push({ code: 'cancelled', message: 'Job cancelled' });
      ready = false;
      break;
    case 6:
      errors.push({
        code: 'battery_too_low',
        message: 'Battery too low to print',
      });
      ready = false;
      break;
    case 7:
      errors.push({
        code: 'cassette_missing',
        message: 'Cassette missing (use advertising-data cassetteId for reliable detection)',
      });
      ready = false;
      break;
    default:
      errors.push({
        code: 'unknown',
        message: `Unknown status code ${String(code)}`,
      });
      ready = false;
      break;
  }

  return { ready, mediaLoaded: true, errors, rawBytes: bytes };
}

// ─── BLE advertising-data status (continuous, no connection) ────────

/** Length in bytes of a well-formed advertising-data payload. */
export const ADVERTISING_STATUS_LENGTH = 3;

/**
 * Cassette tape size enum, broadcast in advertising data and
 * accepted as the `MEDIA_TYPE` directive payload.
 */
export type CassetteId = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Mapping from the `cassetteId` enum (1..5) to the physical tape
 * width in millimetres. ID 0 is treated as "no cassette" — the
 * official app does not document the no-cassette code, but a
 * zero-valued field has no plausible mapping. Use the advertising
 * data's error flags (TAPE_JAM, etc.) and the `busyLocked` /
 * presence signals together to decide whether a cassette is
 * actually loaded.
 */
export const CASSETTE_WIDTH_MM: Readonly<Record<CassetteId, number | null>> = {
  0: null,
  1: 6,
  2: 9,
  3: 12,
  4: 19,
  5: 24,
};

export interface AdvertisingStatus {
  /** Protocol revision broadcast in the top nibble of byte 0. */
  revision: number;
  /** 1=6mm, 2=9mm, 3=12mm, 4=19mm, 5=24mm. 0 = unknown / absent. */
  cassetteId: CassetteId;
  /** Tape width in mm, or `null` when `cassetteId` is 0. */
  cassetteWidthMm: number | null;
  /** Carbon-substrate flag (semantics not yet established). */
  carbonType: boolean;
  /** Printer is mid-job. */
  busyLocked: boolean;
  /** Battery level 0..3 (four levels; 3 = full). */
  batteryLevel: 0 | 1 | 2 | 3;
  /** Charging cable connected. */
  charging: boolean;
  /** Active error flags — empty when the printer is idle and OK. */
  errors: PrinterError[];
  /** Raw 3 bytes for diagnostics export. */
  rawBytes: Uint8Array;
}

/**
 * Parse the LT-200B's BLE advertising-data manufacturer payload.
 *
 * Layout (observable in the BLE manufacturer-data field of every
 * advertising packet broadcast by the printer):
 *
 * ```
 * byte 0  bits 4-7  revision
 *         bits 0-3  reserved
 * byte 1  bits 0-3  cassetteId
 *         bit 4     carbonType
 *         bit 5     busyLocked
 *         bits 6-7  spare
 * byte 2  bit 0     TAPE_JAM
 *         bit 1     CUTTER_JAM
 *         bit 2     BATTERY_TOO_LOW
 *         bit 3     BATTERY_LOW
 *         bits 4-5  batteryLevel (0..3)
 *         bit 6     chargingIndicator
 *         bit 7     reserved
 * ```
 *
 * `null` is returned for malformed input (length < 3); callers can
 * treat that as "device is advertising but the manufacturer data
 * isn't ours".
 */
export function parseAdvertisingStatus(bytes: Uint8Array): AdvertisingStatus | null {
  if (bytes.length < ADVERTISING_STATUS_LENGTH) return null;

  const b0 = bytes[0] ?? 0;
  const b1 = bytes[1] ?? 0;
  const b2 = bytes[2] ?? 0;

  const cassetteIdRaw = (b1 & 0x0f) as CassetteId;
  const cassetteId: CassetteId = cassetteIdRaw <= 5 ? cassetteIdRaw : 0;
  const errors: PrinterError[] = [];
  if ((b2 & 0x01) !== 0) errors.push({ code: 'tape_jam', message: 'Tape jam' });
  if ((b2 & 0x02) !== 0) errors.push({ code: 'cutter_jam', message: 'Cutter jam' });
  if ((b2 & 0x04) !== 0)
    errors.push({ code: 'battery_too_low', message: 'Battery too low to print' });
  if ((b2 & 0x08) !== 0)
    errors.push({ code: 'low_battery', message: 'Battery low; can still print' });

  return {
    revision: (b0 >>> 4) & 0x0f,
    cassetteId,
    cassetteWidthMm: CASSETTE_WIDTH_MM[cassetteId],
    carbonType: ((b1 >>> 4) & 1) !== 0,
    busyLocked: ((b1 >>> 5) & 1) !== 0,
    batteryLevel: ((b2 >>> 4) & 0b11) as 0 | 1 | 2 | 3,
    charging: ((b2 >>> 6) & 1) !== 0,
    errors,
    rawBytes: new Uint8Array(bytes.subarray(0, ADVERTISING_STATUS_LENGTH)),
  };
}

/**
 * Convenience: convert an `AdvertisingStatus` into a contracts
 * `PrinterStatus`. Useful for surfacing the broadcast state through
 * `PrinterAdapter.getStatus()` between print jobs.
 */
export function advertisingToPrinterStatus(adv: AdvertisingStatus): PrinterStatus {
  const fatal = adv.errors.some(
    e => e.code === 'tape_jam' || e.code === 'cutter_jam' || e.code === 'battery_too_low',
  );
  return {
    ready: !fatal && !adv.busyLocked,
    mediaLoaded: adv.cassetteId !== 0,
    errors: adv.errors,
    rawBytes: adv.rawBytes,
  };
}
