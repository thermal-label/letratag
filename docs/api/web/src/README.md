# web/src

## Classes

| Class | Description |
| ------ | ------ |
| [DeviceIdentificationRequiredError](classes/DeviceIdentificationRequiredError.md) | A driver-web `requestPrinters(opts)` factory opened the browser picker and got a port/device back, but couldn't decide which registry entry it corresponds to. The picker may have offered an unidentifiable serial port (Web Serial doesn't expose BT device names) or the picked USB device's VID/PID didn't match anything in the driver's registry. |
| [LetraTagPrinter](classes/LetraTagPrinter.md) | `PrinterAdapter` for the LT-200B over Web Bluetooth. |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [LetraTagMedia](interfaces/LetraTagMedia.md) | DYMO LetraTag media descriptor. |
| [LetraTagPrintOptions](interfaces/LetraTagPrintOptions.md) | Public LetraTag print options. |
| [PairResult](interfaces/PairResult.md) | Result of a successful pairing — the printer adapter plus the BLE plumbing the debug harness needs (observed full UUIDs, link MTU, raw `BluetoothDevice` for diagnostics export). |
| [RequestPrinterOptions](interfaces/RequestPrinterOptions.md) | - |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [ConnectOptions](type-aliases/ConnectOptions.md) | Options for the unified driver-web `requestPrinters(opts)` factory. |
| [LetraTagDevice](type-aliases/LetraTagDevice.md) | DYMO LetraTag device entry. Alias for the contracts `DeviceEntry` narrowed to `family: 'letratag'`. |
| [LetraTagMaterial](type-aliases/LetraTagMaterial.md) | LT cassette substrate family. Picker / preview UX hint — the rasterizer does not branch on this. |
| [PrinterAdapterMap](type-aliases/PrinterAdapterMap.md) | Map from engine role → PrinterAdapter for a connected device. |

## Variables

| Variable | Description |
| ------ | ------ |
| [DEFAULT\_MEDIA](variables/DEFAULT_MEDIA.md) | - |
| [DEVICES](variables/DEVICES.md) | Registry of supported LetraTag devices, keyed by the device's stable `key` field (`LT_200B`). Values are the full contracts `DeviceEntry`. |
| [LT\_PAPER\_WHITE](variables/LT_PAPER_WHITE.md) | Canonical default — the white-paper cassette ships in the box with every LT-200B. Single named const, not a per-cassette export. |
| [MEDIA](variables/MEDIA.md) | Indexed registry of every LT cassette SKU the driver knows about, keyed by entry id (e.g. `MEDIA['lt-paper-white']`). |
| [MEDIA\_LIST](variables/MEDIA_LIST.md) | - |
| [PROTOCOLS](variables/PROTOCOLS.md) | Wire protocols this core's encoder produces correct bytes for. Pair with `DEVICE_REGISTRY_DATA` and `resolveSupportedDevices` from `@thermal-label/contracts` to filter a device list to what this runtime can drive. |

## Functions

| Function | Description |
| ------ | ------ |
| [devicesForTransport](functions/devicesForTransport.md) | Filter the registry to entries declaring `transport`. Used to populate `DeviceIdentificationRequiredError.candidates` from the harness shell. |
| [encodeLabel](functions/encodeLabel.md) | Encode a complete LetraTag print job into the ordered list of BLE writes. The transport calls `write()` with each entry in turn. |
| [findMediaBySku](functions/findMediaBySku.md) | Find a media entry by vendor SKU. LT cassettes ship under many regional part numbers (US 91XXX vs EU S07XXXXX); this helper does the lookup against `MediaDescriptor.skus`. |
| [parseStatus](functions/parseStatus.md) | Parse a 3-byte status notification frame from the printer. |
| [~~requestPrinter~~](functions/requestPrinter.md) | Open the browser BLE picker, pair with an LT-200B, and resolve the GATT service / characteristics. |
| [requestPrinters](functions/requestPrinters.md) | Unified browser-picker factory. |

## References

### PrinterAdapter

Re-exports [PrinterAdapter](../../core/src/interfaces/PrinterAdapter.md)

***

### PrinterError

Re-exports [PrinterError](../../core/src/interfaces/PrinterError.md)

***

### PrinterStatus

Re-exports [PrinterStatus](../../core/src/interfaces/PrinterStatus.md)

***

### Transport

Re-exports [Transport](../../core/src/interfaces/Transport.md)
