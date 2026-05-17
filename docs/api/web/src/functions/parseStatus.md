# Function: parseStatus()

```ts
function parseStatus(bytes: Uint8Array): PrinterStatus;
```

Parse a 3-byte status notification frame from the printer.

Frame layout: `[0x1B, 0x52, code]` — `code` is at byte index 2.
The value-to-meaning mapping in this function is **carried over
from `ysfchn/dymo-bluetooth`'s `Result.from_bytes`** and has not
been confirmed by direct observation, which has only positively
established `code === 0` (success). Treat the table as a
best-effort enum pending hardware confirmation.

  0 → success.
  1 → success (alternate; aliased to 0).
  2 → unknown failure.
  3 → low battery (printed anyway; warning, `ready: true`).
  4 → cancelled.
  5 → unknown failure (alternate; aliased to 2). Bench-confirmed
       2026-05-10: with sufficiently small content (≤ ~16 head
       columns) and `engine.forcedTrailingFeedMm: 0`, back-to-back
       prints with identical payload bytes produced a strict
       1-5-1-5 alternation for 8+ consecutive attempts (head never
       engaged on the 5s). The fix is to ensure a minimum total
       feed-column count per job — either via wider real content
       (e.g. text "hello" ≈ 30 columns avoids it naturally) or via
       `engine.forcedTrailingFeedMm` padding (set to 6 on the
       LT-200B engine). Code 5 in this scenario reads as
       "firmware-state-toggle rejection," not a real fault. ysfchn's
       "unknown failure" mapping may still be correct for *other*
       triggers — only the under-minimum-columns case is
       bench-explained.
  6 → battery too low to print.
  7 → cassette missing.

`mediaLoaded` is always `true` — the LT-200B firmware reports
cassette presence only via this post-print frame's code 7, with no
out-of-job channel. `detectedMedia` is always `undefined`. A
malformed frame returns a `PrinterStatus` with a `'protocol'` error
rather than throwing.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `Uint8Array` |

## Returns

[`PrinterStatus`](/contracts/api/interfaces/PrinterStatus)
