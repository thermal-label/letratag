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
 * wide (the only width the LT-200B chassis accepts) and 30 dots
 * printable; both literal-typed.
 *
 * `printableDots: 30` is a chassis fact, not a wire-format fact —
 * the protocol always frames 32 rows; the LT-200B's print head
 * appears to image all 32, but prior public encoders reported that
 * the top and bottom rows clip on certain substrates. Treat 30 as
 * the safe authoring height for now and verify on hardware.
 */
export interface LetraTagMedia extends MediaDescriptor {
  type: 'tape';
  tapeWidthMm: 12;
  printableDots: 30;
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
