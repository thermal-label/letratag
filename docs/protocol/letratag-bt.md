# LetraTag BT Protocol

The wire protocol of DYMO's LetraTag **LT-200B** — a BLE-only
handheld label printer. Print jobs travel as packet-framed payloads
over a write-without-response GATT characteristic; status replies
arrive as notifications on a second characteristic and as continuous
broadcasts in BLE advertising data. There is no USB, serial, or TCP
path on this chassis.

DYMO does not publish a technical reference for this protocol. The
byte sequences below are anchored on prior public reverse-engineering
work (`ysfchn/dymo-bluetooth`, `alexhorn/lt200b`) and on-the-wire
observation between a paired LT-200B and a host.

::: warning Status of facts — hardware-unverified in places
Concrete byte-level claims (header layout, checksum, opcode table,
chunking, advertising-data bit layout, GATT topology, prefix-matching
strategy) are high-confidence. Three classes of claim deserve
explicit caveats:

1. **Bit packing.** The worked examples follow MSB-first per-byte
   packing plus per-rasterline byte reversal. They have not been
   byte-traced on a real print on every supported substrate.
2. **Inferred semantics.** The `CUT` command direction (`0x30` vs
   `0x31`), whether the trailing zero pad on `MEDIA_TYPE` is
   load-bearing vs tolerated, whether the LT-200B chassis prints
   all 32 rows vs clips the edges, and whether `flags = 0xF0` is
   required vs the only observed value — these are best-guess reads.
3. **Status code enum (codes 1–7).** Only `code === 0` has been
   positively observed; values 1–7 below are carried over from
   `ysfchn/dymo-bluetooth`'s `Result.from_bytes` and have **not**
   been confirmed by direct observation. Do not treat them as
   canonical.
:::

## Frame geometry

The protocol's `PRINT_DATA` height field is fixed at **32 head
rows**. Labels shorter than 32 rows are centred within the 32-row
frame by padding with zero-rasterlines at the top and bottom — there
is no fixed printable-row count baked into the wire format. Whether
all 32 rows physically print is a property of the print head, not
the protocol.

The protocol vocabulary supports five tape widths (see
[Cassette IDs](#cassette-ids)). The LT-200B chassis only accepts
12 mm cassettes, but the wire format does not distinguish.

## BLE topology

The printer advertises a single primary GATT service. The service
UUID and three characteristics share the same 28-character tail; the
first 8 hex digits of the service UUID are stable across firmware
revisions, the remaining body may differ. The canonical advertised
UUIDs are:

| Role                        | UUID prefix    | Properties             |
| --------------------------- | -------------- | ---------------------- |
| Primary service             | `be3dd650-…`   | —                      |
| `printRequestUUID`     (TX) | `be3dd651-…`   | write-without-response |
| `printReplyUUID`       (RX) | `be3dd652-…`   | notify                 |
| `printShortCommandUUID`     | `be3dd653-…`   | write-without-response |

The advertised device name is `Letratag <12-hex-MAC-suffix>` —
e.g. `Letratag 10B41D8220FE`. Prior public reverse-engineering work
(ysfchn / alexhorn) recorded the prefix as `DYMO LT-200B`; firmware
revisions observed in 2026 advertise the `Letratag ` prefix (with a
trailing space) instead. Implementations targeting the broadest fleet
should accept both.

The `printShortCommandUUID` characteristic carries out-of-band
commands that don't go through the chunked-print pipeline — most
notably the stand-alone `START → MEDIA_TYPE → END` payload that
records the loaded cassette in the printer's session state.

::: warning UUID body is variable, prefix is stable
The full UUID **body** observed on the wire may differ across
firmware revisions or device units. Only the first 8 hex digits
(`be3dd650-` / `be3dd651-` / `be3dd652-` / `be3dd653-`) are stable;
the primary service and its three characteristics always share the
same 28-character tail at runtime.
:::

## MTU and chunking

Two ceilings apply to every TX write:

- The **protocol** chunk size is **500 body bytes** (501 on the wire
  once the 1-byte chunk-index prefix is added). This is the upper
  bound documented in the prior public reverse-engineering work; the
  firmware rejects larger bodies per chunk.
- The **BLE link** MTU is whatever the OS / browser negotiates. On
  the LT-200B's BLE 4.2 stack, ATT MTU 247 (244-byte payload) is the
  modern conservative default; older stacks negotiate as low as 23.
  Writes that exceed the negotiated link MTU fail at the BLE layer
  on the first chunk of a multi-chunk job — the firmware never sees
  them. The effective per-chunk ceiling is therefore
  `min(500, mtu - 1)`; the `-1` reserves one byte for the
  chunk-index prefix.

Every write to TX uses **write-without-response**, so the host does
not receive ack frames between writes; ordering is preserved by the
sequence-index byte that prefixes each chunk.

## Advertising data

The printer continuously broadcasts a 3-byte payload in its BLE
advertising packets' manufacturer data. **No connection is required
to read this** — a passive scan exposes cassette presence, tape size,
battery level, charging status, and four error flags. The byte
layout is observable on the wire with any passive scan tool (e.g.
`btmon` on Linux or Android's HCI snoop log):

```
byte 0  bits 4-7  revision           (protocol version)
        bits 0-3  reserved
byte 1  bits 0-3  cassetteId         (1..5; see MEDIA_TYPE)
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

The `cassetteId` field in this broadcast is the load-bearing source
of "is there a cassette in the printer and is it the right size".

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

::: warning Tiny-print alternation quirk (firmware state-toggle)
With identical short content sent back-to-back and **insufficient
total feed-column count**, post-print status codes alternate
perfectly between success and silent rejection — `success → silent
reject (head never engaged) → success → silent reject` — repeating
for 8+ consecutive prints. The threshold is empirical (LT-200B clears
the alternation with ~30+ total feed columns per job, with feed
columns counting whether they come from bitmap content, leading
zeros, or trailing zeros). The firmware appears to require a minimum
number of head-cycles per job to clear an internal state-toggle.
:::

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
recognised by the firmware but has not been observed on the wire.

| Symbol                                                       | ASCII | Hex    | Length     | Bytes                                                                                       |
| ------------------------------------------------------------ | ----- | -----: | ---------- | ------------------------------------------------------------------------------------------- |
| [`START`](#start-—-open-job-1b-73-9a-02-00-00)               | `s`   | `0x73` | 6          | `[1B 73, ...4-byte jobId]`                                                                  |
| [`NUMBER_OF_COPIES`](#number_of_copies-n-—-copy-count-1b-23-n) | `#` | `0x23` | 3          | `[1B 23, N]`                                                                                |
| [`PRINT_DATA`](#print_data-bpp-align-w-h-pixels-—-bitmap-1b-44) | `D` | `0x44` | 12 + image | `[1B 44, bpp, align, ...u32le(w), ...u32le(h), ...image]`                                   |
| [`CUT`](#cut-command-—-finalize-copy-1b-70-nn)               | `p`   | `0x70` | 3          | `[1B 70, cmd]` (`0x30` = cut, `0x31` = suppress)                                            |
| [`FORM_FEED`](#form_feed-—-paper-feed-1b-45)                 | `E`   | `0x45` | 2          | `[1B 45]`                                                                                   |
| [`STATUS`](#status-—-request-result-notification-1b-41)      | `A`   | `0x41` | 2          | `[1B 41]`                                                                                   |
| [`END`](#end-—-close-job-1b-51)                              | `Q`   | `0x51` | 2          | `[1B 51]`                                                                                   |
| [`MEDIA_TYPE`](#media_type-id-—-set-cassette-type-1b-4d-nn-00-00-00) | `M` | `0x4D` | 6    | `[1B 4D, mediaId, 00, 00, 00]` — three trailing zero pad bytes are part of the wire format. |
| [`PRINT_DENSITY`](#print_density-—-declared-not-observed)    | `C`   | `0x43` | —          | recognised by the firmware; not observed on the wire.                                       |

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

| `command`      | Meaning                                                                             |
| :------------: | ----------------------------------------------------------------------------------- |
| `0x30` (`'0'`) | Cut at the trailing edge of this copy. Used when copies = 1 or auto-cut is enabled. |
| `0x31` (`'1'`) | Suppress the cut. Used between copies in a multi-copy job.                          |

`CUT` takes the place of `FORM_FEED` in the LT-200B (Avatar) flow.
Sibling LetraTag-family chassis that lack a cutter substitute
`FORM_FEED` here instead.

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

Always present in a print job, between `CUT` and `END`. Schedules a
**3-byte** notification on the `printReplyUUID` characteristic when
the job completes (or fails). The notification format is:

```
1B 52 <code>
```

`0x1B 0x52` is a fixed prefix (`ESC R`); `<code>` is the result.

| Code | Symbol                  | Meaning                                        |
| ---: | ----------------------- | ---------------------------------------------- |
|    0 | `SUCCESS`               | Print completed.                               |
|    1 | `SUCCESS` (variant)     | Observed alongside 0; same semantics.          |
|    2 | `FAILED`                | Unspecified failure.                           |
|    3 | `SUCCESS_LOW_BATTERY`   | Printed, but battery is low.                   |
|    4 | `CANCELLED`             | Job cancelled by the printer.                  |
|    5 | `FAILED` (variant)      | Observed alongside 2; same semantics.          |
|    6 | `BATTERY_TOO_LOW`       | Battery too low to drive the head.             |
|    7 | `CASSETTE_MISSING`      | Documented; not observed in practice.          |

Codes 1–7 are sourced from `ysfchn/dymo-bluetooth`'s
`Result.from_bytes` enum and have not been confirmed by direct
observation; only code 0 has been positively observed in bench
captures.

The same characteristic may be polled at ~500 ms intervals during
printing to drive a progress UI; the final notification on job
completion arrives on the same channel.

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
Records the cassette type the printer should expect in its session
state. The printer prints correctly on every observed substrate
without this directive — it is optional in the print flow and is
typically issued out-of-band on the short-command characteristic via
the [stand-alone set-cassette-type payload](#stand-alone-set-cassette-type-payload).

The 1-byte `<cassetteId>` and the 4-bit `cassetteId` field in
[advertising data](#advertising-data) share the same enum:

| `cassetteId` | Tape width | DYMO size name |
| -----------: | ---------: | -------------- |
|            1 |       6 mm | `SMALL`        |
|            2 |       9 mm | `MEDIUM`       |
|            3 |      12 mm | `LARGE`        |
|            4 |      19 mm | `X_LARGE`      |
|            5 |      24 mm | `XX_LARGE`     |

LT-200B hardware accepts only 12 mm cassettes and broadcasts
`cassetteId = 3` when one is loaded. The wider widths are reserved
for sibling LetraTag-family chassis that share this protocol.

## `PRINT_DENSITY` — declared, not observed

```
1B 43 …
```

Recognised by the printer firmware (carried over from earlier
LetraTag-family vocabulary) but has not been observed on the wire on
any LT-200B job. Length and payload are unknown on this chassis.

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

Cross-check by single-pixel column:

```
pixel at (x=0, y=0)   →  00 00 00 80   (byte 3, bit 7)
pixel at (x=0, y=7)   →  00 00 00 01   (byte 3, bit 0)
pixel at (x=0, y=24)  →  80 00 00 00   (byte 0, bit 7)
pixel at (x=0, y=31)  →  01 00 00 00   (byte 0, bit 0)
full-black column     →  FF FF FF FF
empty column          →  00 00 00 00
```

Every protocol row is addressable — there is no `y + 1` skip. Labels
shorter than 32 head rows are centred within the 32-row protocol
frame by padding with zero-rasterlines at the top and bottom
(`top = floor((32 - h) / 2)`, `bottom = 32 - h - top`); the firmware
does not branch on content extent.

::: info On centering and "printable rows"
The protocol does not distinguish "printable" from "non-printable"
head positions; all 32 rows go on the wire and all 32 are imaged by
the head. User-facing media descriptors that report a printable-row
count (e.g. 30) describe a chassis-mechanical reality (the top and
bottom rows are clipped by the cassette geometry on certain
substrates), not a wire-format constraint.
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
chunk position `i`, the emitted index is `i + 1` when `i >= 27`)
(per `ysfchn/dymo-bluetooth`).

This skip appears on the wire on every observed job, and the
firmware tolerates (or relies on) it. Realistic LT labels never
reach 27 chunks (= 13.5 KiB body), so the quirk is dormant on every
typical print.

The `12 34` magic appended to the **final** chunk is the same two
bytes that appear inside the header. It marks end-of-body.

::: warning Index byte at 256 chunks
The 1-byte index implies a hard limit of 256 chunks (= ~128 KiB
body). LT labels are nowhere near that. Behaviour at wraparound has
not been observed.
:::

## Stand-alone set-cassette-type payload

A separate, single-write payload tells the printer which cassette is
loaded. It uses the `printShortCommandUUID` characteristic, not TX:

```
HEADER[9] + START + MEDIA_TYPE <cassetteId> + END
```

23 bytes total, **no chunking** — header + body are written as a
single non-print write to the short-command characteristic. This is
the observed mechanism for setting the printer's known cassette
state outside a print job.

## Recovery

There is no soft-reset directive on the wire. If the printer is left
in a partial-job state (host disconnected mid-stream, or a chunk
failed to write), the firmware discards the partial body on GATT
disconnect; subsequent jobs print cleanly after a fresh connection.
The hardware power button is a separate hard reset.

## References

- [`ysfchn/dymo-bluetooth`](https://github.com/ysfchn/dymo-bluetooth) —
  Python reverse-engineering of the LetraTag BT protocol. Source
  for the directive vocabulary, header format, chunking skip at
  index 27, and the result-code enum (codes 1–7 unverified).
- [`alexhorn/lt200b`](https://github.com/alexhorn/lt200b) — earlier
  reverse-engineering effort; first to document the GATT topology
  and the advertised name prefix (`DYMO LT-200B`).
- _LetraTag 200B User Guide_ (Sanford / Newell, 2023) — end-user
  documentation. Establishes the cassette family ("DYMO LT label
  cassettes") and the electrical envelope (4×AA, 2400–2483.5 MHz,
  &lt; 10 dBm). No protocol details.
