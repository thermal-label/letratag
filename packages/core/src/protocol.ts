import type { LabelBitmap } from '@mbtech-nl/bitmap';
import type { LetraTagPrintOptions, __DebugEncoderOverrides } from './types.js';

/**
 * Wire-format encoder for the LetraTag LT-200B BLE print protocol.
 *
 * Reference: docs/protocol/letratag-bt.md. Sources, scope, and
 * legal posture are documented in INTEROPERABILITY.md at the repo
 * root. Every byte choice in this file is anchored on observed
 * wire output and the prior public reverse-engineering work cited
 * there; see the protocol page for confidence caveats.
 */

// ─── Constants ──────────────────────────────────────────────────────

/** Magic bytes appended to the **last** chunk of a print payload. */
export const MAGIC: readonly [number, number] = [0x12, 0x34];

/**
 * Protocol-level body window. Each chunk write is
 * `[chunkIndex, ...body[i*BODY_CHUNK..(i+1)*BODY_CHUNK)]`, plus the
 * MAGIC trailer on the final chunk. The 500-byte window is the
 * value observed on the wire on every captured job.
 */
export const BODY_CHUNK = 500;

/**
 * Wire-format frame height — `PRINT_DATA.height` is always 32. The
 * encoder centres shorter source bitmaps within these 32 rows by
 * inserting zero-rasterlines top and bottom.
 */
export const PROTOCOL_HEAD_FRAME = 32;

/**
 * Conventional "printable rows" — the height we recommend authoring
 * to so labels survive any chassis-mechanical clipping. The wire
 * format does not enforce this; it's a media-side fact.
 */
export const PRINTABLE_DOTS = 30;

/**
 * Hardcoded job ID prefix on the START directive — `9A 02 00 00`
 * appears on every observed job, with no apparent
 * queue/generation-counter semantics.
 */
const START_JOB_ID: readonly number[] = [154, 2, 0, 0];

/**
 * Chunk-index quirk — the index that would be `27` is bumped to
 * `28`, and every index after it is shifted by one. Part of the
 * observed wire format on every captured job.
 */
const CHUNK_INDEX_QUIRK_THRESHOLD = 27;

// ─── Directive opcodes ──────────────────────────────────────────────

const DIR_START = 0x73;
const DIR_NUMBER_OF_COPIES = 0x23;
const DIR_PRINT_DATA = 0x44;
const DIR_CUT = 0x70;
const DIR_FORM_FEED = 0x45;
const DIR_STATUS = 0x41;
const DIR_END = 0x51;
const DIR_MEDIA_TYPE = 0x4d;

/** `CUT` command byte for "cut at the end of this copy". */
export const CUT_AT_END = 0x30;
/** `CUT` command byte for "suppress cut (intermediate copy)". */
export const CUT_SUPPRESS = 0x31;

/** PRINT_DATA byte 2 — fixed in every job. */
const PRINT_DATA_BPP = 0x81;
/** PRINT_DATA byte 3 — fixed in every job. */
const PRINT_DATA_ALIGNMENT = 0x02;

// ─── Directives ─────────────────────────────────────────────────────

/** `[0x1B, 0x73, 154, 2, 0, 0]` — start of a print job. */
export const START: Uint8Array = new Uint8Array([0x1b, DIR_START, ...START_JOB_ID]);

/** `[0x1B, 0x45]` — paper feed. Not emitted on the LT-200B path. */
export const FORM_FEED: Uint8Array = new Uint8Array([0x1b, DIR_FORM_FEED]);

/** `[0x1B, 0x41]` — request a status notification. */
export const STATUS: Uint8Array = new Uint8Array([0x1b, DIR_STATUS]);

/** `[0x1B, 0x51]` — end of job marker. */
export const END: Uint8Array = new Uint8Array([0x1b, DIR_END]);

/** `[0x1B, 0x23, copies]` — number of copies for this job. */
export function buildNumberOfCopies(copies: number): Uint8Array {
  const n = Math.max(1, Math.min(0xff, copies | 0));
  return new Uint8Array([0x1b, DIR_NUMBER_OF_COPIES, n]);
}

/** `[0x1B, 0x70, command]` — cut directive. */
export function buildCut(command: number): Uint8Array {
  return new Uint8Array([0x1b, DIR_CUT, command & 0xff]);
}

/**
 * `[0x1B, 0x4D, mediaId, 0x00, 0x00, 0x00]` — set cassette type.
 * 6 bytes total; the trailing three zeros are part of the observed
 * wire format.
 *
 * Not emitted in the normal print flow. Available for the
 * stand-alone "set cassette type" payload that goes over the
 * `printShortCommandUUID` characteristic.
 */
export function buildMediaType(mediaId: number): Uint8Array {
  return new Uint8Array([0x1b, DIR_MEDIA_TYPE, mediaId & 0xff, 0x00, 0x00, 0x00]);
}

/**
 * `[0x1B, 0x44, 0x81, 0x02, ...u32le(width), ...u32le(height), ...image]`
 *
 * `width = feed_count`, `height = 32` (the protocol frame).
 */
export function buildPrintData(width: number, height: number, image: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + 4 + 4 + image.length);
  out[0] = 0x1b;
  out[1] = DIR_PRINT_DATA;
  out[2] = PRINT_DATA_BPP;
  out[3] = PRINT_DATA_ALIGNMENT;
  writeU32LE(out, 4, width);
  writeU32LE(out, 8, height);
  out.set(image, 12);
  return out;
}

function writeU32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

// ─── Bitmap encoding ────────────────────────────────────────────────

/**
 * Encode a head-aligned bitmap into the column-major 4-bytes-per-feed
 * stream the LT-200B expects.
 *
 * **Input contract** — the bitmap is head-aligned: `widthPx` is the
 * head-perpendicular dimension (along the tape, the feed axis);
 * `heightPx` is across the head. The driver layer is responsible
 * for producing this orientation.
 *
 * **Algorithm** (`getBytesFromBitmapRaster` + `swapBits` in the
 * official app):
 *   - For each feed column, take the column's `heightPx` head-row
 *     bits and pack them MSB-first into 4 bytes (8 bits per byte,
 *     bit 7 = first row of the group).
 *   - Reverse the byte order within the column:
 *     `[b0, b1, b2, b3] → [b3, b2, b1, b0]`.
 *
 * **Net effect** for a pixel at `(x_feed, y_head)` (with `y_head`
 * in `[0, 31]`):
 *
 *     byte_index = 3 - floor(y_head / 8)
 *     bit_index  = 7 - (y_head % 8)
 *
 * No `y+1` skew. Pixel `(0, 0)` lands in bit 7 of byte 3 → first
 * 4 bytes = `00 00 00 80`.
 *
 * If `heightPx < PROTOCOL_HEAD_FRAME` (32), the column is centered
 * within the 32-row frame by padding `floor((32 - h) / 2)` zero
 * rows on top and `32 - h - top` zero rows on the bottom — the
 * placement that matches the observed wire format.
 */
export function encodeBitmap(bitmap: LabelBitmap): Uint8Array {
  const feedCount = bitmap.widthPx;
  const headRows = Math.min(bitmap.heightPx, PROTOCOL_HEAD_FRAME);
  const out = new Uint8Array(4 * feedCount);

  const topPad = Math.floor((PROTOCOL_HEAD_FRAME - headRows) / 2);

  for (let x = 0; x < feedCount; x += 1) {
    for (let y = 0; y < headRows; y += 1) {
      if (!isPixelOn(bitmap, x, y)) continue;
      const yProtocol = y + topPad;
      const byteIndex = 3 - Math.floor(yProtocol / 8);
      const bitMask = 1 << (7 - (yProtocol % 8));
      const idx = x * 4 + byteIndex;
      out[idx] = (out[idx] ?? 0) | bitMask;
    }
  }

  return out;
}

function isPixelOn(bitmap: LabelBitmap, x: number, y: number): boolean {
  const stride = Math.ceil(bitmap.widthPx / 8);
  const byteIndex = y * stride + (x >>> 3);
  const bit = 7 - (x & 7);
  const byte = bitmap.data[byteIndex] ?? 0;
  return ((byte >>> bit) & 1) === 1;
}

// ─── Header / checksum ──────────────────────────────────────────────

/**
 * 9-byte header. Layout:
 *
 *   `[0xFF, 0xF0, 0x12, 0x34, ...u32le(payloadLength), checksum]`
 *
 * `checksum` is the sum of the preceding 8 bytes mod 256.
 */
export function buildHeader(payloadLength: number): Uint8Array {
  const header = new Uint8Array(9);
  header[0] = 0xff;
  header[1] = 0xf0;
  header[2] = 0x12;
  header[3] = 0x34;
  writeU32LE(header, 4, payloadLength);
  let sum = 0;
  for (let i = 0; i < 8; i += 1) sum = (sum + (header[i] ?? 0)) & 0xff;
  header[8] = sum;
  return header;
}

// ─── Payload assembly ───────────────────────────────────────────────

export interface PrintPayloadOptions {
  /** Number of copies. Default `1`. */
  copies?: number;
  /**
   * Whether this copy should advance to the cut line at the end.
   * `true` (default) emits `CUT 0x30`; `false` emits `CUT 0x31`
   * (the suppress-cut byte). Multi-copy jobs typically pass `false`
   * for all but the last copy.
   */
  cut?: boolean;
}

/**
 * Build the print payload (everything after the 9-byte header):
 * `START + [MEDIA_TYPE] + NUMBER_OF_COPIES + PRINT_DATA + CUT +
 * STATUS + END`.
 *
 * `MEDIA_TYPE` is included only when
 * `overrides.mediaTypeByte` is defined — Phase 1 default omits it,
 * matching the observed print flow. The debug harness exposes the
 * override to poke at C5.
 */
export function buildPrintPayload(
  bitmap: LabelBitmap,
  options?: PrintPayloadOptions,
  overrides?: __DebugEncoderOverrides,
): Uint8Array {
  const image = encodeBitmap(bitmap);
  const feedCount = bitmap.widthPx;
  const printData = buildPrintData(feedCount, PROTOCOL_HEAD_FRAME, image);

  const copies = Math.max(1, options?.copies ?? 1);
  const cutByte = (options?.cut ?? true) ? CUT_AT_END : CUT_SUPPRESS;

  const parts: Uint8Array[] = [START];
  if (overrides?.mediaTypeByte !== undefined) {
    parts.push(buildMediaType(overrides.mediaTypeByte));
  }
  parts.push(buildNumberOfCopies(copies), printData, buildCut(cutByte), STATUS, END);
  return concat(parts);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ─── Chunker ────────────────────────────────────────────────────────

/**
 * Slice an assembled payload into the ordered list of BLE writes.
 *
 * Output:
 *   - First entry: 9-byte header.
 *   - Subsequent entries (print path): `[chunkIndex, ...500 body
 *     bytes]`. Final chunk additionally appends MAGIC `[0x12, 0x34]`.
 *   - Non-print path (`isPrint = false`): single body write with
 *     leading zero index (used by the stand-alone set-cassette-type
 *     payload that goes over `printShortCommandUUID`).
 *
 * Chunk indices are sequential 0, 1, 2, … with the wire-format
 * quirk that index 27 is skipped — the chunk that would have
 * received index 27 gets index 28, and every chunk after it shifts
 * by one. Realistic LT labels never approach 27 chunks
 * (~13.5 KiB body); the quirk is preserved for forward-compat.
 */
export function chunkPayload(payload: Uint8Array, isPrint: boolean): Uint8Array[] {
  const header = buildHeader(payload.length);
  const writes: Uint8Array[] = [header];

  if (!isPrint) {
    const single = new Uint8Array(payload.length + 1);
    single[0] = 0;
    single.set(payload, 1);
    writes.push(single);
    return writes;
  }

  const chunkCount = Math.max(1, Math.ceil(payload.length / BODY_CHUNK));
  if (chunkCount > 0xff) {
    throw new Error(`payload exceeds 1-byte chunk index space (${String(chunkCount)} > 255)`);
  }

  for (let i = 0; i < chunkCount; i += 1) {
    const start = i * BODY_CHUNK;
    const end = Math.min(start + BODY_CHUNK, payload.length);
    const body = payload.subarray(start, end);

    const chunkIndex = i >= CHUNK_INDEX_QUIRK_THRESHOLD ? i + 1 : i;
    const isLast = i === chunkCount - 1;
    const trailerLen = isLast ? MAGIC.length : 0;
    const out = new Uint8Array(1 + body.length + trailerLen);
    out[0] = chunkIndex & 0xff;
    out.set(body, 1);
    if (isLast) {
      out.set(new Uint8Array([MAGIC[0], MAGIC[1]]), 1 + body.length);
    }
    writes.push(out);
  }

  return writes;
}

// ─── Top-level ──────────────────────────────────────────────────────

/**
 * Encode a complete LetraTag print job into the ordered list of BLE
 * writes. The transport calls `write()` with each entry in turn.
 *
 * The driver layer is responsible for translating `copies > 1` into
 * the correct sequence of jobs — typically that means emitting
 * `copies - 1` jobs with `cut: false` followed by one final job
 * with `cut: true`. `encodeLabel` itself produces a single job at a
 * time so callers retain control over per-copy status reads.
 */
export function encodeLabel(
  bitmap: LabelBitmap,
  options?: LetraTagPrintOptions,
  overrides?: __DebugEncoderOverrides,
): Uint8Array[] {
  const payload = buildPrintPayload(
    bitmap,
    {
      copies: options?.copies ?? 1,
      cut: options?.autoCut ?? true,
    },
    overrides,
  );
  return chunkPayload(payload, true);
}

/**
 * Build the stand-alone `MEDIA_TYPE`-only write list. Used by the
 * driver's `setCassetteType()` path (writes to the
 * `printShortCommandUUID` characteristic).
 *
 * Wire format: `HEADER + START + MEDIA_TYPE(id) + END`.
 */
export function encodeSetCassetteType(mediaId: number): Uint8Array[] {
  const payload = concat([START, buildMediaType(mediaId), END]);
  return chunkPayload(payload, false);
}

