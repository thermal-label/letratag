# Function: createPreviewOffline()

```ts
function createPreviewOffline(image: RawImageData, media?: LetraTagMedia): PreviewResult;
```

Generate an offline preview without a live printer connection.

Single-plane, single-ink — the LT-200B carries one ink colour per
cassette. Display colours derive from the media's `text` /
`background`. Media defaults to `LT_PAPER_WHITE` when omitted.

## Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `image` | [`RawImageData`](/contracts/api/interfaces/RawImageData) | `undefined` |
| `media` | [`LetraTagMedia`](../interfaces/LetraTagMedia.md) | `DEFAULT_MEDIA` |

## Returns

[`PreviewResult`](/contracts/api/interfaces/PreviewResult)
