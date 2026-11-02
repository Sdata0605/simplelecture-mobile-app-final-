// Decides when the end-of-lecture "Ask AI" card should appear and records the answer.
// Rules live in src/services/endAskPrompt.ts; this hook owns the watched-time ref, the end latch and timing.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  END_FALLBACK_MS,
  END_REARM_MS,
  EndStatusLike,
  INITIAL_WATCHED_STATE,
  MIN_DURATION_MS,
  MIN_WATCHED_RATIO,
  WatchedState,
  accumulateWatched,
  getEndPromptState,
  isRealEnd,
  setEndPromptState,
  shouldOfferEndPrompt,
} from '../services/endAskPrompt';

const SHOW_DELAY_MS = 500;

export interface UseEndOfLecturePromptOptions {
  userId: string | null | undefined;
  jobId: string;
  /** AI Teacher is available for this lecture's subject and the student has an active plan. */
  available: boolean;
  /** Ask AI or the notes panel is open. The prompt waits until this is false. */
  busy: boolean;
  /** Live class: never prompt. */
  isLive: boolean;
}

export interface UseEndOfLecturePromptResult {
  /** Whether the end card should be shown. */
  visible: boolean;
  /** Call on every playback status update with the current playback rate. */
  onStatus: (status: EndStatusLike, rate: number) => void;
  /** Student tapped "Yes, ask away". Hides the card and records 'accepted'. */
  accept: () => void;
  /** Not now, X, back, Replay, or leaving the screen. Hides the card and records 'declined'. */
  decline: () => void;
}

export function useEndOfLecturePrompt({
  userId,
  jobId,
  available,
  busy,
  isLive,
}: UseEndOfLecturePromptOptions): UseEndOfLecturePromptResult {
  const [visible, setVisible] = useState(false);

  const deps = useRef({ userId, jobId, available, busy, isLive });
  deps.current = { userId, jobId, available, busy, isLive };

  const watchedRef = useRef<WatchedState>(INITIAL_WATCHED_STATE);
  const durationRef = useRef(0);
  const endLatchedRef = useRef(false);
  const pausedAtEndCountRef = useRef(0);
  const pendingRef = useRef(false);
  const scheduledRef = useRef(false);
  const visibleRef = useRef(false);
  // In-memory guard: a failed AsyncStorage write still cannot re-show the card this session.
  const handledRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canShowNow = useCallback(() => {
    const d = deps.current;
    return (
      !!d.userId &&
      AppState.currentState === 'active' &&
      d.available &&
      !d.isLive &&
      !d.busy
    );
  }, []);

  const tryOffer = useCallback(() => {
    if (!pendingRef.current || scheduledRef.current || visibleRef.current) return;
    if (!canShowNow()) return;
    scheduledRef.current = true;
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      scheduledRef.current = false;
      if (!pendingRef.current || !canShowNow()) return;
      const d = deps.current;
      if (!d.userId) return;
      const key = `${d.userId}:${d.jobId}`;
      const stored = await getEndPromptState(d.userId, d.jobId);
      // Re-check after the await: state may have changed while reading storage.
      if (!pendingRef.current || handledRef.current.has(key) || !canShowNow()) return;
      if (stored !== null) {
        pendingRef.current = false;
        handledRef.current.add(key);
        return;
      }
      const ok = shouldOfferEndPrompt({
        userId: d.userId,
        durationMillis: durationRef.current,
        watchedMs: watchedRef.current.watchedMs,
        storedState: null,
        available: d.available,
        isLive: d.isLive,
        busy: d.busy,
      });
      if (!ok) return;
      // Synchronous from here on, so two pending timers cannot both show the card.
      pendingRef.current = false;
      handledRef.current.add(key);
      visibleRef.current = true;
      setVisible(true);
      void setEndPromptState(d.userId, d.jobId, 'shown');
    }, SHOW_DELAY_MS);
  }, [canShowNow]);

  const finish = useCallback((state: 'accepted' | 'declined') => {
    if (!visibleRef.current) return;
    visibleRef.current = false;
    setVisible(false);
    const d = deps.current;
    if (d.userId) void setEndPromptState(d.userId, d.jobId, state);
  }, []);

  const accept = useCallback(() => finish('accepted'), [finish]);
  const decline = useCallback(() => finish('declined'), [finish]);

  const onStatus = useCallback(
    (status: EndStatusLike, rate: number) => {
      if (!status.isLoaded) return;
      const dur = status.durationMillis ?? 0;
      const pos = status.positionMillis ?? 0;
      if (dur > 0) durationRef.current = dur;
      watchedRef.current = accumulateWatched(watchedRef.current, status, rate);

      if (dur > 0 && pos < dur - END_REARM_MS) {
        endLatchedRef.current = false;
        pausedAtEndCountRef.current = 0;
      }
      if (endLatchedRef.current) return;

      let ended = isRealEnd(status);
      if (!ended && !status.didJustFinish) {
        // Fallback for platforms that miss didJustFinish: paused at the end on two updates in a row.
        const pausedAtEnd = dur > 0 && !status.isPlaying && pos >= dur - END_FALLBACK_MS;
        pausedAtEndCountRef.current = pausedAtEnd ? pausedAtEndCountRef.current + 1 : 0;
        ended = pausedAtEndCountRef.current >= 2;
      }
      if (!ended) return;

      endLatchedRef.current = true;
      // Watched-time rule: seeking to the end without watching never qualifies.
      const watchedEnough =
        durationRef.current >= MIN_DURATION_MS &&
        watchedRef.current.watchedMs >= MIN_WATCHED_RATIO * durationRef.current;
      if (!watchedEnough) return;
      pendingRef.current = true;
      tryOffer();
    },
    [tryOffer],
  );

  // Re-try a pending end when Ask AI / notes close, the app returns to the foreground, or access changes.
  useEffect(() => {
    tryOffer();
  }, [tryOffer, userId, available, busy, isLive]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tryOffer();
    });
    return () => sub.remove();
  }, [tryOffer]);

  // Leaving the screen with the card up counts as "not now".
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (visibleRef.current) {
        visibleRef.current = false;
        const d = deps.current;
        if (d.userId) void setEndPromptState(d.userId, d.jobId, 'declined');
      }
    };
  }, []);

  return { visible, onStatus, accept, decline };
}
