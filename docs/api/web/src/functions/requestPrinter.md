# ~~Function: requestPrinter()~~

```ts
function requestPrinter(options?: RequestPrinterOptions): Promise<PairResult>;
```

Open the browser BLE picker, pair with an LT-200B, and resolve the
GATT service / characteristics. Returns the printer adapter plus
diagnostic plumbing (observed UUIDs, best-effort link MTU).

Discovery derives TX / RX / aux UUIDs from the observed service-tail
rather than requesting canonical UUIDs (DECISIONS.md D4). This is why
`WebBluetoothTransport.request()` doesn't fit — it asks for
characteristics by canonical UUID before it sees the actual service
tail; we resolve + derive here, then wrap via
`WebBluetoothTransport.fromCharacteristics()`.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`RequestPrinterOptions`](../interfaces/RequestPrinterOptions.md) |

## Returns

`Promise`\<[`PairResult`](../interfaces/PairResult.md)\>

## Deprecated

For harness use, prefer
  `requestPrinters({ transport: 'bluetooth-gatt' })`. `requestPrinter()`
  is retained as the BLE-debug escape hatch (carries observed UUIDs /
  link MTU for the debug app).
