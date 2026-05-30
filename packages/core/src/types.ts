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
 * Tape is always continuous (`heightMm` omitted). Every LT cassette
 * is 12 mm wide — the only width the chassis accepts — carried in
 * `widthMm`. Printable head height is a chassis fact, so it lives on
 * the engine / `PRINTABLE_DOTS`, not here.
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
 * Internal encoder overrides — reachable only via the `./debug`
 * subpath, not re-exported from `index.ts`. Used by the verification
 * harness to poke the one remaining unknown, `mediaTypeByte` (the
 * host normally omits `MEDIA_TYPE` on the print path).
 */
export interface __DebugEncoderOverrides {
  /**
   * When set, prepend a `MEDIA_TYPE` directive carrying this byte to
   * the print payload. Default `undefined` (omit).
   */
  mediaTypeByte?: number;
}
