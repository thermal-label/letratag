# Type Alias: SupportStatus

```ts
type SupportStatus = "verified" | "partial" | "unsupported";
```

Stored verification rung — what a maintainer has directly observed.

- `'verified'` — known-good against a recent reporter.
- `'partial'` — works for some operations / paths but not all.
  Transport- or context-specific by nature; does not propagate.
- `'unsupported'` — known-broken; do not promise support. Beats any
  `'expected'` from propagation.
