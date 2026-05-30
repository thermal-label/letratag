# Function: requestPrinters()

```ts
function requestPrinters(opts: ConnectOptions): Promise<Readonly<Record<string, PrinterAdapter>>>;
```

Unified browser-picker factory. Returns a 1-key `PrinterAdapterMap`
keyed by the device's primary engine role.

The LT-200B is single-engine and BLE-GATT-only, so `transport` must
be `'bluetooth-gatt'` and `deviceKey` is never required (LT_200B is
the only candidate). Other values throw.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`ConnectOptions`](/contracts/api/type-aliases/ConnectOptions) |

## Returns

`Promise`\<`Readonly`\<`Record`\<`string`, [`PrinterAdapter`](/contracts/api/interfaces/PrinterAdapter)\>\>\>
