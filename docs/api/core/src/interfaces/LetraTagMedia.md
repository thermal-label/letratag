# Interface: LetraTagMedia

DYMO LetraTag media descriptor.

Tape is always continuous (`heightMm` omitted). Every LT cassette
is 12 mm wide — the only width the chassis accepts — carried in
`widthMm`. Printable head height is a chassis fact, so it lives on
the engine / `PRINTABLE_DOTS`, not here.

## Extends

- [`MediaDescriptor`](/contracts/api/interfaces/MediaDescriptor)

## Properties

| Property | Type | Description | Overrides |
| ------ | ------ | ------ | ------ |
| <a id="property-background"></a> `background?` | `string` | Substrate colour, named. | - |
| <a id="property-material"></a> `material?` | [`LetraTagMaterial`](../type-aliases/LetraTagMaterial.md) | LT substrate family. | - |
| <a id="property-text"></a> `text?` | `string` | Printed ink colour, named (the only ink the cartridge carries). | - |
| <a id="property-type"></a> `type` | `"tape"` | Media type classification — driver-specific string values. Common values: `'continuous'`, `'die-cut'`, `'tape'`. Drivers may define additional values as needed. | `MediaDescriptor.type` |
