# Function: buildPrintData()

```ts
function buildPrintData(
   width: number, 
   height: number, 
   image: Uint8Array): Uint8Array;
```

`[0x1B, 0x44, 0x81, 0x02, ...u32le(width), ...u32le(height), ...image]`

`width = feed_count`, `height = 32` (the protocol frame).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `width` | `number` |
| `height` | `number` |
| `image` | `Uint8Array` |

## Returns

`Uint8Array`
