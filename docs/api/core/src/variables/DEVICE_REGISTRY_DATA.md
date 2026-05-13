# Variable: DEVICE\_REGISTRY\_DATA

```ts
const DEVICE_REGISTRY_DATA: {
  devices: readonly [{
     engines: readonly [{
        dpi: 200;
        forcedTrailingFeedMm: 6;
        headDots: 30;
        mediaCompatibility: readonly ["letratag"];
        protocol: "letratag-bt";
        role: "primary";
     }];
     family: "letratag";
     hardwareQuirks: "Lid must be closed and batteries adequately charged before the printer registers a print. Status code 7 (no cassette) is documented but never observed in practice; do not use it for cassette presence detection.";
     key: "LT_200B";
     name: "LetraTag LT-200B";
     support: {
        status: "untested";
     };
     supportStatus: "unverified";
     transports: {
        bluetooth-gatt: {
           mtu: 247;
           namePrefix: "Letratag ";
           rxCharacteristicUuid: "be3dd652-2b3d-42f1-99c1-f0f749dd0678";
           serviceUuid: "be3dd650-2b3d-42f1-99c1-f0f749dd0678";
           txCharacteristicUuid: "be3dd651-2b3d-42f1-99c1-f0f749dd0678";
        };
     };
  }];
  driver: "letratag";
  schemaVersion: 1;
} = DEVICE_REGISTRY;
```

Compiled `DeviceRegistry` for the LetraTag driver. Source of truth
lives in `packages/core/data/devices/<KEY>.json5`;
`scripts/compile-data.mjs` aggregates them into the generated TS
module imported here.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-devices"></a> `devices` | readonly \[\{ `engines`: readonly \[\{ `dpi`: `200`; `forcedTrailingFeedMm`: `6`; `headDots`: `30`; `mediaCompatibility`: readonly \[`"letratag"`\]; `protocol`: `"letratag-bt"`; `role`: `"primary"`; \}\]; `family`: `"letratag"`; `hardwareQuirks`: `"Lid must be closed and batteries adequately charged before the printer registers a print. Status code 7 (no cassette) is documented but never observed in practice; do not use it for cassette presence detection."`; `key`: `"LT_200B"`; `name`: `"LetraTag LT-200B"`; `support`: \{ `status`: `"untested"`; \}; `supportStatus`: `"unverified"`; `transports`: \{ `bluetooth-gatt`: \{ `mtu`: `247`; `namePrefix`: `"Letratag "`; `rxCharacteristicUuid`: `"be3dd652-2b3d-42f1-99c1-f0f749dd0678"`; `serviceUuid`: `"be3dd650-2b3d-42f1-99c1-f0f749dd0678"`; `txCharacteristicUuid`: `"be3dd651-2b3d-42f1-99c1-f0f749dd0678"`; \}; \}; \}\] | - |
| <a id="property-driver"></a> `driver` | `"letratag"` | `"letratag"` |
| <a id="property-schemaversion"></a> `schemaVersion` | `1` | `1` |
