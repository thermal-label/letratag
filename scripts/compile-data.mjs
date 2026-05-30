#!/usr/bin/env node
// Aggregates packages/core/data/devices/*.json5 into the compiled
// runtime artifacts:
//
//   - data/devices.json — rich JSON projection (config + raw
//     `verifications` + expanded `verificationGrid` + rolled-up
//     `supportStatus`) for non-TS consumers (docs builder, tooling).
//   - src/devices.generated.ts — lean typed re-export consumed by
//     src/devices.ts (config + per-device `supportStatus`, no
//     `verifications` block).
//   - data/media.json + src/media.generated.ts — same pair for the
//     LT cassette registry.
//
// Mirrors labelwriter/packages/core/scripts/compile-data.mjs:
// validates legacy `support` and the new optional `verifications`
// shape, synthesises a `verifications` block from legacy `support`
// when none is authored, and runs the contracts'
// `expandVerifications` to compute propagation + the rolled-up
// `supportStatus`. Driver-specific differences:
//
//   - DRIVER = 'letratag', KNOWN_PROTOCOLS = {'letratag-bt'}.
//   - USB block validation removed; bluetooth-gatt block validated.
//   - Per-media validation tightened to the LT 12 mm invariant.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSON5 from 'json5';
import { expandVerifications, mapLegacyStatus } from '@thermal-label/contracts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const CORE_PKG = resolve(REPO_ROOT, 'packages/core');
const DEVICES_DIR = resolve(CORE_PKG, 'data/devices');
const MEDIA_FILE = resolve(CORE_PKG, 'data/media.json5');
const DEVICES_OUT = resolve(CORE_PKG, 'data/devices.json');
const MEDIA_OUT = resolve(CORE_PKG, 'data/media.json');
const DEVICES_TS = resolve(CORE_PKG, 'src/devices.generated.ts');
const MEDIA_TS = resolve(CORE_PKG, 'src/media.generated.ts');

const DRIVER = 'letratag';
const SCHEMA_VERSION = 1;
const KNOWN_PROTOCOLS = new Set(['letratag-bt']);
const LEGACY_SUPPORT_STATUS = new Set(['verified', 'partial', 'broken', 'untested']);
const VERIFICATION_RUNGS = new Set(['verified', 'partial', 'unsupported']);
const MAX_ISSUES_PER_CELL = 2;
const TRANSPORT_KEYS = new Set(['usb', 'tcp', 'serial', 'bluetooth-spp', 'bluetooth-gatt']);
const MATERIALS = new Set(['paper', 'plastic', 'plastic-clear', 'metallic', 'iron-on-fabric']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];
const fail = msg => errors.push(msg);

function readJson5(path) {
  return JSON5.parse(readFileSync(path, 'utf8'));
}

function validateDeviceEntry(entry, filename) {
  if (entry.family !== DRIVER) {
    fail(`${filename}: family must be "${DRIVER}" (got ${JSON.stringify(entry.family)})`);
  }

  const transports = entry.transports;
  if (!transports || typeof transports !== 'object') {
    fail(`${filename}: \`transports\` must be a keyed object`);
  } else {
    for (const k of Object.keys(transports)) {
      if (!TRANSPORT_KEYS.has(k)) {
        fail(`${filename}: transports.${k} is not a known transport key`);
      }
    }
    const ble = transports['bluetooth-gatt'];
    if (!ble || typeof ble !== 'object') {
      fail(`${filename}: transports['bluetooth-gatt'] must be present`);
    } else {
      for (const field of ['serviceUuid', 'txCharacteristicUuid', 'rxCharacteristicUuid']) {
        const value = ble[field];
        if (typeof value !== 'string' || !UUID_RE.test(value)) {
          fail(
            `${filename}: transports['bluetooth-gatt'].${field} must be lowercase UUID (got ${JSON.stringify(value)})`,
          );
        }
      }
      if (typeof ble.namePrefix !== 'string' || ble.namePrefix.length === 0) {
        fail(`${filename}: transports['bluetooth-gatt'].namePrefix must be a non-empty string`);
      }
      if (!Number.isInteger(ble.mtu) || ble.mtu <= 0) {
        fail(`${filename}: transports['bluetooth-gatt'].mtu must be a positive integer`);
      }
    }
  }

  if (!Array.isArray(entry.engines) || entry.engines.length === 0) {
    fail(`${filename}: \`engines\` must be a non-empty array`);
  } else {
    for (const [i, eng] of entry.engines.entries()) {
      if (typeof eng?.protocol !== 'string' || !KNOWN_PROTOCOLS.has(eng.protocol)) {
        fail(
          `${filename}: engines[${i}].protocol must be one of ${[...KNOWN_PROTOCOLS].join('|')} (got ${JSON.stringify(eng?.protocol)})`,
        );
      }
      if (typeof eng?.headDots !== 'number') {
        fail(`${filename}: engines[${i}].headDots must be a number`);
      }
      if (typeof eng?.dpi !== 'number') {
        fail(`${filename}: engines[${i}].dpi must be a number`);
      }
      if (typeof eng?.role !== 'string') {
        fail(`${filename}: engines[${i}].role must be a string`);
      }
    }
  }

  if (!entry.support || !LEGACY_SUPPORT_STATUS.has(entry.support.status)) {
    fail(
      `${filename}: \`support.status\` must be one of ${[...LEGACY_SUPPORT_STATUS].join('|')} (got ${JSON.stringify(entry.support?.status)})`,
    );
  }

  // Optional `verifications` block — new shape, runs alongside legacy
  // `support` during the alias transition (see plan #0).
  if (entry?.verifications !== undefined) {
    if (typeof entry.verifications !== 'object' || Array.isArray(entry.verifications)) {
      fail(`${filename}: verifications must be a keyed object`);
    } else {
      const declared = new Set(Object.keys(entry.transports ?? {}));
      for (const [k, cell] of Object.entries(entry.verifications)) {
        const cwhere = `${filename} verifications.${k}`;
        if (!TRANSPORT_KEYS.has(k)) {
          fail(`${cwhere}: unknown transport key`);
          continue;
        }
        if (!declared.has(k)) {
          fail(`${cwhere}: transport not declared on this device`);
        }
        if (!cell || typeof cell !== 'object') {
          fail(`${cwhere}: cell must be an object`);
          continue;
        }
        if (!VERIFICATION_RUNGS.has(cell.status)) {
          fail(`${cwhere}: status must be one of ${[...VERIFICATION_RUNGS].join('|')}`);
        }
        if (cell.issues !== undefined) {
          if (!Array.isArray(cell.issues)) {
            fail(`${cwhere}: issues must be an array`);
          } else {
            if (cell.issues.length > MAX_ISSUES_PER_CELL) {
              fail(`${cwhere}: issues may have at most ${MAX_ISSUES_PER_CELL} entries`);
            }
            for (const n of cell.issues) {
              if (!Number.isInteger(n) || n <= 0) {
                fail(`${cwhere}: issues entries must be positive integers`);
              }
            }
          }
        }
        if (cell.reason !== undefined && typeof cell.reason !== 'string') {
          fail(`${cwhere}: reason must be a string`);
        }
        if (cell.lastReported !== undefined && !ISO_DATE_RE.test(cell.lastReported ?? '')) {
          fail(`${cwhere}: lastReported must be ISO date YYYY-MM-DD`);
        }
      }
    }
  }
}

// Synthesise a `verifications` block from the legacy `support` field
// when no explicit `verifications` is authored. Prefers per-transport
// `support.transports.<t>` when authored; otherwise falls back to the
// device-level `support.status`. Returns an empty object when the
// effective status is `'untested'` (no claim).
//
// `mapLegacyStatus` is imported from `@thermal-label/contracts`.
function legacyToVerifications(entry) {
  const declared = Object.keys(entry?.transports ?? {});
  const supportTransports = entry?.support?.transports;
  const out = {};
  if (supportTransports && typeof supportTransports === 'object') {
    for (const t of declared) {
      const mapped = mapLegacyStatus(supportTransports[t]);
      if (mapped) out[t] = { status: mapped };
    }
    // If author specified per-transport entries, trust the granularity
    // — do not fall back to device-level status for unmentioned transports.
    if (Object.keys(supportTransports).length > 0) return out;
  }
  const deviceStatus = mapLegacyStatus(entry?.support?.status);
  if (!deviceStatus) return {};
  for (const t of declared) {
    if (out[t] === undefined) out[t] = { status: deviceStatus };
  }
  return out;
}

function loadDevices() {
  const files = readdirSync(DEVICES_DIR)
    .filter(f => f.endsWith('.json5'))
    .sort();

  const seenKeys = new Set();
  const devices = [];

  for (const filename of files) {
    const path = join(DEVICES_DIR, filename);
    let entry;
    try {
      entry = readJson5(path);
    } catch (err) {
      fail(`${filename}: parse error — ${err.message}`);
      continue;
    }

    if (typeof entry?.key !== 'string') {
      fail(`${filename}: missing string \`key\``);
      continue;
    }
    if (seenKeys.has(entry.key)) {
      fail(`${filename}: duplicate key \`${entry.key}\``);
      continue;
    }
    seenKeys.add(entry.key);

    validateDeviceEntry(entry, filename);

    devices.push(entry);
  }

  return devices;
}

function loadMedia() {
  const entries = readJson5(MEDIA_FILE);
  if (!Array.isArray(entries)) {
    fail(`media.json5: top-level must be an array`);
    return [];
  }
  const seenIds = new Set();
  for (const [i, m] of entries.entries()) {
    if (typeof m?.id !== 'string' || m.id.length === 0) {
      fail(`media[${i}]: id must be a non-empty string`);
    } else if (seenIds.has(m.id)) {
      fail(`media[${i}]: duplicate id \`${m.id}\``);
    } else {
      seenIds.add(m.id);
    }
    if (m?.widthMm !== 12) fail(`media[${i}]: widthMm must be 12 (got ${JSON.stringify(m?.widthMm)})`);
    if (m?.type !== 'tape') fail(`media[${i}]: type must be 'tape'`);
    if (m?.category !== 'cartridge') fail(`media[${i}]: category must be 'cartridge'`);
    if (typeof m?.material !== 'string' || !MATERIALS.has(m.material)) {
      fail(
        `media[${i}]: material must be one of ${[...MATERIALS].join('|')} (got ${JSON.stringify(m?.material)})`,
      );
    }
    if (typeof m?.text !== 'string' || m.text.length === 0) {
      fail(`media[${i}]: text must be a non-empty string`);
    }
    if (typeof m?.background !== 'string' || m.background.length === 0) {
      fail(`media[${i}]: background must be a non-empty string`);
    }
    if (!Array.isArray(m?.targetModels) || !m.targetModels.includes('letratag')) {
      fail(`media[${i}]: targetModels must include 'letratag'`);
    }
    if (
      !Array.isArray(m?.skus) ||
      m.skus.length === 0 ||
      !m.skus.every(s => typeof s === 'string' && s.length > 0)
    ) {
      fail(`media[${i}]: skus must be a non-empty array of strings`);
    }
  }
  return entries;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

const devices = loadDevices();
const media = loadMedia();

if (errors.length > 0) {
  console.error(`[compile-data] ${errors.length} error(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

// Build a registry shadow where each device has a populated
// `verifications` field — explicit when authored, synthesised from
// legacy `support` otherwise — so the contracts `expandVerifications`
// sees one consistent shape.
const synthesizedDevices = devices.map(d => {
  const v =
    d.verifications && Object.keys(d.verifications).length > 0
      ? d.verifications
      : legacyToVerifications(d);
  return { ...d, verifications: v };
});

const expanded = expandVerifications({
  schemaVersion: SCHEMA_VERSION,
  driver: DRIVER,
  devices: synthesizedDevices,
});

// Lean device entries for the bundled TS: drop authoring-only blocks
// (`verifications`) and stamp the rolled-up `supportStatus`.
const leanDevices = devices.map((d, i) => {
  const { verifications: _v, ...rest } = d;
  return { ...rest, supportStatus: expanded.devices[i].supportStatus };
});

// Rich device entries for the JSON projection: keep `verifications`
// + stamp the expanded `verificationGrid` and rolled-up `supportStatus`.
const richDevices = devices.map((d, i) => ({
  ...d,
  verificationGrid: expanded.devices[i].verificationGrid,
  supportStatus: expanded.devices[i].supportStatus,
}));

const richRegistry = {
  schemaVersion: SCHEMA_VERSION,
  driver: DRIVER,
  devices: richDevices,
};

writeJson(DEVICES_OUT, richRegistry);
writeJson(MEDIA_OUT, media);

const leanRegistry = {
  schemaVersion: SCHEMA_VERSION,
  driver: DRIVER,
  devices: leanDevices,
};

const devicesBody = `// AUTO-GENERATED by scripts/compile-data.mjs — do not edit by hand.
// Regenerate with \`pnpm --filter @thermal-label/letratag-core compile-data\`.
import type { DeviceEntry, DeviceRegistry } from '@thermal-label/contracts';

/**
 * Render-time effective status — superset of the contracts' stored
 * verification rungs that includes \`'expected'\` (propagated lift)
 * and \`'unverified'\` (no claim). Mirrors \`EffectiveStatus\` in
 * @thermal-label/contracts >= 0.6; literal here so codegen does not
 * require the matching contracts version on consumers' machines.
 */
export type EffectiveStatus = 'verified' | 'partial' | 'unsupported' | 'expected' | 'unverified';

/** Each entry carries a rolled-up \`supportStatus\` from the verification grid. */
export type RegistryDeviceEntry = DeviceEntry & { supportStatus: EffectiveStatus };

/** Registry shape with \`supportStatus\` stamped on each device. */
export type RegistryWithStatus = Omit<DeviceRegistry, 'devices'> & {
  devices: readonly RegistryDeviceEntry[];
};

export const DEVICE_REGISTRY = ${JSON.stringify(leanRegistry, null, 2)} as const satisfies RegistryWithStatus;
`;
mkdirSync(dirname(DEVICES_TS), { recursive: true });
writeFileSync(DEVICES_TS, devicesBody, 'utf8');

const mediaBody = `// AUTO-GENERATED by scripts/compile-data.mjs — do not edit by hand.
// Regenerate with \`pnpm --filter @thermal-label/letratag-core compile-data\`.
import type { LetraTagMedia } from './types.js';

export const MEDIA_LIST = ${JSON.stringify(media, null, 2)} as const satisfies readonly LetraTagMedia[];
`;
mkdirSync(dirname(MEDIA_TS), { recursive: true });
writeFileSync(MEDIA_TS, mediaBody, 'utf8');

console.log(
  `[compile-data] OK — ${devices.length} devices, ${media.length} media entries → data/devices.json, data/media.json`,
);
