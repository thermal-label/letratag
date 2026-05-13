# Function: parseAdvertisingStatus()

```ts
function parseAdvertisingStatus(bytes: Uint8Array): AdvertisingStatus | null;
```

Parse the LT-200B's BLE advertising-data manufacturer payload.

Layout (observable in the BLE manufacturer-data field of every
advertising packet broadcast by the printer):

```
byte 0  bits 4-7  revision
        bits 0-3  reserved
byte 1  bits 0-3  cassetteId
        bit 4     carbonType
        bit 5     busyLocked
        bits 6-7  spare
byte 2  bit 0     TAPE_JAM
        bit 1     CUTTER_JAM
        bit 2     BATTERY_TOO_LOW
        bit 3     BATTERY_LOW
        bits 4-5  batteryLevel (0..3)
        bit 6     chargingIndicator
        bit 7     reserved
```

`null` is returned for malformed input (length < 3); callers can
treat that as "device is advertising but the manufacturer data
isn't ours".

## Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `Uint8Array` |

## Returns

[`AdvertisingStatus`](../interfaces/AdvertisingStatus.md) \| `null`
