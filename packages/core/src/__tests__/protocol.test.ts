import { createBitmap } from '@mbtech-nl/bitmap';
import type { LabelBitmap } from '@mbtech-nl/bitmap';
import type { PrintEngine } from '@thermal-label/contracts';
import { describe, expect, it } from 'vitest';
import {
  BODY_CHUNK,
  CUT_AT_END,
  CUT_SUPPRESS,
  END,
  FORM_FEED,
  MAGIC,
  PROTOCOL_HEAD_FRAME,
  START,
  STATUS,
  buildCut,
  buildHeader,
  buildMediaType,
  buildNumberOfCopies,
  buildPrintPayload,
  chunkPayload,
  encodeBitmap,
  encodeLabel,
  encodeSetCassetteType,
} from '../protocol.js';

function setPixel(bitmap: LabelBitmap, x: number, y: number): void {
  const stride = Math.ceil(bitmap.widthPx / 8);
  const byteIndex = y * stride + (x >>> 3);
  const bit = 7 - (x & 7);
  bitmap.data[byteIndex] = (bitmap.data[byteIndex] ?? 0) | (1 << bit);
}

function readU32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] ?? 0) |
    ((buf[offset + 1] ?? 0) << 8) |
    ((buf[offset + 2] ?? 0) << 16) |
    ((buf[offset + 3] ?? 0) << 24)
  );
}

describe('directives', () => {
  it('START contains the official-app job ID prefix [154, 2, 0, 0]', () => {
    expect(Array.from(START)).toEqual([0x1b, 0x73, 154, 2, 0, 0]);
  });

  it('STATUS, END, FORM_FEED are documented two-byte sequences', () => {
    expect(Array.from(STATUS)).toEqual([0x1b, 0x41]);
    expect(Array.from(END)).toEqual([0x1b, 0x51]);
    expect(Array.from(FORM_FEED)).toEqual([0x1b, 0x45]);
  });

  it('NUMBER_OF_COPIES is 3 bytes [1B 23 N]', () => {
    expect(Array.from(buildNumberOfCopies(1))).toEqual([0x1b, 0x23, 0x01]);
    expect(Array.from(buildNumberOfCopies(7))).toEqual([0x1b, 0x23, 0x07]);
    // clamped to >= 1 and <= 0xff
    expect(buildNumberOfCopies(0)[2]).toBe(0x01);
    expect(buildNumberOfCopies(300)[2]).toBe(0xff);
  });

  it('CUT is 3 bytes [1B 70 cmd]', () => {
    expect(Array.from(buildCut(CUT_AT_END))).toEqual([0x1b, 0x70, 0x30]);
    expect(Array.from(buildCut(CUT_SUPPRESS))).toEqual([0x1b, 0x70, 0x31]);
  });

  it('MEDIA_TYPE is 6 bytes [1B 4D id 00 00 00] (per MediaTypeRequest)', () => {
    expect(Array.from(buildMediaType(0x03))).toEqual([0x1b, 0x4d, 0x03, 0x00, 0x00, 0x00]);
  });

  it('MAGIC is the 0x12 0x34 trailer', () => {
    expect([...MAGIC]).toEqual([0x12, 0x34]);
  });
});

describe('header / checksum', () => {
  it('produces the observed checksum for a fixed length', () => {
    // payloadLength = 1000 (LE = e8 03 00 00).
    // header bytes 0..7 = [0xff, 0xf0, 0x12, 0x34, 0xe8, 0x03, 0x00, 0x00]
    // sum = 800 -> 800 & 0xff = 0x20.
    const header = buildHeader(1000);
    expect(Array.from(header)).toEqual([0xff, 0xf0, 0x12, 0x34, 0xe8, 0x03, 0x00, 0x00, 0x20]);
  });

  it('header is exactly 9 bytes', () => {
    expect(buildHeader(0).length).toBe(9);
    expect(buildHeader(1).length).toBe(9);
    expect(buildHeader(0x7fffffff).length).toBe(9);
  });
});

describe('encodeBitmap', () => {
  it('single black pixel at (0, 0) → first 4 bytes = 00 00 00 80', () => {
    // No y+1 skew. Pixel (x=0, y=0) → byte 3, bit 7.
    const bitmap = createBitmap(1, PROTOCOL_HEAD_FRAME);
    setPixel(bitmap, 0, 0);
    expect(Array.from(encodeBitmap(bitmap).subarray(0, 4))).toEqual([0x00, 0x00, 0x00, 0x80]);
  });

  it('single black pixel at (0, 7) → byte 3, bit 0 (= 0x01)', () => {
    const bitmap = createBitmap(1, PROTOCOL_HEAD_FRAME);
    setPixel(bitmap, 0, 7);
    expect(Array.from(encodeBitmap(bitmap).subarray(0, 4))).toEqual([0x00, 0x00, 0x00, 0x01]);
  });

  it('single black pixel at (0, 24) → byte 0, bit 7 (= 0x80 in byte 0)', () => {
    const bitmap = createBitmap(1, PROTOCOL_HEAD_FRAME);
    setPixel(bitmap, 0, 24);
    expect(Array.from(encodeBitmap(bitmap).subarray(0, 4))).toEqual([0x80, 0x00, 0x00, 0x00]);
  });

  it('single black pixel at (0, 31) → byte 0, bit 0 (= 0x01 in byte 0)', () => {
    const bitmap = createBitmap(1, PROTOCOL_HEAD_FRAME);
    setPixel(bitmap, 0, 31);
    expect(Array.from(encodeBitmap(bitmap).subarray(0, 4))).toEqual([0x01, 0x00, 0x00, 0x00]);
  });

  it('total length is 4 × feed_count', () => {
    const bitmap = createBitmap(7, PROTOCOL_HEAD_FRAME);
    expect(encodeBitmap(bitmap).length).toBe(4 * 7);
  });

  it('all-white input emits all zero bytes', () => {
    const bitmap = createBitmap(8, PROTOCOL_HEAD_FRAME);
    expect(encodeBitmap(bitmap).every(b => b === 0)).toBe(true);
  });

  it('shorter source bitmaps are centered within the 32-row frame', () => {
    // 30-row source: top pad = floor((32-30)/2) = 1; user y=0 maps to protocol y=1.
    // → byte 3, bit 6 = 0x40.
    const bitmap = createBitmap(1, 30);
    setPixel(bitmap, 0, 0);
    expect(Array.from(encodeBitmap(bitmap).subarray(0, 4))).toEqual([0x00, 0x00, 0x00, 0x40]);
  });
});

describe('chunkPayload', () => {
  it('emits header as the first write and a single body chunk for tiny payloads', () => {
    const payload = new Uint8Array(10);
    const writes = chunkPayload(payload, true);
    expect(writes.length).toBe(2);
    expect(writes[0]?.length).toBe(9);
    // [chunkIndex=0, ...10 bytes, MAGIC[0], MAGIC[1]]
    expect(writes[1]?.length).toBe(1 + 10 + 2);
    expect(writes[1]?.[0]).toBe(0);
    expect(writes[1]?.at(-2)).toBe(MAGIC[0]);
    expect(writes[1]?.at(-1)).toBe(MAGIC[1]);
  });

  it('round-trip: chunk bodies (minus index byte and MAGIC) reassemble to payload', () => {
    const payload = new Uint8Array(BODY_CHUNK * 3 + 17);
    for (let i = 0; i < payload.length; i += 1) payload[i] = i & 0xff;
    const writes = chunkPayload(payload, true);
    const reassembled = new Uint8Array(payload.length);
    let offset = 0;
    for (let i = 1; i < writes.length; i += 1) {
      const chunk = writes[i]!;
      const isLast = i === writes.length - 1;
      const body = chunk.subarray(1, isLast ? chunk.length - 2 : chunk.length);
      reassembled.set(body, offset);
      offset += body.length;
    }
    expect(offset).toBe(payload.length);
    expect(Array.from(reassembled)).toEqual(Array.from(payload));
  });

  it('chunk index quirk: index 27 is skipped (the chunk that would be #27 gets index 28)', () => {
    // 28 chunks force i to reach 27.
    const payload = new Uint8Array(28 * BODY_CHUNK);
    const writes = chunkPayload(payload, true);
    expect(writes.length).toBe(29);
    expect(writes[27]?.[0]).toBe(26); // i=26 → idx=26
    expect(writes[28]?.[0]).toBe(28); // i=27 → idx=28 (skipped)
  });

  it('non-print payload emits header + single write with leading zero index', () => {
    const writes = chunkPayload(new Uint8Array([0xab, 0xcd]), false);
    expect(writes.length).toBe(2);
    expect(Array.from(writes[1]!)).toEqual([0, 0xab, 0xcd]);
  });

  it('rejects payloads that exceed the 1-byte chunk-index space', () => {
    // 256 chunks => index would need to reach 255 (post-quirk).
    // pre-quirk i needs to be 254 (since i>=27 → +1, max i = 254 → idx 255).
    // so 255 chunks total triggers wrap. Use 256 to be safely over.
    const payload = new Uint8Array(256 * BODY_CHUNK);
    expect(() => chunkPayload(payload, true)).toThrow(/chunk index/);
  });
});

describe('buildPrintPayload + encodeLabel', () => {
  it('payload structure for a tiny label', () => {
    // START(6) + COPIES(3) + PRINT_DATA(12+4*feed) + CUT(3) + STATUS(2) + END(2)
    const bitmap = createBitmap(20, PROTOCOL_HEAD_FRAME);
    const payload = buildPrintPayload(bitmap);
    const expected = 6 + 3 + (12 + 4 * 20) + 3 + 2 + 2;
    expect(payload.length).toBe(expected);

    // Spot-check: directives appear in order
    expect(payload[0]).toBe(0x1b); // START opcode
    expect(payload[1]).toBe(0x73);
    expect(payload[6]).toBe(0x1b); // COPIES
    expect(payload[7]).toBe(0x23);
    expect(payload[9]).toBe(0x1b); // PRINT_DATA
    expect(payload[10]).toBe(0x44);
    expect(payload[11]).toBe(0x81); // bpp
    expect(payload[12]).toBe(0x02); // align
  });

  it('PRINT_DATA dimensions: width = feed_count, height = 32', () => {
    const bitmap = createBitmap(7, PROTOCOL_HEAD_FRAME);
    const payload = buildPrintPayload(bitmap);
    // PRINT_DATA starts at offset 9: [1B 44 81 02 ...u32(w) ...u32(h) ...img]
    const widthLE = readU32LE(payload, 9 + 4);
    const heightLE = readU32LE(payload, 9 + 8);
    expect(widthLE).toBe(7);
    expect(heightLE).toBe(PROTOCOL_HEAD_FRAME);
  });

  it('CUT byte is 0x30 by default (cut at end)', () => {
    const bitmap = createBitmap(5, PROTOCOL_HEAD_FRAME);
    const payload = buildPrintPayload(bitmap);
    // CUT directive lives directly after PRINT_DATA. Find it by opcode.
    const cutIdx = payload.indexOf(0x70);
    expect(cutIdx).toBeGreaterThan(0);
    expect(payload[cutIdx + 1]).toBe(CUT_AT_END);
  });

  it('CUT byte is 0x31 when cut: false (multi-copy intermediate)', () => {
    const bitmap = createBitmap(5, PROTOCOL_HEAD_FRAME);
    const payload = buildPrintPayload(bitmap, { cut: false });
    const cutIdx = payload.indexOf(0x70);
    expect(payload[cutIdx + 1]).toBe(CUT_SUPPRESS);
  });

  it('mediaTypeByte override: MEDIA_TYPE sits between START and COPIES', () => {
    const bitmap = createBitmap(3, PROTOCOL_HEAD_FRAME);
    const payload = buildPrintPayload(bitmap, undefined, { mediaTypeByte: 0x03 });
    // After START (6 bytes), MEDIA_TYPE (6 bytes) then COPIES.
    expect(payload.slice(6, 12)).toEqual(new Uint8Array([0x1b, 0x4d, 0x03, 0x00, 0x00, 0x00]));
    expect(payload[12]).toBe(0x1b); // COPIES
    expect(payload[13]).toBe(0x23);
  });

  it('encodeLabel total length = header + body + chunk overhead + MAGIC', () => {
    const bitmap = createBitmap(5, PROTOCOL_HEAD_FRAME);
    const payload = buildPrintPayload(bitmap);
    const writes = encodeLabel(bitmap);
    let total = 0;
    for (const w of writes) total += w.length;
    const chunkCount = Math.max(1, Math.ceil(payload.length / BODY_CHUNK));
    const expected = 9 + payload.length + chunkCount + 2;
    expect(total).toBe(expected);
  });

  it('encodeLabel honors copies and autoCut from LetraTagPrintOptions', () => {
    const bitmap = createBitmap(5, PROTOCOL_HEAD_FRAME);
    const writes = encodeLabel(bitmap, { copies: 3, autoCut: false });
    // Reassemble payload from chunks (drop header + index + MAGIC).
    const chunks = writes.slice(1);
    let body = new Uint8Array();
    for (const [i, c] of chunks.entries()) {
      const last = i === chunks.length - 1;
      const slice = c.subarray(1, last ? c.length - 2 : c.length);
      const next = new Uint8Array(body.length + slice.length);
      next.set(body, 0);
      next.set(slice, body.length);
      body = next;
    }
    // COPIES is the 4th-byte triplet [1B 23 03] at offset 6
    expect(Array.from(body.subarray(6, 9))).toEqual([0x1b, 0x23, 0x03]);
    // CUT byte should be the suppress byte
    const cutIdx = body.indexOf(0x70);
    expect(body[cutIdx + 1]).toBe(CUT_SUPPRESS);
  });
});

describe('printable-area integration', () => {
  // Plan 08 phase 2: encoder consumes engine.printableArea via
  // getPrintableArea(). With no engine, or an engine that doesn't
  // populate `printableArea`, output must be byte-identical to the
  // pre-Phase-2 encoder. The LT-200B ships with `printableArea`
  // unset today, so this is the live path.

  const ZERO_ENGINE: PrintEngine = {
    role: 'primary',
    protocol: 'letratag-bt',
    dpi: 200,
    headDots: 30,
  };

  it('engine without printableArea is byte-identical to no engine', () => {
    const bitmap = createBitmap(7, PROTOCOL_HEAD_FRAME);
    const baseline = buildPrintPayload(bitmap);
    const withEngine = buildPrintPayload(bitmap, { engine: ZERO_ENGINE });
    expect(Array.from(withEngine)).toEqual(Array.from(baseline));
  });

  it('explicitly zero printableArea is byte-identical to no engine', () => {
    const bitmap = createBitmap(7, PROTOCOL_HEAD_FRAME);
    const baseline = buildPrintPayload(bitmap);
    const withZeros = buildPrintPayload(bitmap, {
      engine: {
        ...ZERO_ENGINE,
        printableArea: { leading: 0, trailing: 0, left: 0, right: 0 },
      },
    });
    expect(Array.from(withZeros)).toEqual(Array.from(baseline));
  });

  it('encodeLabel byte-identical when context omitted vs engine without printableArea', () => {
    const bitmap = createBitmap(5, PROTOCOL_HEAD_FRAME);
    setPixel(bitmap, 2, 4);
    const a = encodeLabel(bitmap);
    const b = encodeLabel(bitmap, undefined, undefined, { engine: ZERO_ENGINE });
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i += 1) {
      expect(Array.from(a[i]!)).toEqual(Array.from(b[i]!));
    }
  });

  it('non-zero leading dead-zone prepends blank feed columns', () => {
    // 200 DPI, 1 mm leading -> round(1 * 200 / 25.4) = 8 dots.
    const bitmap = createBitmap(3, PROTOCOL_HEAD_FRAME);
    setPixel(bitmap, 0, 0);
    const payload = buildPrintPayload(bitmap, {
      engine: {
        ...ZERO_ENGINE,
        printableArea: { leading: 1, trailing: 0, left: 0, right: 0 },
      },
    });
    // PRINT_DATA at offset 6 (START) + 3 (COPIES) = 9.
    // [1B 44 81 02 ...u32(width) ...u32(height) ...image]
    const widthLE =
      (payload[9 + 4] ?? 0) |
      ((payload[9 + 5] ?? 0) << 8) |
      ((payload[9 + 6] ?? 0) << 16) |
      ((payload[9 + 7] ?? 0) << 24);
    expect(widthLE).toBe(3 + 8); // bitmap.widthPx + leadingDots

    // First 8 columns (32 bytes) are leading-pad zeros.
    const imgStart = 9 + 12;
    for (let i = 0; i < 8 * 4; i += 1) {
      expect(payload[imgStart + i] ?? -1).toBe(0);
    }
    // Column 8 carries the original column-0 encoding (pixel at y=0
    // → byte 3, bit 7 = 0x80 in the 4th byte of the column).
    expect(payload[imgStart + 8 * 4 + 3]).toBe(0x80);
  });

  it('cross-feed left dead-zone shifts head-row centering', () => {
    // 200 DPI, 1 mm left -> 8 dots. The 30-row source bitmap
    // currently centers in 32 rows (topPad=1). With left=1mm (8 dots)
    // and right=0, reachable=24 rows; 30 source rows clip to 24
    // and topPad=8.
    const bitmap = createBitmap(1, 30);
    setPixel(bitmap, 0, 0);
    const out = encodeBitmap(bitmap, { left: 8, right: 0 });
    // Pixel (0,0) lands at protocol y=8 = byte 2 (3 - floor(8/8) = 2),
    // bit 7 (7 - (8 % 8)) = 0x80.
    expect(Array.from(out.subarray(0, 4))).toEqual([0x00, 0x00, 0x80, 0x00]);
  });
});

describe('forcedTrailingFeedMm integration', () => {
  // Bench observation 2026-05-10: tiny prints stay inside the
  // head-to-cutter gap on the LT-200B and aren't visible without
  // explicit trailing feed. Encoder appends N blank columns where
  // N = round(forcedTrailingFeedMm * dpi / 25.4).

  const ZERO_ENGINE: PrintEngine = {
    role: 'primary',
    protocol: 'letratag-bt',
    dpi: 200,
    headDots: 30,
  };

  it('forcedTrailingFeedMm appends trailing blank columns to PRINT_DATA', () => {
    // 200 DPI, 6 mm trailing -> round(6 * 200 / 25.4) = 47 dots.
    const bitmap = createBitmap(3, PROTOCOL_HEAD_FRAME);
    setPixel(bitmap, 0, 0);
    const payload = buildPrintPayload(bitmap, {
      engine: { ...ZERO_ENGINE, forcedTrailingFeedMm: 6 },
    });
    // PRINT_DATA at offset 6 (START) + 3 (COPIES) = 9.
    const widthLE =
      (payload[9 + 4] ?? 0) |
      ((payload[9 + 5] ?? 0) << 8) |
      ((payload[9 + 6] ?? 0) << 16) |
      ((payload[9 + 7] ?? 0) << 24);
    expect(widthLE).toBe(3 + 47); // bitmap.widthPx + trailingDots

    // First column carries the original encoding (pixel at y=0
    // → byte 3, bit 7 = 0x80).
    const imgStart = 9 + 12;
    expect(payload[imgStart + 3]).toBe(0x80);

    // Last 47 columns (188 bytes) are trailing-pad zeros.
    const trailingStart = imgStart + 3 * 4;
    for (let i = 0; i < 47 * 4; i += 1) {
      expect(payload[trailingStart + i] ?? -1).toBe(0);
    }
  });

  it('engine without forcedTrailingFeedMm is byte-identical to no engine', () => {
    const bitmap = createBitmap(7, PROTOCOL_HEAD_FRAME);
    const baseline = buildPrintPayload(bitmap);
    const withEngine = buildPrintPayload(bitmap, { engine: ZERO_ENGINE });
    expect(Array.from(withEngine)).toEqual(Array.from(baseline));
  });

  it('forcedTrailingFeedMm: 0 is byte-identical to absent', () => {
    const bitmap = createBitmap(7, PROTOCOL_HEAD_FRAME);
    const baseline = buildPrintPayload(bitmap, { engine: ZERO_ENGINE });
    const withZero = buildPrintPayload(bitmap, {
      engine: { ...ZERO_ENGINE, forcedTrailingFeedMm: 0 },
    });
    expect(Array.from(withZero)).toEqual(Array.from(baseline));
  });

  it('leading + trailing combine: width = bitmap + leadingDots + trailingDots', () => {
    // 200 DPI, 1 mm leading (8 dots) + 6 mm trailing (47 dots).
    const bitmap = createBitmap(3, PROTOCOL_HEAD_FRAME);
    const payload = buildPrintPayload(bitmap, {
      engine: {
        ...ZERO_ENGINE,
        printableArea: { leading: 1, trailing: 0, left: 0, right: 0 },
        forcedTrailingFeedMm: 6,
      },
    });
    const widthLE =
      (payload[9 + 4] ?? 0) |
      ((payload[9 + 5] ?? 0) << 8) |
      ((payload[9 + 6] ?? 0) << 16) |
      ((payload[9 + 7] ?? 0) << 24);
    expect(widthLE).toBe(3 + 8 + 47);
  });
});

describe('encodeSetCassetteType', () => {
  it('single non-print write: header + START + MEDIA_TYPE + END', () => {
    const writes = encodeSetCassetteType(0x03);
    expect(writes.length).toBe(2);
    expect(writes[0]?.length).toBe(9);
    // body = [chunkIndex=0, 1B 73 9A 02 00 00, 1B 4D 03 00 00 00, 1B 51]
    const body = writes[1]!;
    expect(body[0]).toBe(0); // index byte
    expect(Array.from(body.subarray(1, 7))).toEqual([0x1b, 0x73, 0x9a, 0x02, 0x00, 0x00]);
    expect(Array.from(body.subarray(7, 13))).toEqual([0x1b, 0x4d, 0x03, 0x00, 0x00, 0x00]);
    expect(Array.from(body.subarray(13, 15))).toEqual([0x1b, 0x51]);
  });
});
