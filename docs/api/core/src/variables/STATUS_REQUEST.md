# Variable: STATUS\_REQUEST

```ts
const STATUS_REQUEST: Uint8Array;
```

Status request directive — `[0x1B, 0x41]`. Embedded in every print
payload between `CUT` and `END`; on-the-wire observation does not
show it sent stand-alone.
