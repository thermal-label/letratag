# Function: buildMediaType()

```ts
function buildMediaType(mediaId: number): Uint8Array;
```

`[0x1B, 0x4D, mediaId, 0x00, 0x00, 0x00]` — set cassette type.
6 bytes total; the trailing three zeros are part of the observed
wire format.

Not emitted in the normal print flow. Available for the
stand-alone "set cassette type" payload that goes over the
`printShortCommandUUID` characteristic.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `mediaId` | `number` |

## Returns

`Uint8Array`
