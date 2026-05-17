# core/src

## Classes

| Class | Description |
| ------ | ------ |
| [MediaNotSpecifiedError](classes/MediaNotSpecifiedError.md) | `PrinterAdapter.print()` or `createPreview()` was called without a media argument and no detected media was available. |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [DeviceEntry](interfaces/DeviceEntry.md) | A device entry in a driver's registry. |
| [DeviceRegistry](interfaces/DeviceRegistry.md) | A driver's full device registry. |
| [~~DeviceSupport~~](interfaces/DeviceSupport.md) | Verification state for a device. |
| [LabelBitmap](interfaces/LabelBitmap.md) | A 1-bit-per-pixel bitmap. Row-major, MSB-first within each byte. |
| [LetraTagMedia](interfaces/LetraTagMedia.md) | DYMO LetraTag media descriptor. |
| [LetraTagPrintOptions](interfaces/LetraTagPrintOptions.md) | Public LetraTag print options. |
| [MediaDescriptor](interfaces/MediaDescriptor.md) | Base media descriptor. |
| [PaletteEntry](interfaces/PaletteEntry.md) | One ink/foil colour the printer can place on the substrate. |
| [PreviewOptions](interfaces/PreviewOptions.md) | Options for `PrinterAdapter.createPreview()`. |
| [PreviewPlane](interfaces/PreviewPlane.md) | A single colour plane in a preview. |
| [PreviewResult](interfaces/PreviewResult.md) | Result of `PrinterAdapter.createPreview()`. |
| [PrintEngine](interfaces/PrintEngine.md) | A print engine — one printhead with one protocol. |
| [PrinterAdapter](interfaces/PrinterAdapter.md) | High-level printer interface implemented by each driver family. |
| [PrinterError](interfaces/PrinterError.md) | A single error reported by the printer. |
| [PrinterStatus](interfaces/PrinterStatus.md) | Runtime status of a printer. |
| [PrintOptions](interfaces/PrintOptions.md) | Options for a single `PrinterAdapter.print()` call. |
| [RawImageData](interfaces/RawImageData.md) | Raw RGBA image data, compatible with browser ImageData and @napi-rs/canvas ImageData. |
| [Transport](interfaces/Transport.md) | A bidirectional byte channel to a printer. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [LetraTagDevice](type-aliases/LetraTagDevice.md) | DYMO LetraTag device entry. Alias for the contracts `DeviceEntry` narrowed to `family: 'letratag'`. |
| [LetraTagMaterial](type-aliases/LetraTagMaterial.md) | LT cassette substrate family. Picker / preview UX hint — the rasterizer does not branch on this. |
| [RotateDirection](type-aliases/RotateDirection.md) | Direction the printer family rotates landscape input. |
| [SupportStatus](type-aliases/SupportStatus.md) | Stored verification rung — what a maintainer has directly observed. |
| [TransportType](type-aliases/TransportType.md) | Wire-protocol-only transport types. |

## Variables

| Variable | Description |
| ------ | ------ |
| [BODY\_CHUNK](variables/BODY_CHUNK.md) | Protocol-level upper bound on body bytes per BLE write. Used as the ceiling when no `mtu` is provided to `chunkPayload`; effective chunk size is `min(BODY_CHUNK, mtu - 1)`. |
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
| [buildHeader](functions/buildHeader.md) | 9-byte header. Layout: |
| [buildMediaType](functions/buildMediaType.md) | `[0x1B, 0x4D, mediaId, 0x00, 0x00, 0x00]` — set cassette type. 6 bytes total; the trailing three zeros are part of the observed wire format. |
| [buildNumberOfCopies](functions/buildNumberOfCopies.md) | `[0x1B, 0x23, copies]` — number of copies for this job. |
| [buildPrintData](functions/buildPrintData.md) | `[0x1B, 0x44, 0x81, 0x02, ...u32le(width), ...u32le(height), ...image]` |
| [buildPrintPayload](functions/buildPrintPayload.md) | Build the print payload (everything after the 9-byte header): `START + [MEDIA_TYPE] + NUMBER_OF_COPIES + PRINT_DATA + CUT + STATUS + END`. |
| [chunkPayload](functions/chunkPayload.md) | Slice an assembled payload into the ordered list of BLE writes. |
| [createPreviewOffline](functions/createPreviewOffline.md) | Generate an offline preview without a live printer connection. |
| [encodeBitmap](functions/encodeBitmap.md) | Encode a head-aligned bitmap into the column-major 4-bytes-per-feed stream the LT-200B expects. |
| [encodeLabel](functions/encodeLabel.md) | Encode a complete LetraTag print job into the ordered list of BLE writes. The transport calls `write()` with each entry in turn. |
| [encodeSetCassetteType](functions/encodeSetCassetteType.md) | Build the stand-alone `MEDIA_TYPE`-only write list. Used by the driver's `setCassetteType()` path (writes to the `printShortCommandUUID` characteristic). |
| [findMediaBySku](functions/findMediaBySku.md) | Find a media entry by vendor SKU. LT cassettes ship under many regional part numbers (US 91XXX vs EU S07XXXXX); this helper does the lookup against `MediaDescriptor.skus`. |
| [parseStatus](functions/parseStatus.md) | Parse a 3-byte status notification frame from the printer. |
| [pickRotation](functions/pickRotation.md) | Pick the rotation value to pass to `renderImage` / `renderMultiPlaneImage`. |
| [renderImage](functions/renderImage.md) | Convert RGBA pixel data to a packed 1bpp bitmap. |
| [renderText](functions/renderText.md) | Render an ASCII string into a packed 1bpp bitmap using the bundled font. |
