# Interface: AdvertisingStatus

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-batterylevel"></a> `batteryLevel` | `0` \| `1` \| `2` \| `3` | Battery level 0..3 (four levels; 3 = full). |
| <a id="property-busylocked"></a> `busyLocked` | `boolean` | Printer is mid-job. |
| <a id="property-carbontype"></a> `carbonType` | `boolean` | Carbon-substrate flag (semantics not yet established). |
| <a id="property-cassetteid"></a> `cassetteId` | [`CassetteId`](../type-aliases/CassetteId.md) | 1=6mm, 2=9mm, 3=12mm, 4=19mm, 5=24mm. 0 = unknown / absent. |
| <a id="property-cassettewidthmm"></a> `cassetteWidthMm` | `number` \| `null` | Tape width in mm, or `null` when `cassetteId` is 0. |
| <a id="property-charging"></a> `charging` | `boolean` | Charging cable connected. |
| <a id="property-errors"></a> `errors` | [`PrinterError`](PrinterError.md)[] | Active error flags — empty when the printer is idle and OK. |
| <a id="property-rawbytes"></a> `rawBytes` | `Uint8Array` | Raw 3 bytes for diagnostics export. |
| <a id="property-revision"></a> `revision` | `number` | Protocol revision broadcast in the top nibble of byte 0. |
