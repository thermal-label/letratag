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
| `transport` | [`TransportType`](/contracts/api/type-aliases/TransportType) |

## Returns

readonly [`DeviceEntry`](/contracts/api/interfaces/DeviceEntry)[]
