# Function: encodeSetCassetteType()

```ts
function encodeSetCassetteType(mediaId: number): Uint8Array[];
```

Build the stand-alone `MEDIA_TYPE`-only write list. Used by the
driver's `setCassetteType()` path (writes to the
`printShortCommandUUID` characteristic).

Wire format: `HEADER + START + MEDIA_TYPE(id) + END`.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `mediaId` | `number` |

## Returns

`Uint8Array`[]
