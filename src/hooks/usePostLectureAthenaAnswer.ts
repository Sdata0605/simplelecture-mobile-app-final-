// Orchestrates one post-lecture question: stream /ask for the live text
// answer, then poll /answers/{id}/video for the HyperFrame (animated,
// narrated) presentation once generation finishes.
//
// Ported from the web app's src/hooks/usePostLectureAthenaAnswer.ts. The
// phase state machine is identical; the control flow around starting/
// stopping the stream differs because mobile's askAthenaQuestion (built on
// react-native-sse) is callback-based with a synchronous close() handle,
// rather than web's single async function keyed off an AbortController.
import { useCallback, useRef, useState } from 'react';
import {
  AthenaAskMeta,
  AthenaSegment,
  AthenaSource,
  HyperframeVideoStatus,
  askAthenaQuestion,
  pollHyperframeVideo,
  type AskAthenaHandle,
} from '../services/askAssistant/athenaAsk';
import { askLog, askWarn, resetAskClock } from '../services/askAssistant/askLog';

const VIDEO_POLL_MS = 3000;
const VIDEO_TIMEOUT_MS = 5 * 60 * 1000;

export type PostLectureAnswerPhase =
  | 'idle'
  | 'asking'
  | 'streaming'
  | 'awaiting_video'
  | 'video_ready'
  | 'text_only'
  | 'out_of_scope'
  | 'error';

export interface PostLectureAnswerState {
  phase: PostLectureAnswerPhase;
  segments: AthenaSegment[];
  meta: AthenaAskMeta | null;
  sources: AthenaSource[];
  video: HyperframeVideoStatus | null;
  errorMessage: string | null;
}

const INITIAL_STATE: PostLectureAnswerState = {
  phase: 'idle',
  segments: [],
  meta: null,
  sources: [],
  video: null,
  errorMessage: null,
};

export function usePostLectureAthenaAnswer() {
  const [state, setState] = useState<PostLectureAnswerState>(INITIAL_STATE);
  // Phase changes are the backbone of the trace: every stall shows up as a
  // long gap after one of these lines.
  const lastPhaseRef = useRef<PostLectureAnswerPhase>('idle');
  if (lastPhaseRef.current !== state.phase) {
    askLog('phase', `${lastPhaseRef.current} -> ${state.phase}`);
    lastPhaseRef.current = state.phase;
  }
  const handleRef = useRef<AskAthenaHandle | null>(null);
  const abortedRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollDeadlineRef = useRef<number>(0);
  // `meta` arrives before `done` and is the authoritative answer_id; keeping it
  // in a ref lets the `done` handler decide whether to poll without reading it
  // out of a state updater (those must stay pure — React may re-run them).
  const metaRef = useRef<AthenaAskMeta | null>(null);
  const askStartedAtRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    abortedRef.current = true;
    handleRef.current?.close();
    handleRef.current = null;
    stopPolling();
    setState(INITIAL_STATE);
  }, [stopPolling]);

  const pollVideo = useCallback(
    (answerId: string) => {
      stopPolling();
      pollDeadlineRef.current = Date.now() + VIDEO_TIMEOUT_MS;

      const elapsed = () => `${Math.round((Date.now() - askStartedAtRef.current) / 1000)}s`;

      let attempt = 0;
      const tick = async () => {
        attempt += 1;
        try {
          const video = await pollHyperframeVideo(answerId);
          askLog(
            'poll',
            `#${attempt} ready=${String(video.ready)} beats=${video.html_paths.length} audioF=${video.audio_female.length}`,
          );
          if (video.ready === true && video.html_paths.length > 0) {
            askLog('poll', `presentation READY after ${elapsed()} — ${video.html_paths.length} beat(s)`);
            setState((prev) => ({ ...prev, phase: 'video_ready', video }));
            return;
          }
          if (video.ready === false) {
            askWarn('poll', `generation FAILED after ${elapsed()} — staying on text`);
            setState((prev) => ({ ...prev, phase: 'text_only' }));
            return;
          }
        } catch (err) {
          // Transient poll failure — keep trying until the timeout.
          askWarn('poll', `#${attempt} failed, retrying: ${String(err)}`);
        }
        if (Date.now() >= pollDeadlineRef.current) {
          askWarn('poll', `gave up after ${elapsed()} (${attempt} attempts)`);
          setState((prev) => (prev.phase === 'video_ready' ? prev : { ...prev, phase: 'text_only' }));
          return;
        }
        pollTimerRef.current = setTimeout(tick, VIDEO_POLL_MS);
      };
      pollTimerRef.current = setTimeout(tick, VIDEO_POLL_MS);
    },
    [stopPolling],
  );

  const ask = useCallback(
    (params: { question: string; subjectId: string; chapterId?: string; topicId?: string }) => {
      handleRef.current?.close();
      stopPolling();
      abortedRef.current = false;
      metaRef.current = null;
      askStartedAtRef.current = Date.now();
      resetAskClock();
      askLog('ask', `submitting (${params.question.length} chars)`);

      setState({ ...INITIAL_STATE, phase: 'asking' });

      handleRef.current = askAthenaQuestion(
        params,
        (event) => {
          if (abortedRef.current) return;
          switch (event.type) {
            case 'thinking':
              setState((prev) => (prev.phase === 'asking' ? { ...prev, phase: 'streaming' } : prev));
              break;
            case 'meta':
              metaRef.current = event.meta;
              setState((prev) => ({ ...prev, phase: 'streaming', meta: event.meta }));
              break;
            case 'segment':
              setState((prev) => ({ ...prev, segments: [...prev.segments, event.segment] }));
              break;
            case 'done': {
              // `done`'s own payload is the usual source of the id, but fall
              // back to `meta`'s: if it is missing here we would silently drop
              // to text-only and the presentation would never appear.
              const answerId = event.answerId || metaRef.current?.answer_id;
              const hfEnabled = metaRef.current?.hf_enabled ?? false;
              const secs = Math.round((Date.now() - askStartedAtRef.current) / 1000);
              if (hfEnabled && answerId) {
                askLog('ask', `answer streamed in ${secs}s; polling for presentation ${answerId}`);
                pollVideo(answerId);
                setState((prev) => ({ ...prev, phase: 'awaiting_video', sources: event.sources }));
              } else {
                askWarn(
                  'ask',
                  `TEXT-ONLY after ${secs}s — no presentation will load (hf_enabled=${hfEnabled}, answer_id=${answerId ?? 'missing'})`,
                );
                setState((prev) => ({ ...prev, phase: 'text_only', sources: event.sources }));
              }
              break;
            }
            case 'out_of_scope':
              setState((prev) => ({ ...prev, phase: 'out_of_scope', errorMessage: event.message ?? null }));
              break;
            case 'error':
              setState((prev) => ({ ...prev, phase: 'error', errorMessage: event.message }));
              break;
          }
        },
        () => {
          handleRef.current = null;
        },
      );
    },
    [pollVideo, stopPolling],
  );

  return { state, ask, reset };
}
