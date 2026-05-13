# LetraTag BT Protocol

This page documents the wire protocol of the DYMO LetraTag **LT-200B**
(`engine.protocol === 'letratag-bt'`). Unlike its siblings in this org
the LT-200B is **BLE GATT only** — there is no USB, no serial, no TCP
fallback. Print jobs travel as packet-framed payloads over a
write-without-response GATT characteristic; status replies arrive as
notifications on a second characteristic and as continuous broadcasts
in BLE advertising data.

::: info Source
DYMO does not publish a technical reference for the LetraTag BT
protocol. The byte sequences below are anchored on (a) prior public
reverse-engineering work — `ysfchn/dymo-bluetooth` and
`alexhorn/lt200b` — (b) on-the-wire observation between a paired
LT-200B and a host, and (c) interoperability analysis of the
LetraTag Connect Android app limited to the byte sequences it emits
over BLE and consumes from advertising data. See
[`INTEROPERABILITY.md`](https://github.com/thermal-label/letratag/blob/main/INTEROPERABILITY.md)
at the repo root for full sourcing, scope, and legal posture. This page is the
authoritative reference for the driver in this repo; the encoder in
`packages/core/src/protocol.ts` is implemented against it.
:::

::: warning Status of facts — hardware-unverified in places
Treat this page as **a faithful reading of the wire format, not yet
a fully tested specification**. Concrete byte-level claims (header
layout, checksum, opcode table, chunking, advertising-data bit
layout, GATT topology, prefix-matching strategy) are
high-confidence. Three classes of claim deserve explicit caveats:

1. **Bit packing.** The worked examples follow MSB-first per-byte
   packing plus per-rasterline byte reversal. They have not been
   byte-traced on a real print on every supported substrate.
2. **Inferred semantics.** The `CUT` command direction (`0x30` vs
   `0x31`), whether the trailing zero pad on `MEDIA_TYPE` is
   load-bearing vs tolerated, whether the LT-200B chassis prints
   all 32 rows vs clips the edges, and whether `flags = 0xF0` is
   required vs the only observed value — these are best-guess reads.
3. **Status code enum (codes 1–7).** Only `code === 0` has been
   positively observed; values 1–7 in the status table are carried
   over from `ysfchn/dymo-bluetooth`'s `Result.from_bytes` and have
   **not** been confirmed by direct observation. Do not treat them
   as canonical.

The verification harness in `packages/debug` exists to convert each
of these from "very plausible" to "verified" against a real LT-200B.
Promote facts as reports land; this notice comes off when all three
classes are confirmed.
:::

::: tip Related pages

- [Getting started](../getting-started) — install the package and run
  a first print.
- [Source on GitHub](https://github.com/thermal-label/letratag) —
  `packages/core/src/` implements this protocol; `packages/debug` is
  the verification harness referenced below.
  :::

## Models and engines

| Family  | Head dots (protocol frame) | Tape widths supported (cassetteId) |
| ------- | -------------------------: | ---------------------------------- |
| LT-200B |                         32 | 12 mm only on the LT-200B chassis  |

`engine.protocol` is `letratag-bt`. The protocol's `PRINT_DATA` height
field is fixed at **32**. The image is centered within those 32 rows
by padding with zero-rasterlines at the top and bottom — there is no
fixed printable-row count baked into the wire format. Whether all 32
rows physically print is a property of the print head, not the
protocol; LT-200B reliably renders the full 32-row column.

The protocol vocabulary itself supports five tape widths
(see [Cassette IDs](#cassette-ids)); the LT-200B chassis only accepts
12 mm cassettes, but the wire format does not distinguish.

## BLE topology

LT-200B advertises a single primary GATT service. The service UUID
and three characteristics share the same 28-character tail; the host
matches by the **first 8 hex digits** of the service UUID and derives
the characteristic UUIDs from the connected service's tail at runtime.
The values below are the canonical advertised UUIDs:

| Role                        | UUID prefix    | Properties             |
| --------------------------- | -------------- | ---------------------- |
| Primary service             | `be3dd650-…`   | —                      |
| `printRequestUUID`     (TX) | `be3dd651-…`   | write-without-response |
| `printReplyUUID`       (RX) | `be3dd652-…`   | notify                 |
| `printShortCommandUUID`     | `be3dd653-…`   | write-without-response |

The advertised device name is `Letratag <12-hex-MAC-suffix>` —
e.g. `Letratag 10B41D8220FE`. Prior public reverse-engineering work
(ysfchn / alexhorn) recorded the prefix as `DYMO LT-200B`, but the
firmware revisions observed on the bench in 2026 advertise the
`Letratag ` prefix instead. The driver filters Web Bluetooth's
`requestDevice` by `namePrefix: 'Letratag '` (trailing space anchors
the match) plus the `be3dd650-…` service UUID; the older prefix is
left as a fallback for any unit that still advertises it.

The `printShortCommandUUID` characteristic is used for out-of-band
commands that don't go through the chunked-print pipeline — most
notably `setCassetteType`, which sends a stand-alone
`START → MEDIA_TYPE → END` payload to record the loaded cassette in
the printer's session state.

::: warning UUID body is variable, prefix is stable
The full UUID **body** observed on the wire may differ across
firmware revisions or device units. Always:

1. Filter `requestDevice` by the canonical `be3dd650-` service UUID
   above, but
2. After connecting, walk the primary services and pick the one whose
   UUID starts with `be3dd650-`,
3. Reuse that connected service's tail (everything after the first 8
   hex digits) when constructing the TX, RX, and short-command UUIDs.

The same pattern is observable on the wire: the connected service
exposes its tail at runtime, and TX, RX, and short-command UUIDs
all share that tail.
:::

### MTU and chunking

Two ceilings apply to every TX write:

- The **protocol** chunk size is **500 body bytes** (501 on the wire
  once the 1-byte chunk-index prefix is added). This is the upper
  bound documented in the prior public reverse-engineering work and
  is enforced by the encoder.
- The **BLE link** MTU is whatever the OS / browser negotiates. On
  the LT-200B's BLE 4.2 stack, ATT MTU 247 (244-byte payload) is the
  modern conservative default; older stacks negotiate as low as 23.

Bench-confirmed 2026-05-10: writes that exceed the negotiated link
MTU fail on the first chunk of a multi-chunk job with
"GATT operation failed for unknown reason" — Chrome on Linux does
**not** auto-fragment `writeValueWithoutResponse` writes beyond the
link MTU. The driver therefore uses the registry's
`bluetooth-gatt.mtu` (currently `247`) as the effective per-chunk
ceiling: `effectiveChunkBytes = min(500, mtu - 1)`. The `-1` reserves
one byte for the chunk-index prefix that fronts every BLE write.
Single-chunk payloads happened to fit under 244 bytes, so the bug
stayed dormant until the first multi-chunk content went on the wire.

Every write to TX uses **write-without-response**, so the host does
not receive ack frames between writes; ordering is preserved by the
sequence index byte that prefixes each chunk.

## Status

The printer reports state in two channels — both available, with
different latency characteristics.

### 1. BLE advertising manufacturer data — continuous

The LT-200B continuously broadcasts a 3-byte payload in its BLE
advertising packets' manufacturer data. **No connection is required
to read this** — a passive scan exposes cassette presence, tape size,
battery level, charging status, and four error flags. The byte
layout below is observable on the wire with any passive scan tool
(e.g. `btmon` on Linux or Android's HCI snoop log).

```
byte 0  bits 4-7  revision           (protocol version)
        bits 0-3  reserved
byte 1  bits 0-3  cassetteId         (1=6mm, 2=9mm, 3=12mm,
                                      4=19mm, 5=24mm; see below)
        bit 4     carbonType
        bit 5     busyLocked         (job in progress)
        bits 6-7  spare
byte 2  bit 0     TAPE_JAM           (error)
        bit 1     CUTTER_JAM         (error)
        bit 2     BATTERY_TOO_LOW    (error — won't print)
        bit 3     BATTERY_LOW        (warning — prints anyway)
        bits 4-5  batteryLevel       (0..3; four levels)
        bit 6     chargingIndicator
        bit 7     reserved
```

This is the load-bearing source of "is there a cassette in the
printer and is it the right size" — the host scans, reads
`cassetteId`, and compares to the user's selected label width
**before** initiating a connection. This permits a tape-size
mismatch warning before any print is sent.

### 2. RX notification — per-job result

The printer emits a **3-byte** notification on the `printReplyUUID`
characteristic when a job completes (or fails). The notification
format is:

```
1B 52 <code>
```

`0x1B 0x52` is a fixed prefix (`ESC R`); `<code>` is the result.

| Code | Symbol                  | Meaning                                                           |
| ---: | ----------------------- | ----------------------------------------------------------------- |
|    0 | `SUCCESS`               | Print completed.                                                  |
|    1 | `SUCCESS` (alias of 0)  | Some firmware emits this variant; treat as 0.                     |
|    2 | `FAILED`                | Unspecified failure.                                              |
|    3 | `SUCCESS_LOW_BATTERY`   | Printed, but battery is low.                                      |
|    4 | `CANCELLED`             | Job cancelled by the printer.                                     |
|    5 | `FAILED` (alias of 2)   | Firmware variant; treat as 2.                                     |
|    6 | `BATTERY_TOO_LOW`       | Battery too low to drive the head.                                |
|    7 | `CASSETTE_MISSING`      | Documented; **prefer the advertising-data flags** for this state. |

The driver's `parseStatus()` collapses `1 → SUCCESS` and `5 → FAILED`.
For cassette-presence checking, read the advertising-data
`cassetteId` field instead — it is the reliable signal.

A 500 ms poll on the reply characteristic during printing (the
same characteristic that delivers the final notification) is a
practical way to drive a progress UI.

## Cassette IDs

The 4-bit `cassetteId` field in advertising data and the 1-byte
`MEDIA_TYPE` directive payload share the same enum:

| `cassetteId` | Tape width | DYMO size name |
| -----------: | ---------: | -------------- |
|            1 |       6 mm | `SMALL`        |
|            2 |       9 mm | `MEDIUM`       |
|            3 |      12 mm | `LARGE`        |
|            4 |      19 mm | `X_LARGE`      |
|            5 |      24 mm | `XX_LARGE`     |

LT-200B hardware accepts only 12 mm cassettes and broadcasts
`cassetteId = 3` when one is loaded. The wider widths are reserved
for sibling LetraTag-family devices that share this protocol.

## Print job structure

Every job — including a one-line text label — follows this exact
shape:

```
HEADER[9]                            preamble + length + checksum
[chunks of body, prefixed with 1-byte index, ≤500 bytes payload each]
  body =
    START                              opens the job (jobId fixed)
    NUMBER_OF_COPIES <N>               always emitted, default N=1
    PRINT_DATA <bpp> <align> <w> <h> <pixels>
    CUT <command>                      0x30 = cut now, 0x31 = suppress
    STATUS                             requests the result notification
    END                                closes the job
final chunk has MAGIC (12 34) appended after its payload
```

All multi-byte integers are **little-endian**.

The header is sent first, by itself, as the very first TX write. Body
chunks follow as separate writes in order. Total TX writes for a job
= `1 + ⌈len(body) / 500⌉`.

### Header (9 bytes)

```
FF F0 12 34 <length0..3> <checksum>
```

| Field    | Bytes | Meaning                                                       |
| -------- | ----: | ------------------------------------------------------------- |
| Preamble |     1 | `0xFF`                                                        |
| Flags    |     1 | `0xF0` — fixed; meaning unspecified, every job uses it.       |
| Magic    |     2 | `0x12 0x34` — also appended after the final body chunk.       |
| Length   |  4 LE | Body length in bytes (excludes header and chunk index bytes). |
| Checksum |     1 | `(sum of preceding 8 bytes) & 0xFF`                           |

## Directive vocabulary

The protocol's directive opcode is the second byte after a `0x1B`
(`ESC`) prefix. Nine directives are defined; six are emitted in the
normal print flow, two are auxiliary, and one (`PRINT_DENSITY`) is
declared but never emitted.

| Symbol                                                       | ASCII | Hex    | Length     | Bytes                                                                                       |
| ------------------------------------------------------------ | ----- | -----: | ---------- | ------------------------------------------------------------------------------------------- |
| [`START`](#start-—-open-job-1b-73-9a-02-00-00)               | `s`   | `0x73` | 6          | `[1B 73, ...4-byte jobId]`                                                                  |
| [`NUMBER_OF_COPIES`](#number_of_copies-n-—-copy-count-1b-23-n) | `#`   | `0x23` | 3          | `[1B 23, N]`                                                                                |
| [`PRINT_DATA`](#print_data-bpp-align-w-h-pixels-—-bitmap-1b-44) | `D`   | `0x44` | 12 + image | `[1B 44, bpp, align, ...u32le(w), ...u32le(h), ...image]`                                   |
| [`CUT`](#cut-command-—-finalize-copy-1b-70-nn)               | `p`   | `0x70` | 3          | `[1B 70, cmd]` (`0x30` = cut, `0x31` = suppress)                                            |
| [`FORM_FEED`](#form_feed-—-paper-feed-1b-45)                 | `E`   | `0x45` | 2          | `[1B 45]`                                                                                   |
| [`STATUS`](#status-—-request-result-notification-1b-41)      | `A`   | `0x41` | 2          | `[1B 41]`                                                                                   |
| [`END`](#end-—-close-job-1b-51)                              | `Q`   | `0x51` | 2          | `[1B 51]`                                                                                   |
| [`MEDIA_TYPE`](#media_type-id-—-set-cassette-type-1b-4d-nn-00-00-00) | `M` | `0x4D` | 6          | `[1B 4D, mediaId, 00, 00, 00]` — three trailing zero pad bytes are part of the wire format. |
| [`PRINT_DENSITY`](#print_density-—-declared-not-observed)    | `C`   | `0x43` | —          | recognised by the printer; not observed on the wire.                                        |

## `START` — open job (`1B 73 9A 02 00 00`)

```
1B 73 9A 02 00 00
```

The `9A 02 00 00` tail is the printer's expected "job ID" — a fixed
constant on every observed job. It is not related to a queue or
generation counter; emit it verbatim.

## `NUMBER_OF_COPIES <N>` — copy count (`1B 23 N`)

```
1B 23 <N>
```

A 1-byte unsigned copy count, default `1`. Always emitted, even for a
single-copy job. Position is immediately after `START`, before
`PRINT_DATA`.

## `PRINT_DATA <bpp> <align> <w> <h> <pixels>` — bitmap (`1B 44 …`)

```
1B 44 <bpp> <align> <width0..3> <height0..3> <pixel bytes>
```

| Field    | Bytes | Value / meaning                                                          |
| -------- | ----: | ------------------------------------------------------------------------ |
| `bpp`    |     1 | **`0x81`** — fixed.                                                      |
| `align`  |     1 | **`0x02`** — fixed.                                                      |
| `width`  |  4 LE | Feed-direction column count (`= image.length / 4`).                      |
| `height` |  4 LE | Across-head row count — **always `32`**.                                 |
| pixels   |   var | `4 × width` bytes; column-major (one 4-byte head column per feed step).  |

The image bytes encode the head columns in the order the feed
mechanism advances. Each 4-byte column carries 32 bits — the bit
packing is described in [Image encoding](#image-encoding).

## `CUT <command>` — finalize copy (`1B 70 nn`)

```
1B 70 <command>
```

| `command`  | Meaning                                                       |
| :--------: | ------------------------------------------------------------- |
| `0x30` (`'0'`) | Cut at the trailing edge of this copy. Used when copies = 1 or auto-cut is enabled. |
| `0x31` (`'1'`) | Suppress the cut. Used between copies in a multi-copy job.    |

`CUT` takes the place of `FORM_FEED` in the LT-200B (Avatar) flow.
Sibling devices that lack a cutter substitute `FORM_FEED` here
instead — that path is not exercised by this driver.

## `FORM_FEED` — paper feed (`1B 45`)

```
1B 45
```

Documented in the protocol vocabulary; **not emitted** on the
LT-200B (Avatar) path. Sibling LetraTag-family chassis that lack a
cutter substitute `FORM_FEED` for `CUT` to advance the tape past
the head at end-of-job; the LT-200B reaches the same physical
effect by sending `CUT 0x30`.

## `STATUS` — request result notification (`1B 41`)

```
1B 41
```

Schedules the 3-byte notification described in
[Status](#status). Always present in a print job, between `CUT` and
`END`.

## `END` — close job (`1B 51`)

```
1B 51
```

Mandatory trailer. Without it, the printer holds the job in its
buffer and the next write to TX appends rather than starting a new
job.

## `MEDIA_TYPE <id>` — set cassette type (`1B 4D nn 00 00 00`)

```
1B 4D <cassetteId> 00 00 00
```

Six bytes (the trailing three zeros are part of the wire format).
Sets the cassette type the printer should expect. The driver does
**not** emit `MEDIA_TYPE` in the normal print flow — the printer
prints correctly without it on every observed substrate. The
directive exists to support the stand-alone "set cassette type"
payload (see [Set-cassette-type payload](#set-cassette-type-payload)),
which is used to record the loaded cassette in the printer's
session state outside a print.

`<cassetteId>` is the 1..5 enum from [Cassette IDs](#cassette-ids).

## `PRINT_DENSITY` — declared, not observed

```
1B 43 …
```

Recognised by the printer firmware (carried over from earlier
LetraTag-family vocabulary) but **not emitted** on any observed
LT-200B job — the LetraTag Connect app does not send it, and the
driver does not either. Listed in the [vocabulary
table](#directive-vocabulary) for completeness; length and payload
are unknown on this chassis.

## Trailing feed

The LT-200B does not advance enough tape on its own to push the
printed area past the head-to-cutter gap. The encoder appends
`engine.forcedTrailingFeedMm` (currently **6 mm**, = 47 zero feed
columns at 200 dpi) of zero-padded feed columns after the bitmap
and before the `CUT` directive. Two effects bench-confirmed
2026-05-10:

1. **Visibility.** Without trailing feed the printed area stays
   inside the head-to-cutter gap; the user has to manually advance
   tape with the chassis lever before the print becomes readable.
   `CUT 0x30` alone does not advance enough tape — contradicting
   an earlier theory that the firmware enacted trailing feed inside
   the cut command.
2. **Tiny-print alternation quirk.** With identical 16-column-T2
   bytes sent back-to-back and `forcedTrailingFeedMm: 0`, the
   post-print status code alternated perfectly:
   `success (0x01) → silent rejection (0x05, head never engaged)
   → success → silent rejection`, repeating for 8+ consecutive
   prints. With `forcedTrailingFeedMm: 6` every print succeeds.
   Wider real content (~30+ feed columns) avoids the alternation
   even without trailing feed, so the load-bearing dimension is
   **total feed column count**, not literally "trailing zeros."
   Trailing feed is one of two ways to clear the firmware state;
   wider real content is the other.

The 6 mm value is the first tested width that worked; sweeping
lower values is open work. The driver does not currently expose
a per-job override.

## Image encoding

Each feed column packs 32 head rows into 4 bytes. The packing is
**MSB-first within each byte**, then the four bytes of each column
are emitted with **byte 0 = head rows 24..31** and **byte 3 = head
rows 0..7**. That is:

| Byte index in image | Head rows packed | Bit 7 (MSB) is row | Bit 0 (LSB) is row |
| :-----------------: | :--------------- | :----------------: | :----------------: |
|          0          | 24..31           |         24         |         31         |
|          1          | 16..23           |         16         |         23         |
|          2          | 8..15            |          8         |         15         |
|          3          | 0..7             |          0         |          7         |

For a user pixel at feed column `x` (0..feed_count - 1) and head
row `y` (0..31):

```
byte_index = 3 - floor(y / 8)
bit_index  = 7 - (y % 8)
```

There is **no `y + 1` skip** — every protocol row is addressable by
the encoder. Labels that are shorter than 32 head rows are centered
within the 32-row protocol frame by padding with zero-rasterlines at
the top and bottom (`top = floor((32 - h) / 2)`,
`bottom = 32 - h - top`); the firmware does not branch on content
extent.

## Worked examples

```
single black pixel at (x=0, y=0)        →  00 00 00 80
                                              (byte 3, bit 7)
single black pixel at (x=0, y=7)        →  00 00 00 01
                                              (byte 3, bit 0)
single black pixel at (x=0, y=24)       →  80 00 00 00
                                              (byte 0, bit 7)
single black pixel at (x=0, y=31)       →  01 00 00 00
                                              (byte 0, bit 0)
full-black 32-row column                →  FF FF FF FF
empty column                            →  00 00 00 00
```

::: info On centering and "printable rows"
The protocol does not distinguish "printable" from "non-printable"
head positions; all 32 rows go on the wire and all 32 are imaged by
the head. User-facing media descriptors that report a printable-row
count (e.g. 30) describe a chassis-mechanical reality (the top and
bottom rows are clipped by the cassette geometry on certain
substrates), not a wire-format constraint. If you author a label
30 rows tall, the encoder pads it to 32 by inserting one zero row
at the top and one at the bottom; if you author 32 rows, all 32
ship.
:::

## Chunking

The body
(`START + NUMBER_OF_COPIES + PRINT_DATA + CUT + STATUS + END`) is
sliced into ≤500-byte windows. Each window is written as one BLE TX
write:

```
<index> <slice...>                         — for non-final chunks
<index> <slice...> 12 34                   — for the final chunk only
```

`<index>` is a single byte sequence number. The first chunk has
`index = 0`; subsequent chunks increment by 1 — **except** that the
chunk that would receive `index = 27` is given `index = 28` instead,
and every chunk after it is shifted by one (i.e. for a zero-based
chunk position `i`, the emitted index is `i + 1` when `i >= 27`).

This skip appears on the wire on every observed job, and the
firmware tolerates (or relies on) it. Realistic LT labels never
reach 27 chunks (= 13.5 KiB body), so the quirk is dormant on every
typical print, but the encoder honors it.

The `12 34` magic appended to the **final** chunk is the same two
bytes that appear inside the header. It marks end-of-body.

::: warning Index byte at 256 chunks
The 1-byte index implies a hard limit of 256 chunks (= ~128 KiB
body). LT labels are nowhere near that. The encoder rejects bodies
that would exceed the limit; behavior at wraparound has not been
observed.
:::

## Set-cassette-type payload

A separate, single-write payload tells the printer which cassette is
loaded. It uses the `printShortCommandUUID` characteristic, not TX:

```
HEADER[9] + START + MEDIA_TYPE <cassetteId> + END
```

23 bytes total, **no chunking** (the header + body are written as a
single non-print write to the short-command characteristic). This
is the observed mechanism for setting the printer's known cassette
state outside a print job.

The driver does not expose this in the normal `print()` path; it is
available as a separate operation for hosts that want to update the
printer's cassette knowledge ahead of a job.

## Recovery

There is no documented soft-reset directive. If the printer is left
in a partial-job state (host disconnected mid-stream, or a chunk
failed to write), the recovery is to **disconnect the GATT session
and reconnect**. The firmware discards partial bodies on disconnect;
subsequent jobs print cleanly.

The hardware power button is a separate hard reset.

## Web Bluetooth

The browser package uses the Web Bluetooth API:

```ts
navigator.bluetooth.requestDevice({
  filters: [
    { namePrefix: 'DYMO LT-200B' },
    { services: ['be3dd650-2b3d-42f1-99c1-f0f749dd0678'] },
  ],
})
  .then(device => device.gatt.connect())
  .then(server => server.getPrimaryServices())
  // pick the service whose UUID starts with `be3dd650-`
  // derive TX, RX, and short-command UUIDs from its tail
  .then(/* ... */ rxCharacteristic.startNotifications())
  // for each chunk:
  //   txCharacteristic.writeValueWithoutResponse(chunk)
```

Web Bluetooth requires a **secure context** (`https://` or
`localhost`) and a **user gesture** for the initial `requestDevice`
call. Subsequent reconnects do not need a fresh gesture if the
device is still permitted in the browser's session.

For passive cassette / battery / busy detection, the host can also
register an `onDiscovered` handler during scanning and read the
3-byte `manufacturerData` payload directly — no connection needed.

::: info No Node transport in Phase 1
This driver does not currently ship a Node BLE transport — Phase 1
is web-only. The future Node path will not use `noble`; candidates
under evaluation are `webbluetooth` (Node-side polyfill), `node-ble`
(D-Bus on Linux), or shelling out to `bluetoothctl` + `gatttool`.
:::

## References

- **Sources, scope, and legal posture** —
  [`INTEROPERABILITY.md`](https://github.com/thermal-label/letratag/blob/main/INTEROPERABILITY.md)
  at the repo root. Lists the prior public reverse-engineering work this page
  builds on, the on-the-wire observation that anchors each
  byte-level claim, and the project's posture under EU Directive
  2009/24/EC Article 6 and the US fair-use precedents.
- Implementation in this driver:
  - `packages/core/src/protocol.ts` — encoder (directives, header,
    chunker, image packing).
  - `packages/core/src/status.ts` — `parseStatus` (3-byte RX parser)
    and `parseAdvertisingStatus` (3-byte manufacturer-data parser).
  - `packages/core/src/devices.generated.ts` — LT-200B device entry.
  - `packages/web/src/discovery.ts` — Web Bluetooth `requestDevice` +
    UUID-prefix service match + advertising-data scan.
  - `packages/web/src/printer.ts` — `LetraTagPrinter` adapter.
- _LetraTag 200B User Guide_ (Sanford / Newell, 2023) — end-user
  documentation; establishes the cassette family ("DYMO LT label
  cassettes") and the electrical envelope (4×AA, 2400–2483.5 MHz,
  &lt; 10 dBm). No protocol details.
