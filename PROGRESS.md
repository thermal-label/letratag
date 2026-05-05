# Phase 1 — Build Log

Tracking implementation against [PLAN-1.md](PLAN-1.md). Step boxes
mirror the plan; this file is the running log of what's been done,
what's been decided, and where the implementation chose differently
than the plan suggested.

## Step 0 — Tracking

- [x] Read PLAN-1 end-to-end and accept it.
- [x] Convert PLAN-1's checkboxes into this PROGRESS.md.

Sources of truth: `ysfchn/dymo-bluetooth/dymo_bluetooth/printer.py`
(canonical), `alexhorn/lt200b` (alternate; not implemented in Phase 1).

## Step 1 — Repo scaffold

- [x] `LICENSE` (MIT, current year, Mannes Brak).
- [x] `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`,
      `eslint.config.js`, `.prettierignore`, `.gitignore`,
      `.gitattributes`, `.changeset/config.json`, `.changeset/README.md`.
- [x] `pnpm-workspace.yaml` includes `packages/*`.
- [x] `.github/workflows/ci.yml`.
- [x] `.github/workflows/pages.yml` (deploys debug app on push to main).
- [x] `README.md` (three sentences + link to deployed debug page).
- [x] `HARDWARE.md` (single row, `LT_200B`, status `Untested`).
- [x] `DECISIONS.md` (D1–D4 only).

Deferred to Phase 2 per plan: `.github/FUNDING.yml`, hardware-verification
issue template, `release.yml`, `docs.yml`, `scripts/` directory beyond
`compile-data.mjs`, `docs/api/.gitkeep`, `plans/`.

## Step 2 — `@thermal-label/letratag-core`

### 2.1 Package metadata
- [x] `packages/core/package.json` — copied + renamed.

### 2.2 Device registry
- [x] `packages/core/data/devices/LT_200B.json5` (with
      `headDots: 30` + driver-extension `protocolHeadFrame: 32`).
- [x] `scripts/compile-data.mjs` (forked from labelmanager;
      `KNOWN_PROTOCOLS = ['letratag-bt']`, BLE GATT validation,
      LetraTag media validation).
- [x] `data/media.json5` — all ten entries.

### 2.3 Types
- [x] `LetraTagDevice`, `LetraTagMaterial`, `LetraTagMedia`,
      `LetraTagPrintOptions`. No `encoding` / `chunkIndexQuirk` /
      `emitMediaType` on the public type. Internal
      `__DebugEncoderOverrides` carries the experimental knobs.

### 2.4 Protocol encoder
- [x] Directives `START`, `MEDIA_TYPE` (defined, not invoked),
      `PRINT_DATA`, `FORM_FEED`, `STATUS`, `END`.
- [x] `encodeBitmap(bitmap)` — ysfchn column-major + `y+1` skip;
      alexhorn alternate behind override.
- [x] Header / checksum (9 bytes, last = sum of preceding 8 mod 256).
      `MAGIC = [0x12, 0x34]`.
- [x] `buildPrintPayload`, `chunkPayload`, `encodeLabel`.

### 2.4.1 Tests
- [x] Structural directive tests.
- [x] `chunkPayload` round-trip.
- [x] Length tests.
- [x] Checksum test.
- [x] Bit-packing test labelled "matches ysfchn upstream".

### 2.5 Status parser
- [x] Per PLAN.md §2.6 verbatim. Codes 0..7, alias 1↔0 and 5↔2,
      `mediaLoaded: true` always.

### 2.6 Preview
- [x] Single-plane single-ink preview using selected media's
      `text` / `background`.

### 2.7 Public API
- [x] `DEVICES`, `MEDIA`, `MEDIA_LIST`, `DEFAULT_MEDIA`,
      `LT_PAPER_WHITE`, `findMediaBySku`, encoder + status + preview.
- [x] Internal `./debug` subpath export accepting
      `__DebugEncoderOverrides`.

## Step 3 — `@thermal-label/letratag-web`
- [x] `packages/web/package.json` with peerDeps.
- [x] `src/discovery.ts` — `requestPrinter(options?)`; UUID-prefix
      matching; derived TX/RX/aux UUIDs.
- [x] `src/printer.ts` — `LetraTagPrinter implements PrinterAdapter`.
- [x] `src/index.ts` re-exports.
- [x] Tests with fake transport.

## Step 4 — `@thermal-label/letratag-debug`
- [x] `packages/debug/package.json` (`private: true`).
- [x] Vite config with `base: '/letratag/'`.
- [x] Single-page Vue app with all sections from PLAN-1 §4.2.
- [x] Diagnostics JSON shape per PLAN-1 §4.3 (schemaVersion 1, with
      `axisOrder` + `bitPacking` split).
- [x] `.github/workflows/pages.yml` — paths-filtered + workflow_dispatch.
- [x] Deployment docs in README.

## Step 5 — Friend tests + first feedback loop

Cannot execute autonomously — requires a remote tester with an
LT-200B and a Chrome/Edge browser. The harness is deployed by
pushing to `main`; the friend then opens
`https://thermal-label.github.io/letratag/`, runs T1/T2/T3/T4-normal/
T4-no-cassette/CUSTOM, clicks **Copy JSON** after each, and pastes
the export into a tracking issue. Issue creation is left to the
human — this repo doesn't exist on github.com yet at the time of
this build. Once it does, open one tracking issue per test (or one
issue with seven checkboxes — friend's preference).

## Step 6 — Phase-1 release

- [x] Changeset stub at `.changeset/initial-phase-1.md` (minor bumps
      for `letratag-core` + `letratag-web`).
- [ ] `HARDWARE.md` `Untested` → `partial` — gated on hardware
      reports landing.

## Final verification

`pnpm typecheck && pnpm test && pnpm build && pnpm lint` all green
across all three packages.

- core: tests pass (devices, media, protocol, status; counts grow
  with the wire-format reconciliation below).
- web: tests pass (FakeTransport-driven adapter parity +
  advertising-data status path).
- debug: 1 jsdom render test passes.
- debug `dist/` builds, ready for Pages.

---

## Phase 1.5 — Wire-format reconciliation (2026-05-05)

A round of on-the-wire observation against an LT-200B revealed that
the upstream encoders ysfchn and alexhorn each got several
wire-format details wrong. The encoder, status parser, debug
harness, and protocol doc were rewritten to match the actual byte
stream. Authoritative spec:
[`docs/protocol/letratag-bt.md`](docs/protocol/letratag-bt.md);
sources and legal posture:
[`INTEROPERABILITY.md`](INTEROPERABILITY.md).

Concrete code changes:

- `BODY_CHUNK = 500` (was 499).
- `PRINT_DATA` byte 2 = `0x81` (was `0x01`).
- Bit packing: MSB-first per byte, then per-rasterline byte
  reversal. **No `y + 1` skip.** Pixel `(0,0) → 00 00 00 80`.
- `NUMBER_OF_COPIES` directive added (`0x23`); always emitted
  between `START` and `PRINT_DATA`.
- `CUT` directive added (`0x70`); `0x30` for cut-at-end / single
  copy, `0x31` to suppress (multi-copy intermediate).
- Print job order rewritten to
  `START → COPIES → PRINT_DATA → CUT → STATUS → END`.
- `MEDIA_TYPE` directive is 6 bytes
  (`[1B 4D id 00 00 00]`) — three trailing zero pad bytes are part
  of the wire format.
- `chunkIndexQuirk` (skip 27) is now permanent — promoted from a
  debug toggle to wire-format constant.
- `parseAdvertisingStatus()` added in `status.ts` — decodes
  `cassetteId`, `busyLocked`, `batteryLevel`, `charging`, and four
  error flags from the BLE manufacturer-data payload.
- `LetraTagPrintOptions` gained `autoCut?: boolean`.
  `LetraTagPrinter.setAdvertisingStatus()` lets the discovery
  layer push the latest broadcast snapshot into the adapter.
- Debug harness: dropped the now-pointless `axisOrder` and
  `bitPacking` toggles; added an advertising-data status panel.

DECISIONS.md updates:

- **D3** rewritten — encoder follows the observed wire format, not ysfchn's encoder.
- **D5** added — media detection IS available via advertising data.
- **D6** added — post-print status enum 1–7 carried from ysfchn,
  flagged as unconfirmed by direct observation pending hardware
  reports.

---

## Implementation decisions / divergences

These are choices made by Claude during build-out where the plan was
ambiguous or where a small course-correction happened. Each entry
explains the WHY so a human reviewer can flip it.

### Workspace package versions

`@thermal-label/contracts` `^0.5.0`, `@thermal-label/transport`
`^0.5.0`, `@mbtech-nl/bitmap` `^1.3.0` — matched against versions
labelmanager-core depends on, so the toolchain installs cleanly from
the same npm registry state.

### Changeset config inferred

`labelmanager/.changeset/` has no `config.json` (defaults), only a
`README.md`. We follow the same shape — provide a default
`config.json` so we don't depend on changesets's implicit defaults.

### `headDots: 30` in registry; protocol frame size in code

Per PLAN-1 §2.2 we record the printable count (30) under the
contracts-standard `headDots` field. PLAN-1 also called for a
`protocolHeadFrame: 32` driver-extension on the engine, but
`@thermal-label/contracts`' `PrintEngine` shape rejects extra
keys (typecheck failure on the generated `as const satisfies
DeviceRegistry`). We instead pinned the 32-row protocol frame
size as the `PROTOCOL_HEAD_FRAME` constant in
`packages/core/src/protocol.ts`. The wire-format frame is invariant
across every LT cassette, so this is functionally equivalent and
keeps the contracts-shape clean. Logged here for the human
reviewer in case Phase 2 wants to upstream a `PrintEngine`
extension into contracts instead.

### Engine `mediaCompatibility: ['letratag']`

Tier tag, not list of device keys — labelmanager precedent. Every LT
cassette runs on the same engine.

### `encodeBitmap` y+1 skip — ysfchn `Canvas` semantics

User pixel `(x_feed, y_head)` with `y_head` in `[0, 29]` maps to
protocol `y' = y_head + 1` so bit 7 of byte 3 stays clear. This is
encoder-side ("skip first row" baked into the encoder), not a
firmware behaviour. See `printer.py` `Canvas.set_pixel` referenced in
the encoder source comments.

### `chunkIndexQuirk` default true (ysfchn)

Skip index 27 — but realistic labels never reach 27 chunks
(13.5 KiB body), so this is dormant on every label the friend will
print. Test pins both branches.

### Public `LetraTagPrintOptions.encoding` etc. dropped

Per PLAN-1 §2.3 these are internal-only. The debug app reaches them
via the `./debug` subpath; ordinary consumers can't.

### Web peer dep on `@thermal-label/transport`

Plan §3 calls for `peerDeps on letratag-core and
@thermal-label/transport`. Implemented as `peerDependencies` and
`devDependencies` so workspace install works without forcing
consumers to install both.

### Debug app — Vite `base: '/letratag/'`

Pinned to `/letratag/` per PLAN-1 §4.4 ("decide the canonical name
before first deploy"). The repo will be `github.com/thermal-label/letratag`,
so Pages serves at `https://thermal-label.github.io/letratag/`.

### Encoder axis indexing

ysfchn uses `byte_index = 3 - floor(y / 8)`, `bit_index = 7 - (y % 8)`
where `y` is already shifted by `+1` from user coordinates. The test
pins `(0,0) → 00 00 00 40` matches this: user `y=0` → `y'=1` → byte
3 bit 6 set.

### `density` / `engine` silently ignored

`density` and `engine` from base `PrintOptions` are silently ignored
per PLAN.md §2.4 ("density / engine accepted from base, ignored").

### Body chunking — 499-byte windows, 500-byte writes

PLAN.md §2.5 phrased this as "body sliced into 500-byte windows"
but PLAN's narrative also says each write is ≤500 bytes total with
the chunk-index byte prepended. We resolved by taking the BLE-MTU-
honoring read: body is sliced into 499-byte windows and the index
byte is prepended, yielding 500-byte writes (501 on the final
chunk after MAGIC). `BODY_CHUNK = 499` is the encoder constant.
The protocol-MTU on the registry stays 500 (the registry comment
explicitly notes that 500 is the protocol chunk size, not the BLE
link MTU).

### `noUncheckedIndexedAccess` ergonomics

Forced a few `?? 0` and `!` annotations through the codebase. The
shared `@mbtech-nl/tsconfig/base` flips the flag on, which the
labelmanager-core sources (where data is fully populated) avoid by
shape; the generic encoder code here had to add explicit guards.

### Lint / autofix details

`pnpm lint --fix` + a few manual edits resolved
`@typescript-eslint/no-unnecessary-condition`,
`@typescript-eslint/require-await` (made `createPreview` /
`getStatus` return a `Promise.resolve(...)` directly since neither
needs to await), and `unicorn/prefer-at` warnings. Fake transport
in tests dropped `async` for the same reason.

### Debug app jsdom canvas stub

`HTMLCanvasElement.prototype.getContext` is unimplemented in jsdom;
the render test's setupFile stubs it to return `null` so the
component's null-check branch fires cleanly without the noisy
"not implemented" warning hitting stderr.

### Vue/Vite stack pinned at the latest 3.x / 5.x

`vue ^3.5`, `vite ^5.4`, `@vitejs/plugin-vue ^5.0`, `vue-tsc ^2.1`,
`@vue/test-utils ^2.4`. Newer majors exist but Vite 5 is what the
labelmanager docs site uses today, so we stay consistent.

### Deployment URL

Pages must be set to "Source: GitHub Actions" in repo Settings → Pages.
Documented in README under "Deploying the debug page".
