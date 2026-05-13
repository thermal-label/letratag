# Hardware

This driver targets a single device today: the **DYMO LetraTag
LT-200B**, a handheld BLE label printer that prints on 12 mm DYMO
LT label cassettes ("LetraTag" tape family). The wire protocol —
[`letratag-bt`](./protocol/letratag-bt) — reserves enum slots for
6 / 9 / 19 / 24 mm tape widths used by sibling LetraTag-family
chassis, but the LT-200B chassis only accepts 12 mm cassettes.

The canonical per-device matrix lives on the org-wide hardware page:
[thermal-label.github.io/hardware/](https://thermal-label.github.io/hardware/).
It's generated from each driver's `data/devices/*.json5` source of
truth — for this driver, those entries live under
[`packages/core/data/devices/`](https://github.com/thermal-label/letratag/tree/main/packages/core/data/devices).
Got an untested device? Run the
[verification harness](./verification-checklist) — it pairs the
printer, runs diagnostic prints, and submits a hardware report
against the device registry.

## Supported devices

<!-- HARDWARE_TABLE:START -->
**1 devices** — 0 verified · 0 partial · 0 broken · 1 untested

| Model | Key | USB PID | Transports | Status |
| --- | --- | --- | --- | --- |
| [LetraTag LT-200B](https://thermal-label.github.io/hardware/letratag/lt-200b) | `LT_200B` | — | BT LE | ⏳ untested |

Click any model to open its detail page on the docs site, where engines, supported media, and verification reports live. The same data backs the [interactive cross-driver table](https://thermal-label.github.io/hardware/).
<!-- HARDWARE_TABLE:END -->

## Transport

LT-200B is **BLE GATT only** — there is no USB, no serial, no TCP
fallback. Pairing happens via Web Bluetooth in the browser; there
is no Node.js package today (the future Node path will not use
`noble`; candidates are `webbluetooth`, `node-ble`, or shelling out
to `bluetoothctl`).

| Role                       | UUID prefix      | Properties             |
| -------------------------- | ---------------- | ---------------------- |
| Primary service            | `be3dd650-…`     | —                      |
| TX (`printRequestUUID`)    | `be3dd651-…`     | write-without-response |
| RX (`printReplyUUID`)      | `be3dd652-…`     | notify                 |
| Short command              | `be3dd653-…`     | write-without-response |

The driver filters by the canonical service UUID and the observed
advertised name prefix (`Letratag `), then derives TX / RX / short-
command UUIDs from the connected service's tail. Full details in
the [protocol reference](./protocol/letratag-bt#ble-topology).

## Cassettes

LT-200B accepts only **12 mm-wide DYMO LT label cassettes**. The
protocol's `cassetteId` enum is broader (1 = 6 mm, 2 = 9 mm,
3 = 12 mm, 4 = 19 mm, 5 = 24 mm), but the chassis broadcasts
`cassetteId = 3` whenever a cassette is loaded and rejects the
others mechanically.

Tape substrates verified on the bench:

- LT label paper, white (DYMO `S0721510` / `S0721530`).

Other LT substrates (clear, metallic, fluorescent) should print
identically — the wire format does not vary by substrate, only the
firmware's heat profile does, and `MEDIA_TYPE` is host-declared.
File a verification report if you bench a non-paper substrate.

## Hardware quirks

- **Lid must be fully closed** and batteries adequately charged for
  the printer to register a print.
- **Tiny-print alternation.** With very short content (~16 feed
  columns) the firmware silently rejects every other job
  (`success → silent reject → success → silent reject`, repeating).
  The encoder appends **6 mm of trailing zero-padded feed** by
  default — `engine.forcedTrailingFeedMm: 6` — which clears the
  alternation by lifting the total feed-column count past the
  threshold. Wider real content (~30+ columns) avoids the quirk
  without any trailing feed. See
  [Trailing feed](./protocol/letratag-bt#trailing-feed) for the
  bench data.
- **Status code 7 (no cassette) is documented but never observed.**
  Prefer the BLE advertising-data `cassetteId` field for cassette
  presence detection, not the RX notification's code-7 path.

## Reporting a device

See the [verification checklist](./verification-checklist) for the
full flow. Once a verification report is merged, the
`support.status` block in
[`packages/core/data/devices/LT_200B.json5`](https://github.com/thermal-label/letratag/blob/main/packages/core/data/devices/LT_200B.json5)
flips to `verified` and the table above updates automatically on
the next docs-site build.
