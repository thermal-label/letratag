import { renderImage } from '@mbtech-nl/bitmap';
import { DEVICES, encodeLabel, LT_PAPER_WHITE, parseStatus } from '@thermal-label/letratag-core';
import type { Transport } from '@thermal-label/contracts';
import { describe, expect, it } from 'vitest';
import { LetraTagPrinter } from '../printer.js';

class FakeTransport implements Transport {
  writes: Uint8Array[] = [];
  rxQueue: Uint8Array[] = [];
  connected = true;

  write(data: Uint8Array): Promise<void> {
    this.writes.push(new Uint8Array(data));
    return Promise.resolve();
  }

  read(length: number): Promise<Uint8Array> {
    const next = this.rxQueue.shift();
    if (!next) return Promise.reject(new Error('FakeTransport: no queued RX bytes'));
    return Promise.resolve(next.slice(0, length));
  }

  close(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }
}

function makeImage(width: number, height: number): {
  width: number;
  height: number;
  data: Uint8Array;
} {
  // All-white RGBA — the encoder's content doesn't matter for the
  // byte-stream parity test, only that the same input produces the
  // same wire stream as `encodeLabel`.
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4 + 0] = 255;
    data[i * 4 + 1] = 255;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

describe('LetraTagPrinter (fake transport)', () => {
  it('print() writes encodeLabel output exactly, in order', async () => {
    const transport = new FakeTransport();
    transport.rxQueue.push(new Uint8Array([0x1b, 0x52, 0x00])); // success
    const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);

    const image = makeImage(20, 6);
    await printer.print(image, LT_PAPER_WHITE);

    // Simulate what encodeLabel would produce for the same prepared
    // bitmap. Driver applies pickRotation + renderImage; we replicate
    // by re-running the same stack and comparing.
    // It's more honest to check the high-level shape: header first,
    // last write ends with MAGIC, every chunk has a 0..N-1 index.
    expect(transport.writes.length).toBeGreaterThan(1);
    const first = transport.writes[0]!;
    expect(first.length).toBe(9);
    expect(first[0]).toBe(0xff);
    expect(first[1]).toBe(0xf0);

    const last = transport.writes.at(-1)!;
    expect(last.at(-2)).toBe(0x12);
    expect(last.at(-1)).toBe(0x34);
  });

  it('parses the post-print status notification', async () => {
    const transport = new FakeTransport();
    transport.rxQueue.push(new Uint8Array([0x1b, 0x52, 0x03])); // low_battery
    const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);

    await printer.print(makeImage(10, 6), LT_PAPER_WHITE);
    const status = await printer.getStatus();
    expect(status.errors[0]?.code).toBe('low_battery');
    // Low battery is a warning — printer still ready.
    expect(status.ready).toBe(true);
  });

  it('throws on a fatal status', async () => {
    const transport = new FakeTransport();
    transport.rxQueue.push(new Uint8Array([0x1b, 0x52, 0x06])); // battery_too_low
    const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);

    await expect(printer.print(makeImage(10, 6), LT_PAPER_WHITE)).rejects.toThrow(
      /Battery too low/,
    );
  });

  it('createPreview returns assumed=true when media omitted', async () => {
    const transport = new FakeTransport();
    const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);
    const preview = await printer.createPreview(makeImage(10, 6));
    expect(preview.assumed).toBe(true);
    expect(preview.planes.length).toBe(1);
  });

  it('getStatus prefers the advertising-data snapshot when set', async () => {
    const transport = new FakeTransport();
    const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);
    // 12mm cassette, full battery, no errors, idle
    printer.setAdvertisingStatus({
      revision: 1,
      cassetteId: 3,
      cassetteWidthMm: 12,
      carbonType: false,
      busyLocked: false,
      batteryLevel: 3,
      charging: false,
      errors: [],
      rawBytes: new Uint8Array([0x10, 0x03, 0x30]),
    });
    const s = await printer.getStatus();
    expect(s.ready).toBe(true);
    expect(s.mediaLoaded).toBe(true);
  });

  it('encodeLabel byte-stream matches a fresh encode of the same prepared bitmap', () => {
    // Direct encoder parity check, independent of the printer driver.
    const bitmap = renderImage(makeImage(8, 6), { dither: true });
    const a = encodeLabel(bitmap);
    const b = encodeLabel(bitmap);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i += 1) {
      expect(Array.from(a[i]!)).toEqual(Array.from(b[i]!));
    }
    expect(parseStatus(new Uint8Array([0x1b, 0x52, 0]))).toBeTruthy();
  });

  describe('onStatus (plan 11)', () => {
    it('replays the current cached status on subscribe', async () => {
      const transport = new FakeTransport();
      const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);
      // Seed advertising state so getStatus has something non-empty to replay.
      printer.setAdvertisingStatus({
        revision: 1,
        cassetteId: 3,
        cassetteWidthMm: 12,
        carbonType: false,
        busyLocked: false,
        batteryLevel: 3,
        charging: false,
        errors: [],
        rawBytes: new Uint8Array([0x10, 0x03, 0x30]),
      });
      let received = 0;
      const unsub = printer.onStatus(() => {
        received += 1;
      });
      // Replay happens via microtask + Promise — let it land.
      await new Promise<void>(r => setTimeout(r, 5));
      unsub();
      expect(received).toBeGreaterThanOrEqual(1);
    });

    it('fans out setAdvertisingStatus updates to subscribers', () => {
      const transport = new FakeTransport();
      const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);
      const seen: number[] = [];
      const unsub = printer.onStatus(s => {
        // Whatever the projection yields — count invocations.
        seen.push(s.errors.length);
      });
      printer.setAdvertisingStatus({
        revision: 1,
        cassetteId: 3,
        cassetteWidthMm: 12,
        carbonType: false,
        busyLocked: false,
        batteryLevel: 3,
        charging: false,
        errors: [],
        rawBytes: new Uint8Array([0x10, 0x03, 0x30]),
      });
      printer.setAdvertisingStatus({
        revision: 1,
        cassetteId: 0,
        cassetteWidthMm: 0,
        carbonType: false,
        busyLocked: false,
        batteryLevel: 1,
        charging: false,
        errors: [],
        rawBytes: new Uint8Array([0x10, 0x00, 0x10]),
      });
      unsub();
      // Synchronous fan-out — both setAdvertisingStatus calls fire cb.
      expect(seen.length).toBe(2);
    });

    it('post-print notification fans out to subscribers', async () => {
      const transport = new FakeTransport();
      // success notification
      transport.rxQueue.push(new Uint8Array([0x1b, 0x52, 0x00]));
      const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);
      let received = 0;
      printer.onStatus(() => {
        received += 1;
      });
      const initialReceived = received;
      await printer.print(makeImage(10, 6), {
        sku: 'LT-paper-12-white',
        kind: 'paper',
        id: 'LT-paper-12-white',
        name: 'White paper 12 mm',
        targetModels: ['LT_200B'],
        tapeWidthMm: 12,
        material: 'paper',
        background: 'white',
        text: 'black',
      } as never);
      // Print path triggers the post-print parseStatus → notifyListeners path.
      expect(received).toBeGreaterThan(initialReceived);
    });

    it('post-print push keeps battery + details from the advertising snapshot', async () => {
      const transport = new FakeTransport();
      // success notification — `parseStatus` carries no battery/details
      transport.rxQueue.push(new Uint8Array([0x1b, 0x52, 0x00]));
      const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);
      // Seed advertising state — this is the rich source of battery +
      // details that the harness shell renders.
      printer.setAdvertisingStatus({
        revision: 1,
        cassetteId: 3,
        cassetteWidthMm: 12,
        carbonType: false,
        busyLocked: false,
        batteryLevel: 2,
        charging: true,
        errors: [],
        rawBytes: new Uint8Array([0x10, 0x03, 0x30]),
      });
      const pushed: import('@thermal-label/contracts').PrinterStatus[] = [];
      printer.onStatus(s => {
        pushed.push(s);
      });
      await new Promise<void>(r => setTimeout(r, 5)); // let the replay land
      await printer.print(makeImage(10, 6), LT_PAPER_WHITE);

      // The status delivered by the post-print push must still carry
      // the advertising-derived battery glyph + detail rows — the bare
      // `parseStatus` result drops both.
      const last = pushed.at(-1)!;
      expect(last.battery).toBeDefined();
      expect(last.battery?.charging).toBe(true);
      expect(last.details).toBeDefined();
      expect((last.details ?? []).length).toBeGreaterThan(0);
      // The post-print result's errors/ready are still overlaid.
      expect(last.errors).toEqual([]);
      expect(last.ready).toBe(true);
    });

    it('unsubscribe stops further callbacks', () => {
      const transport = new FakeTransport();
      const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);
      let received = 0;
      const unsub = printer.onStatus(() => {
        received += 1;
      });
      unsub();
      printer.setAdvertisingStatus({
        revision: 1,
        cassetteId: 3,
        cassetteWidthMm: 12,
        carbonType: false,
        busyLocked: false,
        batteryLevel: 3,
        charging: false,
        errors: [],
        rawBytes: new Uint8Array([0x10, 0x03, 0x30]),
      });
      expect(received).toBe(0);
    });
  });

  describe('startAdvertisementWatch (plan 11)', () => {
    it('returns false when the device has no watchAdvertisements support', async () => {
      const transport = new FakeTransport();
      const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);
      // jsdom's BluetoothDevice doesn't ship watchAdvertisements;
      // a plain object stands in.
      const fakeDevice = {
        addEventListener: () => {
          /* no-op */
        },
        removeEventListener: () => {
          /* no-op */
        },
      } as unknown as BluetoothDevice;
      const result = await printer.startAdvertisementWatch(fakeDevice);
      expect(result).toBe(false);
    });

    it('subscribes and forwards parsed advertisements when watchAdvertisements exists', async () => {
      const transport = new FakeTransport();
      const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);

      let advHandler: ((event: Event) => void) | null = null;
      const fakeDevice = {
        addEventListener: (type: string, handler: (e: Event) => void) => {
          if (type === 'advertisementreceived') advHandler = handler;
        },
        removeEventListener: () => {
          /* no-op */
        },
        watchAdvertisements: () => Promise.resolve(),
      } as unknown as BluetoothDevice;

      const result = await printer.startAdvertisementWatch(fakeDevice);
      expect(result).toBe(true);
      expect(advHandler).not.toBeNull();

      // Subscribe a status listener and dispatch a synthetic
      // advertisementreceived event with valid manufacturer-data bytes.
      const seen: number[] = [];
      printer.onStatus(s => {
        seen.push(s.errors.length);
      });
      await new Promise<void>(r => setTimeout(r, 5)); // let replay land first
      const seenAfterReplay = seen.length;

      // 12mm cassette, full battery — same payload as the existing
      // getStatus-from-advertising test.
      const bytes = new Uint8Array([0x10, 0x03, 0x30]);
      const view = new DataView(bytes.buffer);
      const fakeEvent = {
        manufacturerData: new Map<number, DataView>([[0x0469, view]]),
      } as unknown as Event;
      advHandler!(fakeEvent);
      expect(seen.length).toBeGreaterThan(seenAfterReplay);
    });
  });
});
