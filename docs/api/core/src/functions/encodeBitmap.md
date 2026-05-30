# Function: encodeBitmap()

```ts
function encodeBitmap(bitmap: LabelBitmap, crossFeed?: {
  left: number;
  right: number;
}): Uint8Array;
```

Encode a head-aligned bitmap into the column-major 4-bytes-per-feed
stream the LT-200B expects. Bit packing: see
docs/protocol/letratag-bt.md § Image encoding.

**Input contract** — the bitmap is head-aligned: `widthPx` is the
head-perpendicular dimension (along the tape, the feed axis);
`heightPx` is across the head. The driver layer produces this
orientation.

No `y+1` skew: pixel `(0, 0)` lands in bit 7 of byte 3 → first
4 bytes = `00 00 00 80`. Source bitmaps shorter than the 32-row
frame are centered by zero-padding top and bottom.

**Cross-feed dead-zone shift** — non-zero `crossFeed.left/right`
(unprintable head rows) shift the centering into the reachable
subrange `[left, 32 - right)`. With both zero (today's default
until a bench measurement), output bytes are unchanged.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `bitmap` | [`LabelBitmap`](/contracts/api/interfaces/LabelBitmap) |
| `crossFeed` | \{ `left`: `number`; `right`: `number`; \} |
| `crossFeed.left` | `number` |
| `crossFeed.right` | `number` |

## Returns

`Uint8Array`
