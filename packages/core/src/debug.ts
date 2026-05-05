/**
 * Internal debug subpath. Exposes the encoder with the
 * `__DebugEncoderOverrides` knob accepted. Used by
 * `@thermal-label/letratag-debug` to poke `MEDIA_TYPE` byte values
 * during the verification harness flow.
 *
 * The earlier axisOrder / bitPacking / chunkIndexQuirk knobs have
 * been removed — the official-app source resolved each in a single
 * direction, and the encoder now implements that direction
 * unconditionally.
 *
 * Not stable. Not part of the public API.
 */
export { encodeBitmap, buildPrintPayload, chunkPayload, encodeLabel } from './protocol.js';
export type { __DebugEncoderOverrides } from './types.js';
