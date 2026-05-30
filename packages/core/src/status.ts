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
 * Parse a 3-byte status notification frame `[0x1B, 0x52, code]` into
 * a `PrinterStatus`. Code enum and confidence caveats: see
 * docs/protocol/letratag-bt.md § `ESC A`. Codes 1/5 are aliased to
 * 0/2 respectively.
 *
 * Code 5 gotcha — bench-confirmed 2026-05-10: with small content
 * (≤ ~16 head columns) and `forcedTrailingFeedMm: 0`, back-to-back
 * identical payloads produced a strict 1-5-1-5 alternation for 8+
 * attempts (head never engaged on the 5s). The fix is a minimum
 * feed-column count per job — wider content or `forcedTrailingFeedMm`
 * padding (6 on the LT-200B engine). Code 5 here is a firmware
 * state-toggle rejection, not a real fault; the "unknown failure"
 * mapping may still hold for other triggers.
 *
 * `mediaLoaded` is always `true` (cassette presence surfaces only
 * via code 7; no out-of-job channel). A malformed frame returns a
 * `'protocol'` error rather than throwing.
 */
export function parseStatus(bytes: Uint8Array): PrinterStatus {
  if (bytes.length < STATUS_NOTIFICATION_LENGTH || bytes[0] !== 0x1b || bytes[1] !== 0x52) {
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
