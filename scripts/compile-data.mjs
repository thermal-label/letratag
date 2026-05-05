#!/usr/bin/env node
// Aggregates packages/core/data/devices/*.json5 into the compiled
// runtime artifacts:
//
//   - data/devices.json — plain JSON, the published artifact loaded
//     by downstream tooling.
//   - src/devices.generated.ts — typed re-export consumed by
//     src/devices.ts.
//   - data/media.json + src/media.generated.ts — same pair for the
//     LT cassette registry.
//
// Forked from labelmanager/scripts/compile-data.mjs. Differences:
//   - DRIVER = 'letratag', KNOWN_PROTOCOLS = {'letratag-bt'}.
//   - USB block validation removed; bluetooth-gatt block validated.
//   - Per-media validation tightened to the LT 12 mm / 30 dot
//     invariants.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSON5 from 'json5';

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
const STATUS_VALUES = new Set(['verified', 'partial', 'broken', 'untested']);
const MATERIALS = new Set(['paper', 'plastic', 'plastic-clear', 'metallic', 'iron-on-fabric']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const errors = [];
const fail = msg => errors.push(msg);

function readJson5(path) {
  return JSON5.parse(readFileSync(path, 'utf8'));
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

    if (entry.family !== DRIVER) {
      fail(`${filename}: family must be "${DRIVER}" (got ${JSON.stringify(entry.family)})`);
    }

    const transports = entry.transports;
    if (!transports || typeof transports !== 'object') {
      fail(`${filename}: \`transports\` must be a keyed object`);
    } else {
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

    if (!entry.support || !STATUS_VALUES.has(entry.support.status)) {
      fail(
        `${filename}: \`support.status\` must be one of ${[...STATUS_VALUES].join('|')} (got ${JSON.stringify(entry.support?.status)})`,
      );
    }

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
    if (m?.tapeWidthMm !== 12) fail(`media[${i}]: tapeWidthMm must be 12`);
    if (m?.printableDots !== 30) fail(`media[${i}]: printableDots must be 30`);
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

function writeGeneratedTs(path, imports, exportName, typeAnnotation, value) {
  const body = `// AUTO-GENERATED by scripts/compile-data.mjs — do not edit by hand.
// Regenerate with \`pnpm --filter @thermal-label/letratag-core compile-data\`.
${imports}

export const ${exportName} = ${JSON.stringify(value, null, 2)} as const satisfies ${typeAnnotation};
`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, 'utf8');
}

const devices = loadDevices();
const media = loadMedia();

if (errors.length > 0) {
  console.error(`[compile-data] ${errors.length} error(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

const registry = {
  schemaVersion: SCHEMA_VERSION,
  driver: DRIVER,
  devices,
};

writeJson(DEVICES_OUT, registry);
writeJson(MEDIA_OUT, media);

writeGeneratedTs(
  DEVICES_TS,
  "import type { DeviceRegistry } from '@thermal-label/contracts';",
  'DEVICE_REGISTRY',
  'DeviceRegistry',
  registry,
);

writeGeneratedTs(
  MEDIA_TS,
  "import type { LetraTagMedia } from './types.js';",
  'MEDIA_LIST',
  'readonly LetraTagMedia[]',
  media,
);

console.log(
  `[compile-data] OK — ${devices.length} devices, ${media.length} media entries → data/devices.json, data/media.json`,
);
