# Phase 2 — Verification, docs, and follow-up rounds

> Continues after [PLAN-1.md](PLAN-1.md) ships. Phase 1 produced a
> running core + web + GitHub Pages debug harness; the friend has
> printed at least T1/T2/T3 and reported diagnostics JSON. Phase 2
> consumes that evidence, polishes the rough edges, and integrates
> with the wider ecosystem.

## Inputs from Phase 1

Before starting Phase 2, you should have on hand:

- One or more diagnostics JSON exports from the friend.
- Photos of the printed labels (T1 single-pixel position, T2
  rectangle orientation, T3 stripe pattern, T4 status captures).
- A clear answer (or a clear "still ambiguous") for each of:
  - **C1 axis order** — does ysfchn's `[feed, 32]` print correctly,
    or does alexhorn's `[32, feed]`?
  - **C2 bit packing** — does the single pixel land where ysfchn's
    code says it should?
  - **C3 printable region** — how many of the 32 head rows actually
    print, and which?
  - **C6 status code 7** — did "no cassette" ever fire?

If any of those is still ambiguous, loop back to PLAN-1 §Step 5
before continuing.

## Step 1 — Act on the verification evidence

### 1.1 Encoder cleanup

- [ ] If ysfchn's defaults printed correctly: **delete** the
      `__DebugEncoderOverrides.axisOrder` and `bitPacking` branches.
      The encoder becomes single-path. The debug app's encoder
      controls collapse to a "view only" panel.
- [ ] If alexhorn's variant printed correctly: swap the encoder
      defaults, delete the ysfchn branch, same cleanup.
- [ ] If neither printed correctly: extend
      `__DebugEncoderOverrides` with whatever new dimensions the
      reports surfaced (e.g. inverted bit endianness, different
      `y+1` skew). Iterate until something prints, **then** clean
      up.

### 1.2 Pin the byte-vector tests

Now that hardware has voted, the byte-level test vectors PLAN.md §2.8
listed (`00 00 00 40` etc.) become real regression tests, not
documentation of guesses. Rename them from "matches ysfchn upstream"
to "produces correct bytes".

### 1.3 Update settled decisions

- [ ] Move D3 in `DECISIONS.md` from "ysfchn pending verification"
      to "ysfchn (or alexhorn — whichever won) — verified by
      `support.reports[<id>]`".
- [ ] Add **D5** — `MEDIA_TYPE` not emitted in any release until
      C5 is decoded.
- [ ] Add **D6** — status code 7 surfaces as warning, never blocks.
      Reference the actual report that confirmed it (if any did).

### 1.4 `printableDots` correction

If T3 revealed the actual printable region differs from 30, update
`packages/core/data/devices/LT_200B.json5` (`headDots`) and every
media entry's `printableDots`. Bump core minor version.

## Step 2 — Maintainer-side replay tooling

Phase 1 read diagnostics JSON by hand. Past three reports it stops
scaling.

- [ ] `scripts/replay-trace.mjs` per PLAN.md §4.6 — accepts a
      diagnostics JSON, decodes `bitmapBase64`, calls
      `encodeLabel(bitmap, options)` with the report's encoder
      settings, diffs the result against `trace[].hex` (TX-only).
- [ ] Wire it as `pnpm replay <file.json>` from the repo root.
- [ ] Add a `--all` flag that scans a `reports/` directory and
      summarises pass/fail across all archived diagnostics.
- [ ] Save replay output alongside each report under
      `support.reports[].notes`.

## Step 3 — Hardware-verification template + tests T6/T7

- [ ] `.github/ISSUE_TEMPLATE/hardware_verification.md` per PLAN.md
      §Step 1 — BLE-specific fields (peripheral name, observed full
      service UUID, OS/browser, cassette SKU printed). Required
      attachments: diagnostics JSON, photos, cassette SKU.
- [ ] Add **T6** to the debug harness — long payload (~14 KiB),
      with an inline toggle for `chunkIndexQuirk`. Document that
      this test only matters once labels routinely exceed 13.5 KiB.
- [ ] Add **T7** to the debug harness — same payload, run across at
      least three cassette substrates. Tester tags each export with
      the SKU.
- [ ] Friend runs T6/T7. Decisions:
  - C4: if both `chunkIndexQuirk` values print, prefer sequential
    (alexhorn) and remove the quirk.
  - C5: if T7 exposes any substrate-specific behavior, this is
    where the `MEDIA_TYPE` byte hunt starts. Otherwise confirm the
    encoder is media-agnostic and move on.

## Step 4 — Docs site integration (`thermal-label.github.io`)

PLAN.md §Step 7 verbatim, with one revision: the debug page
**stays** at the Phase-1 GH Pages URL on this repo. The docs site
links to it rather than rebuilding it.

- [ ] Add `letratag` to the docs site's `pull-driver-docs` config so
      `thermal-label.github.io/letratag/` builds.
- [ ] `hardware/letratag/lt-200b.md` — image, BLE UUIDs, MTU,
      status code table, known quirks (cassette-detection myth),
      verification status (now non-empty thanks to Step 1).
- [ ] `letratag/protocol.md` — link both upstream sources, byte-
      level tables, document **resolved** conflicts C1–C6 with the
      direction hardware picked.
- [ ] `letratag/media.md` — full LT cassette catalogue with images,
      lengths, SKUs (US + EU). Cross-link to the cross-driver media
      table.
- [ ] Getting-started + web pages from the labelmanager template.
- [ ] Sidebar link from the docs site to the GH Pages debug
      harness. The harness is the long-lived debugging surface for
      any future LT-family work.

## Step 5 — `findDevice` and multi-device futures

Phase 1 has a single device, accessed as `DEVICES.LT_200B`. If a
second LT-family model ever ships:

- [ ] Decide on a lookup signature: by service UUID prefix? by
      `namePrefix`? Add to contracts' `OpenOptions` if the answer
      generalises across drivers. Defer until there's a real second
      device to design against.

## Step 6 — Tracking issues for future rounds

- [ ] Open `thermal-label/cli` issue: "LetraTag CLI integration
      depends on Node BLE transport (Phase 3)."
- [ ] Open `thermal-label/transport` issue: "Decide Node BLE
      transport approach — `webbluetooth` polyfill,
      `node-ble`/D-Bus (Linux-only), or CLI-helper shelling out to
      `bluetoothctl` + `gatttool`. Not adopting `noble`."
- [ ] Open issue on this repo: "Decode `MEDIA_TYPE` enum byte
      values (C5)" — depends on a BLE sniff while changing
      cassettes.
- [ ] Open issue on this repo: "Explore aux characteristic
      `be3dd653`" — may carry battery / firmware / serial.

These are **issues**, not work for Phase 2. They land on whatever
schedule makes sense.

## Step 7 — Release

- [ ] Changesets release: `letratag-core` + `letratag-web` minor or
      major bump depending on whether Step 1 changed the public
      type surface.
- [ ] `HARDWARE.md` row → `verified` once T1–T5 (and T6/T7 if run)
      all resolve.
- [ ] Note on the org-level coverage tracker: LT-200B web-verified;
      Node round still pending.

---

## Future rounds (not in scope, even for Phase 2)

These are flagged here so they don't get re-discovered as new ideas
in Phase 3.

- **Node BLE transport**. Separate plan.
- **`thermal-label-cli` integration**. Depends on Node round.
- **Further wire-format observation** for `MEDIA_TYPE` and any
  other protocol gaps.
- **Multi-label session batching** — whether one BLE session can
  carry multiple jobs, or each needs a fresh connection.
- **Index byte wraparound at chunk 256** — purely theoretical until
  a label hits 128 KiB.
- **Tape-colour-as-wire-detail** — confirm via BLE sniff whether
  substrate is purely UI metadata.

## Open questions still deferred

- Standalone `getStatus()` outside a print job (PLAN.md §C7
  effectively).
- Full UUID variance across LT-200B units (Phase-1 T5 only
  addresses this if a second unit becomes available).
