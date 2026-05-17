# Interface: LetraTagPrintOptions

Public LetraTag print options.

Extends the cross-driver `PrintOptions` with `rotate` and
`autoCut`. `density` and `engine` are inherited from the base
type and silently ignored — the LT-200B has no documented density
control and only one engine.

## Extends

- [`PrintOptions`](/contracts/api/interfaces/PrintOptions)

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-autocut"></a> `autoCut?` | `boolean` | Whether the printer should advance to the cut-line after this job. Defaults to `true`. When `copies > 1`, only the final copy receives a cut — intermediate copies are emitted with the suppress-cut byte (`0x31`). |
| <a id="property-rotate"></a> `rotate?` | `0` \| `90` \| `270` \| `"auto"` \| `180` | - |
