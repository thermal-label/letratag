# `@thermal-label/letratag`

Driver for the **DYMO LetraTag LT-200B**, a 12 mm Bluetooth LE
handheld label printer with a custom chunked-GATT print protocol.
This repo ships three workspace packages:

- [`@thermal-label/letratag-core`](packages/core) — pure TypeScript
  protocol encoder, status parser, and media registry. Browser- and
  Node-safe; no transport coupling.
- [`@thermal-label/letratag-web`](packages/web) — Web Bluetooth driver
  built on `@thermal-label/transport/web`.
- [`@thermal-label/letratag-debug`](packages/debug) — single-page
  Vue debug + verification harness, deployed to GitHub Pages on push
  to `main`. **Not published to npm.**

The deployed debug app lives at
**https://thermal-label.github.io/letratag/** — a remote tester points
their LT-200B-paired Chrome at it, runs the test pattern matrix, and
exports the captured trace as a single JSON blob for triage.

## Layout

```
packages/
  core/     — encoder, registry, status parser
  web/      — Web Bluetooth printer adapter
  debug/    — Vue/Vite debug app (Pages-deployed)
scripts/
  compile-data.mjs — emits data/*.json + src/*.generated.ts
.github/workflows/
  ci.yml      — typecheck / lint / test / build
  pages.yml   — builds packages/debug, deploys to GitHub Pages
```

## Workflow

```sh
pnpm install
pnpm --filter @thermal-label/letratag-core compile-data
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Deploying the debug page

Pages publishes from the GitHub Actions deployment flow — there is
**no `gh-pages` branch**. One-time setup in repo Settings:

1. Settings → Pages → "Build and deployment" → Source: **GitHub Actions**.
2. Push to `main`. The `pages.yml` workflow builds
   `packages/debug` and deploys it.
3. Subsequent deploys happen on any push touching `packages/core/**`,
   `packages/web/**`, `packages/debug/**`, or the workflow file.
   Use the "Run workflow" button on the Actions tab for manual redeploys.

The deployed URL is shown on the workflow run summary
(`steps.deployment.outputs.page_url`).

## Phase status

Phase 1 is web-only; Node BLE support is deferred. The encoder
matches the byte stream observed on the wire from a paired LT-200B
— see [`docs/protocol/letratag-bt.md`](docs/protocol/letratag-bt.md)
for the authoritative spec and
[`INTEROPERABILITY.md`](INTEROPERABILITY.md) for the project's
sources and legal posture. Hardware status for the LT-200B starts
at `Untested` — see [HARDWARE.md](HARDWARE.md) and
[DECISIONS.md](DECISIONS.md). Phase-2 items (replay CLI, hardware
issue templates, Node BLE) live in [PLAN-2.md](PLAN-2.md).

## For the remote tester

Open the deployed debug page at
**https://thermal-label.github.io/letratag/** in Chrome or Edge
on a desktop or Android device, then:

1. Click **Connect via Web Bluetooth**, pick your LT-200B from the
   picker. The advertising-data panel should populate within a
   second or two — check that `Cassette ID = 3 (12 mm)` matches
   the loaded cassette.
2. Run **T1** (single-pixel test) → expect a single dot at the
   leading edge of the tape, in the row closest to the cassette
   opening. Click **Copy JSON** and paste into a new GitHub issue
   along with a close-up photo.
3. Run **T2** (asymmetric rectangle) → expect a rectangle wider
   across the head than along the feed.
4. Run **CUSTOM** with any short text → expect normal printing.
5. If anything looks wrong, the **Encoder controls** panel exposes
   the one remaining experimental knob (`MEDIA_TYPE` byte) — the
   maintainer will ask you to flip it if needed.

The diagnostics JSON contains everything needed to debug remotely:
the captured TX/RX trace, the bitmap that was sent, the encoder
settings used, and the printer's advertising-data snapshot.

## Supported hardware

<!-- HARDWARE_TABLE:START -->
**1 devices** — 0 verified · 0 partial · 0 broken · 1 untested

| Model | Key | USB PID | Transports | Status |
| --- | --- | --- | --- | --- |
| [LetraTag LT-200B](https://thermal-label.github.io/hardware/letratag/lt-200b) | `LT_200B` | — | BT LE | ⏳ untested |

Click any model to open its detail page on the docs site, where engines, supported media, and verification reports live. The same data backs the [interactive cross-driver table](https://thermal-label.github.io/hardware/).
<!-- HARDWARE_TABLE:END -->

