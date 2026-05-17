import type { RawImageData } from '@mbtech-nl/bitmap';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MEDIA } from '../media.js';
import { createPreviewOffline } from '../preview.js';
import type { LetraTagMedia } from '../types.js';

/** A tiny 2x2 RGBA image — half black, half white pixels. */
function tinyImage(): RawImageData {
  // prettier-ignore
  const data = new Uint8Array([
    0, 0, 0, 255,        255, 255, 255, 255,
    255, 255, 255, 255,  0, 0, 0, 255,
  ]);
  return { width: 2, height: 2, data };
}

/** Build a synthetic media descriptor overriding the ink (`text`) colour. */
function mediaWithInk(text: string): LetraTagMedia {
  return { ...DEFAULT_MEDIA, text };
}

describe('createPreviewOffline', () => {
  it('defaults to DEFAULT_MEDIA (white-paper cassette) when media is omitted', () => {
    const result = createPreviewOffline(tinyImage());
    expect(result.media).toBe(DEFAULT_MEDIA);
    expect(result.assumed).toBe(false);
  });

  it('produces exactly one ink plane (LT-200B is single-ink)', () => {
    const result = createPreviewOffline(tinyImage());
    expect(result.planes).toHaveLength(1);
    expect(result.planes[0]?.bitmap).toBeDefined();
  });

  it('plane name and displayColor derive from the media ink colour', () => {
    const result = createPreviewOffline(tinyImage(), mediaWithInk('black'));
    expect(result.planes[0]?.name).toBe('black');
    expect(result.planes[0]?.displayColor).toBe('#000000');
  });

  it('falls back to black ink when media.text is absent', () => {
    const mediaNoInk = { ...DEFAULT_MEDIA };
    delete (mediaNoInk as { text?: string }).text;
    const result = createPreviewOffline(tinyImage(), mediaNoInk);
    expect(result.planes[0]?.name).toBe('black');
    expect(result.planes[0]?.displayColor).toBe('#000000');
  });

  it('maps every known cassette ink colour to its CSS value', () => {
    const cases: [string, string][] = [
      ['black', '#000000'],
      ['white', '#ffffff'],
      ['pearl-white', '#f4f0e8'],
      ['yellow', '#f4d04a'],
      ['red', '#d23a3a'],
      ['green', '#3aa765'],
      ['blue', '#3a6dd2'],
      ['clear', 'rgba(255,255,255,0.25)'],
      ['silver', '#bfc1c2'],
    ];
    for (const [ink, css] of cases) {
      const result = createPreviewOffline(tinyImage(), mediaWithInk(ink));
      expect(result.planes[0]?.displayColor).toBe(css);
    }
  });

  it('falls back to the literal ink name for unknown colours', () => {
    const result = createPreviewOffline(tinyImage(), mediaWithInk('hotpink'));
    expect(result.planes[0]?.displayColor).toBe('hotpink');
  });

  it('echoes the supplied media descriptor on the result', () => {
    const media = mediaWithInk('red');
    const result = createPreviewOffline(tinyImage(), media);
    expect(result.media).toBe(media);
  });
});
