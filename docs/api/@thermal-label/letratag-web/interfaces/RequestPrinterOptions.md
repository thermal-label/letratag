# Interface: RequestPrinterOptions

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-nameprefix"></a> `namePrefix?` | `string` | Override the device-name filter passed to `navigator.bluetooth.requestDevice`. Useful when the friend's unit advertises a non-default name. Falls back to the registry's `namePrefix` when omitted. |
