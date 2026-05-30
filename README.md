# `@thermal-label/letratag`

> TypeScript-first DYMO LetraTag LT-200B driver — browser Web Bluetooth.

[![CI](https://github.com/thermal-label/letratag/actions/workflows/ci.yml/badge.svg)](https://github.com/thermal-label/letratag/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/thermal-label/letratag/branch/main/graph/badge.svg)](https://codecov.io/gh/thermal-label/letratag)
[![npm core](https://img.shields.io/npm/v/@thermal-label/letratag-core.svg?label=core)](https://npmjs.com/package/@thermal-label/letratag-core)
[![npm web](https://img.shields.io/npm/v/@thermal-label/letratag-web.svg?label=web)](https://npmjs.com/package/@thermal-label/letratag-web)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Driver for the **DYMO LetraTag LT-200B**, a 12 mm Bluetooth LE
handheld label printer with a custom chunked-GATT print protocol.
This repo ships two workspace packages:

- [`@thermal-label/letratag-core`](packages/core) — pure TypeScript
  protocol encoder, status parser, and media registry. Browser- and
  Node-safe; no transport coupling.
- [`@thermal-label/letratag-web`](packages/web) — Web Bluetooth driver
  built on `@thermal-label/transport/web`.

Verification runs on the shared thermal-label harness; a remote
tester points their LT-200B-paired Chrome at it, runs the test
pattern matrix, and exports the captured trace for triage.

## Layout

```
packages/
  core/     — encoder, registry, status parser
  web/      — Web Bluetooth printer adapter
scripts/
  compile-data.mjs — emits data/*.json + src/*.generated.ts
.github/workflows/
  ci.yml      — typecheck / lint / format / test:coverage / build
```

## Workflow

```sh
pnpm install
pnpm --filter @thermal-label/letratag-core compile-data
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Phase status

Phase 1 is web-only; Node BLE support is deferred. The encoder
matches the byte stream observed on the wire from a paired LT-200B
— see [`docs/protocol/letratag-bt.md`](docs/protocol/letratag-bt.md)
for the authoritative spec and
[`INTEROPERABILITY.md`](INTEROPERABILITY.md) for the project's
sources and legal posture. Current hardware status for the LT-200B
is in the [Supported hardware](#supported-hardware) table below
(generated from the device registry) and on the
[hardware docs page](docs/hardware.md) — see also
[DECISIONS.md](DECISIONS.md). Node BLE support, a replay CLI, and
hardware issue templates are deferred to a later phase.

## For the remote tester

Verification runs on the shared thermal-label harness in Chrome or
Edge on a desktop or Android device:

1. Connect via Web Bluetooth and pick your LT-200B from the picker.
2. Run **T1** (single-pixel test) → expect a single dot at the
   leading edge of the tape, in the row closest to the cassette
   opening. Export the diagnostics JSON and paste into a new GitHub
   issue along with a close-up photo.
3. Run **T2** (asymmetric rectangle) → expect a rectangle wider
   across the head than along the feed.
4. Run **CUSTOM** with any short text → expect normal printing.

The diagnostics JSON contains everything needed to debug remotely:
the captured TX/RX trace, the bitmap that was sent, and the encoder
settings used.

## Supported hardware

<!-- HARDWARE_TABLE:START -->
**1 devices** — 1 verified · 0 partial · 0 broken · 0 untested

| Model | Key | USB PID | Transports | Status |
| --- | --- | --- | --- | --- |
| [LetraTag LT-200B](https://thermal-label.github.io/hardware/letratag/lt-200b) | `LT_200B` | — | BT LE | ✅ verified |

Click any model to open its detail page on the docs site, where engines, supported media, and verification reports live. The same data backs the [interactive cross-driver table](https://thermal-label.github.io/hardware/).
<!-- HARDWARE_TABLE:END -->

