# Variable: DEVICES

```ts
const DEVICES: Record<DeviceKey, LetraTagDevice>;
```

Registry of supported LetraTag devices, keyed by the device's
stable `key` field (`LT_200B`). Values are the full contracts
`DeviceEntry`.
