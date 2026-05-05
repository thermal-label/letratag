// jsdom doesn't implement HTMLCanvasElement.prototype.getContext —
// stub it so the App's drawPreview() runs cleanly under test
// without the "not implemented" warning. The mock returns null so
// the component's `if (!ctx) return` branch fires.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}
