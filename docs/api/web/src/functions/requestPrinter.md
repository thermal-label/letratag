# ~~Function: requestPrinter()~~

```ts
function requestPrinter(options?: RequestPrinterOptions): Promise<PairResult>;
```

Open the browser BLE picker, pair with an LT-200B, and resolve
the GATT service / characteristics.

Discovery follows DECISIONS.md D4 — the registry's canonical
UUIDs filter the picker, but the actual TX / RX / aux UUIDs are
**derived from the observed service UUID's tail** (alexhorn's
convention). This tolerates UUID-body variance across firmware
revisions or device units. `WebBluetoothTransport.request()`
doesn't fit because it asks for characteristics by canonical UUID
before it sees the actual service tail; we do the picker + service
resolution + characteristic derivation here, then wrap via
`WebBluetoothTransport.fromCharacteristics()`.

Returns the printer adapter + diagnostic plumbing (full observed
UUIDs, link MTU best-effort) so the debug harness can export
what's actually on the wire.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`RequestPrinterOptions`](../interfaces/RequestPrinterOptions.md) |

## Returns

`Promise`\<[`PairResult`](../interfaces/PairResult.md)\>

## Deprecated

For harness use, prefer
  `requestPrinters({ transport: 'bluetooth-gatt' })` — the new
  factory returns a `PrinterAdapterMap` matching the contracts
  shape. `requestPrinter()` is retained as the BLE-debug escape
  hatch (carries observed UUIDs / link MTU for the debug app).
