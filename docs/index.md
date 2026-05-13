---
layout: home

hero:
  name: '@thermal-label/letratag'
  text: DYMO LetraTag LT-200B from the browser
  tagline: BLE-only handheld label printing. No vendor app. No proprietary drivers. Just Web Bluetooth, TypeScript, and a clean API.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: brand
      text: Hardware harness →
      link: https://thermal-label.github.io/harness/letratag/
    - theme: alt
      text: GitHub
      link: https://github.com/thermal-label/letratag

features:
  - icon: 🌐
    title: Browser (Web Bluetooth)
    details: Pair an LT-200B directly from Chrome or Edge — no server, no install, no companion app. The web package is the primary surface for this driver; there is no Node package today.
    link: /web
    linkText: Web guide
  - icon: 🧰
    title: Core
    details: Wire-format encoder, GATT topology, status parsers (RX notification + advertising-data manufacturer payload), device registry, media registry. Importable on its own for offline previews and protocol work.
    link: /core
    linkText: Core API
  - icon: 📡
    title: Protocol reference
    details: Every directive (`START`, `NUMBER_OF_COPIES`, `PRINT_DATA`, `CUT`, `STATUS`, `END`, `MEDIA_TYPE`, …) documented to the byte, plus the 3-byte advertising-data status payload and the 9-byte job header.
    link: /protocol/letratag-bt
    linkText: Protocol guide
  - icon: 🖨️
    title: Hardware harness
    details: Bench-only for now — `packages/debug/` in the repo drives identity probe, diagnostic prints, and ad-hoc protocol pokes. Hosted at /harness/letratag/ once the org harness app ships (currently scaffolded, not yet deployed).
    link: https://github.com/thermal-label/letratag/tree/main/packages/debug
    linkText: Debug harness source
---

<div class="home-extra">

<div class="ref-links">
  <a href="./hardware.html" class="ref-link">
    <span class="ref-icon">🖨️</span>
    <span class="ref-body">
      <strong>Supported hardware</strong>
      <span>LetraTag LT-200B, BLE-only, 12 mm cassettes</span>
    </span>
    <span class="ref-arrow">→</span>
  </a>
  <a href="./protocol/letratag-bt.html" class="ref-link">
    <span class="ref-icon">📡</span>
    <span class="ref-body">
      <strong>LetraTag-BT protocol</strong>
      <span>GATT topology, directive vocabulary, advertising-data status, chunking</span>
    </span>
    <span class="ref-arrow">→</span>
  </a>
  <a href="./core.html" class="ref-link">
    <span class="ref-icon">🧰</span>
    <span class="ref-body">
      <strong>Core API</strong>
      <span>Encoder, status parsers, device + media registries</span>
    </span>
    <span class="ref-arrow">→</span>
  </a>
</div>

<div class="ecosystem">
  <p class="ecosystem-label">Also in this ecosystem</p>
  <div class="ecosystem-links">
    <a href="https://thermal-label.github.io/labelmanager/" class="ecosystem-link" target="_blank" rel="noopener">
      <span class="eco-name">labelmanager</span>
      <span class="eco-desc">DYMO LabelManager PnP (USB / HID)</span>
    </a>
    <a href="https://thermal-label.github.io/labelwriter/" class="ecosystem-link" target="_blank" rel="noopener">
      <span class="eco-name">labelwriter</span>
      <span class="eco-desc">DYMO LabelWriter series</span>
    </a>
    <a href="https://thermal-label.github.io/brother-ql/" class="ecosystem-link" target="_blank" rel="noopener">
      <span class="eco-name">brother-ql</span>
      <span class="eco-desc">Brother QL / PT label printers</span>
    </a>
  </div>
</div>

</div>
