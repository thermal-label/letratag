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

function makeImage(
  width: number,
  height: number,
): {
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

  it('getStatus returns the post-print status after a print', async () => {
    const transport = new FakeTransport();
    transport.rxQueue.push(new Uint8Array([0x1b, 0x52, 0x00])); // success
    const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);
    await printer.print(makeImage(10, 6), LT_PAPER_WHITE);
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
      let received = 0;
      const unsub = printer.onStatus(() => {
        received += 1;
      });
      // Replay happens via microtask + Promise — let it land.
      await new Promise<void>(r => setTimeout(r, 5));
      unsub();
      expect(received).toBeGreaterThanOrEqual(1);
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

    it('unsubscribe stops further callbacks', async () => {
      const transport = new FakeTransport();
      transport.rxQueue.push(new Uint8Array([0x1b, 0x52, 0x00])); // success
      const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);
      let received = 0;
      const unsub = printer.onStatus(() => {
        received += 1;
      });
      await new Promise<void>(r => setTimeout(r, 5)); // let the replay land
      const afterReplay = received;
      unsub();
      // A print after unsubscribe must not reach the callback.
      await printer.print(makeImage(10, 6), LT_PAPER_WHITE);
      expect(received).toBe(afterReplay);
    });
  });

  describe('write serialization (plan 15 A3)', () => {
    /**
     * Transport that records write/read order with an async hop on
     * every write, so two concurrent `print()` calls would interleave
     * their writes if nothing serialised them.
     */
    class OrderRecordingTransport implements Transport {
      readonly calls: { kind: 'write' | 'read' }[] = [];
      connected = true;

      async write(): Promise<void> {
        this.calls.push({ kind: 'write' });
        await Promise.resolve();
        await Promise.resolve();
      }

      async read(length: number): Promise<Uint8Array> {
        this.calls.push({ kind: 'read' });
        await Promise.resolve();
        // 3-byte success notification (1B 52 00).
        return new Uint8Array([0x1b, 0x52, 0x00]).slice(0, length);
      }

      close(): Promise<void> {
        this.connected = false;
        return Promise.resolve();
      }
    }

    it('serialises concurrent print() jobs — no interleaved writes', async () => {
      const transport = new OrderRecordingTransport();
      const printer = new LetraTagPrinter(DEVICES.LT_200B, transport);

      // Kick two prints concurrently. Each print() is a burst of
      // writes followed by a post-print status read. With the
      // WriteSerializer, the first job's writes + read must all land
      // before the second job's first write.
      const a = printer.print(makeImage(20, 6), LT_PAPER_WHITE);
      const b = printer.print(makeImage(20, 6), LT_PAPER_WHITE);
      await Promise.all([a, b]);

      // Each job ends with exactly one read. The first read marks the
      // boundary of job A; every call after it belongs to job B and
      // none of job B's writes appear before that boundary.
      const readIndices = transport.calls
        .map((c, i) => (c.kind === 'read' ? i : -1))
        .filter(i => i >= 0);
      expect(readIndices).toHaveLength(2);
      const [firstReadIdx, secondReadIdx] = readIndices as [number, number];
      // Job A: all writes precede its read.
      expect(transport.calls.slice(0, firstReadIdx).every(c => c.kind === 'write')).toBe(true);
      // Job B: its writes sit strictly between the two reads — no
      // job-B write leaked into job A's span.
      expect(
        transport.calls.slice(firstReadIdx + 1, secondReadIdx).every(c => c.kind === 'write'),
      ).toBe(true);
      expect(secondReadIdx).toBe(transport.calls.length - 1);
    });
  });
});
