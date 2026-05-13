# Class: LetraTagPrinter

`PrinterAdapter` for the LT-200B over Web Bluetooth.

Constructed indirectly via `requestPrinter()` / `requestPrinters()`;
the constructor is exported so the harness can inject a `MockTransport`
with a real device entry, mirroring the labelmanager-web /
labelwriter-web shape.

Two channels of status are wired in:

1. **Post-print notification** — the printer emits a 3-byte
   `[1B 52 code]` reply after each job, parsed via `parseStatus`.
   The driver stores this as the last-known status.
2. **Advertising data** — the BLE advertising packets carry a
   3-byte payload with cassette presence + battery + busy +
   error flags. The discovery layer collects this when the device
   is scanned; the driver folds the latest snapshot into
   `getStatus()` so callers get a recent view between print jobs.

## Implements

- [`PrinterAdapter`](../interfaces/PrinterAdapter.md)

## Constructors

### Constructor

```ts
new LetraTagPrinter(device: LetraTagDevice, transport: Transport): LetraTagPrinter;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `device` | [`LetraTagDevice`](../type-aliases/LetraTagDevice.md) |
| `transport` | [`Transport`](../interfaces/Transport.md) |

#### Returns

`LetraTagPrinter`

## Properties

### device

```ts
readonly device: LetraTagDevice;
```

The device entry for the connected printer.

Useful for logging, diagnostics, and displaying VID/PID. Undefined
if the connection was established without device matching (e.g. a
raw TCP connection to a known IP).

#### Implementation of

[`PrinterAdapter`](../interfaces/PrinterAdapter.md).[`device`](../interfaces/PrinterAdapter.md#property-device)

***

### family

```ts
readonly family: "letratag" = 'letratag';
```

Driver family identifier, e.g. `'brother-ql'` or `'labelwriter'`.

#### Implementation of

[`PrinterAdapter`](../interfaces/PrinterAdapter.md).[`family`](../interfaces/PrinterAdapter.md#property-family)

## Accessors

### connected

#### Get Signature

```ts
get connected(): boolean;
```

Whether the printer is currently connected.

##### Returns

`boolean`

Whether the printer is currently connected.

#### Implementation of

[`PrinterAdapter`](../interfaces/PrinterAdapter.md).[`connected`](../interfaces/PrinterAdapter.md#property-connected)

***

### model

#### Get Signature

```ts
get model(): string;
```

Human-readable model name from the driver's device registry.

##### Returns

`string`

Human-readable model name from the driver's device registry.

#### Implementation of

[`PrinterAdapter`](../interfaces/PrinterAdapter.md).[`model`](../interfaces/PrinterAdapter.md#property-model)

## Methods

### close()

```ts
close(): Promise<void>;
```

Close the connection. Always call in `finally` blocks.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PrinterAdapter`](../interfaces/PrinterAdapter.md).[`close`](../interfaces/PrinterAdapter.md#close)

***

### createPreview()

```ts
createPreview(image: RawImageData, options?: PreviewOptions): Promise<PreviewResult>;
```

Generate a preview showing how this printer would reproduce the
design on the given media. Returns separated 1bpp planes with
display colours.

The driver uses its own colour-splitting logic (the same code that
`print()` uses internally) to produce the planes. The consuming app
renders whatever planes come back without needing to know the
splitting rules.

For offline preview without a live connection, use the static
`createPreviewOffline()` function exported from the driver's
`*-core` package instead.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `image` | [`RawImageData`](../../letratag-core/interfaces/RawImageData.md) | — full RGBA, typically from `designer.render()`. |
| `options?` | [`PreviewOptions`](../../letratag-core/interfaces/PreviewOptions.md) | — optional media override. If media is omitted, uses detected media from the last `getStatus()`. If no status is available, the driver defaults to single-colour at the printer's native head width and sets `PreviewResult.assumed = true`. |

#### Returns

`Promise`\<[`PreviewResult`](../../letratag-core/interfaces/PreviewResult.md)\>

#### Implementation of

[`PrinterAdapter`](../interfaces/PrinterAdapter.md).[`createPreview`](../interfaces/PrinterAdapter.md#createpreview)

***

### getStatus()

```ts
getStatus(): Promise<PrinterStatus>;
```

Return the printer's last-known status. Prefers the advertising-data
snapshot when available (it covers cassette + battery + errors and
updates continuously without a print job); falls back to the most
recent post-print notification, then to a default empty status.

#### Returns

`Promise`\<[`PrinterStatus`](../interfaces/PrinterStatus.md)\>

#### Implementation of

[`PrinterAdapter`](../interfaces/PrinterAdapter.md).[`getStatus`](../interfaces/PrinterAdapter.md#getstatus)

***

### print()

```ts
print(
   image: RawImageData, 
   media?: MediaDescriptor, 
options?: LetraTagPrintOptions): Promise<void>;
```

Print from a full-colour RGBA image.

The driver converts to its native format internally:

- Single-colour media (`media.palette` undefined) — threshold/dither
  RGBA to a single 1bpp plane via `renderImage`.
- Multi-ink media (`media.palette` defined) — split into planes via
  `renderMultiPlaneImage` using that palette.

**Orientation:** drivers compute the rotation via `pickRotation`
(see `./orientation.ts`) — the input image is treated as the
intended visual; the driver auto-rotates landscape input on media
tagged `defaultOrientation: 'horizontal'`.

**Multi-ink splitting:** the palette on the media descriptor names
every ink the driver should classify pixels into; the contracts
package does not pick "red" or "black" — those facts live with the
media entry.

**Batch printing:** call `print()` once per label. The driver
handles job framing internally (e.g. Brother QL page-break commands
between sequential `print()` calls within the same session).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `image` | [`RawImageData`](../../letratag-core/interfaces/RawImageData.md) | — full RGBA, typically from `designer.render()`. |
| `media?` | [`MediaDescriptor`](../../letratag-core/interfaces/MediaDescriptor.md) | — which media to print on. Determines dimensions, margins, and colour mode. If omitted, uses detected media from the last `getStatus()`. |
| `options?` | [`LetraTagPrintOptions`](../interfaces/LetraTagPrintOptions.md) | — per-call options (copies, density, etc.). |

#### Returns

`Promise`\<`void`\>

#### Throws

MediaNotSpecifiedError if no media is known.

#### Implementation of

[`PrinterAdapter`](../interfaces/PrinterAdapter.md).[`print`](../interfaces/PrinterAdapter.md#print)

***

### setAdvertisingStatus()

```ts
setAdvertisingStatus(adv: AdvertisingStatus | null): void;
```

Update the printer's known advertising state. Called by the
discovery layer with the most recent manufacturer-data payload.
Use [parseAdvertisingStatus](../functions/parseAdvertisingStatus.md) to construct the argument.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `adv` | [`AdvertisingStatus`](../interfaces/AdvertisingStatus.md) \| `null` |

#### Returns

`void`
