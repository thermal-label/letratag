# Interface: PrinterStatus

Runtime status of a printer.

Returned by `PrinterAdapter.getStatus()` and used to drive media
auto-detection in subsequent `print()` / `createPreview()` calls.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-detectedmedia"></a> `detectedMedia?` | [`MediaDescriptor`](../../letratag-core/interfaces/MediaDescriptor.md) | Detected media descriptor, if the printer supports detection. Undefined if the printer cannot detect media (e.g. LabelWriter 450, LabelManager) or no status has been queried yet. When present, this is what `PrinterAdapter.print()` and `PrinterAdapter.createPreview()` use as the default when no explicit media is provided. |
| <a id="property-errors"></a> `errors` | [`PrinterError`](PrinterError.md)[] | Structured error list. Empty array = no errors. Use `PrinterError.code` for programmatic branching and `PrinterError.message` for display. |
| <a id="property-medialoaded"></a> `mediaLoaded` | `boolean` | Media is loaded (only meaningful if the printer supports detection). |
| <a id="property-rawbytes"></a> `rawBytes` | `Uint8Array` | Raw status bytes from the printer. Exposed for diagnostics and debugging — higher-level fields on this interface should be preferred for normal use. |
| <a id="property-ready"></a> `ready` | `boolean` | Printer is ready to accept a print job. |
