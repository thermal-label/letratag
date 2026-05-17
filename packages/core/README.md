# @thermal-label/letratag-core

[![CI](https://github.com/thermal-label/letratag/actions/workflows/ci.yml/badge.svg)](https://github.com/thermal-label/letratag/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@thermal-label/letratag-core.svg)](https://npmjs.com/package/@thermal-label/letratag-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

Core protocol encoder, status parsers, and media / device registries
for DYMO LetraTag **LT-200B** — a BLE-only handheld label printer.

This package is the shared foundation used by the browser package
`@thermal-label/letratag-web`. There is no Node package today
(no Node BLE GATT transport in `@thermal-label/transport` yet).

## Install

```bash
pnpm add @thermal-label/letratag-core
```

## Quick start

```ts
import {
  encodeLabel,
  parseStatus,
  parseAdvertisingStatus,
  DEVICES,
} from '@thermal-label/letratag-core';
import { renderText } from '@mbtech-nl/bitmap';

const device = DEVICES.LT_200B;
const bitmap = renderText('Hello LetraTag', { headDots: 32 });

// `encodeLabel` returns the framed BLE payload: header + chunked body.
const payload = encodeLabel(bitmap, device.engines[0], {
  copies: 1,
  cut: true,
  mtu: 247, // BLE 4.2 negotiated link MTU
});

// Ship `payload` to the printer's write-without-response TX
// characteristic via your transport of choice.
```

## API highlights

- `encodeLabel(bitmap, engine, options)` — full job encoder (header +
  directives + image + chunking).
- `parseStatus(bytes)` — 3-byte RX notification parser (job-result code).
- `parseAdvertisingStatus(bytes)` — 3-byte BLE advertising-data parser
  (cassette presence, battery, error flags — readable without a
  connection).
- `DEVICES` / `findDevice(vid, pid)` — device registry.
- `MEDIA` / `findMediaBySku(sku)` — media registry (10 LT cassettes).
- `renderImage`, `renderText` re-exported from `@mbtech-nl/bitmap`.

## Wire protocol

The full protocol spec lives at
[thermal-label.github.io/letratag/protocol/letratag-bt](https://thermal-label.github.io/letratag/protocol/letratag-bt).
The encoder in this package implements that spec.

## Documentation

Full TypeDoc reference, getting-started guide, and the wire protocol:
[thermal-label.github.io/letratag/core](https://thermal-label.github.io/letratag/core).

<!-- HARDWARE_TABLE:START -->

**1 devices** — 0 verified · 0 partial · 0 broken · 1 untested

| Model                                                                         | Key       | USB PID | Transports | Status      |
| ----------------------------------------------------------------------------- | --------- | ------- | ---------- | ----------- |
| [LetraTag LT-200B](https://thermal-label.github.io/hardware/letratag/lt-200b) | `LT_200B` | —       | BT LE      | ⏳ untested |

Click any model to open its detail page on the docs site, where engines, supported media, and verification reports live. The same data backs the [interactive cross-driver table](https://thermal-label.github.io/hardware/).

<!-- HARDWARE_TABLE:END -->
