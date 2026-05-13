# Type Alias: TransportType

```ts
type TransportType = "usb" | "tcp" | "serial" | "bluetooth-spp" | "bluetooth-gatt";
```

Wire-protocol-only transport types.

Distinct runtime APIs (node-usb vs WebUSB, node serialport vs Web
Serial, classic Bluetooth SPP vs BLE GATT) are *implementations* of
these transport keys, not separate keys. Per-platform packages
declare which transport types their implementations satisfy; the
registry stays wire-protocol-honest.

The two Bluetooth keys stay split — BR/EDR vs BLE radios, SDP vs
advertisement discovery, classic vs BLE pairing flows, and Web
Bluetooth being GATT-only by spec all force the separation.
