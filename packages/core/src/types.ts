import type { DeviceEntry, MediaDescriptor, PrintOptions } from '@thermal-label/contracts';

/**
 * DYMO LetraTag device entry. Alias for the contracts `DeviceEntry`
 * narrowed to `family: 'letratag'`.
 */
export type LetraTagDevice = DeviceEntry & { family: 'letratag' };

/**
 * LT cassette substrate family. Picker / preview UX hint — the
 * rasterizer does not branch on this.
 */
export type LetraTagMaterial =
  | 'paper'
  | 'plastic'
  | 'plastic-clear'
  | 'metallic'
  | 'iron-on-fabric';

/**
 * DYMO LetraTag media descriptor.
 *
 * Extends the contracts base `MediaDescriptor`. Tape is always
 * continuous — `heightMm` is omitted. Every LT cassette is 12 mm
 * wide; that width lives in the spec'd `widthMm` (the only width
 * the LT-200B chassis accepts).
 *
 * Printable head height is a chassis fact, not a per-cassette one,
 * so it lives on the engine (`PrintEngine.headDots`) and the
 * `PRINTABLE_DOTS` constant in `./protocol.ts` — not on this media
 * type.
 */
export interface LetraTagMedia extends MediaDescriptor {
  type: 'tape';
  /** LT substrate family. */
  material?: LetraTagMaterial;
  /** Printed ink colour, named (the only ink the cartridge carries). */
  text?: string;
  /** Substrate colour, named. */
  background?: string;
}

/**
 * Public LetraTag print options.
 *
 * Extends the cross-driver `PrintOptions` with `rotate` and
 * `autoCut`. `density` and `engine` are inherited from the base
 * type and silently ignored — the LT-200B has no documented density
 * control and only one engine.
 */
export interface LetraTagPrintOptions extends PrintOptions {
  rotate?: 'auto' | 0 | 90 | 180 | 270;
  /**
   * Whether the printer should advance to the cut-line after this
   * job. Defaults to `true`. When `copies > 1`, only the final copy
   * receives a cut — intermediate copies are emitted with the
   * suppress-cut byte (`0x31`).
   */
  autoCut?: boolean;
}

/**
 * Internal encoder overrides. Not re-exported from `index.ts` —
 * reachable only through the `./debug` subpath. Used by the
 * verification harness to poke at the only remaining unknown:
 * `mediaTypeByte` (the cassetteId enum is documented in the
 * protocol page but the host normally does not emit `MEDIA_TYPE`
 * on the print path).
 *
 * The earlier `axisOrder` / `bitPacking` / `chunkIndexQuirk` knobs
 * have been removed: on-the-wire observation resolved each of
 * those conflicts in a single direction, and the encoder now
 * implements that direction unconditionally.
 */
export interface __DebugEncoderOverrides {
  /**
   * When set, prepend a `MEDIA_TYPE` directive carrying this byte
   * to the print payload. Default `undefined` (omit). The
   * directive's wire form is 6 bytes
   * (`[1B 4D byte 00 00 00]`); the trailing zero pad is part of the
   * observed wire format.
   */
  mediaTypeByte?: number;
}
