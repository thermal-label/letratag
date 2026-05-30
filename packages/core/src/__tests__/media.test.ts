import { describe, expect, it } from 'vitest';
import { DEFAULT_MEDIA, LT_PAPER_WHITE, MEDIA, MEDIA_LIST, findMediaBySku } from '../media.js';

describe('media registry', () => {
  it('exposes every entry by id and as a list', () => {
    expect(MEDIA_LIST.length).toBeGreaterThanOrEqual(10);
    for (const m of MEDIA_LIST) {
      expect(MEDIA[m.id]).toBe(m);
    }
  });

  it('every entry is 12 mm tape', () => {
    for (const m of MEDIA_LIST) {
      expect(m.widthMm).toBe(12);
      expect(m.type).toBe('tape');
      expect(m.category).toBe('cartridge');
      expect(m.targetModels).toContain('letratag');
    }
  });

  it('every entry has at least one SKU and named text/background', () => {
    for (const m of MEDIA_LIST) {
      expect(m.skus.length).toBeGreaterThan(0);
      expect(m.text).toBeTruthy();
      expect(m.background).toBeTruthy();
    }
  });

  it('DEFAULT_MEDIA is LT_PAPER_WHITE (ships in the box)', () => {
    expect(DEFAULT_MEDIA).toBe(LT_PAPER_WHITE);
    expect(LT_PAPER_WHITE.id).toBe('lt-paper-white');
  });

  it('findMediaBySku resolves regional part numbers', () => {
    expect(findMediaBySku('91200')?.id).toBe('lt-paper-white');
    expect(findMediaBySku('S0721510')?.id).toBe('lt-paper-white');
    expect(findMediaBySku('does-not-exist')).toBeUndefined();
  });
});
