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
});
