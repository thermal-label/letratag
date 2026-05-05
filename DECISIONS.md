# Decisions

Phase-1 settled decisions only. Phase-2 questions (Node BLE, replay
CLI, the broader LetraTag-family registry) live in PLAN-2.md.

## D1 — BLE-only device; Phase 1 is web-only; Node deferred

The LT-200B exposes no USB or serial interface; the only reachable
transport is BLE GATT. Web Bluetooth in Chrome / Edge handles
platform pairing uniformly, so Phase 1 ships only the web driver.
A Node BLE round needs its own decision document — we are not
adopting `noble` by default.

## D2 — Chunked framing lives in core; transport stays neutral

`@thermal-label/letratag-core` owns the 9-byte header, the 500-byte
chunk slicing, the index-byte sequencing, and the trailing `MAGIC`.
The `Transport` interface stays the same byte channel every other
driver gets. This way the encoder is testable without a transport,
and the transport stays usable by drivers that don't need framing.

## D3 — Encoder follows the observed wire format

`packages/core/src/protocol.ts` implements the wire format that the
LT-200B accepts on its primary GATT service. Every directive byte,
the bit packing (MSB-first per byte then per-rasterline byte
reversal), the chunk size (500), the chunk-index quirk (skip 27),
and the print-job order
(`START → COPIES → PRINT_DATA → CUT → STATUS → END`) are anchored on
the byte sequences observed between a paired LT-200B and a host —
see [`INTEROPERABILITY.md`](INTEROPERABILITY.md) for sources and
posture.

This **supersedes** the earlier draft of D3 that called for ysfchn
conventions with alexhorn as a feature-flagged alternate. The two
upstream encoders disagreed on several details (ysfchn's `y+1` skip,
alexhorn's axis order); on-the-wire observation resolves each
conflict in a single direction, and the encoder now implements that
direction unconditionally. The full reconciliation is documented in
[`docs/protocol/letratag-bt.md`](docs/protocol/letratag-bt.md).

The verification harness retains a single override —
`mediaTypeByte` — for poking at C5 from the debug app. The earlier
`axisOrder`, `bitPacking`, and `chunkIndexQuirk` knobs have been
removed.

## D4 — GATT discovery uses UUID-prefix matching

The driver registry stores the canonical UUID for the request
filter, but the connection path matches the primary service by its
`be3dd650-` prefix and derives TX (`be3dd651-…`), RX (`be3dd652-…`),
and short-command (`be3dd653-…`) characteristic UUIDs by
substituting the prefix on the matched service tail. The official
app does the same via its `setDeviceUUID()` helper, which replaces
a literal placeholder in each of the four UUIDs at connect time.

## D5 — Media detection is available via BLE advertising data

The LT-200B continuously broadcasts a 3-byte payload in its BLE
advertising-data manufacturer field. The payload encodes
`cassetteId` (1=6mm, 2=9mm, 3=12mm, 4=19mm, 5=24mm), `busyLocked`,
`batteryLevel` (0..3), `chargingIndicator`, and four error flags
(tape jam, cutter jam, battery too low, battery low).

This **revises** an earlier PLAN-1 working assumption that the
LT-200B has no media-detection signal. The driver:

- Parses the advertising-data via `parseAdvertisingStatus()` in
  `packages/core/src/status.ts`.
- Folds the most recent snapshot into `LetraTagPrinter.getStatus()`.
- The debug harness shows the full decoded state in a dedicated
  panel and includes it in diagnostics exports.

Status code 7 ("CASSETTE_MISSING") on the post-print RX
notification is still treated as unreliable — prefer the broadcast
`cassetteId` for cassette-presence checks.

## D6 — Post-print status enum (codes 1–7) carried from ysfchn

On the wire, only `code === 0` (success) has been positively
observed; the values 1–7 in the post-print notification table
inherit from `ysfchn/dymo-bluetooth`'s `Result.from_bytes`. The
driver implements the full table but flags it explicitly as
unconfirmed by direct observation. Hardware reports promote it to
verified; until then, treat the table as a best-effort enum.
