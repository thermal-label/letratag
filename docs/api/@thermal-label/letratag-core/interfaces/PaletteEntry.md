# Interface: PaletteEntry

One ink/foil colour the printer can place on the substrate.

`name` is used as the key in `renderMultiPlaneImage`'s result object and
must be unique within the palette. The literal `'white'` is reserved for
the implicit substrate background and rejected by validation.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-name"></a> `name` | `readonly` | `string` | - |
| <a id="property-rgb"></a> `rgb` | `readonly` | readonly \[`number`, `number`, `number`\] | RGB tuple in 0..255. |
