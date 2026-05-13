# @thermal-label/letratag-web

## Classes

| Class | Description |
| ------ | ------ |
| [LetraTagPrinter](classes/LetraTagPrinter.md) | `PrinterAdapter` for the LT-200B over Web Bluetooth. |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [AdvertisingStatus](interfaces/AdvertisingStatus.md) | - |
| [LetraTagMedia](interfaces/LetraTagMedia.md) | DYMO LetraTag media descriptor. |
| [LetraTagPrintOptions](interfaces/LetraTagPrintOptions.md) | Public LetraTag print options. |
| [PairResult](interfaces/PairResult.md) | Result of a successful pairing — the printer adapter plus the BLE plumbing the debug harness needs (observed full UUIDs, link MTU, raw `BluetoothDevice` for diagnostics export). |
| [PrinterAdapter](interfaces/PrinterAdapter.md) | High-level printer interface implemented by each driver family. |
| [PrinterError](interfaces/PrinterError.md) | A single error reported by the printer. |
| [PrinterStatus](interfaces/PrinterStatus.md) | Runtime status of a printer. |
| [RequestPrinterOptions](interfaces/RequestPrinterOptions.md) | - |
| [Transport](interfaces/Transport.md) | A bidirectional byte channel to a printer. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [CassetteId](type-aliases/CassetteId.md) | Cassette tape size enum, broadcast in advertising data and accepted as the `MEDIA_TYPE` directive payload. |
| [LetraTagDevice](type-aliases/LetraTagDevice.md) | DYMO LetraTag device entry. Alias for the contracts `DeviceEntry` narrowed to `family: 'letratag'`. |
| [LetraTagMaterial](type-aliases/LetraTagMaterial.md) | LT cassette substrate family. Picker / preview UX hint — the rasterizer does not branch on this. |

## Variables

| Variable | Description |
| ------ | ------ |
| [ADVERTISING\_STATUS\_LENGTH](variables/ADVERTISING_STATUS_LENGTH.md) | Length in bytes of a well-formed advertising-data payload. |
| [CASSETTE\_WIDTH\_MM](variables/CASSETTE_WIDTH_MM.md) | Mapping from the `cassetteId` enum (1..5) to the physical tape width in millimetres. ID 0 is treated as "no cassette" — the official app does not document the no-cassette code, but a zero-valued field has no plausible mapping. Use the advertising data's error flags (TAPE_JAM, etc.) and the `busyLocked` / presence signals together to decide whether a cassette is actually loaded. |
| [DEFAULT\_MEDIA](variables/DEFAULT_MEDIA.md) | - |
| [DEVICES](variables/DEVICES.md) | Registry of supported LetraTag devices, keyed by the device's stable `key` field (`LT_200B`). Values are the full contracts `DeviceEntry`. |
| [LT\_PAPER\_WHITE](variables/LT_PAPER_WHITE.md) | Canonical default — the white-paper cassette ships in the box with every LT-200B. Single named const, not a per-cassette export. |
| [MEDIA](variables/MEDIA.md) | Indexed registry of every LT cassette SKU the driver knows about, keyed by entry id (e.g. `MEDIA['lt-paper-white']`). |
| [MEDIA\_LIST](variables/MEDIA_LIST.md) | - |
| [PROTOCOLS](variables/PROTOCOLS.md) | Wire protocols this core's encoder produces correct bytes for. Pair with `DEVICE_REGISTRY_DATA` and `resolveSupportedDevices` from `@thermal-label/contracts` to filter a device list to what this runtime can drive. |

## Functions

| Function | Description |
| ------ | ------ |
| [advertisingToPrinterStatus](functions/advertisingToPrinterStatus.md) | Convenience: convert an `AdvertisingStatus` into a contracts `PrinterStatus`. Useful for surfacing the broadcast state through `PrinterAdapter.getStatus()` between print jobs. |
| [decodeAdvertisementManufacturerData](functions/decodeAdvertisementManufacturerData.md) | Helper to decode an advertisement event's manufacturer data into a structured `AdvertisingStatus`. Web Bluetooth's `BluetoothAdvertisingEvent` exposes `manufacturerData` as a `Map<number, DataView>` — the LT-200B's payload is the value of any entry. We read bytes 0..2 of the first entry's value, the layout established in [`status.ts`'s `parseAdvertisingStatus`](../core/src/status.ts). |
| [encodeLabel](functions/encodeLabel.md) | Encode a complete LetraTag print job into the ordered list of BLE writes. The transport calls `write()` with each entry in turn. |
| [findMediaBySku](functions/findMediaBySku.md) | Find a media entry by vendor SKU. LT cassettes ship under many regional part numbers (US 91XXX vs EU S07XXXXX); this helper does the lookup against `MediaDescriptor.skus`. |
| [parseAdvertisingStatus](functions/parseAdvertisingStatus.md) | Parse the LT-200B's BLE advertising-data manufacturer payload. |
| [parseStatus](functions/parseStatus.md) | Parse a 3-byte status notification frame from the printer. |
| [requestPrinter](functions/requestPrinter.md) | Open the browser BLE picker, pair with an LT-200B, and resolve the GATT service / characteristics. |
| [requestPrinters](functions/requestPrinters.md) | Show the browser's Bluetooth picker and return one `PrinterAdapter` per drivable engine on the selected device, keyed by engine role. |
