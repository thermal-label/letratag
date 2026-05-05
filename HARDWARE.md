# Hardware status

| Device  | Family    | Transport      | Status     | Last verified | Driver versions |
| ------- | --------- | -------------- | ---------- | ------------- | --------------- |
| LT_200B | letratag  | bluetooth-gatt | Untested   | —             | —               |

Phase 1 starts every entry as `Untested`. Status promotes to `partial`
once T1 + T2 + T3 (single-pixel, asymmetric rectangle, head stripes)
print correctly with the encoder's ysfchn defaults. Reach `verified`
when T1–T7 all resolve cleanly. See
[PLAN-1.md](PLAN-1.md) Step 5 / Step 6 for the gating criteria.
