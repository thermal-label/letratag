# core/src

## Interfaces

| Interface | Description |
| ------ | ------ |
| [LetraTagMedia](interfaces/LetraTagMedia.md) | DYMO LetraTag media descriptor. |
| [LetraTagPrintOptions](interfaces/LetraTagPrintOptions.md) | Public LetraTag print options. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [LetraTagDevice](type-aliases/LetraTagDevice.md) | DYMO LetraTag device entry. Alias for the contracts `DeviceEntry` narrowed to `family: 'letratag'`. |
| [LetraTagMaterial](type-aliases/LetraTagMaterial.md) | LT cassette substrate family. Picker / preview UX hint — the rasterizer does not branch on this. |

## Variables

| Variable | Description |
| ------ | ------ |
| [BODY\_CHUNK](variables/BODY_CHUNK.md) | Protocol-level upper bound on body bytes per BLE write; ceiling when no `mtu` is provided to `chunkPayload`. Effective chunk size is `min(BODY_CHUNK, mtu - 1)` — see docs/protocol/letratag-bt.md. |
| [CUT\_AT\_END](variables/CUT_AT_END.md) | `CUT` command byte for "cut at the end of this copy". |
| [CUT\_SUPPRESS](variables/CUT_SUPPRESS.md) | `CUT` command byte for "suppress cut (intermediate copy)". |
| [DEFAULT\_MEDIA](variables/DEFAULT_MEDIA.md) | - |
| [DEVICE\_REGISTRY\_DATA](variables/DEVICE_REGISTRY_DATA.md) | Compiled `DeviceRegistry` for the LetraTag driver. Source of truth lives in `packages/core/data/devices/<KEY>.json5`; `scripts/compile-data.mjs` aggregates them into the generated TS module imported here. |
| [DEVICES](variables/DEVICES.md) | Registry of supported LetraTag devices, keyed by the device's stable `key` field (`LT_200B`). Values are the full contracts `DeviceEntry`. |
| [END](variables/END.md) | `[0x1B, 0x51]` — end of job marker. |
| [FORM\_FEED](variables/FORM_FEED.md) | `[0x1B, 0x45]` — paper feed. Not emitted on the LT-200B path. |
| [LT\_PAPER\_WHITE](variables/LT_PAPER_WHITE.md) | Canonical default — the white-paper cassette ships in the box with every LT-200B. Single named const, not a per-cassette export. |
| [MAGIC](variables/MAGIC.md) | Magic bytes appended to the **last** chunk of a print payload. |
| [MEDIA](variables/MEDIA.md) | Indexed registry of every LT cassette SKU the driver knows about, keyed by entry id (e.g. `MEDIA['lt-paper-white']`). |
| [MEDIA\_LIST](variables/MEDIA_LIST.md) | - |
| [PRINTABLE\_DOTS](variables/PRINTABLE_DOTS.md) | Conventional "printable rows" — the height we recommend authoring to so labels survive any chassis-mechanical clipping. The wire format does not enforce this; it's a media-side fact. |
| [PROTOCOL\_HEAD\_FRAME](variables/PROTOCOL_HEAD_FRAME.md) | Wire-format frame height — `PRINT_DATA.height` is always 32. The encoder centres shorter source bitmaps within these 32 rows by inserting zero-rasterlines top and bottom. |
| [PROTOCOLS](variables/PROTOCOLS.md) | Wire protocols this core's encoder produces correct bytes for. Pair with `DEVICE_REGISTRY_DATA` and `resolveSupportedDevices` from `@thermal-label/contracts` to filter a device list to what this runtime can drive. |
| [ROTATE\_DIRECTION](variables/ROTATE_DIRECTION.md) | Direction the LetraTag print head rotates landscape input. |
| [START](variables/START.md) | `[0x1B, 0x73, 154, 2, 0, 0]` — start of a print job. |
| [STATUS](variables/STATUS.md) | `[0x1B, 0x41]` — request a status notification. |
| [STATUS\_NOTIFICATION\_LENGTH](variables/STATUS_NOTIFICATION_LENGTH.md) | Length in bytes of a well-formed RX status notification frame. |
| [STATUS\_REQUEST](variables/STATUS_REQUEST.md) | Status request directive — `[0x1B, 0x41]`. Embedded in every print payload between `CUT` and `END`; on-the-wire observation does not show it sent stand-alone. |

## Functions

| Function | Description |
| ------ | ------ |
| [buildCut](functions/buildCut.md) | `[0x1B, 0x70, command]` — cut directive. |
| [buildHeader](functions/buildHeader.md) | 9-byte job header `[0xFF, 0xF0, 0x12, 0x34, u32le(payloadLength), checksum]`; `checksum` = sum of the preceding 8 bytes mod 256. |
| [buildMediaType](functions/buildMediaType.md) | `[0x1B, 0x4D, mediaId, 0x00, 0x00, 0x00]` — set cassette type. Not emitted in the normal print flow; used by the stand-alone set-cassette-type payload. The trailing three zeros are required. |
| [buildNumberOfCopies](functions/buildNumberOfCopies.md) | `[0x1B, 0x23, copies]` — number of copies for this job. |
| [buildPrintData](functions/buildPrintData.md) | `[0x1B, 0x44, 0x81, 0x02, ...u32le(width), ...u32le(height), ...image]` |
| [buildPrintPayload](functions/buildPrintPayload.md) | Build the print payload (everything after the 9-byte header): `START + [MEDIA_TYPE] + NUMBER_OF_COPIES + PRINT_DATA + CUT + STATUS + END`. |
| [chunkPayload](functions/chunkPayload.md) | Slice an assembled payload into the ordered list of BLE writes. |
| [createPreviewOffline](functions/createPreviewOffline.md) | Generate an offline preview without a live printer connection. |
| [encodeBitmap](functions/encodeBitmap.md) | Encode a head-aligned bitmap into the column-major 4-bytes-per-feed stream the LT-200B expects. Bit packing: see docs/protocol/letratag-bt.md § Image encoding. |
| [encodeLabel](functions/encodeLabel.md) | Encode a complete LetraTag print job into the ordered list of BLE writes. The transport calls `write()` with each entry in turn. |
| [encodeSetCassetteType](functions/encodeSetCassetteType.md) | Build the stand-alone `MEDIA_TYPE`-only write list. Used by the driver's `setCassetteType()` path (writes to the `printShortCommandUUID` characteristic). |
| [findMediaBySku](functions/findMediaBySku.md) | Find a media entry by vendor SKU. LT cassettes ship under many regional part numbers (US 91XXX vs EU S07XXXXX); this helper does the lookup against `MediaDescriptor.skus`. |
| [parseStatus](functions/parseStatus.md) | Parse a 3-byte status notification frame `[0x1B, 0x52, code]` into a `PrinterStatus`. Code enum and confidence caveats: see docs/protocol/letratag-bt.md § `ESC A`. Codes 1/5 are aliased to 0/2 respectively. |
