# Function: advertisingToPrinterStatus()

```ts
function advertisingToPrinterStatus(adv: AdvertisingStatus): PrinterStatus;
```

Convenience: convert an `AdvertisingStatus` into a contracts
`PrinterStatus`. Useful for surfacing the broadcast state through
`PrinterAdapter.getStatus()` between print jobs.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `adv` | [`AdvertisingStatus`](../interfaces/AdvertisingStatus.md) |

## Returns

[`PrinterStatus`](../../../core/src/interfaces/PrinterStatus.md)
