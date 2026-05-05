import { renderImage, type RawImageData } from '@mbtech-nl/bitmap';
import type { PreviewResult } from '@thermal-label/contracts';
import { DEFAULT_MEDIA } from './media.js';
import type { LetraTagMedia } from './types.js';

/**
 * Generate an offline preview without a live printer connection.
 *
 * Single-plane, single-ink — the LT-200B carries one ink colour per
 * cassette. The displayed colour pair derives from the selected
 * media's `text` / `background` so a "print to silver metallic"
 * preview shows black on silver, etc. Media defaults to
 * `LT_PAPER_WHITE` (white-paper cassette ships in the box) when
 * omitted.
 */
export function createPreviewOffline(
  image: RawImageData,
  media: LetraTagMedia = DEFAULT_MEDIA,
): PreviewResult {
  const bitmap = renderImage(image, { dither: true });
  const ink = media.text ?? 'black';
  return {
    planes: [{ name: ink, bitmap, displayColor: cssColor(ink) }],
    media,
    assumed: false,
  };
}

/**
 * Map LT cassette colour names to CSS colours for preview display.
 * Falls back to the literal name (CSS-named-colour) when unknown —
 * good enough for picker UX.
 */
function cssColor(name: string): string {
  switch (name) {
    case 'black':
      return '#000000';
    case 'white':
      return '#ffffff';
    case 'pearl-white':
      return '#f4f0e8';
    case 'yellow':
      return '#f4d04a';
    case 'red':
      return '#d23a3a';
    case 'green':
      return '#3aa765';
    case 'blue':
      return '#3a6dd2';
    case 'clear':
      return 'rgba(255,255,255,0.25)';
    case 'silver':
      return '#bfc1c2';
    default:
      return name;
  }
}
