# Interface: LetraTagPrintOptions

Public LetraTag print options.

Extends the cross-driver `PrintOptions` with `rotate` and
`autoCut`. `density` and `engine` are inherited from the base
type and silently ignored — the LT-200B has no documented density
control and only one engine.

## Extends

- [`PrintOptions`](PrintOptions.md)

## Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-autocut"></a> `autoCut?` | `boolean` | Whether the printer should advance to the cut-line after this job. Defaults to `true`. When `copies > 1`, only the final copy receives a cut — intermediate copies are emitted with the suppress-cut byte (`0x31`). | - |
| <a id="property-copies"></a> `copies?` | `number` | Number of copies to print. Default 1. | [`PrintOptions`](PrintOptions.md).[`copies`](PrintOptions.md#property-copies) |
| <a id="property-density"></a> `density?` | `string` | Driver-specific density setting. Common values: `'light'`, `'normal'`, `'dark'`. Some drivers support additional values such as `'medium'` or `'high'`. Drivers throw `UnsupportedOperationError` for unrecognised values. `'normal'` is universally supported across all drivers. | [`PrintOptions`](PrintOptions.md).[`density`](PrintOptions.md#property-density) |
| <a id="property-engine"></a> `engine?` | `string` | Engine to route to on multi-engine devices. Role name from `printer.engines` (e.g. `'left'`, `'right'`, `'label'`, `'tape'`) or `'auto'` to defer to firmware (where the protocol supports it). Default behaviour: - Single-engine device — ignored. - Multi-engine, protocol supports auto — defaults to `'auto'`. - Multi-engine, protocol does not (e.g. LabelWriter Duo) — required; the driver throws `EngineRequiredError` when omitted. `'auto'` is a routing mode the protocol module interprets — the registry does not store it. Whether a protocol supports auto is implicit in whether its implementation exposes an auto-address sentinel. | [`PrintOptions`](PrintOptions.md).[`engine`](PrintOptions.md#property-engine) |
| <a id="property-rotate"></a> `rotate?` | `0` \| `"auto"` \| `90` \| `180` \| `270` | - | - |
