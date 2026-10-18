/**
 * `fetch` with a hard deadline.
 *
 * React Native on Android runs at most 5 requests per host at a time (OkHttp's default). A request that never
 * answers - e.g. an edge-function proxy waiting on a dead upstream, which holds the connection for 150 s - keeps one
 * of those 5 slots, and enough of them leave every other request to that host (the AI answer included) queued behind
 * them. Aborting at the deadline frees the slot.
 *
 * An optional caller signal (e.g. "a newer keystroke superseded this search") aborts the request as well, so
 * existing cancel-on-keystroke behaviour keeps working. Both reasons surface as an `AbortError`.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000,
): Promise<Response> {
  const { signal: callerSignal, ...rest } = init;
  const controller = new AbortController();
  const abort = () => controller.abort();

  if (callerSignal) {
    if (callerSignal.aborted) abort();
    else callerSignal.addEventListener('abort', abort);
  }
  const timer = setTimeout(abort, timeoutMs);

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', abort);
  }
}
