import { useRef, useCallback } from 'react';
import { SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_TOKEN_KEY, getValidAccessToken } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { maybeRequestReview } from '../utils/inAppReview';

export interface V3SectionForTracker {
  narration?: {
    total_duration_seconds?: number;
  };
}

export interface ChapterTestReadyResult {
  selfTestId: string;
  chapterTitle: string;
  alreadyExisted: boolean;
}

export interface VideoCompletionParams {
  sections: V3SectionForTracker[];
  videoTitle: string;
  topicId?: string;
  chapterId?: string;
  subjectId?: string;
  courseId?: string;
  topicTitle?: string;
  /** Called when finishing this lecture completes the chapter and a self-test
   *  is ready (server-created via check-chapter-completion). */
  onChapterTestReady?: (result: ChapterTestReadyResult) => void;
}

// Stored user data key — mirrors USER_KEY in supabase.ts (not exported, so duplicated here)
const CACHED_USER_KEY = 'user_data';

// Resolve student_id via two strategies:
// 1. Primary: read from cached user_data (most reliable — written by SupabaseService on every login)
// 2. Fallback: decode JWT payload with base64url normalization
async function resolveStudentId(token: string): Promise<string | null> {
  // Strategy 1: cached user object
  try {
    const raw = await AsyncStorage.getItem(CACHED_USER_KEY);
    if (raw) {
      const user = JSON.parse(raw);
      if (user?.id) return user.id as string;
    }
  } catch {
    // fall through to strategy 2
  }

  // Strategy 2: decode JWT (base64url-safe)
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length % 4) || 4);
    const payload = JSON.parse(atob(padded));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export function useVideoCompletionTracker(params: VideoCompletionParams) {
  const {
    sections,
    videoTitle,
    topicId,
    chapterId,
    subjectId,
    courseId,
    topicTitle,
  } = params;

  const accumulatedRef = useRef(0);
  const firedRef = useRef(false);
  const prevTimeRef = useRef<number | null>(null);

  // Keep the latest callback in a ref so reportWatchTime's identity stays stable.
  const onReadyRef = useRef(params.onChapterTestReady);
  onReadyRef.current = params.onChapterTestReady;

  const totalDuration = sections.reduce((sum, s) => {
    return sum + (s.narration?.total_duration_seconds ?? 0);
  }, 0);

  // Threshold: (total_duration - 60), clamped to 0.
  // When 0, fire on the very first valid time tick (i.e. video starts playing).
  const requiredWatchSeconds = Math.max(0, totalDuration - 60);

  const reportWatchTime = useCallback(async (currentTimeSeconds: number) => {
    if (firedRef.current) return;

    // Accumulate only forward, continuous playback (delta capped at 5s to ignore seeks)
    if (prevTimeRef.current !== null) {
      const delta = currentTimeSeconds - prevTimeRef.current;
      if (delta > 0 && delta < 5) {
        accumulatedRef.current += delta;
      }
    }
    prevTimeRef.current = currentTimeSeconds;

    // For requiredWatchSeconds === 0 (short videos ≤60s): fire immediately when
    // playback starts (first tick with currentTimeSeconds > 0).
    const hasReachedThreshold =
      requiredWatchSeconds === 0
        ? currentTimeSeconds > 0
        : accumulatedRef.current >= requiredWatchSeconds;

    if (!hasReachedThreshold) return;

    // Threshold met — fire exactly once
    firedRef.current = true;
    console.log('[VideoCompletion] Threshold met! Accumulated:', accumulatedRef.current.toFixed(1), 'Required:', requiredWatchSeconds);

    try {
      const token = await getValidAccessToken();
      if (!token) {
        console.warn('[VideoCompletion] No auth token, skipping badge award');
        return;
      }

      // Resolve student_id (primary: cached user_data, fallback: JWT decode)
      const studentId = await resolveStudentId(token);
      if (!studentId) {
        console.warn('[VideoCompletion] Could not resolve student_id — skipping completion actions');
        return;
      }

      // ── Action 1: Insert watch log (idempotent — unique index prevents duplicates) ──
      const watchPayload: Record<string, unknown> = {
        student_id:            studentId,
        video_title:           videoTitle,
        completion_percentage: 100,
        watched_seconds:       Math.floor(accumulatedRef.current),
        duration_seconds:      Math.floor(totalDuration),
      };
      if (topicId)   watchPayload.topic_id   = topicId;
      if (chapterId) watchPayload.chapter_id = chapterId;
      if (subjectId) watchPayload.subject_id = subjectId;

      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/ai_video_watch_logs`, {
        method: 'POST',
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal,resolution=ignore-duplicates',
        },
        body: JSON.stringify(watchPayload),
      });

      if (insertRes.ok || insertRes.status === 409) {
        console.log('[VideoCompletion] Watch log inserted (or already exists)');
      } else {
        const errBody = await insertRes.text().catch(() => '');
        console.warn('[VideoCompletion] Watch log insert failed:', insertRes.status, errBody);
      }

      // ── Action 2: Call award-badge edge function ───────────────────────────
      if (topicId && chapterId && subjectId && courseId) {
        const badgePayload = {
          topicId,
          chapterId,
          subjectId,
          courseId,
          topicTitle: topicTitle || videoTitle,
        };

        const badgeRes = await fetch(`${SUPABASE_URL}/functions/v1/award-badge`, {
          method: 'POST',
          headers: {
            'apikey':        SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify(badgePayload),
        });

        const badgeData = await badgeRes.json().catch(() => ({}));
        console.log('[VideoCompletion] Badge award response:', badgeData);

        if (badgeRes.ok) {
          const awardedBadges: string[] = badgeData.badges_awarded ?? [];
          if (awardedBadges.includes('course_complete')) {
            maybeRequestReview('course_complete');
          } else if (awardedBadges.length > 0) {
            maybeRequestReview('badge');
          }

          // ── Action 3: Check whether finishing this lecture completes the chapter ──
          // Server is the source of truth — it creates the self-test (idempotent).
          try {
            const completionRes = await fetch(`${SUPABASE_URL}/functions/v1/check-chapter-completion`, {
              method: 'POST',
              headers: {
                'apikey':        SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`,
                'Content-Type':  'application/json',
              },
              body: JSON.stringify({ chapterId, courseId, subjectId }),
            });
            const completionData = await completionRes.json().catch(() => ({}));
            console.log('[VideoCompletion] Chapter completion response:', completionData);

            if (completionRes.ok && completionData?.completed && completionData?.selfTestId) {
              onReadyRef.current?.({
                selfTestId:     completionData.selfTestId,
                chapterTitle:   completionData.chapterTitle ?? '',
                alreadyExisted: !!completionData.alreadyExisted,
              });
            }
          } catch (e) {
            console.warn('[VideoCompletion] Chapter completion check failed:', e);
          }
        }
      } else {
        console.log('[VideoCompletion] Skipping badge award — missing topicId/chapterId/subjectId/courseId');
      }
    } catch (err) {
      console.error('[VideoCompletion] Error during completion actions:', err);
    }
  }, [requiredWatchSeconds, videoTitle, topicId, chapterId, subjectId, courseId, topicTitle, totalDuration]);

  const reset = useCallback(() => {
    accumulatedRef.current = 0;
    firedRef.current = false;
    prevTimeRef.current = null;
  }, []);

  return { reportWatchTime, reset, requiredWatchSeconds };
}
