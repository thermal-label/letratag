# Function: chunkPayload()

```ts
function chunkPayload(
   payload: Uint8Array, 
   isPrint: boolean, 
   options?: {
  mtu?: number;
}): Uint8Array[];
```

Slice an assembled payload into the ordered list of BLE writes.

Output:
  - First entry: 9-byte header.
  - Print path: `[chunkIndex, ...body]` per write; final chunk
    appends MAGIC `[0x12, 0x34]`.
  - Non-print path (`isPrint = false`): single body write with a
    leading zero index (the stand-alone set-cassette-type payload).

Effective chunk size is `min(BODY_CHUNK, mtu - 1)`; always pass
`mtu` for multi-chunk correctness (omitting it blows up multi-chunk
jobs on stacks that don't auto-fragment). The index-27 skip quirk
applies. See docs/protocol/letratag-bt.md § Chunking.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `payload` | `Uint8Array` |
| `isPrint` | `boolean` |
| `options?` | \{ `mtu?`: `number`; \} |
| `options.mtu?` | `number` |

## Returns

`Uint8Array`[]
