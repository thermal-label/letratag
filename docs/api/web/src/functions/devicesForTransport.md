# Function: devicesForTransport()

```ts
function devicesForTransport(transport: TransportType): readonly DeviceEntry[];
```

Filter the registry to entries declaring `transport`. Used to
populate `DeviceIdentificationRequiredError.candidates` from the
harness shell.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `transport` | [`TransportType`](../../../core/src/type-aliases/TransportType.md) |

## Returns

readonly [`DeviceEntry`](../../../core/src/interfaces/DeviceEntry.md)[]
