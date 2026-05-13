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
  - Subsequent entries (print path): `[chunkIndex, ...body[i*N..]]`
    where N = effective chunk size. Final chunk additionally
    appends MAGIC `[0x12, 0x34]`.
  - Non-print path (`isPrint = false`): single body write with
    leading zero index (used by the stand-alone set-cassette-type
    payload that goes over `printShortCommandUUID`).

Effective chunk size: `min(BODY_CHUNK, mtu - 1)` when `mtu` is
provided (via the registry's `bluetooth-gatt.mtu`). The −1 reserves
one byte for the protocol-level chunk-index prefix that fronts each
BLE write. When `mtu` is omitted the encoder falls back to
`BODY_CHUNK` — which matches single-chunk job behaviour but will
blow up multi-chunk jobs on stacks that don't auto-fragment writes
exceeding negotiated link MTU. Always pass `mtu` for correctness
on multi-chunk content.

Chunk indices are sequential 0, 1, 2, … with the wire-format
quirk that index 27 is skipped — the chunk that would have
received index 27 gets index 28, and every chunk after it shifts
by one. Realistic LT labels never approach 27 chunks
(~13.5 KiB body); the quirk is preserved for forward-compat.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `payload` | `Uint8Array` |
| `isPrint` | `boolean` |
| `options?` | \{ `mtu?`: `number`; \} |
| `options.mtu?` | `number` |

## Returns

`Uint8Array`[]
