# Implementation Plan — `@thermal-label/letratag`

> Driver for the DYMO **LetraTag LT-200B** — a Bluetooth LE handheld
> label printer with a 12 mm tape and a custom chunked-GATT print
> protocol distinct from D1 LabelManager and from LabelWriter.
>
> **Scope, round 1: web only.** Validate the wire protocol against
> real hardware via Web Bluetooth. Node support is deferred — the
> `@thermal-label/transport` package does not yet ship a Node BLE
> transport, we are explicitly not adopting `noble`, and the design
> space for a BLE-on-Node path needs its own decision round.

## Sources of truth

Round 1 cross-references **two independent, tested**
reverse-engineering efforts. Treat them as peers, not as one
"reference" + one "secondary" — both have been printed against real
LT-200Bs, and they nonetheless disagree on three details that have
to be committed to one way or the other before any byte goes on the
wire.

1. **ysfchn / dymo-bluetooth** —
   <https://github.com/ysfchn/dymo-bluetooth>.
   - `README.md` — narrative protocol description.
   - `dymo_bluetooth/printer.py` — actual implementation: `Canvas`
     class with bounds checks, `DirectiveBuilder`, `create_payload`
     chunker, `Result` enum, status decoder.
2. **alexhorn / lt200b** —
   <https://github.com/alexhorn/lt200b>.
   - `job.py` — minimal but tested: `_prepare_image` → `_split_chunks`
     → `create_job`.
   - `print.py` — bleak Web-Bluetooth-equivalent client.

Where the two **tested implementations** disagree, the encoder picks
one and round-1 verification confirms or flips it. ysfchn's narrative
README also disagrees with ysfchn's own code in one place (see C2);
the code wins.

## Naming & layout

- **Repo**: `~/thermal-label/letratag/` (sibling of `labelmanager`,
  `labelwriter`, `niimbot`, `brother-ql`).
- **Org repo**: `github.com/thermal-label/letratag`.
- **npm scope** (round 1): `@thermal-label/letratag-core` and
  `@thermal-label/letratag-web`. **No** `letratag-node` in round 1.
- **Family identifier** (`DeviceEntry.family`): `'letratag'`.
- **Protocol tag** (`PrintEngine.protocol`): `'letratag-bt'` —
  BLE-only family, the tag intentionally encodes the coupling.
- **Device key**: `LT_200B`.
- **Docs slug**: `letratag/lt-200b`.

## Why this driver is structurally different from siblings

`labelmanager` and `labelwriter` are USB-HID / USB-printer-class. The
LT-200B is **BLE GATT only** — no USB, no serial. Two consequences:

1. **Web-only round 1.** `WebBluetoothTransport` ships in
   `@thermal-label/transport`; that's the entire transport story for
   this round.
2. **The protocol is packet-framed, not stream-framed.** Each print
   job is one logical payload wrapped in a 9-byte header (with a
   1-byte checksum) and sliced into ≤500-byte BLE write chunks, each
   prefixed with a 1-byte sequence index. The encoder owns framing;
   the transport stays a dumb byte channel.

Outside those two points the driver follows the labelmanager
template 1:1 (contracts shapes, registry generation, preview
pipeline, hardware verification flow, docs site integration).

---

## Wire-format conflicts between sources

Both ysfchn's code and alexhorn's code have been used to print on real
hardware. Yet they disagree below at the wire level. The encoder's
default uses **ysfchn's code** as canonical (more thorough, bounds-
checked, reproduces vendor-app quirks); alexhorn's encoding is
implemented as a feature-flagged alternate so round-1 verification
can A/B them.

### C1 — Axis order in `PRINT_DATA`

| Source            | First u32 = | Second u32 = | Image data layout                        |
| ----------------- | ----------- | ------------ | ---------------------------------------- |
| ysfchn README     | WIDTH (feed)        | HEIGHT = 32 (head)  | `4 bytes × WIDTH`                  |
| ysfchn code       | `canvas.width` (feed) | `32` (head)         | column-major; `4 bytes × feed_count` |
| alexhorn code     | `32` (head)         | `height` (feed)     | row-major; `4 bytes × feed_count`  |

Total byte count is identical (`4 × feed_count`); only an asymmetric
test pattern will distinguish the two firmwares interpretations.
ysfchn even comments "Seems printer doesn't mind if it is either 30
or 32" — the dimensional fields may be loosely validated, with the
firmware deriving feed length from `total_bytes / 4`.

**Encoder default: ysfchn order** (`[u32le(feed), u32le(32)]`).
Verification: print an asymmetric rectangle and confirm orientation.

### C2 — Bit packing

ysfchn's README disagrees with **ysfchn's own code** here. The code is
the source of truth.

| Source            | Pixel `(0, 0)` lives in              | Single pixel at origin → 4 bytes |
| ----------------- | ------------------------------------ | -------------------------------- |
| ysfchn README     | bit 7 of byte 3                      | `00 00 00 80`                    |
| ysfchn code       | bit 6 of byte 3 (note `y+1` offset)  | `00 00 00 40`                    |
| alexhorn code     | bit 0 of byte 0 (LSB-first scanline) | `01 00 00 00`                    |

ysfchn's code packs as: for pixel at (x_feed, y_head),
`byte = 3 - floor((y + 1) / 8)`, `bit = 7 - ((y + 1) % 8)`. The `y+1`
skews so bit 7 of byte 3 stays empty — that's the "skip first row"
mechanism baked into the encoder rather than a firmware-level
behaviour.

**Encoder default: ysfchn code packing.** Pin the
`00 00 00 40` test vector. The README's `00 00 00 80` test stays as
`it.todo` so a human re-reads the README before deleting it.

### C3 — Printable region & first-row skip

- ysfchn README: "Printable area is 30 pixels but protocol expects 32
  pixels per height; first row is automatically skipped by the
  implementation."
- ysfchn code: `FIXED_EDGE_PIXELS = 30`. The `y+1` offset above is
  what implements the skip — it's an **encoder-side** behaviour, not
  firmware-side. The first 4-byte group's bit 7 of byte 3 is left
  unused.
- alexhorn code: prints all 32 rows; no skip; relies on the user to
  position content within whatever physically prints.

**Encoder default: 30 printable rows + ysfchn's encoder-side skip.**
Round-1 verification (Test 3 below) prints a striped pattern across
the head and identifies the printable region exactly.

### C4 — Chunk index numbering

Both implementations chunk at 500 bytes. They disagree on the index
byte for chunks ≥ 27.

- alexhorn: `index = chunk_number` (0, 1, 2, …, 26, 27, 28, …).
- ysfchn: `chunk_index = index + 1 if index >= 27 else index`. So:
  0, 1, 2, …, 26, **28** (skips 27), 29, 30, … ysfchn's comment:
  "Not sure what is the purpose of this, but the original vendor app
  skips this index, so we do the same here."

Round-1 labels are nowhere near ≥ 27 chunks (= ≥ 13.5 KiB body), so
either implementation works for any realistic label. **Encoder
default: ysfchn convention** (mirror the vendor app). Encode an
explicit assertion until a future label exceeds the threshold.

### C5 — `MEDIA_TYPE` enum byte values

Neither source enumerates the byte values that go in
`MEDIA_TYPE(value)`. ysfchn exposes `command_casette(media_type:
int)` but no defined values. Round 1 does **not** emit `MEDIA_TYPE`
at all (matching alexhorn). A future round establishes the enum from
on-the-wire observation.

### C6 — Status code coverage

ysfchn's `Result` enum normalises duplicate codes:

- Code `1` is an alternate "completed" code → mapped to SUCCESS.
- Code `5` is an alternate "failed" code → mapped to FAILED.
- Code `7` (no cassette) **never actually fires** per ysfchn's
  testing — the printer prints (or spins gears) regardless. Surface
  as a soft warning at most; never block on it.

These reconciliations apply directly to our parser.

## GATT discovery — UUID-prefix matching

alexhorn matches the service by the **first 8 hex digits** of the
UUID (`be3dd650-…`) and derives the TX UUID by replacing those 8
digits (`be3dd651-…` etc.). This implies the UUID body may vary per
device or firmware. The driver registry stores the canonical UUID
for the request filter, but the connection path mirrors alexhorn:
match by `be3dd650-` prefix, derive characteristic UUIDs from the
matched service tail.

---

## Media library — LetraTag (LT) tape catalogue

The LT-200B user guide specifies only "DYMO LT label cassettes" —
the device accepts the full LetraTag (LT) tape family that earlier
LT-100H / LT-100T / LT-110T machines accept. All listed below are
12 mm wide, the only width LT cassettes ship in.

Source matrix is wider than usual because DYMO publishes regionally:

- **Compatibility chart** —
  <https://www.dymo.com/compatibility-charts.html>
- **DYMO LetraTag tapes index** —
  <https://www.dymo.com/labels-tapes/letratag-tapes/>
- **Iron-on fabric product page** —
  <https://www.dymo.com/labels-tapes/letratag-tapes/letratag-iron-on-tape/SP_95601.html>
- **LabelCity catalogue** —
  <https://www.labelcity.com/dymo-letratag/letratag-labels-tapes/dymo-letratag-labels-all-of-them>
- **EU SKU cross-reference** — refreshcartridges.co.uk,
  premiumcompatibles.co.uk, dymo-express.co.uk, easylabelbg.com (all
  list the equivalent S0721…/S0718… part numbers next to the US
  91XXX numbers).

### Catalogue (`packages/core/data/media.json5`)

Every entry: 12 mm tape width, 30 printable dots across the head,
single ink colour ("text"), single substrate colour ("background").
Per-cassette roll length varies (most are ~4 m / 13 ft; iron-on is
2 m) but is **not** a `MediaDescriptor` field — `heightMm` stays
undefined for continuous tape per `@thermal-label/contracts` (variable
length per label). Roll length lives on the docs site instead.

Each entry's contracts-shape vs driver-extension fields are split per
the labelmanager precedent:

- **Contracts base** (from `MediaDescriptor`): `id`, `name`,
  `widthMm`, `type: 'tape'`, `category: 'cartridge'`, `targetModels`,
  `defaultOrientation`, `printMargins`, `skus`.
- **Driver extension** (on `LetraTagMedia`): `material`, `text`,
  `background`, `tapeWidthMm`, `printableDots`.

`skus` is the contracts-standard field for vendor part numbers — use
it. **Do not** invent `alternativePartNumbers` or similar. `skus` lists
every observed US (91XXX) and EU (S07XXXXX) part number for the same
physical tape; downstream consumers (search-by-SKU helpers) match
against this list.

| Const export             | `id` (registry key)         | Substrate      | Text  | Background  | `skus` (US + EU)                                                 | Status        |
| ------------------------ | --------------------------- | -------------- | ----- | ----------- | ---------------------------------------------------------------- | ------------- |
| `LT_PAPER_WHITE`         | `lt-paper-white`            | paper          | black | white       | `91200`, `91220`, `91330`, `10697`, `S0721510`, `S0721520`       | active        |
| `LT_PLASTIC_WHITE`       | `lt-plastic-white`          | plastic        | black | white       | `91201`, `91221`, `91331`, `S0721560`, `S0721610`                | active        |
| `LT_PLASTIC_PEARL_WHITE` | `lt-plastic-pearl-white`    | plastic        | black | pearl-white | (regional variant of 91201 / 91221; verify before shipping)      | active (TBV)  |
| `LT_PLASTIC_YELLOW`      | `lt-plastic-yellow`         | plastic        | black | yellow      | `91202`, `91222`, `91332`, `S0721620`, `S0721670`                | active        |
| `LT_PLASTIC_RED`         | `lt-plastic-red`            | plastic        | black | red         | `91203`, `91223`, `91333`, `S0721630`                            | discontinued  |
| `LT_PLASTIC_GREEN`       | `lt-plastic-green`          | plastic        | black | green       | `S0721640`                                                       | discontinued? |
| `LT_PLASTIC_BLUE`        | `lt-plastic-blue`           | plastic        | black | blue        | `91205`, `91225`, `91335`, `S0721650`                            | discontinued  |
| `LT_PLASTIC_CLEAR`       | `lt-plastic-clear`          | plastic-clear  | black | clear       | `16952`, `12267`, `S0721530`, `S0721550`                         | active        |
| `LT_METALLIC_SILVER`     | `lt-metallic-silver`        | metallic       | black | silver      | `91208`, `91228`, `91338`, `S0721700`                            | active        |
| `LT_IRON_ON_WHITE`       | `lt-iron-on-white`          | iron-on-fabric | black | white       | `18769`, `18771`, `18768`, `14042`, `S0718850`, `S0718840`       | active        |

Notes & gotchas:

- The **91XXX series** uses suffix conventions: `91X20` ≈ `91X30` ≈
  `91X00` for the same tape (regional packaging variations). The
  registry collapses to a single entry per (substrate, colour) pair
  and lists every observed SKU on `skus`.
- **Iron-on tape is 2 m**, not 4 m. Roll length is informational only
  (docs page, not registry); the print contract is "continuous" so
  `heightMm` stays undefined per contracts.
- "Pearl white" and "white" plastic are sometimes sold under the same
  SKU in different regions; confirm the marketing finish before
  shipping. `LT_PLASTIC_PEARL_WHITE` stays as a tentative entry; if
  round-1 sourcing shows it's just a regional rebrand, fold it into
  `LT_PLASTIC_WHITE`.
- DYMO occasionally refreshes the catalogue with new colour-ways
  (recent: black-on-pink, black-on-light-green, multi-pack
  assortments). Treat the table above as today's snapshot, not a
  closed set; new entries land via small PRs once a SKU is verified.
- `LT_MULTIPACK_3PK` (12331 — paper + plastic + clear, US) is **not**
  a registry entry; it's a retail SKU bundling three of the entries
  above. The driver does not need to know about retail SKUs.
- **Label length on the printer is unbounded** by the cassette; the
  encoder ships a `MAX_FEED_PIXELS` guard at `8000` (matching
  ysfchn's `Canvas.UNFIXED_EDGE_MAX_PIXELS` constant, which is
  empirically validated upstream).
- **`printMargins`** are TBD per round-1 verification — labelmanager
  uses `{ leftMm: 3, rightMm: 3, topMm: 0, bottomMm: 0 }` for D1; the
  LT-200B's leader/trailer-feed behaviour needs measuring before we
  pin numbers. Until then ship the same `3/3/0/0` defaults and flag
  for re-verification.

### Tier tag — `targetModels: ['letratag']`

Every media entry sets `targetModels: ['letratag']` (a tier tag, not
a list of device keys), and the `LT_200B` device's engine sets
`mediaCompatibility: ['letratag']`. This matches the labelmanager
`['d1']` precedent — `mediaCompatibility` is engine-tier
categorization, not a list of media or device keys. If the family
ever grows wide-cassette or non-standard-protocol siblings, a second
tier tag (`['letratag-wide']`, etc.) is added at that time.

### Picker UX hint — `LetraTagMaterial`

```ts
export type LetraTagMaterial =
  | 'paper'
  | 'plastic'
  | 'plastic-clear'
  | 'metallic'
  | 'iron-on-fabric';
```

`material` is a picker UX hint (preview rendering, sort order). The
encoder does not branch on it.

### What the registry intentionally **omits** in round 1

- The `MEDIA_TYPE` directive byte for each substrate (conflict C5).
  Until the enum is decoded, every entry's encoder path is
  identical: emit a print job that does **not** include
  `MEDIA_TYPE`. Once round 2 maps substrate → byte, the registry
  grows a `mediaTypeByte: number` field per entry.
- "Genuine media required" hardware-enforcement flags. Unlike LW
  550/5XL, the LT-200B does not appear to NFC-lock its media; the
  user guide simply requires "DYMO-branded LT label cassettes" but
  does not (per ysfchn's testing) actually detect cassette presence
  reliably (see C6).

---

## Step 0 — Tracking

- [ ] Read this PLAN end-to-end and accept it.
- [ ] Create `PROGRESS.md` mirroring this file's checkboxes.
- [ ] Pin both source repos. Cite specific files / line ranges in
      commits where bytes are copied verbatim:
      `ysfchn/dymo-bluetooth/dymo_bluetooth/printer.py` and
      `alexhorn/lt200b/job.py`.

## Step 1 — Repo scaffold

Mirror the labelmanager root layout. Files at `~/thermal-label/letratag/`:

- [ ] `LICENSE` — MIT, current year, Mannes Brak.
- [ ] `.github/FUNDING.yml` — copy from labelmanager.
- [ ] `.github/ISSUE_TEMPLATE/hardware_verification.md` — copy and
      retitle for LetraTag (BLE-specific fields: peripheral name,
      observed full service UUID, OS/browser, cassette SKU printed).
- [ ] `.github/workflows/ci.yml`, `release.yml`, `docs.yml` — copy.
- [ ] `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`,
      `eslint.config.js`, `.prettierignore`, `.gitignore`,
      `.gitattributes`, `.githooks/`, `.changeset/config.json` —
      copy verbatim from labelmanager.
- [ ] `README.md` — placeholder (note: web-only in round 1).
- [ ] `HARDWARE.md` — single row for `LT-200B`, status `Untested`.
- [ ] `DECISIONS.md`:
  - **D1** BLE-only device; round 1 is web-only; Node deferred.
  - **D2** Chunked framing lives in core, transport stays neutral.
  - **D3** Encoder defaults to ysfchn's code conventions (axis order,
        bit packing, encoder-side first-row skip, vendor-app chunk-
        index quirk). alexhorn's encoding is implemented as a feature
        flag for A/B verification.
  - **D4** GATT discovery uses UUID-prefix matching (per alexhorn).
  - **D5** Round 1 omits `MEDIA_TYPE` directive entirely until the
        enum is decoded.
  - **D6** Status code 7 ("no cassette") surfaces as a warning at
        most; never blocks. (Per ysfchn: never observed.)
- [ ] `scripts/` — copy build-hardware-table, validate-hardware-status,
      postprocess-api-docs, compile-data.
- [ ] `docs/api/.gitkeep`, `plans/`.

**Gate:** `pnpm install` clean; `pnpm typecheck` `pnpm lint`
`pnpm test` `pnpm build` pass.

## Step 2 — `@thermal-label/letratag-core`

Pure TypeScript, runs in browser and Node, no transport coupling.

### 2.1 Package metadata

- [ ] `packages/core/package.json` — copy labelmanager-core, rename to
      `@thermal-label/letratag-core`. Keywords: `dymo`, `letratag`,
      `bluetooth`, `ble`, `label-printer`, `thermal-label`.
- [ ] Dependencies: `@mbtech-nl/bitmap`, `@thermal-label/contracts`.
      No transport dep.
- [ ] Scripts mirror labelmanager-core.

### 2.2 Device registry (`packages/core/data/devices/<KEY>.json5`)

The labelmanager precedent uses **one JSON5 file per device** under
`data/devices/`, not a single aggregated file. The compile script
(`scripts/compile-data.mjs`) iterates the directory, validates each
entry, asserts `key` uniqueness, and emits `data/devices.json` +
`src/devices.generated.ts`. Mirror this even though LetraTag has only
one device today — it keeps the build pipeline drop-in compatible.

The file's basename **must equal `key`**, UPPER_SNAKE
(`LT_200B.json5`).

```json5
// packages/core/data/devices/LT_200B.json5
{
  key: 'LT_200B',
  name: 'LetraTag LT-200B',
  family: 'letratag',
  transports: {
    'bluetooth-gatt': {
      // Canonical UUIDs. Driver matches by `be3dd650-` prefix and
      // derives characteristic UUIDs from the matched service tail
      // (DECISIONS.md D4).
      serviceUuid: 'be3dd650-2b3d-42f1-99c1-f0f749dd0678',
      txCharacteristicUuid: 'be3dd651-2b3d-42f1-99c1-f0f749dd0678',
      rxCharacteristicUuid: 'be3dd652-2b3d-42f1-99c1-f0f749dd0678',
      namePrefix: 'DYMO LT-200B',
      mtu: 500, // protocol chunk size, NOT the BLE link MTU
    },
  },
  engines: [
    {
      role: 'primary',
      protocol: 'letratag-bt',
      dpi: 200,
      headDots: 32, // protocol value; 30 actually print (DECISIONS.md D3)
      // Tier tag matched against MediaDescriptor.targetModels —
      // labelmanager uses ['d1'], we use ['letratag']. Single tag
      // because every LT cassette runs on the same engine.
      mediaCompatibility: ['letratag'],
    },
  ],
  hardwareQuirks:
    'Lid must be closed and batteries adequately charged before the printer registers a print. Status code 7 (no cassette) is documented but never observed in practice; do not use it for cassette presence detection.',
  support: { status: 'untested' },
}
```

The aggregated `schemaVersion: 1` and `driver: 'letratag'` envelope
is **assembled by the compile script**, not stored in the per-device
file.

**Key vs id, on the contracts level**: `DeviceEntry.key` is
UPPER_SNAKE (`LT_200B`); `MediaDescriptor.id` is kebab-case
(`lt-paper-white`). Don't conflate them — the labelmanager generated
TypeScript types narrow on these literal strings.

### 2.2.1 Compile script fork (`scripts/compile-data.mjs`)

Copy `labelmanager/scripts/compile-data.mjs` and change the
driver-specific constants and validation. Keep the overall shape:
read JSON5 from disk → validate → write `data/*.json` artifacts AND
`src/*.generated.ts` modules using `as const satisfies <Type>`.

- [ ] **Constants**:
  - `DRIVER = 'letratag'`.
  - `KNOWN_PROTOCOLS = new Set(['letratag-bt'])`.
  - `STATUS_VALUES` and `SCHEMA_VERSION` unchanged.
- [ ] **Per-device validation** (replace USB block):
  - **Drop** the USB VID/PID hex-string + collision checks —
    LT-200B has no USB transport.
  - **Add** a `bluetooth-gatt` block check: `serviceUuid`,
    `txCharacteristicUuid`, `rxCharacteristicUuid` must each match
    `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`
    (lowercase, full UUID); `namePrefix` non-empty string; `mtu`
    positive integer.
  - Engine validation (protocol / headDots / dpi / role) unchanged.
- [ ] **Per-media validation** (extend the labelmanager checks):
  - Existing checks: `id` present and unique, `widthMm` numeric,
    `type` string.
  - **Add**: `widthMm === 12` (single tape width), `type === 'tape'`,
    `category === 'cartridge'`, `material` ∈ {`'paper'`, `'plastic'`,
    `'plastic-clear'`, `'metallic'`, `'iron-on-fabric'`}, `text` and
    `background` non-empty strings, `tapeWidthMm === 12`,
    `printableDots === 30`, `targetModels` includes `'letratag'`,
    `skus` is a non-empty array of strings.
- [ ] **Generated TS shape** (mirror labelmanager exactly):
  - `src/devices.generated.ts` exports `DEVICE_REGISTRY` —
    `as const satisfies DeviceRegistry`.
  - `src/media.generated.ts` exports `MEDIA_LIST` —
    `as const satisfies readonly LetraTagMedia[]`.
- [ ] Run as `pnpm --filter @thermal-label/letratag-core compile-data`
      (script lives at the repo root, packages/core/package.json
      forwards via `"compile-data": "node ../../scripts/compile-data.mjs"`).

### 2.3 Media registry (`packages/core/data/media.json5`)

One entry per (substrate, colour) pair from the catalogue table
above. Each entry follows the labelmanager precedent — every
contracts-required field present, driver-extensions appended:

```json5
{
  // Contracts-base fields (MediaDescriptor)
  id: 'lt-paper-white',
  name: '12mm White Paper (LT)',
  widthMm: 12,                              // physical tape width
  type: 'tape',                             // contracts vocabulary
  category: 'cartridge',                    // matches D1 precedent
  targetModels: ['letratag'],               // tier tag, not device key
  defaultOrientation: 'horizontal',         // long axis horizontal when reading
  printMargins: { leftMm: 3, rightMm: 3, topMm: 0, bottomMm: 0 }, // TBV round 1
  skus: ['91200', '91220', '91330', '10697', 'S0721510', 'S0721520'],

  // Driver-extension fields (LetraTagMedia)
  material: 'paper',
  text: 'black',
  background: 'white',
  tapeWidthMm: 12,
  printableDots: 30,
}
```

Repeat for the other nine entries from the catalogue table.

Notes on contracts conformance:

- **`id`** is the registry key — kebab-case, driver-prefixed, unique
  within the driver. Mirrors labelmanager's `'d1-standard-bw-6'`
  pattern. The const export name in TypeScript (`LT_PAPER_WHITE`) is
  separate — the lookup `MEDIA[id]` returns the same record.
- **`widthMm`** (contracts base) and **`tapeWidthMm`** (driver
  extension) both carry `12`. They're not redundant: `widthMm` is
  the contracts-standard physical-width field consumed by
  cross-driver tooling; `tapeWidthMm` is a `TapeWidth` literal-typed
  field consumed by the encoder. Labelmanager carries both.
- **`heightMm`** is omitted — continuous tape has variable per-label
  length per contracts (`heightMm?: number; // Undefined =
  continuous`). The roll length (4 m / 2 m) is a packaging fact, not
  a print-time fact.
- **`skus`** (contracts base) carries every observed US (91XXX) and
  EU (S07XXXXX) part number. This is the contracts-standard field
  for vendor SKUs — no `alternativePartNumbers` field.
- **`palette`** is omitted — single-ink media. Driver renders via
  `renderImage` (luminance threshold), per the contracts
  `MediaDescriptor.palette` docstring.
- **`cornerRadiusMm`** is omitted — not die-cut.

`DEFAULT_MEDIA = LT_PAPER_WHITE` (ships in the box).

### 2.4 Types (`src/types.ts`)

Mirror the labelmanager `types.ts` structure: extend the contracts
base interfaces with driver-specific fields, never re-declare base
fields with the same name.

- [ ] `LetraTagDevice = DeviceEntry & { family: 'letratag' }`.
- [ ] `LetraTagMaterial` — `'paper' | 'plastic' | 'plastic-clear' |
      'metallic' | 'iron-on-fabric'` (picker UX hint; encoder does
      not branch on it).
- [ ] `LetraTagMedia extends MediaDescriptor` with **driver-only**
      fields:
  - `type: 'tape'` (literal narrowing of base `type: string`).
  - `tapeWidthMm: 12` (literal-typed; mirrors labelmanager's
    `TapeWidth`, but LT only ships at 12 mm so a literal-12 type is
    enough).
  - `printableDots: 30`.
  - `material?: LetraTagMaterial`.
  - `text?: string` (printed ink colour, named).
  - `background?: string` (substrate colour, named).
  - **No** `alternativePartNumbers` — contracts has `skus` for that.
  - **No** `lengthMm` — `heightMm` is the contracts field for
    per-label height; continuous tape leaves it undefined. Roll
    length is informational only and lives in docs.
- [ ] `LetraTagPrintOptions extends PrintOptions`:
  - **Inherited from base**: `copies`, `density`, `engine` — all
    optional. The encoder **ignores `density`** because
    `PRINT_DENSITY` is documented unused upstream. We do not throw
    `UnsupportedOperationError` on a `density` value: silently
    ignore, since `'normal'` is universally supported per contracts.
  - `engine` is ignored on this single-engine device.
  - **Driver extensions**:
    - `rotate?: 'auto' | 0 | 90 | 180 | 270`.
    - `encoding?: 'ysfchn' | 'alexhorn'` — feature-flag for the
      wire-format A/B (see C1, C2). **Default: `'ysfchn'`.** Drop
      this field after round-1 verification confirms one direction.
    - `chunkIndexQuirk?: boolean` — when `true` (default), skips
      chunk index `27` per ysfchn's vendor-app mirroring (C4); when
      `false`, emits sequential indices per alexhorn. Exposed
      runtime so the debug harness in §Step 4 can A/B both. Drop
      this field once verified.
    - `emitMediaType?: { byte: number }` — round-1 default
      `undefined` (do not emit). The debug harness exposes a
      numeric input so a tester can poke values for C5 without
      shipping a public API.
  - **No** `cassetteType` in round 1 — defer until C5 resolves.

### 2.5 Protocol encoder (`src/protocol.ts`)

Implement bottom-up, citing
`ysfchn/dymo-bluetooth/dymo_bluetooth/printer.py` for byte-level
choices.

- [ ] **Directives** — pure constructors, mirror
      `DirectiveBuilder`:
  - `START` → `[0x1B, 0x73, 154, 2, 0, 0]` (ysfchn job ID
    `[154, 2, 0, 0]`; "Without that, printer won't print anything
    but a small blank label").
  - `MEDIA_TYPE(byte)` → `[0x1B, 0x4D, byte]` (defined; not emitted
    in round 1 per D5).
  - `PRINT_DATA(width, height, image)` →
    `[0x1B, 0x44, 0x01, 0x02, ...u32le(width), ...u32le(height),
    ...image]`.
    Per ysfchn: `width = feed`, `height = 32`. Alexhorn alternate:
    `width = 32`, `height = feed`. Switch behind
    `LetraTagPrintOptions.encoding`.
  - `FORM_FEED` → `[0x1B, 0x45]`
  - `STATUS` → `[0x1B, 0x41]`
  - `END` → `[0x1B, 0x51]`
  - `PRINT_DENSITY` — declared but unused.
- [ ] **Image encoding** — two strategies behind the
      `encoding` flag:
  - `encodeBitmapYsfchn(bitmap)`:
    - Input: head-aligned bitmap, 32 dots tall (across head),
      `width` long (along feed). 30 of the 32 are printable; the
      encoder maps user pixel `(x_feed, y_head ∈ 0..29)` to
      protocol `y' = y_head + 1` to leave bit 7 of byte 3
      empty (the "skip first row" mechanism baked into ysfchn's
      `Canvas`).
    - For each feed column `x`, emit 4 bytes packed
      column-major, big-byte-order, big-bit-order: pixel at
      `y' = 1` → byte 3 bit 6 = `0x40`; pixel at `y' = 7` → byte
      3 bit 0; pixel at `y' = 8` → byte 2 bit 7; …
      pixel at `y' = 31` → byte 0 bit 0.
    - Total bytes: `4 × feed_count`. Pad with `0x00` for any
      missing rows.
  - `encodeBitmapAlexhorn(bitmap)`:
    - Pack each scanline of 32 across-head pixels LSB-first into
      4 bytes. `feed_count` scanlines stack along feed.
    - Single pixel at `(0, 0)` → first 4 bytes = `01 00 00 00`.
- [ ] **Magic** — `MAGIC = [0x12, 0x34]`.
- [ ] **Header** (`buildHeader(payloadLength)`):
  - 9 bytes: `[0xFF, 0xF0, 0x12, 0x34, ...u32le(payloadLength),
    checksum]`.
  - `checksum = (sum of preceding 8 bytes) & 0xFF`.
  - Mirror ysfchn's `assert len(header) == 9`.
- [ ] **Payload assemblers**:
  - `buildPrintPayload(image)` →
    `START + PRINT_DATA + FORM_FEED + STATUS + END`.
  - `buildMediaTypePayload(byte)` — declared, not invoked round 1.
- [ ] **Chunker** (`chunkPayload(payload, isPrint): Uint8Array[]`):
  - Returns the full ordered write list including the 9-byte header
    as the first entry. Mirrors ysfchn's
    `create_payload(...)` generator shape.
  - For non-print payloads: header + raw data appended (no
    chunking; ysfchn's `if not is_print` branch). Set-media-type
    falls here.
  - For print payloads:
    1. Header is its own write.
    2. Body sliced into 500-byte windows. Index byte per chunk:
       when `options.chunkIndexQuirk !== false` (default true),
       `chunkIndex = i + 1 if i >= 27 else i` per ysfchn's vendor-
       app mirroring; when `chunkIndexQuirk === false`, sequential
       per alexhorn. Both paths covered by tests; the runtime
       toggle is what the debug harness exercises (§Step 4 / T6).
    3. **Final chunk only**: append `MAGIC` (`0x12 0x34`).
- [ ] **Top-level**:
  - `encodeLabel(bitmap, options): Uint8Array[]` — full write list
    for one print job.
  - `encodeSetMediaType(byte): Uint8Array[]` — declared; not invoked
    in round 1.

### 2.5.1 Public API surface (`src/index.ts`)

Mirror labelmanager-core's `index.ts` shape exactly. Two key things
to internalise from the labelmanager precedent before listing
exports:

- **Devices are accessed via `DEVICES.LT_200B`**, not via a
  per-device top-level const. `devices.ts` builds `DEVICES =
  Object.fromEntries(DEVICE_REGISTRY.devices.map(d => [d.key, d]))`
  with a literal-typed key map, so `DEVICES.LT_200B` is fully typed.
- **Media has both patterns**: `MEDIA[id]` for the keyed-by-id map,
  `MEDIA_LIST` for the array, **plus** named const exports for
  canonical defaults — labelmanager's `TAPE_12MM` /
  `DEFAULT_MEDIA`. Reach for the named const only for the **default
  used in offline previews**, not for every media entry.

`src/devices.ts` implementation:

```ts
import { DEVICE_REGISTRY } from './devices.generated.js';
import type { LetraTagDevice } from './types.js';

export const DEVICE_REGISTRY_DATA = DEVICE_REGISTRY;

type DeviceKey = (typeof DEVICE_REGISTRY)['devices'][number]['key'];

export const DEVICES = Object.fromEntries(
  DEVICE_REGISTRY.devices.map(d => [d.key, d]),
) as unknown as Record<DeviceKey, LetraTagDevice>;
```

**No `findDevice(vid, pid)` helper** — that signature is USB-only
and labelmanager's version doesn't apply here. Round 1 has a single
device, so callers just use `DEVICES.LT_200B`. If a second LT-family
model ever ships, the appropriate lookup is by service UUID prefix
or by name prefix — neither of which has a clean equivalent today
in contracts' `OpenOptions`. Defer until needed.

`src/media.ts` implementation mirrors labelmanager's pattern:

```ts
import { MEDIA_LIST } from './media.generated.js';
import type { LetraTagMedia } from './types.js';

type MediaId = (typeof MEDIA_LIST)[number]['id'];

const MEDIA_BY_ID = Object.fromEntries(MEDIA_LIST.map(m => [m.id, m])) as unknown as Record<
  MediaId,
  LetraTagMedia
>;

export const MEDIA = MEDIA_BY_ID;
export { MEDIA_LIST };

// Canonical default — ships in the box, single named const.
// Don't add per-entry exports for every cassette colour.
export const LT_PAPER_WHITE: LetraTagMedia = MEDIA_BY_ID['lt-paper-white'];
export const DEFAULT_MEDIA: LetraTagMedia = LT_PAPER_WHITE;

export function findMediaBySku(sku: string): LetraTagMedia | undefined {
  return MEDIA_LIST.find(m => m.skus?.includes(sku));
}
```

**`findMediaBySku`** is genuinely new (not "mirrored from
labelmanager" — labelmanager only has `findMediaByTapeWidth`, which
doesn't apply to a single-width family). The helper is justified
because LT cassettes have many regional SKUs and "is this SKU
supported?" is a real question for callers; flag it in the
PROGRESS.md as the one helper that diverges from the precedent.

`src/index.ts` re-exports:

- [ ] **From `@mbtech-nl/bitmap`**: types `LabelBitmap`,
      `PaletteEntry`, `RawImageData`; values `renderImage`,
      `renderText`.
- [ ] **From `@thermal-label/contracts`** (types only):
      `DeviceEntry`, `DeviceRegistry`, `DeviceSupport`,
      `MediaDescriptor`, `PreviewOptions`, `PreviewPlane`,
      `PreviewResult`, `PrintEngine`, `PrintOptions`,
      `PrinterAdapter`, `PrinterError`, `PrinterStatus`,
      `RotateDirection`, `SupportStatus`, `Transport`,
      `TransportType`.
- [ ] **From `@thermal-label/contracts`** (values):
      `MediaNotSpecifiedError`, `pickRotation`.
- [ ] **Driver-local**:
  - `PROTOCOLS = new Set(['letratag-bt'])`.
  - From `./devices.js`: `DEVICE_REGISTRY_DATA`, `DEVICES`.
  - From `./media.js`: `MEDIA`, `MEDIA_LIST`, `DEFAULT_MEDIA`,
    `LT_PAPER_WHITE`, `findMediaBySku`.
  - From `./orientation.js`: `ROTATE_DIRECTION`.
  - From `./protocol.js`: `encodeLabel`, `encodeSetMediaType`,
    `buildHeader`, `chunkPayload`.
  - From `./status.js`: `STATUS_REQUEST`, `parseStatus`.
  - From `./preview.js`: `createPreviewOffline`.
  - **Types**: `LetraTagDevice`, `LetraTagMaterial`,
    `LetraTagMedia`, `LetraTagPrintOptions`.

### 2.6 Status parser (`src/status.ts`)

Mirror labelmanager's `parseStatus` shape — always returns
`PrinterStatus` (never throws on protocol-valid bytes; malformed
input still returns a `PrinterStatus` with appropriate errors). The
contracts type is `PrinterStatus`, not `PrinterStatus | PrinterError`
— `PrinterError` is a member of `PrinterStatus.errors[]`.

- [ ] `STATUS_NOTIFICATION_LENGTH = 3`.
- [ ] `STATUS_REQUEST = new Uint8Array([0x1B, 0x41])` (exported for
      callers that want to poll outside a print job, gated on C7).
- [ ] `parseStatus(bytes: Uint8Array): PrinterStatus`:
  - On length < 3 or prefix mismatch (`bytes[0] !== 0x1B || bytes[1]
    !== 0x52`): return `{ ready: false, mediaLoaded: true, errors:
    [{ code: 'protocol', message: 'Invalid status frame' }],
    rawBytes: bytes }`.
  - Otherwise map `bytes[2]` to `errors[]` entries (mirroring
    labelmanager's pattern of "one PrinterError per condition"):
    - `0` → `errors: []`, `ready: true` (printed; see hardwareQuirks)
    - `1` → same as 0 (alias per ysfchn `Result.from_bytes`)
    - `2` → `[{ code: 'unknown_failure', message: 'Print failed' }]`
    - `3` → `[{ code: 'low_battery', message: 'Battery low; printed
      anyway' }]` (warning; `ready: true`)
    - `4` → `[{ code: 'cancelled', message: 'Job cancelled' }]`
    - `5` → same as 2
    - `6` → `[{ code: 'battery_too_low', message: 'Battery too low to
      print' }]`
    - `7` → `[{ code: 'cassette_missing', message: 'Cassette
      missing (unreliable signal — see hardwareQuirks)' }]` —
      surface as a `PrinterError` so consumers can see it, but per
      D6 do not treat the absence of code 7 as evidence the cassette
      is present.
  - **`mediaLoaded`**: always `true` — the LT-200B has no reliable
    cassette-detection signal (D6, C6). Setting `false` here would
    mislead callers. The `cassette_missing` error is surfaced via
    `errors[]` only when the printer claims it.
  - **`detectedMedia`**: always `undefined` — LT has no media
    introspection over the wire. Same posture as labelmanager.
  - **`rawBytes`**: pass through.
  - **`ready`**: derive from no failure-class errors present.

### 2.7 Preview (`src/preview.ts`)

- [ ] `createPreviewOffline(input, options): PreviewResult` — mirror
      labelmanager-core. Single-plane, single-ink. The preview
      colour pair derives from the selected media's
      `text`/`background` fields so a "print to silver metallic"
      preview shows black on grey, etc.

### 2.8 Tests (`packages/core/src/__tests__/`)

- [ ] `devices.test.ts` — registry shape, `findDevice('LT_200B')`,
      UUID-prefix derivation helper.
- [ ] `media.test.ts` — registry shape, every entry has unique key,
      every entry's `targetModels` includes `LT_200B`, every
      `alternativePartNumbers` entry is a non-empty string,
      `DEFAULT_MEDIA === LT_PAPER_WHITE`.
- [ ] `protocol.test.ts` — pin every byte:
  - Each directive byte-for-byte.
  - START contains the `154, 2, 0, 0` job ID.
  - `encodeBitmapYsfchn`: single black pixel at `(x=0, y=0)` → first
    4 bytes = `00 00 00 40`. Full black scanline → `FF FF FF FE`
    (note: bit 7 of byte 3 stays clear due to `y+1` skip).
    All-white 32×32 → 128 zero bytes.
  - `encodeBitmapAlexhorn`: single black pixel at origin →
    `01 00 00 00`. Full black scanline → `FF FF FF FF`.
  - `it.todo('ysfchn README example: 00 00 00 80 — verify against
    hardware before deleting')`.
  - Header for known payload length — pin checksum against ysfchn's
    `_calculate_checksum` reference.
  - Chunker: 9-byte header alone, then chunks at 0/499/500/501
    bytes; verify last chunk has `MAGIC` trailer.
  - Chunker: 28th chunk has index `28` (skips 27) per ysfchn.
  - `buildPrintPayload` length matches
    `6 + (10 + 4 × feed_count) + 2 + 2 + 2`.
- [ ] `status.test.ts` — every code 0..7 maps correctly (including
      the 1↔0 and 5↔2 aliases); malformed packets reject; length
      under 3 rejects.
- [ ] `preview.test.ts` — golden snapshot per substrate variant.

**Gate:** `pnpm -F core typecheck && pnpm -F core lint && pnpm -F
core test && pnpm -F core build`.

## Step 3 — `@thermal-label/letratag-web`

The only transport-bound package in round 1.

- [ ] `packages/web/package.json` — peerDeps on `letratag-core` and
      `@thermal-label/transport` (pin to a version that ships
      `WebBluetoothTransport`).
- [ ] `src/discovery.ts`:
  - `requestPrinter(options?)` — `navigator.bluetooth.requestDevice`
    with filter from `LT_200B.transports['bluetooth-gatt']`
    (`namePrefix` and `services: [serviceUuid]`).
  - Walk `gatt.getPrimaryServices()`; locate the service whose UUID
    starts with `be3dd650-`. Derive TX (`be3dd651-…`), RX
    (`be3dd652-…`), and aux (`be3dd653-…`) characteristic UUIDs by
    replacing the first 8 hex digits.
  - Subscribe to RX notifications. Wrap the resolved characteristics
    in a `WebBluetoothTransport`.
- [ ] `src/printer.ts` — `LetraTagPrinter implements PrinterAdapter`.
      The full `PrinterAdapter` contract surface (per
      `@thermal-label/contracts/src/adapter.ts`):
  - **Required readonly properties**:
    - `family: 'letratag'` (literal).
    - `model: string` — from `device.name` (e.g.
      `'LetraTag LT-200B'`).
    - `connected: boolean` — delegate to `transport.connected`.
    - `device?: DeviceEntry` — the matched `LT_200B` entry.
  - **`print(image, media?, options?): Promise<void>`**:
    1. Resolve media: passed-in argument > `DEFAULT_MEDIA`. Throw
       `MediaNotSpecifiedError` only if both are absent (cannot
       happen in round 1 because we always default).
    2. `pickRotation(image, media)` for orientation, then
       `renderImage(image, …)` to a 1bpp bitmap (single-ink media,
       `palette` undefined per contracts).
    3. `encodeLabel(bitmap, options)` → `Uint8Array[]`.
    4. For each chunk in order, `await transport.write(chunk)`.
       Yield to the event loop between chunks.
    5. Best-effort status read: try `transport.read(3, timeout)`,
       parse via `parseStatus`, store as last-known status. On
       timeout, log a warning and resolve successfully (alexhorn
       never reads; ysfchn does — round-1 confirms).
    6. If the parsed status has any non-warning error, throw an
       `Error` carrying the `PrinterError.message`. Warnings (e.g.
       low battery) resolve successfully.
  - **`createPreview(image, options?): Promise<PreviewResult>`** —
    delegate to `createPreviewOffline` from `letratag-core`. Pass
    the resolved media's `text` / `background` colours so the
    preview reflects the loaded cassette. Set `assumed: true` if the
    caller did not pass media and no status has been received.
  - **`getStatus(): Promise<PrinterStatus>`** — return the
    last-known status from the most recent print, or a default
    `{ ready: true, mediaLoaded: true, errors: [], rawBytes: new
    Uint8Array() }` if no print has run. Standalone status query
    (sending only `STATUS` directive without a job) is not exposed
    until C7 resolves.
  - **`onStatus?`** — omit; the LT-200B does not push spontaneous
    notifications outside a print job. Consumers fall back to
    polling `getStatus()`.
  - **`close(): Promise<void>`** — delegate to `transport.close()`.
- [ ] `src/index.ts` — re-export `requestPrinter`, `LetraTagPrinter`,
      `PROTOCOLS`, types.
- [ ] Tests with a fake `Transport` confirm full-job byte stream
      matches `encodeLabel` exactly; final chunk carries `MAGIC`.

**Gate:** typecheck, lint, test, build.

## Step 4 — Debug & verification harness (docs site)

The maintainer (me) does not own an LT-200B. Round-1 verification
lives across a fence: a friend with the device runs tests in a
browser, and the captured byte-level evidence comes back as JSON +
photos. This step builds the harness — a debug page on the docs
site — that makes that workflow ergonomic enough to actually happen.

**Existing demos are not enough.** `LabelManagerDemo.vue` etc. are
type-text-and-print pages backed by a USB-only `useUsbPairing.ts`
composable. LetraTag needs:

- BLE pairing (no USB equivalent in this org's docs stack today).
- Bidirectional byte capture surfaced in the UI — TX writes and RX
  notifications are the data of interest, not just "did it print".
- Pre-baked test patterns mapped 1:1 to the wire-format conflicts
  C1–C9 (see "Wire-format conflicts" earlier in this doc).
- Encoder feature-flag toggles (ysfchn vs alexhorn axis / packing /
  chunk-index) exposed as UI controls so the friend can A/B them.
- A "copy diagnostics JSON" button that produces a single
  paste-able blob covering everything the maintainer needs to debug
  remotely.

### 4.1 Shared scaffolding additions

Live in `thermal-label.github.io/docs/.vitepress/components/LiveDemo/shared/`:

- [ ] **`useBlePairing.ts`** — BLE-pairing composable, parallel to
      `useUsbPairing.ts`. Same return shape (`printer`, `connect`,
      `disconnect`, `runPrint`, `printerName`, `isConnecting`,
      `isPrinting`, `statusMessage`, `statusType`) **plus**
      BLE-specific observables:
  - `serviceUuidObserved: Ref<string | null>` — full UUID of the
    matched primary service (for C8 verification).
  - `linkMtu: Ref<number | null>` — best-effort BLE link MTU; `null`
    when the browser doesn't expose it.
  - Event hooks `onTx(cb)` and `onRx(cb)` so a debug-log component
    can subscribe to every byte that crosses the wire.
- [ ] **`BleDebugLog.vue`** — scrolling list of TX / RX events:
      timestamp, direction, byte length, hex dump (truncated past
      64 bytes with "…+N more"), and for RX, the parsed
      `PrinterStatus` decoded by `parseStatus`. Auto-scroll with a
      "pause" toggle so the friend can inspect a frame mid-flow.
      Clear-log button.
- [ ] **`DiagnosticsExport.vue`** — "Copy diagnostics JSON" +
      "Download .json" + "Download all photos as .zip" (the photo
      flow uses an `<input type="file" multiple>` so the friend
      drops in pictures of the printed labels and they get bundled
      into the export). Schema described in §4.4.

### 4.2 The debug demo component (`LetraTagDebugDemo.vue`)

Lives at
`docs/.vitepress/components/LiveDemo/LetraTagDebugDemo.vue`. Bigger
than the other demos because it bundles the full verification
matrix.

Sections, top to bottom:

- [ ] **Connection panel.** `DevicePairButton` ("Connect via Web
      Bluetooth") plus, once connected, a read-only details block:
      device name, observed service UUID, derived TX/RX/aux UUIDs,
      best-effort link MTU, browser/OS user-agent string. All of
      this gets exported in the diagnostics JSON.
- [ ] **Test pattern selector.** Radio group, one option per test
      below (each option pre-fills the encoder controls and the
      payload). Mirrors the round-1 tests:
  - **T1** Single pixel at `(0, 0)` (C2 — bit packing).
  - **T2** Asymmetric rectangle 32×16 (C1 — axis order).
  - **T3** Stripes across head, alternating rows 0..31 (C3 —
    printable region).
  - **T4** Status capture — paired buttons "Print normal", "Print
    with cassette removed (you remove it)", "Print with low
    battery". The label is identical across the three; only the
    captured RX matters (C6, C7).
  - **T5** UUID variance — passive; just records the observed
    UUID into the diagnostics JSON. Active only if a second
    LT-200B is connected.
  - **T6** Long payload (≥ 28 chunks, synthesised to ~14 KiB by
    repeating a tall checkerboard). Has a sub-toggle "chunk
    indexing: ysfchn (skip 27) | alexhorn (sequential)" — the
    friend prints both variants and reports which printed.
  - **T7** Substrate sweep — same payload as T2; the friend swaps
    cassettes between prints and tags each export with the SKU
    field on the export form.
  - **Custom** — free-form text + tape preview, mirrors the
    other-driver demos. This is the "test label" the user
    requested for casual ad-hoc prints.
- [ ] **Encoder controls** (above the print button so they're easy
      to flip mid-test):
  - `encoding: 'ysfchn' | 'alexhorn'` — radio.
  - `chunkIndexQuirk: boolean` — checkbox (default on, matches T6
    but exposed for any test).
  - `emitMediaType: boolean` (round-1 default off) + numeric input
    for the byte value, for opportunistic poking at C5.
- [ ] **Preview** — `BitmapPreview` showing the bitmap that will be
      sent. Aspect-corrected for the 30-printable-row reality.
- [ ] **Print button** + status panel from the shared kit.
- [ ] **`BleDebugLog`** — live trace, default visible (this is the
      whole point of the page).
- [ ] **`DiagnosticsExport`** at the bottom.

### 4.3 The page (`docs/demo/letratag.md`)

Mirrors the other `demo/<driver>.md` files: thin wrapper that
imports the Vue component inside `<ClientOnly>`. Lead paragraph
calls out:

- Web Bluetooth required (Chrome / Edge, secure context, user
  gesture for `requestDevice`).
- The page is a **debug & verification harness**, not a polished
  consumer demo — it's wired up so test results can be exported and
  shared back. The richer "design and print" demo lives on
  burnmark.io (per the docs/burnmark split established for other
  drivers).
- Direct link to the GitHub issue template for filing a
  verification report (see §4.5).

### 4.4 Diagnostics export schema

The "Copy JSON" button produces this shape — keep it stable across
sessions so the maintainer can parse it programmatically:

```json5
{
  schemaVersion: 1,
  capturedAt: '<ISO-8601>',
  test: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'CUSTOM',
  reporter: { name: '<friend>', githubHandle: '<optional>' },
  environment: {
    userAgent: '<navigator.userAgent>',
    platform: '<navigator.platform>',
    locale: '<navigator.language>',
  },
  device: {
    name: '<bluetoothDevice.name>',
    serviceUuidObserved: '<full UUID>',
    txUuidDerived: '<full UUID>',
    rxUuidDerived: '<full UUID>',
    auxUuidDerived: '<full UUID>',
    linkMtu: <number | null>,
  },
  cassette: {
    sku: '<user-entered or null>',
    material: '<user-entered or null>',
    background: '<user-entered or null>',
  },
  encoder: {
    encoding: 'ysfchn' | 'alexhorn',
    chunkIndexQuirk: true | false,
    emitMediaType: false,
    mediaTypeByte: null,
    libraryVersion: '<from letratag-core package.json>',
  },
  payload: {
    bitmapWidth: <number>,
    bitmapHeight: <number>,
    bitmapBase64: '<for replay; gzip+base64 of the 1bpp bitmap>',
    chunkCount: <number>,
    totalBytes: <number>,
  },
  trace: [
    { t: <ms-since-capture-start>, dir: 'tx', hex: '<bytes>' },
    { t: <ms>, dir: 'rx', hex: '<bytes>', parsed: { ready: <bool>, errors: [...] } },
    // ...
  ],
  notes: '<free-text from the friend>',
}
```

The `bitmapBase64` field lets the maintainer **replay** the exact
job in a unit test or in the `letratag-web` package against a fake
transport, comparing the captured trace against
`encodeLabel(bitmap, options)` byte-for-byte. This is the load-
bearing piece — without it, "the print looked wrong" is unfalsifiable.

### 4.5 Reporting flow

- [ ] Update the existing
      `.github/ISSUE_TEMPLATE/hardware_verification.md` (Step 1) to
      include three required attachments per report:
  1. Diagnostics JSON (paste or attach `.json`).
  2. One photo per printed label, taken close enough that
     individual dots are countable on the test patterns where it
     matters (T1, T3).
  3. The cassette SKU and a photo of the cassette itself for T7.
- [ ] Issue template prefilled with a checklist of the seven tests;
      the friend ticks each one off as they run.

### 4.6 Maintainer-side replay tooling

Reading the JSON by hand doesn't scale past one report. Build a
tiny CLI harness that ingests the export and validates it:

- [ ] `scripts/replay-trace.mjs` (in the letratag repo, not the docs
      site) — accepts a path to a diagnostics JSON, decodes
      `bitmapBase64`, calls `encodeLabel(bitmap, options)` with the
      report's encoder settings, and compares the resulting byte
      stream to `trace[].hex` filtered to TX. Prints a unified diff
      of expected vs observed bytes. This is what closes the loop:
      the friend prints, exports, the maintainer runs
      `pnpm replay <file.json>`, and the encoder either matches the
      wire reality or doesn't.
- [ ] Save the replay output alongside the report under
      `support.reports[].notes` so historical traces remain
      auditable.

**Gate checks for Step 4:** typecheck + lint pass on the docs site;
the demo component renders and pairs against a stub
`Bluetooth` API in a Vitest jsdom test. The page builds cleanly under
`pnpm docs:build` on the docs site repo.

## Step 5 — Hardware verification (round 1)

With Step 4's harness in place, the friend runs through this
matrix in the browser. The exit criteria for each test is
"diagnostics JSON pasted into the verification issue + photo
attached + maintainer's `replay-trace.mjs` either matches or
reveals the discrepancy".

- [ ] **Test 1 — single pixel** at `(x_feed=0, y_head=0)`,
      `encoding: 'ysfchn'`. Confirms C2 (bit packing). If the dot
      lands in the wrong row/column, switch encoder to
      `'alexhorn'`, re-export, repeat.
- [ ] **Test 2 — asymmetric rectangle** 32 × 16. Confirms C1 (axis
      order). If the print is 32 across the head and 16 along the
      feed, ysfchn's order is correct.
- [ ] **Test 3 — striped pattern** across head, rows 0..31.
      Identifies which dots actually print (C3). Updates
      `printableDots` / adds a `printableOffset` field to the media
      descriptor as the result demands.
- [ ] **Test 4 — status capture**. Three prints (normal / cassette
      removed / low battery). Confirms whether code 7 ever fires
      (C6) and the timing relative to the form-feed (C7).
- [ ] **Test 5 — UUID variance**. Passive capture during any other
      test. If a second LT-200B is available later, repeat (C8).
- [ ] **Test 6 — chunk-index quirk**. Long payload, both
      `chunkIndexQuirk = true` and `false`. Confirms whether the
      vendor-app quirk is load-bearing or vestigial (C4). If both
      print, prefer the simpler sequential variant going forward.
- [ ] **Test 7 — substrate sweep**. Same payload across at least
      three cassette types (paper, plastic, metallic). Verifies the
      encoder is media-agnostic in round 1 (C5 deferred to later
      rounds anyway).

Each test result lands as a row under `support.reports[]` on
`LT_200B` with the diagnostics JSON inlined or linked. Bump
`support.status` to `partial` once T1+T2+T3 pass; to `verified`
once T1–T7 all resolve cleanly.

If any test invalidates an assumption, fix the encoder, ship a
patch release of `letratag-core`, ask the friend to re-run on the
new published version (the diagnostics JSON records
`encoder.libraryVersion` so we can see when they updated).

## Step 6 — CLI integration

Round 1 is web-only, so the `thermal-label-cli` integration waits on
`letratag-node` (future round). No CLI changes in this round.

- [ ] Open a tracking issue on `thermal-label/cli` referencing this
      plan and the eventual Node-BLE transport.

## Step 7 — Docs site (`thermal-label.github.io`)

- [ ] Add `letratag` to `pull-driver-docs` config so
      `thermal-label.github.io/letratag/` builds.
- [ ] Hardware page `hardware/letratag/lt-200b.md` — image, BLE UUIDs,
      MTU, status code table, known quirks (cassette-detection
      myth), verification status.
- [ ] Wire-protocol page `letratag/protocol.md` — link both upstream
      sources, reproduce byte-level tables, document conflicts C1–C6
      with the chosen direction.
- [ ] Media page `letratag/media.md` — full LT cassette catalogue
      with images, lengths, SKUs (US + EU). Cross-link to the docs
      site's cross-driver media table.
- [ ] Getting-started + web pages from the labelmanager template. No
      Node page in round 1.
- [ ] **Debug demo page** — already built in §Step 4
      (`docs/demo/letratag.md` + `LetraTagDebugDemo.vue`); this step
      just registers it in the docs sidebar / nav. **Stays
      published after round 1** as the long-lived debugging surface
      for any future LT-family work, not just verification. Link
      from the hardware page and the protocol page.
- [ ] **No standalone `LiveDemos` entry like the other drivers' "type
      text and print" demos.** The debug page subsumes that role
      via its T-CUSTOM mode; the polished consumer demo lives on
      burnmark.io per the docs/burnmark split.

## Step 8 — Release

- [ ] Changesets release: `letratag-core` + `letratag-web` `0.1.0`.
- [ ] Update `HARDWARE.md` once a verified report lands.
- [ ] Note on the org-level coverage tracker that LT-200B is web-
      only in round 1; full coverage waits on the Node BLE round.

---

## Future rounds (not in scope)

- **Node BLE transport.** Out of scope. We are not adopting `noble`.
  Candidates to evaluate next round: `webbluetooth` (Node-side
  polyfill), `node-ble` (D-Bus / BlueZ — Linux-only), or a
  CLI-helper approach shelling out to `bluetoothctl` + `gatttool`.
  Decide in a separate plan once the protocol is verified on web.
- **`thermal-label-cli` integration** — depends on Node round.
- **`MEDIA_TYPE` enum byte values** (C5) — needs a BLE sniff while
  changing cassettes. Defer.
- **Aux characteristic `be3dd653`** (listed "Unknown" upstream) —
  may carry battery / firmware / serial. Explore opportunistically.
- **Encoder cleanup** — once round-1 verification picks a winner,
  remove the `encoding` flag and the loser's code.

## Open questions deferred to a later round

- Whether `getStatus()` works as a standalone directive outside a
  print job (upstream documents status only inside the print flow).
- Whether multiple labels can be queued in one BLE session or each
  print needs a fresh connection.
- Whether the `index` byte wraps cleanly at 256 chunks.
- Cassette-substrate enum byte values for `MEDIA_TYPE`.
- Whether the host-side tape-colour picker is purely a UI hint or
  whether it changes anything on the wire (it almost certainly is
  UI-only, but confirm via sniff).
- Full UUID variance across LT-200B units (Test 5 only addresses
  this if a second unit is available).
