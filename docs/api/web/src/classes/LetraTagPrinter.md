# Class: LetraTagPrinter

`PrinterAdapter` for the LT-200B over Web Bluetooth.

Constructed indirectly via `requestPrinter()` / `requestPrinters()`;
the constructor is exported so the harness can inject a `MockTransport`
with a real device entry, mirroring the labelmanager-web /
labelwriter-web shape.

Status has a single real source — the post-print `[1B 52 code]`
reply; the LT-200B has no out-of-job status channel (DECISIONS.md D5).

## Implements

- [`PrinterAdapter`](/contracts/api/interfaces/PrinterAdapter)

## Constructors

### Constructor

```ts
new LetraTagPrinter(device: LetraTagDevice, transport: Transport): LetraTagPrinter;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `device` | [`LetraTagDevice`](../type-aliases/LetraTagDevice.md) |
| `transport` | [`Transport`](/contracts/api/interfaces/Transport) |

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

```ts
PrinterAdapter.device
```

***

### family

```ts
readonly family: "letratag" = 'letratag';
```

Driver family identifier, e.g. `'brother-ql'` or `'labelwriter'`.

#### Implementation of

```ts
PrinterAdapter.family
```

## Accessors

### connected

#### Get Signature

```ts
get connected(): boolean;
```

Whether the printer is currently connected.

##### Returns

`boolean`

#### Implementation of

```ts
PrinterAdapter.connected
```

***

### model

#### Get Signature

```ts
get model(): string;
```

Human-readable model name from the driver's device registry.

##### Returns

`string`

#### Implementation of

```ts
PrinterAdapter.model
```

## Methods

### close()

```ts
close(): Promise<void>;
```

Close the connection. Always call in `finally` blocks.

#### Returns

`Promise`\<`void`\>

#### Implementation of

```ts
PrinterAdapter.close
```

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
| `image` | [`RawImageData`](/contracts/api/interfaces/RawImageData) | — full RGBA, typically from `designer.render()`. |
| `options?` | [`PreviewOptions`](/contracts/api/interfaces/PreviewOptions) | — optional media override. If media is omitted, uses detected media from the last `getStatus()`. If no status is available, the driver defaults to single-colour at the printer's native head width and sets `PreviewResult.assumed = true`. |

#### Returns

`Promise`\<[`PreviewResult`](/contracts/api/interfaces/PreviewResult)\>

#### Implementation of

```ts
PrinterAdapter.createPreview
```

***

### getStatus()

```ts
getStatus(): Promise<PrinterStatus>;
```

Return the printer's last-known status — the most recent post-print
notification, or a default empty status before the first print.

#### Returns

`Promise`\<[`PrinterStatus`](/contracts/api/interfaces/PrinterStatus)\>

#### Implementation of

```ts
PrinterAdapter.getStatus
```

***

### onStatus()

```ts
onStatus(cb: (status: PrinterStatus) => void): () => void;
```

Subscribe to status updates; returns an unsubscribe function. The
only push source is the post-print notification (see
[parseStatus](../functions/parseStatus.md)). The current cached status is replayed
immediately on subscribe so the harness status pill resolves
without waiting for the next print.

Letratag has real push (plan 11), so this is not a polling shim.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `cb` | (`status`: [`PrinterStatus`](/contracts/api/interfaces/PrinterStatus)) => `void` |

#### Returns

() => `void`

#### Implementation of

```ts
PrinterAdapter.onStatus
```

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
| `image` | [`RawImageData`](/contracts/api/interfaces/RawImageData) | — full RGBA, typically from `designer.render()`. |
| `media?` | [`MediaDescriptor`](/contracts/api/interfaces/MediaDescriptor) | — which media to print on. Determines dimensions, margins, and colour mode. If omitted, uses detected media from the last `getStatus()`. |
| `options?` | [`LetraTagPrintOptions`](../interfaces/LetraTagPrintOptions.md) | — per-call options (copies, density, etc.). |

#### Returns

`Promise`\<`void`\>

#### Throws

MediaNotSpecifiedError if no media is known.

#### Implementation of

```ts
PrinterAdapter.print
```
