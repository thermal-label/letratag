# Interface: \_\_DebugEncoderOverrides

Internal encoder overrides. Not re-exported from `index.ts` —
reachable only through the `./debug` subpath. Used by the
verification harness to poke at the only remaining unknown:
`mediaTypeByte` (the cassetteId enum is documented in the
protocol page but the host normally does not emit `MEDIA_TYPE`
on the print path).

The earlier `axisOrder` / `bitPacking` / `chunkIndexQuirk` knobs
have been removed: on-the-wire observation resolved each of
those conflicts in a single direction, and the encoder now
implements that direction unconditionally.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-mediatypebyte"></a> `mediaTypeByte?` | `number` | When set, prepend a `MEDIA_TYPE` directive carrying this byte to the print payload. Default `undefined` (omit). The directive's wire form is 6 bytes (`[1B 4D byte 00 00 00]`); the trailing zero pad is part of the observed wire format. |
