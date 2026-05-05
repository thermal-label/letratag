import { DEVICE_REGISTRY } from './devices.generated.js';
import type { LetraTagDevice } from './types.js';

/**
 * Compiled `DeviceRegistry` for the LetraTag driver. Source of truth
 * lives in `packages/core/data/devices/<KEY>.json5`;
 * `scripts/compile-data.mjs` aggregates them into the generated TS
 * module imported here.
 */
export const DEVICE_REGISTRY_DATA = DEVICE_REGISTRY;

type DeviceKey = (typeof DEVICE_REGISTRY)['devices'][number]['key'];

/**
 * Registry of supported LetraTag devices, keyed by the device's
 * stable `key` field (`LT_200B`). Values are the full contracts
 * `DeviceEntry`.
 */
export const DEVICES = Object.fromEntries(
  DEVICE_REGISTRY.devices.map(d => [d.key, d]),
) as unknown as Record<DeviceKey, LetraTagDevice>;
