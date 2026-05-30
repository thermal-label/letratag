import type { LabelBitmap } from '@mbtech-nl/bitmap';
import {
  getForcedTrailingFeedMm,
  getPrintableArea,
  type MediaDescriptor,
  type PrintEngine,
} from '@thermal-label/contracts';
import type { LetraTagPrintOptions, __DebugEncoderOverrides } from './types.js';

/**
 * Wire-format encoder for the LetraTag LT-200B BLE print protocol.
 *
 * Wire format, sources, and confidence caveats: see
 * docs/protocol/letratag-bt.md and INTEROPERABILITY.md.
 */

// ─── Constants ──────────────────────────────────────────────────────

/** Magic bytes appended to the **last** chunk of a print payload. */
export const MAGIC: readonly [number, number] = [0x12, 0x34];

/**
 * Protocol-level upper bound on body bytes per BLE write; ceiling
 * when no `mtu` is provided to `chunkPayload`. Effective chunk size
 * is `min(BODY_CHUNK, mtu - 1)` — see docs/protocol/letratag-bt.md.
 *
 * 500 exceeds typical BLE link MTU and Chrome won't auto-fragment
 * write-without-response past the negotiated MTU. Bench-confirmed
 * 2026-05-10: 500-byte writes fail on the first chunk of a
 * multi-chunk job; 244-byte writes succeed. Always pass the
 * registry's `bluetooth-gatt.mtu` via the encoder context for
 * multi-chunk-safe behaviour.
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

/** Fixed job-ID tail on START — emit verbatim; not a queue handle. */
const START_JOB_ID: readonly number[] = [154, 2, 0, 0];

/** Index 27 is skipped on the wire; every later index shifts by one. */
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
 * Not emitted in the normal print flow; used by the stand-alone
 * set-cassette-type payload. The trailing three zeros are required.
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
 * stream the LT-200B expects. Bit packing: see
 * docs/protocol/letratag-bt.md § Image encoding.
 *
 * **Input contract** — the bitmap is head-aligned: `widthPx` is the
 * head-perpendicular dimension (along the tape, the feed axis);
 * `heightPx` is across the head. The driver layer produces this
 * orientation.
 *
 * No `y+1` skew: pixel `(0, 0)` lands in bit 7 of byte 3 → first
 * 4 bytes = `00 00 00 80`. Source bitmaps shorter than the 32-row
 * frame are centered by zero-padding top and bottom.
 *
 * **Cross-feed dead-zone shift** — non-zero `crossFeed.left/right`
 * (unprintable head rows) shift the centering into the reachable
 * subrange `[left, 32 - right)`. With both zero (today's default
 * until a bench measurement), output bytes are unchanged.
 */
export function encodeBitmap(
  bitmap: LabelBitmap,
  crossFeed: { left: number; right: number } = { left: 0, right: 0 },
): Uint8Array {
  const feedCount = bitmap.widthPx;
  const headRows = Math.min(bitmap.heightPx, PROTOCOL_HEAD_FRAME);
  const out = new Uint8Array(4 * feedCount);

  // Reachable head-row subrange after cross-feed dead-zone is
  // `[left, PROTOCOL_HEAD_FRAME - right)`. Center the source bitmap
  // within that subrange. With left=right=0 this reduces to the
  // existing `floor((32 - h) / 2)` formula.
  const leftDots = Math.max(0, Math.floor(crossFeed.left));
  const rightDots = Math.max(0, Math.floor(crossFeed.right));
  const reachable = Math.max(0, PROTOCOL_HEAD_FRAME - leftDots - rightDots);
  const fitRows = Math.min(headRows, reachable);
  const topPad = leftDots + Math.floor((reachable - fitRows) / 2);

  for (let x = 0; x < feedCount; x += 1) {
    for (let y = 0; y < fitRows; y += 1) {
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
 * 9-byte job header `[0xFF, 0xF0, 0x12, 0x34, u32le(payloadLength),
 * checksum]`; `checksum` = sum of the preceding 8 bytes mod 256.
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
  /**
   * Engine context — resolves the chassis dead-zone via
   * `getPrintableArea(engine, media)`. When omitted (or with no
   * `printableArea` set) output is byte-identical to pre-Phase-2.
   */
  engine?: PrintEngine;
  /**
   * Resolved media, passed alongside `engine` for per-roll
   * `getPrintableArea` overrides. No LT-200B media ships such
   * overrides today; present for shape-parity with sister drivers.
   */
  media?: MediaDescriptor;
}

/**
 * Resolve the chassis dead-zone from `engine` + `media` and convert
 * each edge from mm (the contracts unit) to dots at `engine.dpi`
 * (the wire-format unit).
 *
 * Returns zero-everywhere when `engine` is undefined or has no
 * `printableArea` set — the path that keeps Phase-2 output byte-
 * identical to pre-Phase-2 for every device shipped today.
 */
function resolveDeadZoneDots(
  engine?: PrintEngine,
  media?: MediaDescriptor,
): { leading: number; trailing: number; left: number; right: number } {
  if (!engine) return { leading: 0, trailing: 0, left: 0, right: 0 };
  const area = getPrintableArea(engine, media);
  const dpi = engine.dpi;
  const mmToDots = (mm: number): number => Math.round((mm * dpi) / 25.4);
  return {
    leading: mmToDots(area.leading),
    trailing: mmToDots(area.trailing),
    left: mmToDots(area.left),
    right: mmToDots(area.right),
  };
}

/**
 * Build the print payload (everything after the 9-byte header):
 * `START + [MEDIA_TYPE] + NUMBER_OF_COPIES + PRINT_DATA + CUT +
 * STATUS + END`.
 *
 * `MEDIA_TYPE` is emitted only when `overrides.mediaTypeByte` is
 * defined; the default print flow omits it.
 */
export function buildPrintPayload(
  bitmap: LabelBitmap,
  options?: PrintPayloadOptions,
  overrides?: __DebugEncoderOverrides,
): Uint8Array {
  const deadZone = resolveDeadZoneDots(options?.engine, options?.media);

  // Leading dead-zone prepends blank feed columns; trailing feed
  // columns are appended so the printed area clears the cutter —
  // bench-confirmed: CUT 0x30 alone doesn't advance enough tape;
  // engine.forcedTrailingFeedMm carries the magnitude.
  const bodyImage = encodeBitmap(bitmap, { left: deadZone.left, right: deadZone.right });
  const leadingPadBytes = 4 * deadZone.leading;
  const trailingFeedDots = options?.engine
    ? Math.round((getForcedTrailingFeedMm(options.engine) * options.engine.dpi) / 25.4)
    : 0;
  const trailingPadBytes = 4 * trailingFeedDots;
  const segments: Uint8Array[] = [];
  if (leadingPadBytes > 0) segments.push(new Uint8Array(leadingPadBytes));
  segments.push(bodyImage);
  if (trailingPadBytes > 0) segments.push(new Uint8Array(trailingPadBytes));
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length===1 guard above proves [0] exists
  const image = segments.length === 1 ? segments[0]! : concat(segments);
  const feedCount = bitmap.widthPx + deadZone.leading + trailingFeedDots;
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
 *   - Print path: `[chunkIndex, ...body]` per write; final chunk
 *     appends MAGIC `[0x12, 0x34]`.
 *   - Non-print path (`isPrint = false`): single body write with a
 *     leading zero index (the stand-alone set-cassette-type payload).
 *
 * Effective chunk size is `min(BODY_CHUNK, mtu - 1)`; always pass
 * `mtu` for multi-chunk correctness (omitting it blows up multi-chunk
 * jobs on stacks that don't auto-fragment). The index-27 skip quirk
 * applies. See docs/protocol/letratag-bt.md § Chunking.
 */
export function chunkPayload(
  payload: Uint8Array,
  isPrint: boolean,
  options?: { mtu?: number },
): Uint8Array[] {
  const header = buildHeader(payload.length);
  const writes: Uint8Array[] = [header];

  if (!isPrint) {
    const single = new Uint8Array(payload.length + 1);
    single[0] = 0;
    single.set(payload, 1);
    writes.push(single);
    return writes;
  }

  // -1 reserves the chunk-index prefix byte.
  const maxBody =
    options?.mtu !== undefined ? Math.max(1, Math.min(BODY_CHUNK, options.mtu - 1)) : BODY_CHUNK;
  const chunkCount = Math.max(1, Math.ceil(payload.length / maxBody));
  if (chunkCount > 0xff) {
    throw new Error(`payload exceeds 1-byte chunk index space (${String(chunkCount)} > 255)`);
  }

  for (let i = 0; i < chunkCount; i += 1) {
    const start = i * maxBody;
    const end = Math.min(start + maxBody, payload.length);
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
 * Produces a single job per call so callers keep per-copy status
 * reads; the driver layer sequences `copies > 1` itself (typically
 * `copies - 1` jobs with `cut: false` then one with `cut: true`).
 *
 * Pass `engine` (and optionally `media`) to apply the chassis
 * dead-zone correction; omitting it yields byte-identical output.
 */
export function encodeLabel(
  bitmap: LabelBitmap,
  options?: LetraTagPrintOptions,
  overrides?: __DebugEncoderOverrides,
  context?: { engine?: PrintEngine; media?: MediaDescriptor; mtu?: number },
): Uint8Array[] {
  const payloadOptions: PrintPayloadOptions = {
    copies: options?.copies ?? 1,
    cut: options?.autoCut ?? true,
  };
  if (context?.engine) payloadOptions.engine = context.engine;
  if (context?.media) payloadOptions.media = context.media;
  const payload = buildPrintPayload(bitmap, payloadOptions, overrides);
  return chunkPayload(payload, true, context?.mtu !== undefined ? { mtu: context.mtu } : undefined);
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
