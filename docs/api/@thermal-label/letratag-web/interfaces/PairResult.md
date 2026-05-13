# Interface: PairResult

Result of a successful pairing — the printer adapter plus the
BLE plumbing the debug harness needs (observed full UUIDs, link
MTU, raw `BluetoothDevice` for diagnostics export).

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-advertisingstatus"></a> `advertisingStatus` | [`AdvertisingStatus`](AdvertisingStatus.md) \| `null` | Most recent advertising-data status snapshot captured during the scan that found the device, when available. The driver also holds this internally — see `LetraTagPrinter.setAdvertisingStatus`. |
| <a id="property-device"></a> `device` | `BluetoothDevice` | - |
| <a id="property-linkmtu"></a> `linkMtu` | `number` \| `null` | Best-effort link MTU; `null` when the browser doesn't expose it. |
| <a id="property-printer"></a> `printer` | [`LetraTagPrinter`](../classes/LetraTagPrinter.md) | - |
| <a id="property-rxuuidderived"></a> `rxUuidDerived` | `string` | RX (notify) characteristic — `printReplyUUID`. |
| <a id="property-serviceuuidobserved"></a> `serviceUuidObserved` | `string` | - |
| <a id="property-shortcommanduuidderived"></a> `shortCommandUuidDerived` | `string` | Short-command characteristic — `printShortCommandUUID`. |
| <a id="property-txuuidderived"></a> `txUuidDerived` | `string` | - |
