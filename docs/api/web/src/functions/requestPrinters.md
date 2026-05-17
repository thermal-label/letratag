# Function: requestPrinters()

```ts
function requestPrinters(opts: ConnectOptions): Promise<Readonly<Record<string, PrinterAdapter>>>;
```

Unified browser-picker factory.

The LT-200B is single-engine and BLE-GATT-only, so this is a
one-transport dispatch — the `transport` discriminator must be
`'bluetooth-gatt'`. Other values throw. Auto-identifies by service
UUID prefix (DECISIONS.md D4); the LT_200B is the only candidate,
so `deviceKey` is never required.

Returns a 1-key `PrinterAdapterMap` keyed by the device's primary
engine role.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`ConnectOptions`](../type-aliases/ConnectOptions.md) |

## Returns

`Promise`\<`Readonly`\<`Record`\<`string`, [`PrinterAdapter`](../../../core/src/interfaces/PrinterAdapter.md)\>\>\>
