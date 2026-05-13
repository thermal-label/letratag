# Function: encodeBitmap()

```ts
function encodeBitmap(bitmap: LabelBitmap, crossFeed?: {
  left: number;
  right: number;
}): Uint8Array;
```

Encode a head-aligned bitmap into the column-major 4-bytes-per-feed
stream the LT-200B expects.

**Input contract** — the bitmap is head-aligned: `widthPx` is the
head-perpendicular dimension (along the tape, the feed axis);
`heightPx` is across the head. The driver layer is responsible
for producing this orientation.

**Algorithm** (`getBytesFromBitmapRaster` + `swapBits` in the
official app):
  - For each feed column, take the column's `heightPx` head-row
    bits and pack them MSB-first into 4 bytes (8 bits per byte,
    bit 7 = first row of the group).
  - Reverse the byte order within the column:
    `[b0, b1, b2, b3] → [b3, b2, b1, b0]`.

**Net effect** for a pixel at `(x_feed, y_head)` (with `y_head`
in `[0, 31]`):

    byte_index = 3 - floor(y_head / 8)
    bit_index  = 7 - (y_head % 8)

No `y+1` skew. Pixel `(0, 0)` lands in bit 7 of byte 3 → first
4 bytes = `00 00 00 80`.

If `heightPx < PROTOCOL_HEAD_FRAME` (32), the column is centered
within the 32-row frame by padding `floor((32 - h) / 2)` zero
rows on top and `32 - h - top` zero rows on the bottom — the
placement that matches the observed wire format.

**Cross-feed dead-zone shift** — when `crossFeed.left` /
`crossFeed.right` are non-zero (head rows the chassis cannot
print), the centering shifts so the bitmap rows land inside the
reachable subrange `[left, 32 - right)`. With both zero (today's
default until the maintainer benches a measurement), the math
reduces to the centering formula above and output bytes are
unchanged.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `bitmap` | [`LabelBitmap`](../interfaces/LabelBitmap.md) |
| `crossFeed` | \{ `left`: `number`; `right`: `number`; \} |
| `crossFeed.left` | `number` |
| `crossFeed.right` | `number` |

## Returns

`Uint8Array`
