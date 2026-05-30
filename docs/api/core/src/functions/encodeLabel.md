# Function: encodeLabel()

```ts
function encodeLabel(
   bitmap: LabelBitmap, 
   options?: LetraTagPrintOptions, 
   overrides?: __DebugEncoderOverrides, 
   context?: {
  engine?: PrintEngine;
  media?: MediaDescriptor;
  mtu?: number;
}): Uint8Array[];
```

Encode a complete LetraTag print job into the ordered list of BLE
writes. The transport calls `write()` with each entry in turn.

Produces a single job per call so callers keep per-copy status
reads; the driver layer sequences `copies > 1` itself (typically
`copies - 1` jobs with `cut: false` then one with `cut: true`).

Pass `engine` (and optionally `media`) to apply the chassis
dead-zone correction; omitting it yields byte-identical output.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `bitmap` | [`LabelBitmap`](/contracts/api/interfaces/LabelBitmap) |
| `options?` | [`LetraTagPrintOptions`](../interfaces/LetraTagPrintOptions.md) |
| `overrides?` | `__DebugEncoderOverrides` |
| `context?` | \{ `engine?`: [`PrintEngine`](/contracts/api/interfaces/PrintEngine); `media?`: [`MediaDescriptor`](/contracts/api/interfaces/MediaDescriptor); `mtu?`: `number`; \} |
| `context.engine?` | [`PrintEngine`](/contracts/api/interfaces/PrintEngine) |
| `context.media?` | [`MediaDescriptor`](/contracts/api/interfaces/MediaDescriptor) |
| `context.mtu?` | `number` |

## Returns

`Uint8Array`[]
