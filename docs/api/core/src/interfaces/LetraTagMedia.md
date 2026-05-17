# Interface: LetraTagMedia

DYMO LetraTag media descriptor.

Extends the contracts base `MediaDescriptor`. Tape is always
continuous — `heightMm` is omitted. Every LT cassette is 12 mm
wide (the only width the LT-200B chassis accepts) and 30 dots
printable; both literal-typed.

`printableDots: 30` is a chassis fact, not a wire-format fact —
the protocol always frames 32 rows; the LT-200B's print head
appears to image all 32, but prior public encoders reported that
the top and bottom rows clip on certain substrates. Treat 30 as
the safe authoring height for now and verify on hardware.

## Extends

- [`MediaDescriptor`](/contracts/api/interfaces/MediaDescriptor)

## Properties

| Property | Type | Description | Overrides |
| ------ | ------ | ------ | ------ |
| <a id="property-background"></a> `background?` | `string` | Substrate colour, named. | - |
| <a id="property-material"></a> `material?` | [`LetraTagMaterial`](../type-aliases/LetraTagMaterial.md) | LT substrate family. | - |
| <a id="property-printabledots"></a> `printableDots` | `30` | - | - |
| <a id="property-tapewidthmm"></a> `tapeWidthMm` | `12` | - | - |
| <a id="property-text"></a> `text?` | `string` | Printed ink colour, named (the only ink the cartridge carries). | - |
| <a id="property-type"></a> `type` | `"tape"` | Media type classification — driver-specific string values. Common values: `'continuous'`, `'die-cut'`, `'tape'`. Drivers may define additional values as needed. | `MediaDescriptor.type` |
