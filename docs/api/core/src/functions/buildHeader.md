# Function: buildHeader()

```ts
function buildHeader(payloadLength: number): Uint8Array;
```

9-byte job header `[0xFF, 0xF0, 0x12, 0x34, u32le(payloadLength),
checksum]`; `checksum` = sum of the preceding 8 bytes mod 256.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `payloadLength` | `number` |

## Returns

`Uint8Array`
