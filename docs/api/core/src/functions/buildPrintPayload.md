# Function: buildPrintPayload()

```ts
function buildPrintPayload(
   bitmap: LabelBitmap, 
   options?: PrintPayloadOptions, 
   overrides?: __DebugEncoderOverrides): Uint8Array;
```

Build the print payload (everything after the 9-byte header):
`START + [MEDIA_TYPE] + NUMBER_OF_COPIES + PRINT_DATA + CUT +
STATUS + END`.

`MEDIA_TYPE` is included only when
`overrides.mediaTypeByte` is defined — Phase 1 default omits it,
matching the observed print flow. The debug harness exposes the
override to poke at C5.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `bitmap` | [`LabelBitmap`](../interfaces/LabelBitmap.md) |
| `options?` | `PrintPayloadOptions` |
| `overrides?` | `__DebugEncoderOverrides` |

## Returns

`Uint8Array`
