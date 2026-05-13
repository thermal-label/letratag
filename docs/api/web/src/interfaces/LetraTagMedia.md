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

- [`MediaDescriptor`](../../../core/src/interfaces/MediaDescriptor.md)

## Properties

| Property | Modifier | Type | Description | Overrides | Inherited from |
| ------ | ------ | ------ | ------ | ------ | ------ |
| <a id="property-background"></a> `background?` | `public` | `string` | Substrate colour, named. | - | - |
| <a id="property-category"></a> `category?` | `public` | \| `"address"` \| `"shipping"` \| `"file-folder"` \| `"multi-purpose"` \| `"name-badge"` \| `"barcode"` \| `"price-tag"` \| `"continuous"` \| `"cartridge"` \| `"tape"` \| `"die-cut"` | Coarse category for grouping in docs and UI. Driver-extensible; common values listed for cross-driver consistency. | - | [`MediaDescriptor`](../../../core/src/interfaces/MediaDescriptor.md).[`category`](../../../core/src/interfaces/MediaDescriptor.md#property-category) |
| <a id="property-cornerradiusmm"></a> `cornerRadiusMm?` | `public` | `number` | Corner radius (mm) of die-cut labels with rounded corners. Only meaningful for die-cut media. Undefined or `0` = sharp corners. For round labels, set this to `widthMm / 2` so the rounded rectangle degenerates to a circle. | - | [`MediaDescriptor`](../../../core/src/interfaces/MediaDescriptor.md).[`cornerRadiusMm`](../../../core/src/interfaces/MediaDescriptor.md#property-cornerradiusmm) |
| <a id="property-defaultorientation"></a> `defaultOrientation?` | `public` | `"horizontal"` \| `"vertical"` | Hint for how the user is expected to author content for this media. Drives the auto-rotate decision in `print()`: - `'horizontal'` — long axis horizontal when reading (landscape). Driver rotates 90° in the family-specific direction when input matches landscape dimensions. Examples: 89×28 mm address labels, 12 mm narrow tape with a name on it. - `'vertical'` — long axis vertical when reading (portrait). Driver passes through. - `undefined` — driver passes through. Recommended for continuous wide tape (62 mm) where users may go either way. | - | [`MediaDescriptor`](../../../core/src/interfaces/MediaDescriptor.md).[`defaultOrientation`](../../../core/src/interfaces/MediaDescriptor.md#property-defaultorientation) |
| <a id="property-heightmm"></a> `heightMm?` | `public` | `number` | Physical height/length in mm. - Undefined = continuous (variable length; printer cuts to content). - A number = fixed length (die-cut labels, tape segments). | - | [`MediaDescriptor`](../../../core/src/interfaces/MediaDescriptor.md).[`heightMm`](../../../core/src/interfaces/MediaDescriptor.md#property-heightmm) |
| <a id="property-id"></a> `id` | `public` | `string` \| `number` | Unique identifier within the driver family. | - | [`MediaDescriptor`](../../../core/src/interfaces/MediaDescriptor.md).[`id`](../../../core/src/interfaces/MediaDescriptor.md#property-id) |
| <a id="property-material"></a> `material?` | `public` | [`LetraTagMaterial`](../type-aliases/LetraTagMaterial.md) | LT substrate family. | - | - |
| <a id="property-name"></a> `name` | `public` | `string` | Human-readable name, e.g. `"62mm continuous"` or `"DK-22251"`. | - | [`MediaDescriptor`](../../../core/src/interfaces/MediaDescriptor.md).[`name`](../../../core/src/interfaces/MediaDescriptor.md#property-name) |
| <a id="property-palette"></a> `palette?` | `public` | readonly [`PaletteEntry`](../../../core/src/interfaces/PaletteEntry.md)[] | Inks this media supports, beyond the implicit white substrate. - Undefined = single-colour black-on-white. Driver renders via `renderImage` (luminance threshold + optional dither). - Defined = multi-plane media. Driver renders via `renderMultiPlaneImage` with this palette. For DK-22251 (the only multi-ink media we ship today): `[{ name: 'black', rgb: [0, 0, 0] }, { name: 'red', rgb: [255, 0, 0] }]` | - | [`MediaDescriptor`](../../../core/src/interfaces/MediaDescriptor.md).[`palette`](../../../core/src/interfaces/MediaDescriptor.md#property-palette) |
| <a id="property-printabledots"></a> `printableDots` | `public` | `30` | - | - | - |
| <a id="property-printmargins"></a> `printMargins?` | `public` | \{ `bottomMm`: `number`; `leftMm`: `number`; `rightMm`: `number`; `topMm`: `number`; \} | Insets (mm) inside the media bounds where the printer may clip a design (paper-feed tolerance, head edges, die-cut slack). Informational — for label designers and previews. Drivers do not enforce these; protocol-level margins (head pin offsets, head-dot fitting) are handled separately by family-specific fields. When present, all four edges are required (pass `0` where there is no margin). Omit the whole field when the entire media area is safe to design within. | - | [`MediaDescriptor`](../../../core/src/interfaces/MediaDescriptor.md).[`printMargins`](../../../core/src/interfaces/MediaDescriptor.md#property-printmargins) |
| `printMargins.bottomMm` | `readonly` | `number` | - | - | - |
| `printMargins.leftMm` | `readonly` | `number` | - | - | - |
| `printMargins.rightMm` | `readonly` | `number` | - | - | - |
| `printMargins.topMm` | `readonly` | `number` | - | - | - |
| <a id="property-skus"></a> `skus?` | `public` | readonly `string`[] | Vendor SKUs for this media — e.g. Dymo `'30321'` / `'S0722400'`, Brother `'DK-22251'`. Mixed formats allowed; the registry does no validation. Used by docs (per-device "supported media" table) and by UI consumers that let users search by SKU. | - | [`MediaDescriptor`](../../../core/src/interfaces/MediaDescriptor.md).[`skus`](../../../core/src/interfaces/MediaDescriptor.md#property-skus) |
| <a id="property-tapewidthmm"></a> `tapeWidthMm` | `public` | `12` | - | - | - |
| <a id="property-targetmodels"></a> `targetModels?` | `public` | readonly `string`[] | Devices this media is compatible with. Driver-defined string set; matched against `PrintEngine.mediaCompatibility`. Examples: `['standard']` (paper roll fits 672-dot heads), `['4xl', '5xl']` (wide-head only), `['duo']` (D1 cartridges). Omit = fits every device in the family. | - | [`MediaDescriptor`](../../../core/src/interfaces/MediaDescriptor.md).[`targetModels`](../../../core/src/interfaces/MediaDescriptor.md#property-targetmodels) |
| <a id="property-text"></a> `text?` | `public` | `string` | Printed ink colour, named (the only ink the cartridge carries). | - | - |
| <a id="property-type"></a> `type` | `public` | `"tape"` | Media type classification — driver-specific string values. Common values: `'continuous'`, `'die-cut'`, `'tape'`. Drivers may define additional values as needed. | [`MediaDescriptor`](../../../core/src/interfaces/MediaDescriptor.md).[`type`](../../../core/src/interfaces/MediaDescriptor.md#property-type) | - |
| <a id="property-widthmm"></a> `widthMm` | `public` | `number` | Physical width in mm. | - | [`MediaDescriptor`](../../../core/src/interfaces/MediaDescriptor.md).[`widthMm`](../../../core/src/interfaces/MediaDescriptor.md#property-widthmm) |
