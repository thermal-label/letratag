import type { PrinterError, PrinterStatus } from '@thermal-label/contracts';

/** Length in bytes of a well-formed RX status notification frame. */
export const STATUS_NOTIFICATION_LENGTH = 3;

/**
 * Status request directive — `[0x1B, 0x41]`. Embedded in every print
 * payload between `CUT` and `END`; on-the-wire observation does not
 * show it sent stand-alone.
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
 *   5 → unknown failure (alternate; aliased to 2). Bench-confirmed
 *        2026-05-10: with sufficiently small content (≤ ~16 head
 *        columns) and `engine.forcedTrailingFeedMm: 0`, back-to-back
 *        prints with identical payload bytes produced a strict
 *        1-5-1-5 alternation for 8+ consecutive attempts (head never
 *        engaged on the 5s). The fix is to ensure a minimum total
 *        feed-column count per job — either via wider real content
 *        (e.g. text "hello" ≈ 30 columns avoids it naturally) or via
 *        `engine.forcedTrailingFeedMm` padding (set to 6 on the
 *        LT-200B engine). Code 5 in this scenario reads as
 *        "firmware-state-toggle rejection," not a real fault. ysfchn's
 *        "unknown failure" mapping may still be correct for *other*
 *        triggers — only the under-minimum-columns case is
 *        bench-explained.
 *   6 → battery too low to print.
 *   7 → cassette missing.
 *
 * `mediaLoaded` is always `true` — the LT-200B firmware reports
 * cassette presence only via this post-print frame's code 7, with no
 * out-of-job channel. `detectedMedia` is always `undefined`. A
 * malformed frame returns a `PrinterStatus` with a `'protocol'` error
 * rather than throwing.
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
        message: 'Cassette missing',
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
