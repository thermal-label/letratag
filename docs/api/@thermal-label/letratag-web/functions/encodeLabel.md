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

The driver layer is responsible for translating `copies > 1` into
the correct sequence of jobs — typically that means emitting
`copies - 1` jobs with `cut: false` followed by one final job
with `cut: true`. `encodeLabel` itself produces a single job at a
time so callers retain control over per-copy status reads.

Pass `engine` (and optionally `media`) so the encoder can apply
the chassis dead-zone correction via `getPrintableArea` from
`@thermal-label/contracts`. When omitted, output is byte-identical
to Phase-1 — the path used by every test in this package.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `bitmap` | [`LabelBitmap`](../../letratag-core/interfaces/LabelBitmap.md) |
| `options?` | [`LetraTagPrintOptions`](../interfaces/LetraTagPrintOptions.md) |
| `overrides?` | [`__DebugEncoderOverrides`](../../letratag-core/debug/interfaces/DebugEncoderOverrides.md) |
| `context?` | \{ `engine?`: [`PrintEngine`](../../letratag-core/interfaces/PrintEngine.md); `media?`: [`MediaDescriptor`](../../letratag-core/interfaces/MediaDescriptor.md); `mtu?`: `number`; \} |
| `context.engine?` | [`PrintEngine`](../../letratag-core/interfaces/PrintEngine.md) |
| `context.media?` | [`MediaDescriptor`](../../letratag-core/interfaces/MediaDescriptor.md) |
| `context.mtu?` | `number` |

## Returns

`Uint8Array`[]
