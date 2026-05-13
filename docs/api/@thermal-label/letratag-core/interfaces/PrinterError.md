# Interface: PrinterError

A single error reported by the printer.

Use `code` for programmatic branching (e.g. showing an "out of paper"
dialog) and `message` for display.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-code"></a> `code` | `string` | Machine-readable error code, e.g. `'no_media'`, `'cover_open'`, `'cutter_jam'`. Driver-specific — document the full set in each driver's README. |
| <a id="property-message"></a> `message` | `string` | Human-readable error description, safe to show to the end user. |
