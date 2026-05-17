# Browser (Web Bluetooth)

`@thermal-label/letratag-web` is the primary surface for this
driver. It uses the browser
[Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
to pair with the LT-200B's BLE GATT service, derives the
TX / RX / short-command characteristic UUIDs from the observed
service-UUID tail, and sends chunked print payloads via
write-without-response. It implements the `PrinterAdapter` contract
from `@thermal-label/contracts` and builds on `WebBluetoothTransport`
from `@thermal-label/transport`. No server or native dependencies.

## Browser support

| Browser    | Support                              |
| ---------- | ------------------------------------ |
| Chrome 56+ | ✅ desktop, Android, ChromeOS        |
| Edge 79+   | ✅                                   |
| Firefox    | ❌ no Web Bluetooth                  |
| Safari     | ❌ no Web Bluetooth                  |

Web Bluetooth requires a **secure context** (`https://` or
`localhost`) and a **user gesture** (click, keypress) for the
initial `requestDevice` call. Subsequent reconnects to a still-
permitted device do not need a fresh gesture.

## Install

```bash
pnpm add @thermal-label/letratag-web
```

---

## Quick start

```ts
import {
  requestPrinter,
  LT_PAPER_WHITE,
  renderText,
} from '@thermal-label/letratag-web';

// Must run from a user gesture.
const { printer } = await requestPrinter();
try {
  const bitmap = renderText('hello LT-200B', { fontSizePt: 18 });
  await printer.print(bitmap, LT_PAPER_WHITE);
} finally {
  await printer.close();
}
```

`renderText` and `renderImage` come from
[`@mbtech-nl/bitmap`](https://www.npmjs.com/package/@mbtech-nl/bitmap)
and are re-exported by the core package. You can also build
`LabelBitmap` values directly — `{ widthPx, heightPx, data: Uint8Array }`
where `data` is row-major MSB-first 1bpp.

---

## Pairing

```ts
const result = await requestPrinter({
  // Optional: override the BLE name filter. Defaults to the
  // registry's `namePrefix` (`Letratag `).
  namePrefix: 'Letratag ',
});

result.printer;                  // PrinterAdapter — has print / getStatus / close / …
result.device;                   // raw BluetoothDevice (for diagnostics export)
result.serviceUuidObserved;      // full observed service UUID
result.txUuidDerived;            // derived from service tail
result.rxUuidDerived;
result.shortCommandUuidDerived;
result.linkMtu;                  // best-effort link MTU; null on most browsers
```

The picker filters by **both** `namePrefix` and the canonical
`be3dd650-…` service UUID. After connect, the driver enumerates
primary services, picks the one whose UUID starts with `be3dd650-`,
and derives the TX / RX / short-command UUIDs from that service's
tail — tolerating UUID-body variance across firmware revisions
(see [`DECISIONS.md`](https://github.com/thermal-label/letratag/blob/main/DECISIONS.md) D4).

---

## Status

```ts
const status = await printer.getStatus();

status.ready;       // printer is idle and error-free
status.mediaLoaded; // cassette is inserted
status.errors;      // structured PrinterError[]
```

`getStatus()` returns the most recent advertising-data snapshot when
one is available, mapped through `advertisingToPrinterStatus`. There
is no on-demand poll: the advertising-data channel is **continuous
and connection-free**, so the driver keeps the latest scan-side
snapshot and serves it synchronously. Hosts that want a fresh
broadcast should use the advertising-event API directly (see below).

---

## Passive cassette / battery scanning

The LT-200B broadcasts a 3-byte manufacturer-data payload in every
advertising packet — cassette presence, tape width (`cassetteId`),
battery level, charging flag, and four error bits. **No connection
required.** The web package re-exports the parser:

```ts
import {
  parseAdvertisingStatus,
  decodeAdvertisementManufacturerData,
} from '@thermal-label/letratag-web';

// Web Bluetooth's advertising-event API is currently flag-gated in
// Chrome (`chrome://flags/#enable-experimental-web-platform-features`).
device.addEventListener('advertisementreceived', event => {
  const adv = decodeAdvertisementManufacturerData(event.manufacturerData);
  if (adv) {
    console.log('cassetteId', adv.cassetteId, 'battery', adv.batteryLevel);
  }
});
await device.watchAdvertisements();
```

For the byte layout see
[BLE advertising manufacturer data](./protocol/letratag-bt#1.-ble-advertising-manufacturer-data-—-continuous).

---

## Previewing

```ts
const preview = await printer.createPreview(bitmap, { media: LT_PAPER_WHITE });
// preview.planes[0].bitmap is the 1bpp LabelBitmap the printer would render
// preview.planes[0].displayColor is '#000000'
```

For offline previews without a live BLE connection, import
`createPreviewOffline` from `@thermal-label/letratag-core`.

---

## Multi-copy jobs

The encoder produces one job per call. For `copies > 1`, emit
`copies - 1` jobs with `autoCut: false` (`CUT 0x31` suppresses the
cut between copies), then one final job with `autoCut: true`
(`CUT 0x30` finalises). The driver wraps this pattern:

```ts
await printer.print(bitmap, LT_PAPER_WHITE, { copies: 3 });
// emits three sequential BLE print payloads under the hood
```

Between copies the host can read the RX notification (`parseStatus`)
to confirm each one before sending the next. Realistic LT labels
never approach the 256-chunk hard ceiling (~128 KiB body); the
encoder throws if they do.

---

## React example

```tsx
import { useState } from 'react';
import {
  requestPrinter,
  LT_PAPER_WHITE,
  renderText,
  type LetraTagPrinter,
} from '@thermal-label/letratag-web';

export function PrintButton() {
  const [printer, setPrinter] = useState<LetraTagPrinter | null>(null);

  async function connect() {
    const { printer } = await requestPrinter();
    setPrinter(printer);
  }

  async function print() {
    if (!printer) return;
    const bitmap = renderText('hello', { fontSizePt: 18 });
    await printer.print(bitmap, LT_PAPER_WHITE);
  }

  async function disconnect() {
    if (!printer) return;
    await printer.close();
    setPrinter(null);
  }

  return (
    <div>
      <button onClick={connect} disabled={!!printer}>Connect</button>
      <button onClick={print} disabled={!printer}>Print</button>
      <button onClick={disconnect} disabled={!printer}>Disconnect</button>
    </div>
  );
}
```

Keep the printer reference in component state. Call `close()` on
unmount — it disconnects the GATT session, which is also the
documented recovery path for partial-job state.

---

## Recovery from partial-job state

There is no soft-reset directive on the wire. If the host
disconnects mid-stream, or a chunk write fails, the recovery is to
**tear down the GATT session and reconnect** — call
`printer.close()` followed by a fresh `requestPrinter()`. The
firmware discards partial bodies on disconnect; the next job prints
cleanly. The hardware power button on the chassis is a separate hard
reset.

---

## MTU and write-without-response

Chrome on Linux does **not** auto-fragment
`writeValueWithoutResponse` writes beyond the negotiated link MTU —
oversize writes fail the first chunk of a multi-chunk job with
"GATT operation failed for unknown reason". The driver passes the
device registry's `bluetooth-gatt.mtu` (currently `247`) through to
the encoder, which caps each BLE write at `min(500, mtu - 1)` body
bytes (one byte reserved for the chunk-index prefix). If you call
the encoder directly, pass an `mtu` override; if you swap in a Node
BLE transport later, the same ceiling applies. See
[MTU and chunking](./protocol/letratag-bt#mtu-and-chunking) in the
protocol reference for the firmware-side constraint.

::: info No Node transport in Phase 1
Phase 1 is web-only. A future Node path will not use `noble`;
candidates under evaluation are `webbluetooth` (Node-side polyfill),
`node-ble` (D-Bus on Linux), or shelling out to
`bluetoothctl` + `gatttool`.
:::

---

## How it works

`requestPrinter()`:

1. Calls `navigator.bluetooth.requestDevice` with
   `{ filters: [{ namePrefix, services: [SERVICE_UUID] }] }`.
2. Connects to the GATT server.
3. Walks primary services, picks the one starting with `be3dd650-`.
4. Derives TX / RX / short-command UUIDs by appending the service-tail
   to the canonical `be3dd651`/`52`/`53` prefixes.
5. Starts notifications on RX.
6. Wraps the characteristics in `WebBluetoothTransport.fromCharacteristics`
   with `mtu = 247` from the registry.

`printer.print()` then calls `encodeLabel(bitmap, options, undefined,
{ engine, media, mtu })` to produce the ordered list of BLE writes
and sends each via `writeValueWithoutResponse`. `getStatus()` reads
the cached advertising-data snapshot. `close()` disconnects the GATT
server.

---

## API summary

| Export                                  | Description                                                   |
| --------------------------------------- | ------------------------------------------------------------- |
| `requestPrinter(opts?)`                 | Open the BLE picker, pair, resolve characteristics            |
| `requestPrinters(opts?)`                | Sibling-symmetric multi-engine factory (LT-200B has one)      |
| `decodeAdvertisementManufacturerData()` | Helper for advertising-event listeners                        |
| `LetraTagPrinter`                       | Adapter class implementing `PrinterAdapter`                   |
| `PairResult`                            | `{ printer, device, serviceUuidObserved, txUuidDerived, … }`  |

`LetraTagPrinter` implements `PrinterAdapter` from
[`@thermal-label/contracts`](https://www.npmjs.com/package/@thermal-label/contracts) —
`print`, `createPreview`, `getStatus`, `close`, plus the `family`,
`model`, `device`, `connected` getters.

## Hardware harness

The hosted org-wide harness at
<https://thermal-label.github.io/harness/letratag/> wraps the same
pairing + diagnostic-print flow as the sibling drivers' harness
apps: pair an LT-200B in the browser, run an identity probe, fire
diagnostic prints, and submit a verification report.
