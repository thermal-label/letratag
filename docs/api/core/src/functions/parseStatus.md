# Function: parseStatus()

```ts
function parseStatus(bytes: Uint8Array): PrinterStatus;
```

Parse a 3-byte status notification frame `[0x1B, 0x52, code]` into
a `PrinterStatus`. Code enum and confidence caveats: see
docs/protocol/letratag-bt.md § `ESC A`. Codes 1/5 are aliased to
0/2 respectively.

Code 5 gotcha — bench-confirmed 2026-05-10: with small content
(≤ ~16 head columns) and `forcedTrailingFeedMm: 0`, back-to-back
identical payloads produced a strict 1-5-1-5 alternation for 8+
attempts (head never engaged on the 5s). The fix is a minimum
feed-column count per job — wider content or `forcedTrailingFeedMm`
padding (6 on the LT-200B engine). Code 5 here is a firmware
state-toggle rejection, not a real fault; the "unknown failure"
mapping may still hold for other triggers.

`mediaLoaded` is always `true` (cassette presence surfaces only
via code 7; no out-of-job channel). A malformed frame returns a
`'protocol'` error rather than throwing.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `Uint8Array` |

## Returns

[`PrinterStatus`](/contracts/api/interfaces/PrinterStatus)
