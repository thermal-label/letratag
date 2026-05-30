# @thermal-label/letratag-core

## 0.6.1

### Patch Changes

- Maintenance release.
  - **`LetraTagMedia` drops the redundant `tapeWidthMm` and `printableDots`
    fields.** They shadowed the spec'd `widthMm` and the engine's
    `headDots` / the `PRINTABLE_DOTS` constant, were unread at runtime, and
    were cargo-culted from the multi-width labelmanager driver. The LT-200B
    is single-width (12 mm) with a fixed printable head height — read those
    canonical sources instead.
  - **LT-200B marked `verified` on `bluetooth-gatt`** in the shipped device
    registry, from the dogfood verification-harness reports (Linux/Chromium
    and Android/Chromium, both diagnostic=pass).
  - Leaner type/JSDoc and regenerated API reference — no behaviour change.
