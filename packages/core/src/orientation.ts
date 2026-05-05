import type { RotateDirection } from '@thermal-label/contracts';

/**
 * Direction the LetraTag print head rotates landscape input.
 *
 * `90` = clockwise, mirroring the labelmanager precedent. Verify on
 * hardware before flipping if anything changes here.
 */
export const ROTATE_DIRECTION: RotateDirection = 90;
