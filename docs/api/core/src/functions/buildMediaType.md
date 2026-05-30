# Function: buildMediaType()

```ts
function buildMediaType(mediaId: number): Uint8Array;
```

`[0x1B, 0x4D, mediaId, 0x00, 0x00, 0x00]` — set cassette type.
Not emitted in the normal print flow; used by the stand-alone
set-cassette-type payload. The trailing three zeros are required.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `mediaId` | `number` |

## Returns

`Uint8Array`
