<script setup lang="ts">
import type { LabelBitmap } from '@mbtech-nl/bitmap';
import { encodeLabel } from '@thermal-label/letratag-core/debug';
import type { __DebugEncoderOverrides } from '@thermal-label/letratag-core/debug';
import { DEVICES, parseStatus, STATUS_NOTIFICATION_LENGTH } from '@thermal-label/letratag-core';
import { computed, onMounted, ref, watch, type Ref } from 'vue';
import {
  bitmapToBase64,
  bytesToHex,
  statusToParsed,
  type DiagnosticsExport,
  type TraceEvent,
} from './diagnostics';
import {
  buildCustom,
  buildT1,
  buildT2,
  buildT3,
  buildT4,
  buildT5,
  PATTERNS,
  type PatternMeta,
} from './patterns';

// ─── Pairing state ──────────────────────────────────────────────────

interface ConnectionState {
  device: BluetoothDevice;
  serviceUuid: string;
  txUuid: string;
  rxUuid: string;
  shortCmdUuid: string;
  txCharacteristic: BluetoothRemoteGATTCharacteristic;
  rxCharacteristic: BluetoothRemoteGATTCharacteristic;
}

const connection: Ref<ConnectionState | null> = ref(null);
const isConnecting = ref(false);
const isPrinting = ref(false);
const statusMessage: Ref<string> = ref('');
const statusKind: Ref<'info' | 'ok' | 'warn' | 'err'> = ref('info');

// ─── Encoder controls (post-APK: only mediaTypeByte remains) ────────

const emitMediaType = ref(false);
const mediaTypeByte = ref(0);
const copies = ref(1);
const autoCut = ref(true);
const showEncoderControls = ref(false);

const encoderOverrides = computed<__DebugEncoderOverrides>(() => {
  const overrides: __DebugEncoderOverrides = {};
  if (emitMediaType.value) overrides.mediaTypeByte = mediaTypeByte.value & 0xff;
  return overrides;
});

// ─── Test pattern selection ─────────────────────────────────────────

const selected: Ref<PatternMeta['id']> = ref('T1');
const customText = ref('hello');
const bitmap: Ref<LabelBitmap | null> = ref(null);

async function rebuildBitmap(): Promise<void> {
  switch (selected.value) {
    case 'T1':
      bitmap.value = buildT1();
      break;
    case 'T2':
      bitmap.value = buildT2();
      break;
    case 'T3':
      bitmap.value = buildT3();
      break;
    case 'T4':
      bitmap.value = buildT4();
      break;
    case 'T5':
      bitmap.value = buildT5();
      break;
    case 'CUSTOM':
      bitmap.value = await buildCustom(customText.value);
      break;
  }
}

watch([selected, customText], () => void rebuildBitmap(), { immediate: true });

// ─── Trace log ──────────────────────────────────────────────────────

const trace: Ref<TraceEvent[]> = ref([]);
const tracePaused = ref(false);
const traceStartedAt: Ref<number> = ref(performance.now());

function appendTrace(event: Omit<TraceEvent, 't'>): void {
  if (tracePaused.value) return;
  trace.value.push({
    ...event,
    t: Math.round(performance.now() - traceStartedAt.value),
  });
}

function clearTrace(): void {
  trace.value = [];
  traceStartedAt.value = performance.now();
}

// ─── Cassette / reporter metadata ───────────────────────────────────

const reporterName = ref('');
const reporterGithub = ref('');
const cassetteSku = ref('');
const cassetteMaterial = ref('');
const cassetteBackground = ref('');
const exportNotes = ref('');

// ─── Connect / disconnect ───────────────────────────────────────────

const SERVICE_PREFIX = 'be3dd650-';
const CANONICAL_SERVICE = 'be3dd650-2b3d-42f1-99c1-f0f749dd0678';
// Real LT-200B advertises as `Letratag <12-hex-MAC-suffix>`
// (bench-confirmed 2026-05-10). ysfchn / alexhorn upstream documented
// `DYMO LT-200B` — wrong for this firmware rev.
const CANONICAL_NAME_PREFIX = 'Letratag ';

async function connect(): Promise<void> {
  isConnecting.value = true;
  statusMessage.value = 'Opening Bluetooth picker…';
  statusKind.value = 'info';
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: CANONICAL_NAME_PREFIX, services: [CANONICAL_SERVICE] }],
      optionalServices: [CANONICAL_SERVICE],
    });
    if (!device.gatt) throw new Error('Selected device has no GATT server');

    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();
    const matched = services.find(s => s.uuid.startsWith(SERVICE_PREFIX));
    if (!matched) throw new Error(`No GATT service starting with "${SERVICE_PREFIX}"`);
    const tail = matched.uuid.slice(8);
    const txUuid = `be3dd651${tail}`;
    const rxUuid = `be3dd652${tail}`;
    const shortCmdUuid = `be3dd653${tail}`;
    const tx = await matched.getCharacteristic(txUuid);
    const rx = await matched.getCharacteristic(rxUuid);
    rx.addEventListener('characteristicvaluechanged', onRxNotification);
    await rx.startNotifications();

    connection.value = {
      device,
      serviceUuid: matched.uuid,
      txUuid,
      rxUuid,
      shortCmdUuid,
      txCharacteristic: tx,
      rxCharacteristic: rx,
    };
    appendTrace({
      dir: 'info',
      hex: '',
      message: `connected: ${device.name ?? '(unnamed)'} — service ${matched.uuid}`,
    });
    statusMessage.value = `Connected: ${device.name ?? 'unnamed'}`;
    statusKind.value = 'ok';
  } catch (err) {
    statusMessage.value = err instanceof Error ? err.message : String(err);
    statusKind.value = 'err';
  } finally {
    isConnecting.value = false;
  }
}

async function disconnect(): Promise<void> {
  const c = connection.value;
  if (!c) return;
  try {
    c.rxCharacteristic.removeEventListener('characteristicvaluechanged', onRxNotification);
    await c.rxCharacteristic.stopNotifications();
  } catch {
    // OK to ignore — device may have already disconnected.
  }
  if (c.device.gatt?.connected) c.device.gatt.disconnect();
  connection.value = null;
  appendTrace({ dir: 'info', hex: '', message: 'disconnected' });
}

// ─── RX handling ────────────────────────────────────────────────────

const lastStatus: Ref<ReturnType<typeof parseStatus> | null> = ref(null);

function onRxNotification(event: Event): void {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  const view = target.value;
  if (!view) return;
  const bytes = new Uint8Array(
    view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
  );
  if (bytes.length >= STATUS_NOTIFICATION_LENGTH) {
    const status = parseStatus(bytes);
    lastStatus.value = status;
    appendTrace({ dir: 'rx', hex: bytesToHex(bytes, 64), parsed: statusToParsed(status) });
  } else {
    appendTrace({ dir: 'rx', hex: bytesToHex(bytes, 64) });
  }
}

// ─── Print ──────────────────────────────────────────────────────────

const lastWrites: Ref<Uint8Array[]> = ref([]);

async function print(): Promise<void> {
  const c = connection.value;
  if (!c) {
    statusMessage.value = 'Connect first';
    statusKind.value = 'err';
    return;
  }
  const bm = bitmap.value;
  if (!bm) {
    statusMessage.value = 'No bitmap';
    statusKind.value = 'err';
    return;
  }
  if (selected.value === 'T5') {
    statusMessage.value = 'T5 is passive — no print needed (UUIDs already captured)';
    statusKind.value = 'info';
    return;
  }

  isPrinting.value = true;
  statusMessage.value = 'Printing…';
  statusKind.value = 'info';

  try {
    // Pass engine context so the encoder consumes the registry's
    // forcedTrailingFeedMm (6 mm bench-confirmed). Without this the
    // print stays inside the head-to-cutter gap and isn't visible.
    // Also pass the registry's bluetooth-gatt.mtu so the encoder
    // sizes its protocol chunks to single-BLE-write fits — Chrome
    // doesn't auto-fragment writeValueWithoutResponse on Linux.
    const engine = DEVICES.LT_200B.engines[0];
    const mtu = DEVICES.LT_200B.transports['bluetooth-gatt']?.mtu;
    const writes = encodeLabel(
      bm,
      { copies: copies.value, autoCut: autoCut.value },
      encoderOverrides.value,
      {
        ...(engine ? { engine } : {}),
        ...(mtu !== undefined ? { mtu } : {}),
      },
    );
    lastWrites.value = writes;
    // Inter-chunk delay: with `setTimeout(resolve, 0)` (~0 ms) the
    // browser's BLE write-without-response queue overflows on
    // multi-chunk payloads (~2 KB / 5 chunks → "GATT operation
    // failed for unknown reason" on the first chunk). 50 ms gives
    // the queue time to drain. Tunable; the vendor LetraTag Connect
    // app delegates to NativeScript's `bluetooth.writeToService`
    // which handles flow control internally.
    const INTER_CHUNK_DELAY_MS = 50;
    for (const chunk of writes) {
      appendTrace({ dir: 'tx', hex: bytesToHex(chunk, 64) });
      await c.txCharacteristic.writeValueWithoutResponse(chunk);
      await new Promise<void>(resolve => setTimeout(resolve, INTER_CHUNK_DELAY_MS));
    }
    statusMessage.value = `Sent ${String(writes.length)} writes; awaiting RX…`;
    statusKind.value = 'ok';
    // H3 (vendor-style 500ms GATT READ poll on printReplyUUID) was
    // tested 2026-05-10 and did NOT resolve the alternation — polling
    // reads alone don't help. Reads also returned spurious stale
    // bytes (often `1B 52 05`) that mis-parse as failures. Reverted.
  } catch (err) {
    statusMessage.value = err instanceof Error ? err.message : String(err);
    statusKind.value = 'err';
    appendTrace({ dir: 'err', hex: '', message: statusMessage.value });
  } finally {
    isPrinting.value = false;
  }
}

// ─── Diagnostics export ─────────────────────────────────────────────

function buildExport(): DiagnosticsExport {
  const bm = bitmap.value;
  const writes = lastWrites.value;
  let totalBytes = 0;
  for (const w of writes) totalBytes += w.length;
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    test: selected.value,
    reporter: {
      name: reporterName.value,
      githubHandle: reporterGithub.value || null,
    },
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      locale: navigator.language,
    },
    device: {
      name: connection.value?.device.name ?? '',
      serviceUuidObserved: connection.value?.serviceUuid ?? null,
      txUuidDerived: connection.value?.txUuid ?? null,
      rxUuidDerived: connection.value?.rxUuid ?? null,
      auxUuidDerived: connection.value?.shortCmdUuid ?? null,
      linkMtu: null,
    },
    cassette: {
      sku: cassetteSku.value || null,
      material: cassetteMaterial.value || null,
      background: cassetteBackground.value || null,
    },
    encoder: {
      // axisOrder/bitPacking/chunkIndexQuirk are no longer adjustable —
      // kept in the schema for backward-compat but pinned to the
      // values implied by the official-app-derived encoder.
      axisOrder: 'ysfchn',
      bitPacking: 'ysfchn',
      chunkIndexQuirk: true,
      emitMediaType: emitMediaType.value,
      mediaTypeByte: emitMediaType.value ? mediaTypeByte.value & 0xff : null,
      libraryVersion: '0.0.0',
    },
    payload: {
      bitmapWidth: bm?.widthPx ?? 0,
      bitmapHeight: bm?.heightPx ?? 0,
      bitmapBase64: bm ? bitmapToBase64(bm) : '',
      chunkCount: writes.length,
      totalBytes,
    },
    trace: trace.value,
    notes: exportNotes.value,
  };
}

async function copyJson(): Promise<void> {
  const json = JSON.stringify(buildExport(), null, 2);
  try {
    await navigator.clipboard.writeText(json);
    statusMessage.value = 'Diagnostics JSON copied to clipboard';
    statusKind.value = 'ok';
  } catch {
    statusMessage.value = 'Clipboard write failed; use Download .json';
    statusKind.value = 'warn';
  }
}

function downloadJson(): void {
  const json = JSON.stringify(buildExport(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `letratag-diagnostics-${selected.value}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const photos: Ref<File[]> = ref([]);

function onPhotoChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (!input.files) return;
  photos.value = Array.from(input.files);
}

async function downloadZip(): Promise<void> {
  if (photos.value.length === 0) {
    statusMessage.value = 'No photos selected';
    statusKind.value = 'warn';
    return;
  }
  const { zip } = await import('fflate');
  const files: Record<string, Uint8Array> = {};
  for (const file of photos.value) {
    const buf = new Uint8Array(await file.arrayBuffer());
    files[file.name] = buf;
  }
  const exportJson = new TextEncoder().encode(JSON.stringify(buildExport(), null, 2));
  files['diagnostics.json'] = exportJson;
  zip(files, (err: unknown, data: Uint8Array | undefined) => {
    if (err || !data) {
      statusMessage.value = 'Zip failed';
      statusKind.value = 'err';
      return;
    }
    const blob = new Blob([data], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `letratag-${selected.value}-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ─── Bitmap canvas preview ──────────────────────────────────────────

const previewCanvas: Ref<HTMLCanvasElement | null> = ref(null);

function drawPreview(): void {
  const cv = previewCanvas.value;
  const bm = bitmap.value;
  if (!cv || !bm) return;
  if (typeof (cv as { getContext: unknown }).getContext !== 'function') return;
  let ctx: CanvasRenderingContext2D | null;
  try {
    ctx = cv.getContext('2d');
  } catch {
    return;
  }
  if (!ctx) return;
  const scale = 4;
  cv.width = bm.widthPx * scale;
  cv.height = bm.heightPx * scale;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#000';
  const stride = Math.ceil(bm.widthPx / 8);
  for (let y = 0; y < bm.heightPx; y += 1) {
    for (let x = 0; x < bm.widthPx; x += 1) {
      const byteIndex = y * stride + (x >>> 3);
      const bit = 7 - (x & 7);
      const byte = bm.data[byteIndex] ?? 0;
      if (((byte >>> bit) & 1) === 1) ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

watch(bitmap, () => {
  void Promise.resolve().then(drawPreview);
});

onMounted(() => drawPreview());

// ─── Computed display ───────────────────────────────────────────────

const selectedMeta = computed(() => PATTERNS.find(p => p.id === selected.value));
const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
</script>

<template>
  <main>
    <header>
      <h1>LetraTag LT-200B — Debug & Verification Harness</h1>
      <p class="muted">
        Pair your LT-200B over Web Bluetooth, run the test pattern matrix, and export a single JSON
        blob covering everything the maintainer needs to debug remotely. The encoder follows the
        official DYMO LetraTag Connect app byte-for-byte, so prints should "just work" — confirm
        with the T1 single-pixel test and report any deviation. File reports against the
        <a href="https://github.com/thermal-label/letratag/issues" target="_blank" rel="noopener"
          >letratag repo</a
        >.
      </p>
    </header>

    <!-- Connection panel -->
    <section class="panel">
      <h2>Connection</h2>
      <div class="row">
        <button v-if="!connection" class="primary" :disabled="isConnecting" @click="connect">
          {{ isConnecting ? 'Connecting…' : 'Connect via Web Bluetooth' }}
        </button>
        <button v-else @click="disconnect">Disconnect</button>
        <span v-if="connection" class="tag ok">connected</span>
      </div>
      <dl v-if="connection" class="kv">
        <dt>Device name</dt>
        <dd>{{ connection.device.name || '(unnamed)' }}</dd>
        <dt>Service UUID</dt>
        <dd>{{ connection.serviceUuid }}</dd>
        <dt>TX UUID (printRequest)</dt>
        <dd>{{ connection.txUuid }}</dd>
        <dt>RX UUID (printReply)</dt>
        <dd>{{ connection.rxUuid }}</dd>
        <dt>Short-command UUID</dt>
        <dd>{{ connection.shortCmdUuid }}</dd>
        <dt>User-Agent</dt>
        <dd>{{ userAgent }}</dd>
      </dl>
    </section>

    <!-- Test pattern selector -->
    <section class="panel">
      <h2>Test pattern</h2>
      <div class="row" style="flex-direction: column; align-items: stretch; gap: 6px">
        <label v-for="p in PATTERNS" :key="p.id" class="radio">
          <input type="radio" :value="p.id" v-model="selected" />
          <span
            ><strong>{{ p.label }}</strong></span
          >
        </label>
      </div>
      <p v-if="selectedMeta" class="muted">{{ selectedMeta.description }}</p>
      <div v-if="selected === 'CUSTOM'" class="row">
        <label style="flex: 1">
          <span class="muted">Text</span>
          <input type="text" v-model="customText" />
        </label>
      </div>
    </section>

    <!-- Encoder controls -->
    <section class="panel">
      <h2>
        <button
          type="button"
          style="
            border: none;
            background: none;
            color: inherit;
            text-transform: inherit;
            font: inherit;
            letter-spacing: inherit;
            padding: 0;
            cursor: pointer;
          "
          @click="showEncoderControls = !showEncoderControls"
        >
          Encoder controls {{ showEncoderControls ? '▾' : '▸' }}
        </button>
      </h2>
      <div
        v-if="showEncoderControls"
        class="row"
        style="flex-direction: column; align-items: stretch; gap: 10px"
      >
        <div class="row">
          <label class="checkbox">
            <input type="checkbox" v-model="autoCut" /> autoCut (CUT byte 0x30 vs 0x31)
          </label>
        </div>
        <div class="row">
          <span class="muted">copies</span>
          <input type="number" min="1" max="255" v-model.number="copies" style="max-width: 100px" />
        </div>
        <div class="row">
          <label class="checkbox">
            <input type="checkbox" v-model="emitMediaType" />
            emit MEDIA_TYPE byte
          </label>
          <input
            type="number"
            min="0"
            max="5"
            v-model.number="mediaTypeByte"
            :disabled="!emitMediaType"
            style="max-width: 100px"
          />
        </div>
        <p class="muted">
          The encoder is now byte-for-byte the official DYMO LetraTag Connect app — axis order, bit
          packing, and the chunk-index quirk are all fixed. <code>autoCut</code> flips between cut
          (0x30) and no-cut (0x31). <code>copies</code> sets the NUMBER_OF_COPIES directive
          (1..255). <code>MEDIA_TYPE</code> is normally not emitted; toggle it to test whether 0..5
          changes anything.
        </p>
      </div>
    </section>

    <!-- Bitmap preview -->
    <section class="panel">
      <h2>Bitmap preview</h2>
      <p class="muted">
        {{ bitmap?.widthPx }} × {{ bitmap?.heightPx }} pixels (head-aligned; feed × head). The
        encoder pads the head dimension to 32 by adding zero-rasterlines top and bottom.
      </p>
      <canvas ref="previewCanvas" class="bitmap-canvas" />
    </section>

    <!-- Print + status -->
    <section class="panel">
      <h2>Print</h2>
      <div class="row">
        <button class="primary" :disabled="!connection || isPrinting" @click="print">
          {{ isPrinting ? 'Printing…' : 'Print' }}
        </button>
        <span v-if="statusMessage" :class="['tag', statusKind]">{{ statusMessage }}</span>
      </div>
      <div
        v-if="lastStatus"
        class="row"
        style="flex-direction: column; align-items: stretch; gap: 4px"
      >
        <span class="muted">Last RX status</span>
        <code
          >ready={{ lastStatus.ready }} mediaLoaded={{ lastStatus.mediaLoaded }} errors=[{{
            lastStatus.errors.map(e => e.code).join(', ')
          }}]</code
        >
      </div>
    </section>

    <!-- Trace log -->
    <section class="panel">
      <h2>Trace</h2>
      <div class="row">
        <button @click="tracePaused = !tracePaused">
          {{ tracePaused ? 'Resume' : 'Pause' }}
        </button>
        <button @click="clearTrace">Clear</button>
        <span class="muted">{{ trace.length }} events</span>
      </div>
      <div class="trace">
        <div v-for="(ev, i) in trace" :key="i" :class="`row-${ev.dir}`">
          <span>[{{ ev.t.toString().padStart(6, ' ') }}ms] {{ ev.dir.toUpperCase() }}</span>
          <span v-if="ev.message"> {{ ev.message }}</span>
          <span v-if="ev.hex"> {{ ev.hex }}</span>
          <span v-if="ev.parsed">
            ⇒ ready={{ ev.parsed.ready }} errors=[{{
              ev.parsed.errors.map(e => e.code).join(', ')
            }}]</span
          >
        </div>
      </div>
    </section>

    <!-- Diagnostics export -->
    <section class="panel">
      <h2>Diagnostics export</h2>
      <p class="muted">
        Schema version 1 — stable across sessions. The encoder is now pinned to the official-app's
        byte stream; encoder fields in the export are kept for backward-compat. Fill the reporter /
        cassette fields before exporting.
      </p>
      <div class="row" style="flex-direction: column; align-items: stretch; gap: 6px">
        <div class="row">
          <input type="text" placeholder="Reporter name" v-model="reporterName" />
          <input type="text" placeholder="GitHub handle (optional)" v-model="reporterGithub" />
        </div>
        <div class="row">
          <input type="text" placeholder="Cassette SKU (e.g. 91200)" v-model="cassetteSku" />
          <input
            type="text"
            placeholder="Material (paper / plastic / metallic / …)"
            v-model="cassetteMaterial"
          />
          <input type="text" placeholder="Background colour" v-model="cassetteBackground" />
        </div>
        <textarea
          rows="3"
          placeholder="Notes — what did you see? Any anomalies?"
          v-model="exportNotes"
        />
        <input type="file" multiple accept="image/*" @change="onPhotoChange" />
      </div>
      <div class="row">
        <button class="primary" @click="copyJson">Copy JSON</button>
        <button @click="downloadJson">Download .json</button>
        <button @click="downloadZip">Download photos as .zip</button>
      </div>
    </section>
  </main>
</template>
