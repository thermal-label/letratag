# Phase 1 — Minimum viable LetraTag stack

> Goal: ship the smallest thing that lets a remote tester print to a real
> LT-200B and send back a debuggable trace. Three packages — `core`,
> `web`, `debug` — and a GitHub Pages deployment of `debug`. No docs
> site, no replay CLI, no alexhorn fallback, no hardware matrix
> bookkeeping. Those live in [PLAN-2.md](PLAN-2.md).
>
> Supersedes [PLAN.md](PLAN.md) §§Step 0–4 partially. Read PLAN.md for
> the protocol-conflict catalogue (C1–C6); this file picks one path
> through it (ysfchn) and defers everything else.

## Sources of truth (Phase 1 only consults ysfchn)

- `ysfchn/dymo-bluetooth/dymo_bluetooth/printer.py` — the wire-format
  reference. Cite specific line ranges in commits where bytes are
  copied verbatim.
- `alexhorn/lt200b` — read for context, but do **not** implement the
  alexhorn encoding path or chunk-index variant in Phase 1. That work
  is gated on Phase 1 verification revealing ysfchn is wrong.

The protocol conflicts C1–C6 in PLAN.md are real. Phase 1 picks ysfchn
unconditionally and gathers evidence via the debug harness; Phase 2
acts on that evidence.

## Naming & layout (unchanged from PLAN.md)

- Repo: `~/thermal-label/letratag/`. Org repo:
  `github.com/thermal-label/letratag`.
- npm: `@thermal-label/letratag-core`, `@thermal-label/letratag-web`.
- Family: `'letratag'`. Protocol tag: `'letratag-bt'`. Device key:
  `LT_200B`.
- Workspace adds a third package: `@thermal-label/letratag-debug` —
  **not published**, deployed to GitHub Pages.

## Step 0 — Tracking

- [ ] Read PLAN-1 end-to-end and accept it.
- [ ] Convert this file's checkboxes into the project's tracker (or
      tick them in-place).

## Step 1 — Repo scaffold (lean)

Mirror labelmanager's root layout, but skip what only matters for the
docs site or release polish.

- [ ] `LICENSE` (MIT, current year, Mannes Brak).
- [ ] `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`,
      `eslint.config.js`, `.prettierignore`, `.gitignore`,
      `.gitattributes`, `.changeset/config.json` — copy from
      labelmanager.
- [ ] `pnpm-workspace.yaml` includes `packages/*`.
- [ ] `.github/workflows/ci.yml` — typecheck + lint + test on push.
- [ ] `.github/workflows/pages.yml` — build `packages/debug` and
      deploy to GitHub Pages via the official Actions flow
      (`actions/upload-pages-artifact` + `actions/deploy-pages`) on
      push to `main`. No `gh-pages` branch. (Step 4 details.)
- [ ] `README.md` — three sentences: what the LT-200B is, what's
      shipped (core/web/debug), link to the deployed debug page.
- [ ] `HARDWARE.md` — single row, `LT_200B`, status `Untested`.
- [ ] `DECISIONS.md` — only the decisions that are actually settled
      in Phase 1:
  - **D1** BLE-only device; Phase 1 is web-only; Node deferred.
  - **D2** Chunked framing lives in core; transport stays neutral.
  - **D3** Encoder uses ysfchn conventions. alexhorn deferred to
        Phase 2 pending hardware evidence.
  - **D4** GATT discovery uses UUID-prefix matching (`be3dd650-`).

**Defer**: `.github/FUNDING.yml`, the hardware-verification issue
template, `release.yml`, `docs.yml`, `scripts/` directory,
`docs/api/.gitkeep`, `plans/`. Phase 2 picks these up.

**Gate:** `pnpm install` clean; `pnpm typecheck` `pnpm lint`
`pnpm test` `pnpm build` pass on an empty workspace.

## Step 2 — `@thermal-label/letratag-core` (single-encoder)

Pure TypeScript, runs in browser and Node, no transport coupling.

### 2.1 Package metadata

- [ ] `packages/core/package.json` — copy labelmanager-core, rename.
      Keywords: `dymo`, `letratag`, `bluetooth`, `ble`,
      `label-printer`, `thermal-label`.
- [ ] Dependencies: `@mbtech-nl/bitmap`, `@thermal-label/contracts`.

### 2.2 Device registry — ship the compile-script fork

The labelmanager precedent uses one JSON5 file per device under
`data/devices/` plus a compile script that emits `*.generated.ts`.
Mirror it even though we have one device, so Phase 2 doesn't have to
retrofit.

- [ ] `packages/core/data/devices/LT_200B.json5` — per PLAN.md §2.2.
      Notable: `headDots: 30` (physical printable rows), and a
      driver-extension `protocolHeadFrame: 32` for the wire-format
      value. **This deviates from PLAN.md** which used `headDots: 32`
      with a comment — keeping the contracts field semantically
      "dots that print" avoids confusing cross-driver tooling.
- [ ] `scripts/compile-data.mjs` — fork from labelmanager. Constants
      and validation per PLAN.md §2.2.1 (drop USB, add
      `bluetooth-gatt`, validate media shape, etc.).
- [ ] `data/media.json5` — all ten entries from PLAN.md's catalogue
      table. Contracts-base + driver-extension fields per §2.3 of
      PLAN.md.

### 2.3 Types (`src/types.ts`)

Per PLAN.md §2.4, with these Phase-1 simplifications:

- [ ] `LetraTagPrintOptions extends PrintOptions`:
  - `rotate?: 'auto' | 0 | 90 | 180 | 270`.
  - **No** `encoding` field (single encoder).
  - **No** `chunkIndexQuirk` field (ysfchn behavior is hard-coded).
  - **No** `emitMediaType` field on the public type (see 2.5).
  - `density` / `engine` accepted from base, ignored.
- [ ] An **internal** `__DebugEncoderOverrides` type (not re-exported
      from `index.ts`) carries the experimental knobs the debug app
      needs:
  - `axisOrder?: 'ysfchn' | 'alexhorn'` — defaults to ysfchn.
  - `bitPacking?: 'ysfchn' | 'alexhorn'` — defaults to ysfchn.
  - `chunkIndexQuirk?: boolean` — defaults to true.
  - `mediaTypeByte?: number` — defaults to undefined (omit directive).

  These exist as **runtime** branches inside the encoder so the debug
  app can A/B them without us shipping a public API. Phase 2 either
  removes them or promotes them, depending on what the friend's
  tests reveal.

### 2.4 Protocol encoder (`src/protocol.ts`)

Implement ysfchn's path. Cite line numbers from `printer.py` in
comments where bytes are copied.

- [ ] **Directives** per PLAN.md §2.5: `START`, `MEDIA_TYPE` (defined,
      not invoked), `PRINT_DATA`, `FORM_FEED`, `STATUS`, `END`.
- [ ] **`encodeBitmap(bitmap)`** — ysfchn column-major packing with
      the `y+1` skip. Single function; the alexhorn alternate is a
      tiny branch behind `__DebugEncoderOverrides.bitPacking ===
      'alexhorn'`.
- [ ] **Header / checksum** — 9 bytes, last byte = sum of preceding 8
      mod 256. Use `MAGIC = [0x12, 0x34]`.
- [ ] **`buildPrintPayload`**, **`chunkPayload`** — per PLAN.md §2.5.
- [ ] **`encodeLabel(bitmap, options)`** — full write list.

### 2.4.1 What the tests pin (and don't)

Per the review of PLAN.md: **do not** pin specific output byte
vectors as canonical regression tests before hardware confirms them.
Instead:

- [ ] **Structural tests** — directive byte sequences for `START`,
      `END`, `FORM_FEED`, `STATUS`, `PRINT_DATA` opcode + dimension
      fields. These are documented in both upstream sources and
      uncontested.
- [ ] **Round-trip tests** — `chunkPayload` outputs reassemble
      losslessly to the input payload (modulo headers + magic).
- [ ] **Length tests** — `encodeLabel` total byte count =
      `9 + ceil(body / 500) * 500 + 2` for predictable inputs.
- [ ] **Checksum test** — pin against ysfchn's `_calculate_checksum`
      computed offline for one fixed payload length. This is
      arithmetic, not a wire-format guess.
- [ ] **Bit-packing test** — assert "single pixel at origin →
      `00 00 00 40`" but mark it `it('matches ysfchn upstream', …)`
      not `it('produces correct bytes')`. The framing matters: when
      the friend reports the print is wrong, we know the test
      passing means we matched ysfchn, not that we matched reality.

Drop PLAN.md's `it.todo` for the README's `00 00 00 80` — Phase 1
trusts ysfchn's code, not its README, and the harness will produce
the data to settle it.

### 2.5 Status parser (`src/status.ts`)

Per PLAN.md §2.6 verbatim. Map codes 0–7, alias 1↔0 and 5↔2,
`mediaLoaded: true` always, `detectedMedia: undefined`.

### 2.6 Preview (`src/preview.ts`)

Per PLAN.md §2.7. Single-plane, single-ink, colours from selected
media's `text` / `background`. The debug app needs this to render
"what will print" before sending bytes.

### 2.7 Public API (`src/index.ts`)

Per PLAN.md §2.5.1 — `DEVICES`, `MEDIA`, `MEDIA_LIST`,
`DEFAULT_MEDIA`, `LT_PAPER_WHITE`, `findMediaBySku`, encoder +
status + preview functions, types. Plus an internal `__debug`
subpath export (`./debug`) that exposes the encoder with
`__DebugEncoderOverrides` accepted, used only by the debug package.

**Gate:** typecheck, lint, test, build green.

## Step 3 — `@thermal-label/letratag-web`

- [ ] `packages/web/package.json` — peerDeps on `letratag-core` and
      `@thermal-label/transport`.
- [ ] `src/discovery.ts` — `requestPrinter(options?)` per PLAN.md
      §Step 3. Match service by `be3dd650-` prefix; derive TX
      (`be3dd651-`), RX (`be3dd652-`), aux (`be3dd653-`) UUIDs.
- [ ] `src/printer.ts` — `LetraTagPrinter implements PrinterAdapter`
      per PLAN.md §Step 3. `print` / `createPreview` / `getStatus` /
      `close`; no `onStatus`.
- [ ] `src/index.ts` — re-export the surface.
- [ ] Tests with a fake `Transport` confirm the byte stream from
      `print()` matches `encodeLabel()` exactly.

**Gate:** typecheck, lint, test, build green.

## Step 4 — `@thermal-label/letratag-debug` (deployable GH Pages app)

The load-bearing piece for Phase 1. Lives in **this repo**, not in
the docs site repo. Vite + Vue, deploys to GitHub Pages from
`main`.

### 4.1 Package shape

- [ ] `packages/debug/package.json` — `private: true` (never
      published), workspace deps on `letratag-core` and
      `letratag-web`.
- [ ] Vite config with `base: '/letratag/'` (or whatever the gh-pages
      project path turns out to be).
- [ ] Single-page Vue app. No router needed.

### 4.2 The page

One Vue component, top to bottom:

- [ ] **Header** — title, one-paragraph "what is this", link to the
      GitHub issue tracker.
- [ ] **Connection panel** — "Connect via Web Bluetooth" button.
      Once connected: device name, observed full service UUID,
      derived TX/RX/aux UUIDs, link MTU (best-effort), user-agent
      string. All exported in the diagnostics JSON.
- [ ] **Test pattern selector** — radio group:
  - **T1** Single pixel at `(0,0)` (C2 — bit packing).
  - **T2** Asymmetric rectangle 32×16 (C1 — axis order).
  - **T3** Stripes across head, alternating rows (C3 — printable
    region).
  - **T4** Status capture — paired buttons, identical label, three
    scenarios (normal / cassette removed / low battery). Compares
    captured RX bytes (C6).
  - **T5** UUID variance — passive; recorded automatically.
  - **CUSTOM** — text input + tape preview, mirrors the casual
    "type and print" demos other drivers ship.
- [ ] **Encoder controls** — collapsible details block, defaults all
      ysfchn:
  - `axisOrder` radio.
  - `bitPacking` radio.
  - `chunkIndexQuirk` checkbox.
  - `emitMediaType` checkbox + numeric byte input.

  All wired to `__DebugEncoderOverrides`. Hidden by default; the
  friend only opens this if a print comes out wrong and we ask them
  to A/B.
- [ ] **Bitmap preview** — `BitmapPreview`-equivalent showing what
      will print, aspect-corrected for 30 printable rows.
- [ ] **Print button** + status panel.
- [ ] **Trace log** — scrolling list of TX/RX events: timestamp,
      direction, byte length, hex dump (truncated past 64 bytes),
      decoded `PrinterStatus` for RX. Auto-scroll with pause.
- [ ] **Diagnostics export** — buttons for "Copy JSON",
      "Download .json", "Download photos as .zip". Photo upload via
      `<input type="file" multiple>`; bundled into the export.

### 4.3 Diagnostics JSON schema

Per PLAN.md §4.4. Phase 1 ships **schemaVersion 1** — keep it
stable. The replay CLI in Phase 2 reads this exact shape.

Minor change from PLAN.md: rename `encoder.encoding` →
`encoder.axisOrder` + `encoder.bitPacking` (two separate fields)
since C1 and C2 are independent variables and a tester might want
to mix them.

### 4.4 Deployment

GitHub Pages via the Actions deployment flow — **no `gh-pages`
branch**. The build artifact is uploaded directly from the workflow
run and `actions/deploy-pages` publishes it. Pages must be set to
"Source: GitHub Actions" in repo settings (one-time manual step).

- [ ] `.github/workflows/pages.yml`:
  - Trigger: `push` to `main` (paths-filtered to `packages/core/**`,
    `packages/web/**`, `packages/debug/**`, and the workflow file
    itself) **plus** `workflow_dispatch` for manual redeploys.
  - Permissions block: `pages: write`, `id-token: write`,
    `contents: read`.
  - Concurrency group `pages` with `cancel-in-progress: false`
    (don't cancel an in-flight deploy if a second push lands).
  - Two jobs:
    1. **build** — checkout, setup pnpm + Node, `pnpm install
       --frozen-lockfile`, `pnpm --filter @thermal-label/letratag-debug
       build`, then `actions/configure-pages@v5` and
       `actions/upload-pages-artifact@v3` with `path:
       packages/debug/dist`.
    2. **deploy** — `needs: build`, `environment: github-pages`,
       runs `actions/deploy-pages@v4`. Outputs the deployed URL
       (`steps.deployment.outputs.page_url`) to the run summary.
- [ ] Vite `base` matches the project-pages path
      (`/<repo-name>/`). Decide the canonical name before first
      deploy (`letratag` is the obvious pick); pin it in
      `vite.config.ts` so the workflow doesn't need to inject it.
- [ ] One-time repo settings: Settings → Pages → "Build and
      deployment" → Source: **GitHub Actions**. Document the click
      path in `README.md` under a "Deploying the debug page"
      section so a future contributor doesn't have to rediscover
      it.
- [ ] Verify the deployed URL pairs against a real LT-200B from a
      Chrome browser before announcing it. The friend gets a
      stable URL of the shape
      `https://thermal-label.github.io/letratag/`.

### 4.5 What's deferred to Phase 2

- **T6** (long-payload chunk-index quirk) — unreachable on realistic
  labels; not implemented in the harness.
- **T7** (substrate sweep) — easy to add but no Phase-1 value
  beyond CUSTOM mode; defer.
- The maintainer-side `replay-trace.mjs` CLI — Phase 2.
- The `hardware_verification.md` issue template — Phase 2.

**Gate:** typecheck + lint pass; the page renders in a Vitest jsdom
test with a stubbed `Bluetooth` API; `pnpm --filter
@thermal-label/letratag-debug build` produces a deployable
`dist/`.

## Step 5 — Friend tests + first feedback loop

- [ ] Send the friend the deployed page URL and a checklist:
      "T1, T2, T3, T4-normal, T4-no-cassette, CUSTOM (any short
      label of your choosing). Click Copy JSON after each, paste
      into a GitHub issue. Photo of each printed label."
- [ ] Open one tracking issue per test (or one issue with seven
      checkboxes — friend's preference).
- [ ] When reports land, eyeball the diagnostics JSON manually.
      Reading by hand is fine for the first three reports; the
      replay CLI lands in Phase 2 once a pattern emerges.

If T1/T2/T3 print correctly with ysfchn defaults, Phase 1 is done
and Phase 2 starts. If they don't, iterate the encoder
(`__DebugEncoderOverrides` makes A/B easy) and re-deploy.

## Step 6 — Phase-1 release

- [ ] Changesets release: `letratag-core` + `letratag-web` `0.1.0`.
      `letratag-debug` stays unpublished.
- [ ] `HARDWARE.md` updates from `Untested` → `partial` once T1+T2+T3
      pass.

---

## Out of scope (→ PLAN-2)

- Docs site integration (`thermal-label.github.io/letratag/`).
- alexhorn encoder cleanup or removal.
- `replay-trace.mjs` CLI.
- Hardware-verification issue template.
- T6 long-payload test, T7 substrate sweep.
- Node BLE transport.
- `MEDIA_TYPE` enum decoding.
- CLI integration tracking.
- Aux characteristic exploration.
