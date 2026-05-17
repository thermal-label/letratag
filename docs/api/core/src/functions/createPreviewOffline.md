# Function: createPreviewOffline()

```ts
function createPreviewOffline(image: RawImageData, media?: LetraTagMedia): PreviewResult;
```

Generate an offline preview without a live printer connection.

Single-plane, single-ink — the LT-200B carries one ink colour per
cassette. The displayed colour pair derives from the selected
media's `text` / `background` so a "print to silver metallic"
preview shows black on silver, etc. Media defaults to
`LT_PAPER_WHITE` (white-paper cassette ships in the box) when
omitted.

## Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `image` | [`RawImageData`](/contracts/api/interfaces/RawImageData) | `undefined` |
| `media` | [`LetraTagMedia`](../interfaces/LetraTagMedia.md) | `DEFAULT_MEDIA` |

## Returns

[`PreviewResult`](/contracts/api/interfaces/PreviewResult)
