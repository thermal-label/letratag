# Interoperability statement

This project documents the wire protocol of the **DYMO LetraTag
LT-200B** — a Bluetooth LE handheld label printer — and provides a
TypeScript driver that produces those bytes.

## Scope

The driver targets **interoperability with the printer**, not the
mobile app that ships with it. Specifically, the protocol pages
under [`docs/protocol/`](./docs/protocol/) describe:

- The chunked GATT command stream the LT-200B accepts on its
  primary BLE service. The driver emits the same byte sequences
  the printer's own firmware consumes on the wire.
- The 3-byte status notification the printer returns on its reply
  characteristic, and the 3-byte advertising-data manufacturer
  payload it broadcasts continuously (cassette ID, battery, error
  flags) — both readable on the wire without any host-side
  cooperation.
- The GATT topology (one primary service, three characteristics,
  UUID-prefix matching) used to locate the printer and its
  characteristics.

## Sources

The byte-level claims on the protocol pages are anchored on:

- **Pre-existing public reverse-engineering work**:
  - [`ysfchn/dymo-bluetooth`](https://github.com/ysfchn/dymo-bluetooth)
    — narrative protocol description, byte tables, and a working
    Python encoder.
  - [`alexhorn/lt200b`](https://github.com/alexhorn/lt200b) — an
    independent encoder that disagreed with `ysfchn` on a small
    number of details. The disagreements were resolved by
    on-the-wire observation, not by preferring one author over
    the other.
- **Interoperability analysis of the official LetraTag Connect
  Android application** — limited to the byte sequences the
  application emits over BLE and the layout of the advertising-data
  it consumes. The application's source was not redistributed; only
  the unprotectable wire-format facts (opcode bytes, header layout,
  chunking strategy, bit-packing order, advertising-data bit layout)
  are reproduced here. This corresponds to the use of
  decompilation expressly authorised under EU Directive 2009/24/EC
  Article 6 for the purpose of achieving interoperability of an
  independently-created program.
- **Observed wire output** captured between a host and a paired
  printer. BLE GATT writes and notifications on the LT-200B are
  unencrypted; capture is routine via Android's "HCI snoop log"
  developer option, `btmon`, or Wireshark with the BlueZ plugin.
  Advertising-data broadcasts are observable with a passive scan
  (no pairing required).

The driver does **not** redistribute the printer's firmware, the
mobile app, or any vendor binary. It does not include keys,
credentials, or any technological-protection-measure circumvention.

## Legal posture

Documenting and re-implementing a wire protocol for the purpose of
interoperability is recognised as a legitimate use:

- **United States**: under *Sega Enterprises v. Accolade*
  (9th Cir. 1992) and *Sony Computer Entertainment v. Connectix*
  (9th Cir. 2000), intermediate copying for the purpose of
  understanding an unprotectable interface and producing an
  interoperable program is fair use.
- **European Union**: Directive 2009/24/EC (Software Directive),
  Article 6, expressly authorises decompilation for the purpose of
  achieving interoperability of an independently-created program.
  The interface specifications obtained may be used for that
  purpose without further authorisation from the rightsholder.
- The wire-format facts themselves — the byte sequences a printer
  consumes, the opcodes it returns — are interoperability
  information, not copyrightable expression.

## What this project is not

- It is not a replacement for or a port of the LetraTag Connect
  mobile app.
- It is not a redistribution of any vendor's firmware, driver
  binary, or proprietary source code.
- It does not bypass technical protection measures.
- It is not affiliated with, endorsed by, or sponsored by DYMO,
  Newell Brands, Sanford, or any other rightsholder. Trademarks are
  used only to identify supported hardware.

## Reporting concerns

If you are a rightsholder and believe a specific passage in these
docs goes beyond interoperability documentation into protected
expression, please open an issue at
<https://github.com/thermal-label/letratag/issues> and we will
re-examine the passage in question.
