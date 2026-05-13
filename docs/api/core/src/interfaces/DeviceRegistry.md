# Interface: DeviceRegistry

A driver's full device registry.

`schemaVersion: 1` is the initial published shape. Bump when a
future change is genuinely incompatible; the aggregator and
cross-driver consumers refuse unknown values rather than silently
mishandle shape divergence.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-devices"></a> `devices` | readonly [`DeviceEntry`](DeviceEntry.md)[] | - |
| <a id="property-driver"></a> `driver` | `string` | Driver family identifier — matches `DeviceEntry.family`. |
| <a id="property-schemaversion"></a> `schemaVersion` | `1` | - |
