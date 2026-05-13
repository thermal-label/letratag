# Function: findMediaBySku()

```ts
function findMediaBySku(sku: string): LetraTagMedia | undefined;
```

Find a media entry by vendor SKU. LT cassettes ship under many
regional part numbers (US 91XXX vs EU S07XXXXX); this helper does
the lookup against `MediaDescriptor.skus`.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `sku` | `string` |

## Returns

[`LetraTagMedia`](../interfaces/LetraTagMedia.md) \| `undefined`
