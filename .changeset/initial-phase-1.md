---
'@thermal-label/letratag-core': minor
'@thermal-label/letratag-web': minor
---

Initial Phase 1 release — DYMO LetraTag LT-200B driver, web only.

- `letratag-core` — pure TypeScript encoder for the LT-200B BLE
  print protocol, following the observed wire format (column-major
  bit packing, the 32-row print frame, the vendor chunk-index
  quirk). A single internal `__DebugEncoderOverrides.mediaTypeByte`
  knob is reachable via the `./debug` subpath but not on the public
  API. Status parser covers codes 0..7 with the 1↔0 / 5↔2 aliases.
  Media registry has all ten active and discontinued LT cassette
  SKUs (US 91XXX + EU S07XXXXX).
- `letratag-web` — `LetraTagPrinter implements PrinterAdapter` over
  Web Bluetooth. UUID-prefix matching on the `be3dd650-` service
  with TX / RX / aux UUIDs derived from the observed service tail.
- `letratag-debug` (private, deployed to GitHub Pages) — verification
  harness with the T1..T5 + CUSTOM test pattern matrix, encoder A/B
  controls, live trace log, and schemaVersion-1 diagnostics export.

Phase 2 lands the alexhorn cleanup, the replay CLI, the hardware
verification issue template, and Node BLE support.
