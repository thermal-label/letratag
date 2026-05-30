# Variable: BODY\_CHUNK

```ts
const BODY_CHUNK: 500 = 500;
```

Protocol-level upper bound on body bytes per BLE write; ceiling
when no `mtu` is provided to `chunkPayload`. Effective chunk size
is `min(BODY_CHUNK, mtu - 1)` — see docs/protocol/letratag-bt.md.

500 exceeds typical BLE link MTU and Chrome won't auto-fragment
write-without-response past the negotiated MTU. Bench-confirmed
2026-05-10: 500-byte writes fail on the first chunk of a
multi-chunk job; 244-byte writes succeed. Always pass the
registry's `bluetooth-gatt.mtu` via the encoder context for
multi-chunk-safe behaviour.
