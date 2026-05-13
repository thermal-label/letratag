# debug

## Interfaces

| Interface | Description |
| ------ | ------ |
| [\_\_DebugEncoderOverrides](interfaces/DebugEncoderOverrides.md) | Internal encoder overrides. Not re-exported from `index.ts` — reachable only through the `./debug` subpath. Used by the verification harness to poke at the only remaining unknown: `mediaTypeByte` (the cassetteId enum is documented in the protocol page but the host normally does not emit `MEDIA_TYPE` on the print path). |

## References

### buildPrintPayload

Re-exports [buildPrintPayload](../functions/buildPrintPayload.md)

***

### chunkPayload

Re-exports [chunkPayload](../functions/chunkPayload.md)

***

### encodeBitmap

Re-exports [encodeBitmap](../functions/encodeBitmap.md)

***

### encodeLabel

Re-exports [encodeLabel](../functions/encodeLabel.md)
