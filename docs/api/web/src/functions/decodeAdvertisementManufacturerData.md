# Function: decodeAdvertisementManufacturerData()

```ts
function decodeAdvertisementManufacturerData(manufacturerData: Map<number, DataView> | undefined): AdvertisingStatus | null;
```

Helper to decode an advertisement event's manufacturer data into a
structured `AdvertisingStatus`. Web Bluetooth's
`BluetoothAdvertisingEvent` exposes `manufacturerData` as a
`Map<number, DataView>` — the LT-200B's payload is the value of
any entry. We read bytes 0..2 of the first entry's value, the
layout established in
[`status.ts`'s `parseAdvertisingStatus`](../core/src/status.ts).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `manufacturerData` | `Map`\<`number`, `DataView`\> \| `undefined` |

## Returns

[`AdvertisingStatus`](../interfaces/AdvertisingStatus.md) \| `null`
