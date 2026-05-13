# Variable: BODY\_CHUNK

```ts
const BODY_CHUNK: 500 = 500;
```

Protocol-level upper bound on body bytes per BLE write. Used as
the ceiling when no `mtu` is provided to `chunkPayload`; effective
chunk size is `min(BODY_CHUNK, mtu - 1)`.

500 is the value documented in vendor-protocol notes — but on
real BLE links this size exceeds typical MTU (247 ATT, 244-byte
payload), and Chrome doesn't auto-fragment `writeValueWithoutResponse`
writes beyond the negotiated link MTU on every platform.
Bench-confirmed 2026-05-10: 500-byte writes fail on the first
chunk of a multi-chunk job with "GATT operation failed for unknown
reason"; 244-byte writes succeed reliably.

Always pass the registry's `bluetooth-gatt.mtu` through the
encoder context (`encodeLabel(bitmap, opts, overrides, { mtu })`)
for multi-chunk-safe behaviour. The registry value should track
the BLE link MTU you expect to negotiate (247 = conservative
default; some stacks negotiate higher).
