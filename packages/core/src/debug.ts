/**
 * Internal debug subpath — exposes the encoder accepting
 * `__DebugEncoderOverrides`. Used by `@thermal-label/letratag-debug`
 * to poke `MEDIA_TYPE` byte values in the verification harness.
 *
 * Not stable. Not part of the public API.
 */
export { encodeBitmap, buildPrintPayload, chunkPayload, encodeLabel } from './protocol.js';
export type { __DebugEncoderOverrides } from './types.js';
