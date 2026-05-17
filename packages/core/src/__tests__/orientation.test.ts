import { describe, expect, it } from 'vitest';
import { ROTATE_DIRECTION } from '../orientation.js';

describe('ROTATE_DIRECTION', () => {
  it('rotates landscape input 90 degrees clockwise (labelmanager precedent)', () => {
    expect(ROTATE_DIRECTION).toBe(90);
  });
});
