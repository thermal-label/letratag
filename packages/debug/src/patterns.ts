import { createBitmap, type LabelBitmap } from '@mbtech-nl/bitmap';

/**
 * Test patterns mapped 1:1 to PLAN-1 §4.2's T1..T5 + CUSTOM. Each
 * pattern is constructed as a head-aligned bitmap: `widthPx` is the
 * feed (along-tape) dimension, `heightPx` is across the head and
 * always 30 (printable rows; the encoder's y+1 skip leaves the
 * 32-row protocol frame's row 0 blank).
 *
 * "Asymmetric" patterns are deliberately so — only an asymmetric
 * print can disambiguate axis-order conflicts (C1) by hardware
 * inspection.
 */

export const HEAD_ROWS = 30;

export interface PatternMeta {
  id: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'CUSTOM';
  label: string;
  description: string;
  /** Conflict tag from PLAN.md the pattern targets. */
  conflict: 'C1' | 'C2' | 'C3' | 'C6' | 'C8' | null;
}

export const PATTERNS: readonly PatternMeta[] = [
  {
    id: 'T1',
    label: 'T1 — Single pixel at (0, 0)',
    description:
      'Smoke test for bit packing. The encoder produces 4-byte column [00, 00, 00, 80] for this input — the print should show a single dot at the leading edge of the tape, in the row closest to the cassette opening.',
    conflict: 'C2',
  },
  {
    id: 'T2',
    label: 'T2 — Asymmetric rectangle 16 feed × 30 head',
    description:
      'Smoke test for axis order and dimensions. Rectangle is wider across the head than along the feed — confirms the print head orientation is what we expect.',
    conflict: 'C1',
  },
  {
    id: 'T3',
    label: 'T3 — Stripes across head (rows 0..29)',
    description:
      'Diagonal of dots — each successive feed column lights one row higher across the head. Verifies the printable region of the cassette and exposes any clipping at the top or bottom rows.',
    conflict: 'C3',
  },
  {
    id: 'T4',
    label: 'T4 — Status capture',
    description:
      'Three identical labels printed under different conditions (normal / cassette removed / low battery). The labels are the same — the captured RX byte and advertising-data state are the data of interest.',
    conflict: 'C6',
  },
  {
    id: 'T5',
    label: 'T5 — UUID variance (passive)',
    description:
      'Records the observed full service UUID on connect. No print required; data lands in diagnostics export automatically.',
    conflict: 'C8',
  },
  {
    id: 'CUSTOM',
    label: 'CUSTOM — type and print',
    description:
      'Free-form testing. Drives the same encoder path as T1..T4 but with a user-provided bitmap (typed text rendered in-browser).',
    conflict: null,
  },
];

function setPixel(bitmap: LabelBitmap, x: number, y: number): void {
  if (x < 0 || x >= bitmap.widthPx) return;
  if (y < 0 || y >= bitmap.heightPx) return;
  const stride = Math.ceil(bitmap.widthPx / 8);
  const byteIndex = y * stride + (x >>> 3);
  const bit = 7 - (x & 7);
  bitmap.data[byteIndex] = (bitmap.data[byteIndex] ?? 0) | (1 << bit);
}

/** T1 — single pixel at (x_feed=0, y_head=0). */
export function buildT1(): LabelBitmap {
  const bm = createBitmap(8, HEAD_ROWS);
  setPixel(bm, 0, 0);
  return bm;
}

/**
 * T2 — Asymmetric rectangle: `feedSpan = 16`, `headSpan = 30`
 * (the full printable head height). The plan describes "32 × 16";
 * we use the printable 30 because the encoder skips row 0 → 32-row
 * protocol frame. Either way, the rectangle's across-head dimension
 * is larger than its along-feed dimension, which is what
 * disambiguates axis order.
 */
export function buildT2(): LabelBitmap {
  const FEED = 16;
  const HEAD = HEAD_ROWS;
  const bm = createBitmap(FEED, HEAD);
  for (let x = 0; x < FEED; x += 1) {
    for (let y = 0; y < HEAD; y += 1) setPixel(bm, x, y);
  }
  return bm;
}

/**
 * T3 — Across-head stripes. For each y_head ∈ [0, 30), set a single
 * pixel on the y-th feed column. Print should show a diagonal of
 * dots (or the printable subset thereof), making the printable
 * region directly visible by eye.
 */
export function buildT3(): LabelBitmap {
  const bm = createBitmap(HEAD_ROWS, HEAD_ROWS);
  for (let y = 0; y < HEAD_ROWS; y += 1) setPixel(bm, y, y);
  return bm;
}

/**
 * T4 — Status capture pattern. The label content doesn't matter
 * (the RX byte is the data of interest); use a small "status" tag.
 * 12 px wide so the print finishes fast.
 */
export function buildT4(): LabelBitmap {
  const bm = createBitmap(12, HEAD_ROWS);
  // A simple checkerboard so the friend can see *something* printed
  // when status reports success.
  for (let x = 0; x < bm.widthPx; x += 1) {
    for (let y = 0; y < bm.heightPx; y += 1) {
      if ((x + y) % 4 === 0) setPixel(bm, x, y);
    }
  }
  return bm;
}

/**
 * T5 — UUID variance has no associated bitmap (passive). Return a
 * 1×30 placeholder so the preview pane stays consistent.
 */
export function buildT5(): LabelBitmap {
  return createBitmap(1, HEAD_ROWS);
}

/**
 * CUSTOM — render arbitrary text into a head-aligned bitmap. Uses
 * `renderText` from `@mbtech-nl/bitmap` then crops/pads to the
 * 30-row printable height.
 */
export async function buildCustom(text: string): Promise<LabelBitmap> {
  const { renderText, padBitmap, cropBitmap } = await import('@mbtech-nl/bitmap');
  if (text.length === 0) return createBitmap(8, HEAD_ROWS);
  const rendered = renderText(text, { scaleX: 2, scaleY: 2 });
  // Fit into HEAD_ROWS — pad if smaller, crop if taller.
  if (rendered.heightPx === HEAD_ROWS) return rendered;
  if (rendered.heightPx < HEAD_ROWS) {
    const pad = HEAD_ROWS - rendered.heightPx;
    const top = Math.floor(pad / 2);
    const bottom = pad - top;
    return padBitmap(rendered, { top, bottom });
  }
  return cropBitmap(rendered, 0, 0, rendered.widthPx, HEAD_ROWS);
}
