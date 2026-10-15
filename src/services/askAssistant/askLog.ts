// One logger for the whole "Ask AI" flow, so a stalled question can be traced
// end to end from a single `[Ask` filter in the Metro log:
//
//   adb logcat | grep '\[Ask'      (or just search the Expo terminal)
//
// Every line carries seconds since the question was submitted, which is what
// makes "where did the time go" answerable: the gap between two lines is the
// step that was slow. `resetAskClock()` is called by the ask hook when a new
// question starts.
//
// This is deliberately verbose — it exists to diagnose the mobile-vs-web
// latency gap, where the server itself was verified fast (the proxy streams
// `thinking` events within a second of the POST).
let t0 = Date.now();

export function resetAskClock() {
  t0 = Date.now();
}

/** Seconds since the current question started, e.g. "  1.84s". */
export function askElapsed(): string {
  return `${((Date.now() - t0) / 1000).toFixed(2)}s`;
}

function line(scope: string, message: string) {
  return `[Ask +${askElapsed()}] ${scope} ${message}`;
}

export function askLog(scope: string, message: string, extra?: unknown) {
  if (extra === undefined) console.log(line(scope, message));
  else console.log(line(scope, message), extra);
}

export function askWarn(scope: string, message: string, extra?: unknown) {
  if (extra === undefined) console.warn(line(scope, message));
  else console.warn(line(scope, message), extra);
}

/** Shortens a transcript/payload for the log without hiding its shape. */
export function preview(value: unknown, max = 120): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return String(value);
  return text.length > max ? `${text.slice(0, max)}… (${text.length} chars)` : text;
}
