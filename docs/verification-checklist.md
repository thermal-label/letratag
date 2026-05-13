# Verification checklist — DYMO LetraTag

Hardware verification runs through the harness app. It pairs the
printer over BLE, prints a diagnostic, captures the advertising-data
snapshot + RX-notification result code, and submits a hardware
report issue — no manual transcription, no scattered captures.

## Browser harness

> **Coming soon.** The hosted `letratag` harness is scaffolded but
> not yet deployed. Once shipped it will live at
> <https://thermal-label.github.io/harness/letratag/>. Until then,
> use the in-repo debug app (below).

## In-repo debug app

The repo ships its own Vue/Vite debug harness at
[`packages/debug/`](https://github.com/thermal-label/letratag/tree/main/packages/debug):

```bash
git clone https://github.com/thermal-label/letratag
cd letratag
pnpm install
pnpm --filter @thermal-label/letratag-debug dev
```

The app pairs over Web Bluetooth, dumps the observed full UUIDs,
runs the standard diagnostic prints, and surfaces the
advertising-data status + RX notification side-by-side. The output
is suitable for pasting into a verification issue.

## Fallback

Hand-rolled report? Open the
[hardware verification issue template](https://github.com/thermal-label/letratag/issues/new?template=hardware_verification.yml)
directly.

## Driver-specific notes for the verifier

- **Advertised name varies.** Current firmware revisions advertise
  as `Letratag <12-hex-MAC-suffix>`; older units may still advertise
  `DYMO LT-200B`. If your unit doesn't show up in the picker, flag
  the observed name in the report — the driver filters by the
  current prefix plus the canonical service UUID.
- **Lid + battery prerequisites.** The printer silently no-ops jobs
  if the lid is open or batteries are low. Verify the lid latches
  fully and the battery indicator on the chassis shows green before
  attributing a failed print to the driver.
- **Tiny-print alternation.** If you're testing with very short
  content (single character / icon), the firmware can silently
  reject every other job. The encoder appends 6 mm of trailing feed
  by default to clear it. If you see strict every-other-print
  failures with `forcedTrailingFeedMm: 0`, that's the documented
  quirk, not a new defect — see the
  [Trailing feed section](./protocol/letratag-bt#trailing-feed).
