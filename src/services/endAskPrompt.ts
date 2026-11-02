// End-of-lecture "Ask AI" prompt: pure trigger rules plus the once-per-lecture flag store.
// No React here; the hook in src/hooks/useEndOfLecturePrompt.ts drives it.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const MIN_DURATION_MS = 60_000;
export const MIN_WATCHED_RATIO = 0.6;
// Same false-end guard as AILecturePlayerScreen: a didJustFinish with more than this left is ignored.
export const END_GUARD_MS = 1500;
// Position within this distance of the end counts as "at the end" for the non-event fallback.
export const END_FALLBACK_MS = 1000;
// Moving back below (duration - this) re-arms the end detector.
export const END_REARM_MS = 5000;

export type EndPromptState = 'shown' | 'declined' | 'accepted';

export interface EndStatusLike {
  isLoaded?: boolean;
  positionMillis?: number;
  durationMillis?: number | null;
  isPlaying?: boolean;
  didJustFinish?: boolean;
}

export interface WatchedState {
  watchedMs: number;
  lastPos: number | null;
}

export const INITIAL_WATCHED_STATE: WatchedState = { watchedMs: 0, lastPos: null };

/** True when the status is a genuine natural end (not a mid-video Android false positive). */
export function isRealEnd(status: EndStatusLike): boolean {
  if (!status.didJustFinish) return false;
  const pos = status.positionMillis ?? 0;
  const dur = status.durationMillis ?? 0;
  return dur > 0 && dur - pos <= END_GUARD_MS;
}

/**
 * Adds real playback time to the watched total. Only forward deltas between 0 and
 * END_GUARD_MS * rate count, so seeks (forward or backward) add nothing, and 2x playback still counts.
 */
export function accumulateWatched(
  prev: WatchedState,
  status: EndStatusLike,
  rate: number,
): WatchedState {
  const pos = status.positionMillis ?? 0;
  let watchedMs = prev.watchedMs;
  if (status.isPlaying && prev.lastPos !== null) {
    const delta = pos - prev.lastPos;
    const maxDelta = END_GUARD_MS * Math.max(1, rate);
    if (delta > 0 && delta <= maxDelta) watchedMs += delta;
  }
  return { watchedMs, lastPos: pos };
}

export interface OfferInput {
  userId: string | null | undefined;
  durationMillis: number;
  watchedMs: number;
  storedState: EndPromptState | null;
  available: boolean;
  isLive: boolean;
  busy: boolean;
}

/** All trigger rules in one place. Logged-out, unavailable, live, busy or already-handled never offers. */
export function shouldOfferEndPrompt(input: OfferInput): boolean {
  if (!input.userId) return false;
  if (!input.available || input.isLive || input.busy) return false;
  if (input.storedState !== null) return false;
  if (input.durationMillis < MIN_DURATION_MS) return false;
  return input.watchedMs >= MIN_WATCHED_RATIO * input.durationMillis;
}

export function endPromptKey(userId: string, jobId: string): string {
  return `sl:endAskPrompt:v1:${userId}:${jobId}`;
}

/**
 * Reads the stored state. Corrupted or unknown values are treated as 'shown' so the
 * student is never nagged by a bad write. Storage errors also return 'shown' (fail quiet).
 */
export async function getEndPromptState(userId: string, jobId: string): Promise<EndPromptState | null> {
  try {
    const raw = await AsyncStorage.getItem(endPromptKey(userId, jobId));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { state?: unknown };
    if (parsed.state === 'shown' || parsed.state === 'declined' || parsed.state === 'accepted') {
      return parsed.state;
    }
    return 'shown';
  } catch {
    return 'shown';
  }
}

export async function setEndPromptState(
  userId: string,
  jobId: string,
  state: EndPromptState,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      endPromptKey(userId, jobId),
      JSON.stringify({ state, at: Date.now() }),
    );
  } catch {
    // A failed write is covered by the in-memory set in the hook for this session.
  }
}
