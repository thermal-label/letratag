import { describe, expect, it } from 'vitest';
import * as debug from '../debug.js';
import * as protocol from '../protocol.js';

/**
 * The `./debug` subpath re-exports the encoder from `protocol.ts`
 * with the internal `__DebugEncoderOverrides` knob in scope. These
 * tests assert the subpath surfaces exactly the same callables as
 * `protocol.ts` (no drift) and that the `mediaTypeByte` override —
 * the whole reason the subpath exists — actually reaches the wire.
 */
describe('@thermal-label/letratag-core/debug subpath', () => {
  it('re-exports the encoder entry points', () => {
    expect(typeof debug.encodeBitmap).toBe('function');
    expect(typeof debug.buildPrintPayload).toBe('function');
    expect(typeof debug.chunkPayload).toBe('function');
    expect(typeof debug.encodeLabel).toBe('function');
  });

  it('re-exports the identical function references from protocol.ts', () => {
    expect(debug.encodeBitmap).toBe(protocol.encodeBitmap);
    expect(debug.buildPrintPayload).toBe(protocol.buildPrintPayload);
    expect(debug.chunkPayload).toBe(protocol.chunkPayload);
    expect(debug.encodeLabel).toBe(protocol.encodeLabel);
  });

  it('does not leak non-encoder symbols (subpath is encoder-only)', () => {
    const names = Object.keys(debug).sort();
    expect(names).toEqual(['buildPrintPayload', 'chunkPayload', 'encodeBitmap', 'encodeLabel']);
  });

  it('accepts the __DebugEncoderOverrides mediaTypeByte knob', () => {
    const bitmap = { widthPx: 8, heightPx: 32, data: new Uint8Array(8 * 4) };
    const withOverride = debug.buildPrintPayload(bitmap, undefined, { mediaTypeByte: 0x05 });
    const withoutOverride = debug.buildPrintPayload(bitmap);

    // MEDIA_TYPE directive [1B 4D 05 00 00 00] adds 6 bytes; it sits
    // immediately after the 6-byte START directive.
    expect(withOverride.length).toBe(withoutOverride.length + 6);
    expect(Array.from(withOverride.slice(6, 12))).toEqual([0x1b, 0x4d, 0x05, 0x00, 0x00, 0x00]);
  });
});
