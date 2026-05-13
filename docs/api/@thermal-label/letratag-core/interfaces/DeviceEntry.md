# Interface: DeviceEntry

A device entry in a driver's registry.

Each driver's `data/devices.json` lists entries of this shape. The
driver still owns the data; contracts owns only the shape.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-capabilities"></a> `capabilities?` | `Readonly`\<`Record`\<`string`, `unknown`\>\> | Chassis-level capability flags — properties of the box, not the printhead. Most boolean capabilities are engine-level; this bag is for genuinely chassis-y things (Brother's `editorLite` USB-Mass-Storage trick, eventual battery / display flags). Open shape so drivers can extend without touching contracts. |
| <a id="property-engines"></a> `engines` | readonly [`PrintEngine`](PrintEngine.md)[] | Print engines in this device. Always an array, never empty — single-engine devices fabricate a `'primary'` entry. Composite devices (Duo, Twin) carry one entry per independent engine. |
| <a id="property-family"></a> `family` | `string` | Driver family this device belongs to, e.g. `'labelwriter'`. |
| <a id="property-hardwarequirks"></a> `hardwareQuirks?` | `string` | In-source hardware quirks — immutable facts about the chassis. Distinct from `support.quirks`, which is editorial and changes with firmware revisions. Example: "PID collides with the LabelManager PnP variant; needs usb_modeswitch on Linux". |
| <a id="property-key"></a> `key` | `string` | Stable key used as the registry export name (e.g. `'LW_450'`). |
| <a id="property-name"></a> `name` | `string` | Human-readable model name, e.g. `'LabelWriter 450'`. |
| <a id="property-support"></a> ~~`support`~~ | [`DeviceSupport`](DeviceSupport.md) | Always defined; defaults to `{ status: 'untested' }`. **Deprecated** Author `verifications` instead. Kept populated by codegen (synthesised from `verifications` if present, else mapped from legacy authoring) so existing consumers keep working unchanged. Removed in the cleanup PR once all drivers migrate. |
| <a id="property-transports"></a> `transports` | [`DeviceTransports`](/contracts/api/interfaces/DeviceTransports) | Wire-protocol transports this device exposes. |
| <a id="property-verifications"></a> `verifications?` | `Partial`\<`Record`\<[`TransportType`](../type-aliases/TransportType.md), [`VerificationCell`](/contracts/api/interfaces/VerificationCell)\>\> | Per-transport stored verifications. Authored by hardware-report PRs; expanded at codegen time into a derived grid (see `expandVerifications` in `./expand.js`). When absent, codegen falls back to legacy `support.status`. |
