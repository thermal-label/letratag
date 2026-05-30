# @thermal-label/letratag-web

[![CI](https://github.com/thermal-label/letratag/actions/workflows/ci.yml/badge.svg)](https://github.com/thermal-label/letratag/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@thermal-label/letratag-web.svg)](https://npmjs.com/package/@thermal-label/letratag-web)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

Web Bluetooth driver for DYMO LetraTag **LT-200B** — connect and
print labels directly from a Chromium-class browser via GATT.

## Install

```bash
pnpm add @thermal-label/letratag-web
```

## Quick start

```ts
import { requestPrinter } from '@thermal-label/letratag-web';
import { renderText } from '@thermal-label/letratag-core';

// Must be called from a user gesture (click handler).
const printer = await requestPrinter();
try {
  const bitmap = renderText('Hello LetraTag', { headDots: 32 });
  await printer.print(bitmap);
} finally {
  await printer.close();
}
```

## Browser support

Web Bluetooth is required. Tested:

| Platform | Chrome | Edge | Firefox | Safari |
| -------- | :----: | :--: | :-----: | :----: |
| Linux    |   ✓    |  ✓   |    ✗    |  n/a   |
| Windows  |   ✓    |  ✓   |    ✗    |  n/a   |
| macOS    |   ✓    |  ✓   |    ✗    |   ✗    |
| Android  |   ✓    |  ✓   |    ✗    |  n/a   |

Firefox does not implement Web Bluetooth. Safari does not support it
on macOS. iOS Safari has no Web Bluetooth — pair through a third-party
app like Bluefy if you need iOS coverage.

## Passive cassette / battery scanning

LT-200B continuously broadcasts cassette, battery, and error state in
its BLE advertising packets. The web package can read this without a
paired connection:

```ts
import { scanAdvertising } from '@thermal-label/letratag-web';

const stop = await scanAdvertising(status => {
  console.log('cassette loaded:', status.cassetteLoaded);
  console.log('battery level:', status.batteryLevel, '/ 3');
});
// Later:
stop();
```

## Documentation

Full guide + TypeDoc reference:
[thermal-label.github.io/letratag/web](https://thermal-label.github.io/letratag/web).

For the hardware harness (verification flow):
[thermal-label.github.io/harness/letratag](https://thermal-label.github.io/harness/letratag/)
(bench-only today; hosted bundle pending).

<!-- HARDWARE_TABLE:START -->
**1 devices** — 1 verified · 0 partial · 0 broken · 0 untested

| Model | Key | USB PID | Transports | Status |
| --- | --- | --- | --- | --- |
| [LetraTag LT-200B](https://thermal-label.github.io/hardware/letratag/lt-200b) | `LT_200B` | — | BT LE | ✅ verified |

Click any model to open its detail page on the docs site, where engines, supported media, and verification reports live. The same data backs the [interactive cross-driver table](https://thermal-label.github.io/hardware/).
<!-- HARDWARE_TABLE:END -->
