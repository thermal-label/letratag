import { MEDIA_LIST } from './media.generated.js';
import type { LetraTagMedia } from './types.js';

type MediaId = (typeof MEDIA_LIST)[number]['id'];

const MEDIA_BY_ID = Object.fromEntries(MEDIA_LIST.map(m => [m.id, m])) as unknown as Record<
  MediaId,
  LetraTagMedia
>;

/**
 * Indexed registry of every LT cassette SKU the driver knows about,
 * keyed by entry id (e.g. `MEDIA['lt-paper-white']`).
 */
export const MEDIA = MEDIA_BY_ID;

export { MEDIA_LIST };

/**
 * Canonical default — the white-paper cassette ships in the box with
 * every LT-200B. Single named const, not a per-cassette export.
 */
export const LT_PAPER_WHITE: LetraTagMedia = MEDIA_BY_ID['lt-paper-white'];

export const DEFAULT_MEDIA: LetraTagMedia = LT_PAPER_WHITE;

/**
 * Find a media entry by vendor SKU. LT cassettes ship under many
 * regional part numbers (US 91XXX vs EU S07XXXXX); this helper does
 * the lookup against `MediaDescriptor.skus`.
 */
export function findMediaBySku(sku: string): LetraTagMedia | undefined {
  return MEDIA_LIST.find(m => (m.skus as readonly string[] | undefined)?.includes(sku));
}
