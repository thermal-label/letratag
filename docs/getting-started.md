# Getting Started

The LT-200B is **BLE-only** — no USB, no serial, no TCP. The driver
runs in the browser via Web Bluetooth. There is no Node.js package
today.

## Install

```bash
pnpm add @thermal-label/letratag-web
```

`@thermal-label/letratag-web` re-exports the registry, types, status
parsers, and encoder from `@thermal-label/letratag-core`, so you
usually only need the one package.

## Browser support

| Browser    | Support                                    |
| ---------- | ------------------------------------------ |
| Chrome 56+ | ✅ desktop + Android                       |
| Edge 79+   | ✅                                         |
| Firefox    | ❌ no Web Bluetooth                        |
| Safari     | ❌ no Web Bluetooth                        |

Web Bluetooth requires a **secure context** (`https://` or
`localhost`) and a **user gesture** for the initial `requestDevice`
call.

## Quick start

```ts
import {
  requestPrinter,
  LT_PAPER_WHITE,
  renderText,
} from '@thermal-label/letratag-web';

// Must be called from a user gesture (button click, etc.)
const { printer } = await requestPrinter();
try {
  // Render a 1bpp label bitmap from a string. The encoder will
  // centre it within the printer's 32-row protocol frame.
  const bitmap = renderText('hello LT-200B', { fontSizePt: 18 });
  await printer.print(bitmap, LT_PAPER_WHITE);
} finally {
  await printer.close();
}
```

`requestPrinter()` opens the browser's BLE picker filtered to
LetraTag-family advertisements (`Letratag <MAC>` + the canonical
`be3dd650-…` service UUID), connects, and resolves the GATT
characteristics by service-UUID-tail derivation. The returned
`PairResult` also exposes the observed UUIDs and link MTU for
diagnostics — see the [Web guide](./web) for the full surface.

## Cassette / battery status without printing

Cassette presence, tape width, and battery level ride in the
LT-200B's BLE **advertising-data manufacturer payload** — readable
on a passive scan, no connection required. The status parser is
re-exported from the web package:

```ts
import { parseAdvertisingStatus } from '@thermal-label/letratag-web';

// In a `BluetoothAdvertisingEvent` handler:
const bytes = new Uint8Array(event.manufacturerData.values().next().value.buffer);
const status = parseAdvertisingStatus(bytes);
// status.cassetteId, status.batteryLevel, status.tapeJam, …
```

Note: the advertising-event API is experimental and currently
flag-gated in Chrome (`chrome://flags/#enable-experimental-web-platform-features`).
The [protocol reference](./protocol/letratag-bt#1.-ble-advertising-manufacturer-data-—-continuous)
documents the byte layout.

## Next steps

- [Web guide](./web) — pairing, status, multi-copy jobs, React example.
- [Core API](./core) — registries, encoder, offline preview.
- [Protocol reference](./protocol/letratag-bt) — every byte on the wire.
- [Hardware harness](https://thermal-label.github.io/harness/letratag/)
  — the hosted browser app for pairing, diagnostic prints, and
  verification reports.
