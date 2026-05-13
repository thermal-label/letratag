# Function: requestPrinters()

```ts
function requestPrinters(options?: RequestPrinterOptions): Promise<Record<string, LetraTagPrinter>>;
```

Show the browser's Bluetooth picker and return one `PrinterAdapter`
per drivable engine on the selected device, keyed by engine role.

The LT-200B is single-engine, so this returns a 1-key record keyed
by the device's `engines[0].role` (`'primary'`). Mirrors the
labelmanager / labelwriter `requestPrinters()` factories so harness
adapters can stay symmetric across driver families — the harness
shell consumes the per-engine map directly.

The `PairResult` plumbing (full observed UUIDs, advertising-data
snapshot) is dropped on this path; callers that need the BLE
diagnostic surface should use `requestPrinter()` instead.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`RequestPrinterOptions`](../interfaces/RequestPrinterOptions.md) |

## Returns

`Promise`\<`Record`\<`string`, [`LetraTagPrinter`](../classes/LetraTagPrinter.md)\>\>
