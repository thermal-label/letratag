# Core

`@thermal-label/letratag-core` is the protocol layer for the
LetraTag LT-200B. It contains the wire-format encoder, the status
parsers (RX notification + BLE advertising-data manufacturer
payload), the device registry, the media registry, and the
offline-preview helper. It also re-exports the
`@thermal-label/contracts` base types
(`PrinterAdapter`, `MediaDescriptor`, `PrinterStatus`, `Transport`,
…) for consumer convenience.

You rarely import `*-core` directly — use the web package for
production code. Core is useful when you need the encoder, the
status parsers, or the offline preview without a live BLE
connection (for tests, server-side rendering of previews, or
offline tooling).

::: tip Looking for byte-level details?
The [LetraTag-BT protocol reference](./protocol/letratag-bt)
documents the GATT topology, exact byte sequences for every
directive, the 3-byte advertising-data manufacturer payload, the
9-byte job header, and the chunking quirks.
:::

## Install

```bash
pnpm add @thermal-label/letratag-core
```

## Core API

| Export                                                                | Description                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `DEVICES` / `DEVICE_REGISTRY_DATA`                                    | Device registry (LT-200B entry — service UUID, name prefix, MTU, engine) |
| `MEDIA` / `MEDIA_LIST` / `DEFAULT_MEDIA` / `LT_PAPER_WHITE`           | Media registry and the 12 mm white-paper default                         |
| `findMediaBySku(sku)`                                                 | Media lookup helper                                                      |
| `PROTOCOLS`                                                           | `ReadonlySet<string>` — wire protocols this encoder produces (`letratag-bt`) |
| `STATUS` / `STATUS_REQUEST`                                           | `ESC A` byte sequence — request a job-completion notification            |
| `parseStatus(bytes)`                                                  | Parse the 3-byte RX notification into a `PrinterStatus`                  |
| `parseAdvertisingStatus(bytes)`                                       | Parse the 3-byte advertising-data manufacturer payload                   |
| `advertisingToPrinterStatus(adv)`                                     | Convert an `AdvertisingStatus` to the contracts `PrinterStatus` shape    |
| `START`, `END`, `MAGIC`, `FORM_FEED`, `CUT_AT_END`, `CUT_SUPPRESS`    | Directive byte constants                                                 |
| `buildHeader(payloadLength)`                                          | 9-byte job header (preamble + length + checksum)                         |
| `buildNumberOfCopies(n)` / `buildCut(cmd)` / `buildMediaType(id)`     | Parameterised directive builders                                         |
| `buildPrintData(w, h, image)`                                         | `PRINT_DATA` directive — header + 4-bytes-per-feed-column image          |
| `encodeBitmap(bitmap, crossFeed?)`                                    | Pack a `LabelBitmap` into the column-major head-row stream               |
| `buildPrintPayload(bitmap, options, overrides?)`                      | Assemble `START + COPIES + PRINT_DATA + CUT + STATUS + END`              |
| `chunkPayload(payload, isPrint, { mtu? })`                            | Slice into the ordered list of BLE writes (header + indexed body)        |
| `encodeLabel(bitmap, options, overrides?, context?)`                  | Top-level: produce the full ordered list of TX writes for one job        |
| `encodeSetCassetteType(mediaId)`                                      | Stand-alone `MEDIA_TYPE` payload for the short-command characteristic    |
| `createPreviewOffline(image, media)`                                  | Render `PreviewResult` without a live BLE connection                     |
| `BODY_CHUNK` / `PROTOCOL_HEAD_FRAME` / `PRINTABLE_DOTS`               | Protocol constants (`500`, `32`, `30`)                                   |
| `ADVERTISING_STATUS_LENGTH` / `STATUS_NOTIFICATION_LENGTH`            | Wire lengths (`3`, `3`)                                                  |
| `CASSETTE_WIDTH_MM`                                                   | `cassetteId → mm` map (`1 → 6`, `2 → 9`, `3 → 12`, `4 → 19`, `5 → 24`)   |
| `LetraTagDevice`, `LetraTagMedia`, `LetraTagPrintOptions`             | Driver-specific shapes                                                   |
| `AdvertisingStatus`, `CassetteId`                                     | Status-parser result types                                               |
| `PrinterAdapter`, `MediaDescriptor`, `PrinterStatus`, `Transport`, …  | Re-exported from `@thermal-label/contracts`                              |

## Encoder output shape

`encodeLabel` returns an **ordered list of `Uint8Array`s** rather
than a single contiguous stream — BLE is packet-framed, and the
chunk-index byte lives on each write. The transport layer
(`@thermal-label/transport/web`) calls `writeValueWithoutResponse`
once per entry:

```ts
const writes = encodeLabel(bitmap, { copies: 1 }, undefined, {
  engine: device.engines[0],
  media: LT_PAPER_WHITE,
  mtu: 247, // from registry's `bluetooth-gatt.mtu`
});
// writes[0] is the 9-byte header
// writes[1..n] are body chunks with leading sequence index;
//   final chunk has the `12 34` MAGIC appended
```

`mtu` is **load-bearing for multi-chunk content** — Chrome on Linux
does not auto-fragment writes beyond the negotiated link MTU. Pass
the registry's `bluetooth-gatt.mtu` (`247`) through every call. See
[MTU and chunking](./protocol/letratag-bt#mtu-and-chunking) for the
bench-confirmed failure mode at 500-byte writes.

## Status — two channels

| Source                          | Bytes | Latency       | Connection? |
| ------------------------------- | ----- | ------------- | ----------- |
| RX notification (`printReplyUUID`) | 3   | end-of-job    | required    |
| Advertising-data manufacturer payload | 3 | continuous (~100 ms) | no       |

`parseStatus` decodes the RX notification's result code (`0` =
success, `5` = silent reject, …; full table in the
[protocol reference](./protocol/letratag-bt#rx-notification-per-job-result)).
The encoder collapses the two observed alias codes onto canonical
results: `1 → SUCCESS` (same semantics as `0`) and `5 → FAILED`
(same semantics as `2`). Hosts that need the raw firmware code can
read it from the underlying notification bytes before parsing.

`parseAdvertisingStatus` decodes the broadcast cassette / battery /
error flags — readable on a passive scan with no pairing required.

For cassette-presence checks, **prefer the advertising-data
channel**: it reports `cassetteId` directly (1..5 → 6..24 mm), where
the RX notification's `7 = CASSETTE_MISSING` code is documented but
never observed in practice (see `DECISIONS.md` for the history).

## `MEDIA_TYPE` is not emitted in the print flow

The encoder does **not** include `MEDIA_TYPE` in the normal print
payload — the printer prints correctly without it on every observed
substrate. The `encodeSetCassetteType(mediaId)` helper produces a
stand-alone `HEADER + START + MEDIA_TYPE + END` payload (23 bytes,
no chunking) that hosts can write to the short-command characteristic
to record the loaded cassette in the printer's session state outside
a print job.

## Trailing feed

The encoder appends `engine.forcedTrailingFeedMm` of zero-padded feed
columns after the bitmap and before the `CUT` directive. The current
value is **6 mm** (≈ 47 zero feed columns at 200 dpi) — the first
tested width that cleared the firmware's
[tiny-print alternation quirk](./protocol/letratag-bt#tiny-print-alternation-quirk).
Sweeping lower values is open work; there is no per-job override
today.
