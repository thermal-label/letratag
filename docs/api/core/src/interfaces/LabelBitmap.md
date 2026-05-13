# Interface: LabelBitmap

A 1-bit-per-pixel bitmap. Row-major, MSB-first within each byte.

Memory layout:
  Row y, pixel x -> byte index: y * bytesPerRow + Math.floor(x / 8)
                 -> bit index:  7 - (x % 8)   (MSB = leftmost pixel)

A set bit (1) = black dot. A clear bit (0) = white dot.

## Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-data"></a> `data` | `readonly` | `Uint8Array` |
| <a id="property-heightpx"></a> `heightPx` | `readonly` | `number` |
| <a id="property-widthpx"></a> `widthPx` | `readonly` | `number` |
