// Client for Athena's /ask (SSE) and /answers/{id}/video (HyperFrame
// readiness poll) — ported from the web app's src/lib/api/athenaAsk.ts.
// Same athena-proxy Supabase Edge Function, same project, confirmed live
// (2026-10-06) to need no auth headers (verify_jwt=false on the function,
// matching web's own un-authenticated fetch).
//
// Web parses the stream manually via fetch's readable body
// (`response.body.getReader()`). React Native's built-in `fetch` has no
// streaming body, so this uses `expo/fetch` (Expo SDK 54's WinterCG fetch),
// whose Response exposes a real ReadableStream — letting this file run the
// web client's exact read-and-parse loop. See askAthenaQuestion for why the
// previous react-native-sse/XHR transport had to go.
import { fetch as expoFetch } from 'expo/fetch';
import { SUPABASE_DIRECT_URL } from '../supabase';
import { askLog, askWarn, preview } from './askLog';

const ATHENA_BASE = 'http://116.202.230.124:8090';
const PROXY_URL = `${SUPABASE_DIRECT_URL}/functions/v1/athena-proxy`;

function proxyUrl(path: string, extra?: Record<string, string>) {
  const search = new URLSearchParams({ path, base: ATHENA_BASE, ...extra });
  return `${PROXY_URL}?${search.toString()}`;
}

/** Origin to mount injected beat pages under.
 *
 * The pages pull GSAP and KaTeX from cdn.jsdelivr.net and Google Fonts. Web
 * gets that for free: an iframe's `srcDoc` document inherits the parent's
 * origin. React Native injects the markup instead, and without a baseUrl
 * Android loads it with a null/opaque origin, where remote subresources are
 * unreliable — the page renders but GSAP never arrives, and since these
 * timelines start with everything at opacity 0 the result is a blank stage
 * rather than a visible error. Any real https origin fixes it. */
export const HYPERFRAME_BASE_URL = `${SUPABASE_DIRECT_URL}/`;

/** Full, fetchable URL for a HyperFrame html_paths/audio_* relative path. */
export function resolveHyperframeAssetUrl(answerId: string, relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '');
  return proxyUrl(`/storage/answers/${answerId}/${clean}`);
}

export interface AthenaWordTiming {
  w: string;
  s: number;
  e: number;
}

export interface AthenaSegment {
  i: number;
  type?: string;
  title?: string;
  html?: string;
  plain?: string;
  t_start?: number;
  t_end?: number;
  tokens?: AthenaWordTiming[];
  cite?: number[];
  visual?: { renderer?: string; latex?: string };
}

export interface AthenaSource {
  document_id: string;
  title: string;
  section?: string;
}

export interface AthenaAskMeta {
  answer_id: string;
  hf_enabled: boolean;
  cached: boolean;
  sources: AthenaSource[];
}

export type AthenaAskEvent =
  | { type: 'thinking' }
  | { type: 'meta'; meta: AthenaAskMeta }
  | { type: 'segment'; segment: AthenaSegment }
  | { type: 'done'; answerId: string; sources: AthenaSource[] }
  | { type: 'out_of_scope'; message?: string }
  | { type: 'error'; message: string };

export interface AskAthenaParams {
  question: string;
  subjectId: string;
  chapterId?: string;
  topicId?: string;
}

/** Log a warning if the stream has produced nothing by these marks. */
const STALL_WARN_AFTER_MS = [10_000, 30_000, 60_000];

export interface AskAthenaHandle {
  /** Close the connection early (e.g. the student closed the assistant). */
  close: () => void;
}

/**
 * Streams /ask, calling `onEvent` for each SSE message as it arrives, and
 * `onEnd` once the stream closes (after `done`/`out_of_scope`, a connection
 * error, or an explicit `close()`). Mirrors the web function's event
 * semantics; callers read final state from the events they received.
 *
 * Transport: `expo/fetch`, whose Response exposes a real ReadableStream, so
 * this runs the web client's exact read-and-parse loop. It replaced
 * react-native-sse, which is built on XMLHttpRequest: on this build the XHR
 * never fired a single readystatechange for this request (the library's own
 * debug output showed only "Will open new connection in 500 ms", then silence
 * for 93s while the identical request from a desktop returned headers
 * instantly), so every question was lost before Athena sent a byte.
 */
export function askAthenaQuestion(
  params: AskAthenaParams,
  onEvent: (event: AthenaAskEvent) => void,
  onEnd: () => void,
): AskAthenaHandle {
  const body = JSON.stringify({
    question: params.question,
    subjectId: params.subjectId,
    chapterId: params.chapterId,
    topicId: params.topicId,
  });

  askLog('sse', `POST /ask subject=${params.subjectId} topic=${params.topicId ?? '-'}`);
  askLog('sse', `question: ${preview(params.question)}`);

  const controller = new AbortController();
  let ended = false;
  let eventCount = 0;
  const seen: Record<string, number> = {};

  const watchdogs = STALL_WARN_AFTER_MS.map((ms) =>
    setTimeout(() => {
      if (ended || eventCount > 0) return;
      askWarn('sse', `STALLED: ${ms / 1000}s with no response at all`);
    }, ms),
  );

  const finish = (reason: string) => {
    if (ended) return;
    ended = true;
    watchdogs.forEach(clearTimeout);
    askLog('sse', `closing after ${eventCount} event(s) — ${reason}`, seen);
    controller.abort();
    onEnd();
  };

  const dispatch = (name: string, rawData: string) => {
    eventCount += 1;
    seen[name] = (seen[name] ?? 0) + 1;

    let data: any;
    try {
      data = rawData ? JSON.parse(rawData) : {};
    } catch {
      askWarn('sse', `<- ${name} payload did not parse — dropped: ${preview(rawData)}`);
      return;
    }

    switch (name) {
      case 'thinking':
        askLog('sse', `<- thinking ${preview(data.status ?? '', 60)}`);
        onEvent({ type: 'thinking' });
        break;
      case 'meta':
        askLog(
          'sse',
          `<- meta answer_id=${data.answer_id} hf_enabled=${!!data.hf_enabled} cached=${!!data.cached}`,
        );
        onEvent({
          type: 'meta',
          meta: {
            answer_id: data.answer_id,
            hf_enabled: !!data.hf_enabled,
            cached: !!data.cached,
            sources: Array.isArray(data.sources) ? data.sources : [],
          },
        });
        break;
      case 'segment':
        askLog('sse', `<- segment i=${data.i} type=${data.type ?? '-'} ${preview(data.title ?? '', 40)}`);
        onEvent({ type: 'segment', segment: data as AthenaSegment });
        break;
      case 'done':
        askLog('sse', `<- done answer_id=${data.answer_id ?? 'MISSING'}`);
        if (!data.answer_id) askWarn('sse', 'done carried no answer_id — the hook falls back to meta');
        onEvent({
          type: 'done',
          answerId: data.answer_id,
          sources: Array.isArray(data.source_documents) ? data.source_documents : [],
        });
        finish('done');
        break;
      case 'out_of_scope':
        askLog('sse', `<- out_of_scope ${preview(data.message ?? '', 80)}`);
        onEvent({ type: 'out_of_scope', message: data.message });
        finish('out_of_scope');
        break;
      case 'error':
        askWarn('sse', `<- error ${preview(data.message || data.error || '', 80)}`);
        onEvent({ type: 'error', message: data.message || data.error || 'Unknown error' });
        finish('server error');
        break;
      default:
        askWarn('sse', `<- unknown event "${name}" ignored`);
    }
  };

  void (async () => {
    try {
      const res = await expoFetch(proxyUrl('/ask'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      askLog('sse', `response ${res.status} ${res.headers.get('content-type') ?? ''}`);

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        askWarn('sse', `request failed (${res.status}): ${preview(text)}`);
        onEvent({ type: 'error', message: text || `Request failed (${res.status})` });
        finish(`HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // SSE frames are separated by a blank line; each frame carries an
      // "event:" and one or more "data:" lines (":" comment lines — keep-alive
      // pings — are ignored). Normalizing CRLF on the whole buffer, exactly as
      // the web client does, keeps this agnostic to the server's line endings
      // even when a CRLF straddles two chunks.
      while (!ended) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');

        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);

          let name = 'message';
          const dataLines: string[] = [];
          for (const rawLine of frame.split('\n')) {
            if (rawLine.startsWith(':')) continue;
            if (rawLine.startsWith('event:')) name = rawLine.slice(6).trim();
            else if (rawLine.startsWith('data:')) dataLines.push(rawLine.slice(5).trim());
          }
          if (dataLines.length) dispatch(name, dataLines.join('\n'));
        }
      }

      finish('stream ended');
    } catch (err) {
      if (ended) return; // our own abort from finish()
      askWarn('sse', `transport error: ${String(err)}`);
      onEvent({ type: 'error', message: 'Connection error' });
      finish('transport error');
    }
  })();

  return { close: () => finish('closed by caller') };
}

export interface HyperframeVideoStatus {
  ready: boolean | null;
  html_paths: string[];
  audio_female: string[];
  audio_male: string[];
}

/** Every athena-proxy call goes through expo/fetch with a hard timeout.
 *
 * RN's global `fetch` never came back for this host on the affected build —
 * the video poll awaited it forever, so the poll loop fired once, hung, and
 * never rescheduled or logged, which looked exactly like Athena still
 * rendering. A timeout also means one dropped request costs a retry instead
 * of the whole presentation. */
const ATHENA_REQUEST_TIMEOUT_MS = 15_000;

export async function athenaProxyFetch(url: string, timeoutMs = ATHENA_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await expoFetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function pollHyperframeVideo(answerId: string): Promise<HyperframeVideoStatus> {
  const res = await athenaProxyFetch(proxyUrl(`/answers/${encodeURIComponent(answerId)}/video`));
  if (!res.ok) throw new Error(`Video status request failed (${res.status})`);
  const data = await res.json();
  return {
    ready: data.ready ?? null,
    html_paths: Array.isArray(data.html_paths) ? data.html_paths : [],
    audio_female: Array.isArray(data.audio_female) ? data.audio_female : [],
    audio_male: Array.isArray(data.audio_male) ? data.audio_male : [],
  };
}
