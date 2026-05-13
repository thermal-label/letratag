# Variable: PROTOCOL\_HEAD\_FRAME

```ts
const PROTOCOL_HEAD_FRAME: 32 = 32;
```

Wire-format frame height — `PRINT_DATA.height` is always 32. The
encoder centres shorter source bitmaps within these 32 rows by
inserting zero-rasterlines top and bottom.
