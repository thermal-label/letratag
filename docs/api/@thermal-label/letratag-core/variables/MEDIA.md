# Variable: MEDIA

```ts
const MEDIA: Record<
  | "lt-paper-white"
  | "lt-plastic-white"
  | "lt-plastic-pearl-white"
  | "lt-plastic-yellow"
  | "lt-plastic-red"
  | "lt-plastic-green"
  | "lt-plastic-blue"
  | "lt-plastic-clear"
  | "lt-metallic-silver"
  | "lt-iron-on-white", LetraTagMedia> = MEDIA_BY_ID;
```

Indexed registry of every LT cassette SKU the driver knows about,
keyed by entry id (e.g. `MEDIA['lt-paper-white']`).
