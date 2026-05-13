# Variable: CASSETTE\_WIDTH\_MM

```ts
const CASSETTE_WIDTH_MM: Readonly<Record<CassetteId, number | null>>;
```

Mapping from the `cassetteId` enum (1..5) to the physical tape
width in millimetres. ID 0 is treated as "no cassette" — the
official app does not document the no-cassette code, but a
zero-valued field has no plausible mapping. Use the advertising
data's error flags (TAPE_JAM, etc.) and the `busyLocked` /
presence signals together to decide whether a cassette is
actually loaded.
