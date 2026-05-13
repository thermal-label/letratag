# Variable: PROTOCOLS

```ts
const PROTOCOLS: ReadonlySet<string>;
```

Wire protocols this core's encoder produces correct bytes for.
Pair with `DEVICE_REGISTRY_DATA` and `resolveSupportedDevices`
from `@thermal-label/contracts` to filter a device list to what
this runtime can drive.
