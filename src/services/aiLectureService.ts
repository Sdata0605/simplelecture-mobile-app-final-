/**
 * Shared AI lecture resolution service.
 *
 * Both CoursePreviewScreen and TopicDetailsScreen must use these helpers
 * so that free-chapter gating, visibility filtering and V4 routing are
 * always consistent.
 *
 * Do NOT add a duplicate Supabase client here — reuse SUPABASE_URL and
 * SUPABASE_ANON_KEY from the central supabase service.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

const REST_HEADERS = {
  Accept: 'application/json',
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiLecture {
  id: string;
  document_name: string | null;
  external_job_id: string | null;
  is_marketing: boolean | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return the chapter_ids that are free for the given course.
 * An empty array means no free chapters are configured (nothing is free).
 */
export async function getFreePreviewChapterIds(courseId: string): Promise<string[]> {
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/course_free_access_chapters` +
      `?select=chapter_id&course_id=eq.${courseId}`;
    const resp = await fetch(url, { headers: REST_HEADERS });
    if (!resp.ok) return [];
    const data: { chapter_id: string }[] = await resp.json();
    return Array.isArray(data) ? data.map(r => r.chapter_id) : [];
  } catch {
    return [];
  }
}

/**
 * Fetch published, completed AI lectures for a topic.
 * Returns them ordered newest-first.
 */
export async function getPublishedAiLectures(topicId: string): Promise<AiLecture[]> {
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/video_generation_jobs` +
      `?select=id,document_name,external_job_id,is_marketing,created_at,` +
      `ai_assistant_documents!inner(topic_id,chapter_id)` +
      `&is_published=eq.true&status=eq.completed` +
      `&ai_assistant_documents.topic_id=eq.${topicId}` +
      `&order=created_at.desc`;
    const resp = await fetch(url, { headers: REST_HEADERS });
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Fetch the topic_lecture_visibility mode for a topic.
 * Returns null if no row exists (= show all).
 */
export async function getTopicLectureVisibility(topicId: string): Promise<string | null> {
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/topic_lecture_visibility` +
      `?select=mode&topic_id=eq.${topicId}&limit=1`;
    const resp = await fetch(url, { headers: REST_HEADERS });
    if (!resp.ok) return null;
    const data = await resp.json();
    return Array.isArray(data) && data.length > 0 ? (data[0].mode ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Apply topic_lecture_visibility filtering rules:
 *   hide_marketing → only non-marketing lectures
 *   hide_lecture   → only marketing lectures
 *   anything else  → all lectures
 *
 * Generic so it works with any object that carries an `is_marketing` field —
 * both the canonical `AiLecture` type and the screen-local `AiLecturePreviewItem`.
 */
export function filterLecturesByVisibility<T extends { is_marketing?: boolean | null }>(
  lectures: T[],
  mode?: string | null,
): T[] {
  if (mode === 'hide_marketing') return lectures.filter(l => l.is_marketing !== true);
  if (mode === 'hide_lecture') return lectures.filter(l => l.is_marketing === true);
  return lectures;
}

/**
 * One-shot resolver: fetch lectures + visibility mode and return the filtered list.
 */
export async function resolveVisibleAiLectures(topicId: string): Promise<AiLecture[]> {
  const [lectures, mode] = await Promise.all([
    getPublishedAiLectures(topicId),
    getTopicLectureVisibility(topicId),
  ]);
  return filterLecturesByVisibility(lectures, mode);
}
