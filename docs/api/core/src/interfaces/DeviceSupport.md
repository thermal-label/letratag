# ~~Interface: DeviceSupport~~

Verification state for a device.

Always present on `DeviceEntry` (defaults to `{ status: 'untested' }`)
so consumer types stay unconditional.

## Deprecated

Superseded by `DeviceVerifications` in
`./verifications.js` (per-transport `VerificationCell`s, no
`reports`/`lastVerified`/`packageVersion`/`quirks`/engine axis).
Codegen synthesises this from `verifications` and maps legacy
`status` values to the new rungs (`'broken'` → `'unsupported'`,
`'untested'` → absent). Retained during the alias transition;
removed in the cleanup PR once all drivers have migrated.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-engines"></a> ~~`engines?`~~ | `Record`\<`string`, [`LegacySupportStatus`](/contracts/api/type-aliases/LegacySupportStatus)\> | Per-engine status — useful for the Duo's "label works, tape doesn't" case. Keys must match `engines[].role`. |
| <a id="property-lastverified"></a> ~~`lastVerified?`~~ | `string` | ISO date of the most recent accepted report. |
| <a id="property-packageversion"></a> ~~`packageVersion?`~~ | `string` | Driver package version the most recent reports were filed against. |
| <a id="property-quirks"></a> ~~`quirks?`~~ | `string` | Editorial caveats. Markdown. Changes with firmware revisions. |
| <a id="property-reports"></a> ~~`reports?`~~ | readonly [`DeviceReport`](/contracts/api/interfaces/DeviceReport)[] | Accepted verification reports backing the status above. |
| <a id="property-status"></a> ~~`status`~~ | [`LegacySupportStatus`](/contracts/api/type-aliases/LegacySupportStatus) | Worst-case status across declared transports and engines. |
| <a id="property-transports"></a> ~~`transports?`~~ | `Partial`\<`Record`\<[`TransportType`](../type-aliases/TransportType.md), [`LegacySupportStatus`](/contracts/api/type-aliases/LegacySupportStatus)\>\> | Per-transport status, where the data records it. |
