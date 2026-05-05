import type { LabelBitmap } from '@mbtech-nl/bitmap';
import type { PrinterStatus } from '@thermal-label/contracts';

/**
 * Diagnostics export schema. PLAN-1 §4.3 — schemaVersion 1, stable
 * across sessions so the maintainer can parse it programmatically
 * (the replay CLI from PLAN-2 reads this exact shape). Per PLAN-1
 * §4.3's note, `encoder.encoding` from PLAN.md is split into
 * `encoder.axisOrder` + `encoder.bitPacking` — C1 and C2 are
 * independent variables and a tester might want to mix them.
 */
export interface DiagnosticsExport {
  schemaVersion: 1;
  capturedAt: string;
  test: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'CUSTOM';
  reporter: { name: string; githubHandle: string | null };
  environment: {
    userAgent: string;
    platform: string;
    locale: string;
  };
  device: {
    name: string;
    serviceUuidObserved: string | null;
    txUuidDerived: string | null;
    rxUuidDerived: string | null;
    auxUuidDerived: string | null;
    linkMtu: number | null;
  };
  cassette: {
    sku: string | null;
    material: string | null;
    background: string | null;
  };
  encoder: {
    axisOrder: 'ysfchn' | 'alexhorn';
    bitPacking: 'ysfchn' | 'alexhorn';
    chunkIndexQuirk: boolean;
    emitMediaType: boolean;
    mediaTypeByte: number | null;
    libraryVersion: string;
  };
  payload: {
    bitmapWidth: number;
    bitmapHeight: number;
    bitmapBase64: string;
    chunkCount: number;
    totalBytes: number;
  };
  trace: TraceEvent[];
  notes: string;
}

export interface TraceEvent {
  /** ms since the trace was started. */
  t: number;
  dir: 'tx' | 'rx' | 'info' | 'err';
  hex: string;
  parsed?: {
    ready: boolean;
    errors: { code: string; message: string }[];
  };
  message?: string;
}

export function bitmapToBase64(bitmap: LabelBitmap): string {
  // Concatenate widthPx + heightPx + raw data in a tiny header so a
  // replayer can reconstruct the bitmap shape without separate
  // metadata. Format: [u16 widthPx LE][u16 heightPx LE][...data].
  const totalBytes = 4 + bitmap.data.length;
  const out = new Uint8Array(totalBytes);
  out[0] = bitmap.widthPx & 0xff;
  out[1] = (bitmap.widthPx >>> 8) & 0xff;
  out[2] = bitmap.heightPx & 0xff;
  out[3] = (bitmap.heightPx >>> 8) & 0xff;
  out.set(bitmap.data, 4);
  return uint8ToBase64(out);
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i] ?? 0);
  return btoa(bin);
}

export function bytesToHex(bytes: Uint8Array, max = 64): string {
  const hex: string[] = [];
  const stop = Math.min(bytes.length, max);
  for (let i = 0; i < stop; i += 1) {
    hex.push((bytes[i] ?? 0).toString(16).padStart(2, '0'));
  }
  if (bytes.length > max) hex.push(`…+${String(bytes.length - max)} more`);
  return hex.join(' ');
}

export function statusToParsed(
  status: PrinterStatus,
): NonNullable<TraceEvent['parsed']> {
  return {
    ready: status.ready,
    errors: status.errors.map(e => ({ code: e.code, message: e.message })),
  };
}
