# Type Alias: RotateDirection

```ts
type RotateDirection = 90 | 270;
```

Direction the printer family rotates landscape input.

`90` = clockwise, `270` = counter-clockwise. Each driver picks the
value that matches its head/leading-edge geometry — confirm once on
hardware with a die-cut "F" landscape print, then export the constant
from the driver core.
