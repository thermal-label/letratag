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

`MEDIA_TYPE` is emitted only when `overrides.mediaTypeByte` is
defined; the default print flow omits it.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `bitmap` | [`LabelBitmap`](/contracts/api/interfaces/LabelBitmap) |
| `options?` | `PrintPayloadOptions` |
| `overrides?` | `__DebugEncoderOverrides` |

## Returns

`Uint8Array`
