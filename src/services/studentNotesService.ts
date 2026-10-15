/**
 * Data-fetching + persistence service for the "My Notes" feature (task #96).
 *
 * All calls are direct authenticated Supabase REST/RPC against existing tables
 * (`student_lecture_notes`, `course_subjects`, `subject_chapters`,
 * `subject_topics`, `popular_subjects`) plus the
 * `get_enrolled_courses_with_progress` RPC. No new backend, no schema changes,
 * no service-role key. Every write is protected by RLS (student can only touch
 * their own rows) — we always send the authenticated access token.
 *
 * Local persistence uses AsyncStorage so the editor can hydrate instantly and
 * survive a failed cloud sync ("Saved locally - cloud sync will retry").
 *
 * Conventions mirror ./topicNotesService.ts (BASE_HEADERS + authHeaders()).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  SUPABASE_URL,
  SUPABASE_DIRECT_URL,
  SUPABASE_ANON_KEY,
  getValidAccessToken,
} from './supabase';
import type {
  CourseNotebookSubject as UICourseNotebookSubject,
  NotebookChapter as UINotebookChapter,
} from '../components/my-notes/types';

const BASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
};

/** Thrown by authHeaders() when there is no authenticated student session. */
export const NOT_AUTHENTICATED = 'Not authenticated';

/**
 * Build headers carrying the authenticated access token.
 *
 * My Notes rows are RLS-protected per student, so a REAL access token is
 * mandatory — we must NOT silently fall back to the anon bearer (that would
 * either 401 confusingly or, worse, read/write against the wrong RLS scope).
 * If no token is available we throw NOT_AUTHENTICATED; every fetch wrapper here
 * catches it and returns a clean { success:false } before hitting the network.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getValidAccessToken().catch(() => null);
  if (!token) {
    throw new Error(NOT_AUTHENTICATED);
  }
  return {
    ...BASE_HEADERS,
    Authorization: `Bearer ${token}`,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Row shape returned by get_enrolled_courses_with_progress RPC. */
export interface EnrolledCourseNotebook {
  course_id: string;
  course_name: string;
  course_slug: string | null;
  thumbnail_url: string | null;
  short_description: string | null;
  duration_months: number | null;
  enrolled_at: string | null;
  progress: number | null;
  category_id: string | null;
  category_name: string | null;
  parent_category_id: string | null;
  parent_category_name: string | null;
  parent_category_icon: string | null;
}

export interface PopularSubject {
  id: string;
  name: string;
  thumbnail_url: string | null;
}

/** Raw row from course_subjects with its joined popular_subjects record. */
export interface CourseSubjectRow {
  id: string;
  course_id: string;
  subject_id: string;
  display_order: number | null;
  subject: PopularSubject | null;
}

/** Raw row from subject_chapters. */
export interface SubjectChapterRow {
  id: string;
  subject_id: string;
  chapter_number: number | null;
  title: string;
  sequence_order: number | null;
  description: string | null;
}

// Public type names the My Notes screens import. Aliased to the shared UI types
// so screen state, list props and these service results stay a single shape.
export type CourseSubject = UICourseNotebookSubject;
export type SubjectChapter = UINotebookChapter;

/** The aggregate chapter notebook row (topic_id = null). */
export interface AggregateChapterNote {
  content: string;
  updated_at: string;
}

/** A per-topic (lecture) note row. */
export interface TopicNoteRow {
  content: string;
  topic_id: string;
  updated_at: string;
}

export interface TopicName {
  id: string;
  title: string;
}

/** Payload for an upsert into student_lecture_notes. */
export interface SaveNotePayload {
  student_id: string;
  job_id: string;
  subject_id: string;
  chapter_id: string;
  /** null for the aggregate chapter notebook; a topic id for lecture notes. */
  topic_id: string | null;
  content: string;
}

export interface ServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// Local storage keys + metadata
// ---------------------------------------------------------------------------

/**
 * Full identity of a single editable note in local storage.
 *
 * The aggregate chapter notebook (topicId null / undefined) keeps the ORIGINAL
 * documented key so existing cached notes keep working:
 *   simplelecture:my-notes:{userId}:{subjectId}:{chapterId}
 *
 * Lecture notes (a real jobId + topicId) MUST get a distinct key so two
 * lectures within the same chapter never clobber each other's drafts:
 *   simplelecture:my-notes:{userId}:{subjectId}:{chapterId}:{jobId}:{topicId}
 */
export interface LocalNoteContext {
  userId: string;
  subjectId: string;
  chapterId: string;
  /** Real lecture job id; omit/undefined for the aggregate notebook. */
  jobId?: string | null;
  /** Real lecture topic id; omit/undefined for the aggregate notebook. */
  topicId?: string | null;
}

const LOCAL_KEY_PREFIX = 'simplelecture:my-notes';

/** True when this context targets a per-lecture note rather than the aggregate. */
export function isLectureContext(ctx: LocalNoteContext): boolean {
  return !!ctx.jobId && !!ctx.topicId;
}

/**
 * Local cache key for a note. Aggregate keeps the documented 3-part key;
 * lecture notes append jobId + topicId so they are distinct.
 */
export function localNoteKey(ctx: LocalNoteContext): string {
  const base = `${LOCAL_KEY_PREFIX}:${ctx.userId}:${ctx.subjectId}:${ctx.chapterId}`;
  if (isLectureContext(ctx)) {
    return `${base}:${ctx.jobId}:${ctx.topicId}`;
  }
  return base;
}

/**
 * Metadata stored per local note. Persisted as JSON so a locally-typed draft
 * that hasn't reached the cloud yet is never blindly overwritten by an older
 * cloud copy on the next load. Legacy plain-string cache entries (content only)
 * are tolerated on read.
 */
export interface LocalNoteMeta {
  content: string;
  /** ms epoch when this local copy was last written. */
  updatedAt: number;
  /** True while this draft still needs to reach the cloud. */
  pendingSync: boolean;
}

/**
 * Parse a raw AsyncStorage value into LocalNoteMeta.
 *
 * - null            → null (no cache).
 * - valid JSON meta → that meta (missing fields defaulted).
 * - anything else   → treated as a LEGACY plain-string content value; wrapped
 *                     as { content, updatedAt: 0, pendingSync: false } so old
 *                     caches keep working and never look "newer" than cloud.
 */
export function parseLocalNoteMeta(raw: string | null): LocalNoteMeta | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object' && typeof obj.content === 'string') {
        return {
          content: obj.content,
          updatedAt:
            typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt)
              ? obj.updatedAt
              : 0,
          pendingSync: obj.pendingSync === true,
        };
      }
    } catch {
      // Fall through to legacy handling.
    }
  }
  // Legacy plain-string content (or unparseable JSON): keep the content, mark it
  // as old + synced so cloud reconciliation prefers a real cloud copy.
  return { content: raw, updatedAt: 0, pendingSync: false };
}

export async function readLocalNoteMeta(
  ctx: LocalNoteContext,
): Promise<LocalNoteMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(localNoteKey(ctx));
    return parseLocalNoteMeta(raw);
  } catch {
    return null;
  }
}

export async function writeLocalNoteMeta(
  ctx: LocalNoteContext,
  meta: LocalNoteMeta,
): Promise<void> {
  try {
    await AsyncStorage.setItem(localNoteKey(ctx), JSON.stringify(meta));
  } catch {
    // Non-fatal: local cache is a best-effort convenience.
  }
}

export async function removeLocalNoteMeta(ctx: LocalNoteContext): Promise<void> {
  try {
    await AsyncStorage.removeItem(localNoteKey(ctx));
  } catch {
    // Non-fatal.
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic job id for a chapter's aggregate notebook. */
export function aggregateJobId(subjectId: string, chapterId: string): string {
  return `notebook-${subjectId}-${chapterId}`;
}

const enc = encodeURIComponent;

async function parseJsonArray<T>(res: Response): Promise<T[]> {
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? (data as T[]) : [];
}

// ---------------------------------------------------------------------------
// Screen 1: Enrolled course notebooks (RPC)
// ---------------------------------------------------------------------------

/**
 * POST /rest/v1/rpc/get_enrolled_courses_with_progress
 * Returns only the courses the student is enrolled in, with progress.
 */
export async function fetchEnrolledCourseNotebooks(
  studentId: string,
): Promise<ServiceResult<EnrolledCourseNotebook[]>> {
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_enrolled_courses_with_progress`,
      {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ p_student_id: studentId }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed');
      return { success: false, error: text };
    }
    const data = await res.json().catch(() => null);
    return {
      success: true,
      data: Array.isArray(data) ? (data as EnrolledCourseNotebook[]) : [],
    };
  } catch (err) {
    return { success: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Screen 2: Subject notebooks + note counts
// ---------------------------------------------------------------------------

/**
 * GET course_subjects joined with popular_subjects, ordered by display_order.
 */
export async function fetchCourseSubjects(
  courseId: string,
): Promise<ServiceResult<CourseSubjectRow[]>> {
  try {
    const h = await authHeaders();
    const url =
      `${SUPABASE_URL}/rest/v1/course_subjects` +
      `?select=*,subject:popular_subjects(*)` +
      `&course_id=eq.${enc(courseId)}` +
      `&order=display_order`;
    const res = await fetch(url, { headers: h });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed');
      return { success: false, error: text };
    }
    return { success: true, data: await parseJsonArray<CourseSubjectRow>(res) };
  } catch (err) {
    return { success: false, error: errMessage(err) };
  }
}

/**
 * Fetch note rows for the given subject ids and count them locally per subject.
 * Returns a map of subject_id → note count (subjects with no notes are absent;
 * treat missing as zero — "Fresh notebook").
 */
export async function fetchSubjectNoteCounts(
  userId: string,
  subjectIds: string[],
): Promise<ServiceResult<Record<string, number>>> {
  if (subjectIds.length === 0) return { success: true, data: {} };
  try {
    const h = await authHeaders();
    const inList = subjectIds.map((id) => enc(id)).join(',');
    const url =
      `${SUPABASE_URL}/rest/v1/student_lecture_notes` +
      `?select=subject_id` +
      `&student_id=eq.${enc(userId)}` +
      `&subject_id=in.(${inList})`;
    const res = await fetch(url, { headers: h });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed');
      return { success: false, error: text };
    }
    const rows = await parseJsonArray<{ subject_id: string }>(res);
    return { success: true, data: countBySubject(rows) };
  } catch (err) {
    return { success: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Screen 3: Chapter notebook data
// ---------------------------------------------------------------------------

/**
 * GET subject_chapters for a subject, ordered by chapter_number ascending.
 */
export async function fetchSubjectChapters(
  subjectId: string,
): Promise<ServiceResult<SubjectChapterRow[]>> {
  try {
    const h = await authHeaders();
    const url =
      `${SUPABASE_URL}/rest/v1/subject_chapters` +
      `?select=id,subject_id,chapter_number,title,sequence_order,description` +
      `&subject_id=eq.${enc(subjectId)}` +
      `&order=chapter_number.asc`;
    const res = await fetch(url, { headers: h });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed');
      return { success: false, error: text };
    }
    return {
      success: true,
      data: await parseJsonArray<SubjectChapterRow>(res),
    };
  } catch (err) {
    return { success: false, error: errMessage(err) };
  }
}

/**
 * Load the aggregate chapter notebook row (topic_id = null), keyed by the
 * deterministic notebook job id. Returns null if none exists yet.
 */
export async function fetchAggregateChapterNote(
  userId: string,
  subjectId: string,
  chapterId: string,
): Promise<ServiceResult<AggregateChapterNote | null>> {
  try {
    const h = await authHeaders();
    const jobId = aggregateJobId(subjectId, chapterId);
    const url =
      `${SUPABASE_URL}/rest/v1/student_lecture_notes` +
      `?select=content,updated_at` +
      `&student_id=eq.${enc(userId)}` +
      `&job_id=eq.${enc(jobId)}` +
      `&subject_id=eq.${enc(subjectId)}` +
      `&chapter_id=eq.${enc(chapterId)}` +
      `&topic_id=is.null`;
    const res = await fetch(url, { headers: h });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed');
      return { success: false, error: text };
    }
    const rows = await parseJsonArray<AggregateChapterNote>(res);
    return { success: true, data: rows.length > 0 ? rows[0] : null };
  } catch (err) {
    return { success: false, error: errMessage(err) };
  }
}

/**
 * Load exactly ONE note row for a fully-specified context
 * (student_id + job_id + subject_id + chapter_id + topic_id).
 *
 * This is the correct loader for the lecture player: it must read only that
 * lecture's own row, NOT the aggregate + every topic note in the chapter.
 * `topicId` may be null to target the aggregate row explicitly.
 */
export async function fetchSingleNote(
  userId: string,
  jobId: string,
  subjectId: string,
  chapterId: string,
  topicId: string | null,
): Promise<ServiceResult<AggregateChapterNote | null>> {
  try {
    const h = await authHeaders();
    const topicFilter =
      topicId == null
        ? `&topic_id=is.null`
        : `&topic_id=eq.${enc(topicId)}`;
    const url =
      `${SUPABASE_URL}/rest/v1/student_lecture_notes` +
      `?select=content,updated_at` +
      `&student_id=eq.${enc(userId)}` +
      `&job_id=eq.${enc(jobId)}` +
      `&subject_id=eq.${enc(subjectId)}` +
      `&chapter_id=eq.${enc(chapterId)}` +
      topicFilter +
      `&limit=1`;
    const res = await fetch(url, { headers: h });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed');
      return { success: false, error: text };
    }
    const rows = await parseJsonArray<AggregateChapterNote>(res);
    return { success: true, data: rows.length > 0 ? rows[0] : null };
  } catch (err) {
    return { success: false, error: errMessage(err) };
  }
}

/**
 * Load the per-topic (lecture) notes for a chapter, oldest first. These are the
 * rows the lecture player writes (topic_id not null).
 */
export async function fetchChapterTopicNotes(
  userId: string,
  subjectId: string,
  chapterId: string,
): Promise<ServiceResult<TopicNoteRow[]>> {
  try {
    const h = await authHeaders();
    const url =
      `${SUPABASE_URL}/rest/v1/student_lecture_notes` +
      `?select=content,topic_id,updated_at` +
      `&student_id=eq.${enc(userId)}` +
      `&subject_id=eq.${enc(subjectId)}` +
      `&chapter_id=eq.${enc(chapterId)}` +
      `&topic_id=not.is.null` +
      `&order=updated_at.asc`;
    const res = await fetch(url, { headers: h });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed');
      return { success: false, error: text };
    }
    return { success: true, data: await parseJsonArray<TopicNoteRow>(res) };
  } catch (err) {
    return { success: false, error: errMessage(err) };
  }
}

/**
 * Fetch topic titles for the given topic ids.
 */
export async function fetchTopicNames(
  topicIds: string[],
): Promise<ServiceResult<TopicName[]>> {
  if (topicIds.length === 0) return { success: true, data: [] };
  try {
    const h = await authHeaders();
    const inList = topicIds.map((id) => enc(id)).join(',');
    const url =
      `${SUPABASE_URL}/rest/v1/subject_topics` +
      `?select=id,title` +
      `&id=in.(${inList})`;
    const res = await fetch(url, { headers: h });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed');
      return { success: false, error: text };
    }
    return { success: true, data: await parseJsonArray<TopicName>(res) };
  } catch (err) {
    return { success: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Save / clear
// ---------------------------------------------------------------------------

/**
 * Upsert a note row into student_lecture_notes using the composite unique
 * context (student_id, job_id, subject_id, chapter_id, topic_id).
 *
 * PostgREST upsert = POST + on_conflict + `Prefer: resolution=merge-duplicates`.
 * A successful upsert returns an empty body (no representation requested).
 */
export async function upsertNote(
  payload: SaveNotePayload,
): Promise<ServiceResult> {
  try {
    const h = await authHeaders();
    const url =
      `${SUPABASE_URL}/rest/v1/student_lecture_notes` +
      `?on_conflict=student_id,job_id,subject_id,chapter_id,topic_id`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...h,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed');
      return { success: false, error: text };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: errMessage(err) };
  }
}

/**
 * Convenience wrapper for saving the aggregate chapter notebook (topic_id null).
 */
export async function saveAggregateChapterNote(
  userId: string,
  subjectId: string,
  chapterId: string,
  content: string,
): Promise<ServiceResult> {
  const jobId = aggregateJobId(subjectId, chapterId);
  try {
    const h = await authHeaders();
    const exactFilter =
      `student_id=eq.${enc(userId)}` +
      `&job_id=eq.${enc(jobId)}` +
      `&subject_id=eq.${enc(subjectId)}` +
      `&chapter_id=eq.${enc(chapterId)}` +
      `&topic_id=is.null`;

    // A nullable topic_id is not guaranteed to participate in a normal
    // PostgreSQL UNIQUE conflict (unless the index uses NULLS NOT DISTINCT).
    // Update the deterministic aggregate row first and request its
    // representation so we know whether one existed.
    const update = await fetch(
      `${SUPABASE_URL}/rest/v1/student_lecture_notes?${exactFilter}`,
      {
        method: 'PATCH',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify({ content }),
      },
    );
    if (!update.ok) {
      return { success: false, error: await update.text().catch(() => 'Request failed') };
    }
    const updated = await parseJsonArray<Record<string, unknown>>(update);
    if (updated.length > 0) return { success: true };

    // No aggregate exists yet. Insert once. If another device wins this race,
    // retry the exact PATCH so the final content still converges on one row.
    const insert = await fetch(`${SUPABASE_URL}/rest/v1/student_lecture_notes`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        student_id: userId,
        job_id: jobId,
        subject_id: subjectId,
        chapter_id: chapterId,
        topic_id: null,
        content,
      }),
    });
    if (insert.ok) return { success: true };
    if (insert.status !== 409) {
      return { success: false, error: await insert.text().catch(() => 'Request failed') };
    }
    const retry = await fetch(
      `${SUPABASE_URL}/rest/v1/student_lecture_notes?${exactFilter}`,
      {
        method: 'PATCH',
        headers: h,
        body: JSON.stringify({ content }),
      },
    );
    return retry.ok
      ? { success: true }
      : { success: false, error: await retry.text().catch(() => 'Request failed') };
  } catch (err) {
    return { success: false, error: errMessage(err) };
  }
}

/**
 * DELETE all aggregate + topic notes for a chapter (Clear Page).
 */
export async function deleteChapterNotes(
  userId: string,
  subjectId: string,
  chapterId: string,
): Promise<ServiceResult> {
  try {
    const h = await authHeaders();
    const url =
      `${SUPABASE_URL}/rest/v1/student_lecture_notes` +
      `?student_id=eq.${enc(userId)}` +
      `&subject_id=eq.${enc(subjectId)}` +
      `&chapter_id=eq.${enc(chapterId)}`;
    const res = await fetch(url, { method: 'DELETE', headers: h });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed');
      return { success: false, error: text };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: errMessage(err) };
  }
}

/**
 * DELETE exactly ONE lecture note row (student + job + subject + chapter +
 * topic). Used by the lecture-player "clear" so it removes only that lecture's
 * note and never the whole chapter's worth of notes. `topicId` may be null to
 * target the aggregate row.
 */
export async function deleteSingleNote(
  userId: string,
  jobId: string,
  subjectId: string,
  chapterId: string,
  topicId: string | null,
): Promise<ServiceResult> {
  try {
    const h = await authHeaders();
    const topicFilter =
      topicId == null
        ? `&topic_id=is.null`
        : `&topic_id=eq.${enc(topicId)}`;
    const url =
      `${SUPABASE_URL}/rest/v1/student_lecture_notes` +
      `?student_id=eq.${enc(userId)}` +
      `&job_id=eq.${enc(jobId)}` +
      `&subject_id=eq.${enc(subjectId)}` +
      `&chapter_id=eq.${enc(chapterId)}` +
      topicFilter;
    const res = await fetch(url, { method: 'DELETE', headers: h });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed');
      return { success: false, error: text };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Pure exported helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Count note rows per subject_id. Missing subjects are simply absent. */
export function countBySubject(
  rows: Array<{ subject_id: string | null }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (!r || !r.subject_id) continue;
    counts[r.subject_id] = (counts[r.subject_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Count words in a chunk of notebook text. Splits on any run of whitespace and
 * ignores empty tokens. Returns 0 for null/empty/whitespace-only input.
 */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * Build the combined aggregate notebook text from per-topic notes.
 *
 * Each topic block is rendered as:
 *   Topic: <title>
 *   <blank>
 *   <blank>
 *   <content>
 * separated from the next block by a blank line. Topics without a resolved
 * title fall back to "Topic". Empty-content topics are skipped.
 */
export function buildAggregateContent(
  topicNotes: Array<{ topic_id: string; content: string }>,
  topicTitleById: Record<string, string>,
): string {
  const blocks: string[] = [];
  for (const note of topicNotes) {
    const content = (note?.content ?? '').trim();
    if (!content) continue;
    const title = topicTitleById[note.topic_id]?.trim() || 'Topic';
    blocks.push(`Topic: ${title}\n\n\n${content}`);
  }
  return blocks.join('\n\n');
}

/**
 * Decide whether the aggregate chapter note is stale relative to the newest
 * per-topic note (i.e. topic notes are newer → rebuild + resave the aggregate).
 * Returns true when there are topic notes AND (no aggregate exists OR the newest
 * topic updated_at is strictly newer than the aggregate updated_at).
 */
export function isAggregateStale(
  aggregate: { updated_at: string } | null,
  topicNotes: Array<{ updated_at: string }>,
): boolean {
  if (topicNotes.length === 0) return false;
  const newestTopic = topicNotes.reduce((max, n) => {
    const t = Date.parse(n.updated_at);
    return Number.isFinite(t) && t > max ? t : max;
  }, Number.NEGATIVE_INFINITY);
  if (!Number.isFinite(newestTopic)) return false;
  if (!aggregate) return true;
  const aggTime = Date.parse(aggregate.updated_at);
  if (!Number.isFinite(aggTime)) return true;
  return newestTopic > aggTime;
}

/** Build a topic_id → title lookup from fetched topic-name rows. */
export function buildTopicTitleMap(
  names: Array<{ id: string; title: string }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const n of names) {
    if (n && n.id) map[n.id] = n.title;
  }
  return map;
}

/**
 * The full context that uniquely identifies a note row for realtime matching:
 * student + job + subject + chapter + topic (topic may be null for aggregate).
 */
export interface NoteMatchContext {
  userId: string;
  jobId: string;
  subjectId: string;
  chapterId: string;
  topicId: string | null;
}

/**
 * Pure matcher: does a realtime row (its `new`/`old` record) belong to exactly
 * this editor's context? Compares student_id, job_id, subject_id, chapter_id,
 * and topic_id — treating a missing/null/empty topic_id on the row as the
 * aggregate (null) case so `topic_id: null` contexts match aggregate rows.
 */
export function noteRowMatchesContext(
  row: Record<string, unknown> | null | undefined,
  ctx: NoteMatchContext,
): boolean {
  if (!row) return false;
  const rowTopic =
    row.topic_id == null || row.topic_id === '' ? null : String(row.topic_id);
  const ctxTopic = ctx.topicId == null || ctx.topicId === '' ? null : ctx.topicId;
  return (
    String(row.student_id) === ctx.userId &&
    String(row.job_id) === ctx.jobId &&
    String(row.subject_id) === ctx.subjectId &&
    String(row.chapter_id) === ctx.chapterId &&
    rowTopic === ctxTopic
  );
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Network error';
}

// ---------------------------------------------------------------------------
// Screen-facing wrappers
// ---------------------------------------------------------------------------
//
// The My Notes screens (owned separately) expect thin helpers that return the
// data array/record directly and THROW on failure (so the screen's try/catch
// can surface an error state). These wrap the ServiceResult-returning functions
// above without duplicating any request logic.

/** Screen wrapper: enrolled course notebooks (throws on failure). */
export async function getEnrolledCourseNotebooks(
  userId: string,
): Promise<EnrolledCourseNotebook[]> {
  const res = await fetchEnrolledCourseNotebooks(userId);
  if (!res.success) {
    throw new Error(res.error || 'Failed to load your course notebooks.');
  }
  return res.data ?? [];
}

/**
 * Screen wrapper: subjects for a course (throws on failure). Only rows with a
 * resolved joined subject are returned, so the UI's non-null `subject` holds.
 */
export async function getCourseNotebookSubjects(
  courseId: string,
): Promise<CourseSubject[]> {
  const res = await fetchCourseSubjects(courseId);
  if (!res.success) {
    throw new Error(res.error || 'Failed to load subjects for this course.');
  }
  // Keep only rows with a resolved joined subject so the UI's non-null
  // `subject` (name/thumbnail) always holds.
  return (res.data ?? [])
    .filter(
      (row): row is CourseSubjectRow & { subject: PopularSubject } =>
        row.subject != null,
    )
    .map((row) => ({
      id: row.id,
      course_id: row.course_id,
      subject_id: row.subject_id,
      display_order: row.display_order,
      subject: {
        id: row.subject.id,
        name: row.subject.name,
        thumbnail_url: row.subject.thumbnail_url,
      },
    }));
}

/** Screen wrapper: per-subject note counts (throws on failure). */
export async function getSubjectNoteCounts(
  userId: string,
  subjectIds: string[],
): Promise<Record<string, number>> {
  const res = await fetchSubjectNoteCounts(userId, subjectIds);
  if (!res.success) {
    throw new Error(res.error || 'Failed to load note counts.');
  }
  return res.data ?? {};
}

/** Screen wrapper: chapters for a subject (throws on failure). */
export async function getNotebookChapters(
  subjectId: string,
): Promise<SubjectChapter[]> {
  const res = await fetchSubjectChapters(subjectId);
  if (!res.success) {
    throw new Error(res.error || 'Failed to load chapters.');
  }
  return (res.data ?? []).map((c) => ({
    id: c.id,
    subject_id: c.subject_id,
    chapter_number: c.chapter_number ?? 0,
    title: c.title,
    sequence_order: c.sequence_order,
    description: c.description,
  }));
}

// ---------------------------------------------------------------------------
// Realtime (best-effort)
// ---------------------------------------------------------------------------

/**
 * Subscribe to Supabase Realtime changes on `student_lecture_notes` for the
 * current student, so notes stay in sync across devices.
 *
 * The mobile app has NO @supabase/supabase-js client (all data access is raw
 * REST), so we open the Realtime WebSocket directly using the Phoenix channel
 * protocol that supabase-realtime speaks. This is intentionally best-effort:
 * every step is guarded, and if the runtime lacks WebSocket or the connection
 * fails, `onChange` simply never fires — callers still work via manual refetch.
 *
 * Returns an unsubscribe function (safe to call multiple times).
 */
export interface RealtimeChange {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

export type RealtimeNoteDecision =
  | { action: 'ignore' }
  | { action: 'apply'; content: string }
  | { action: 'clear' }
  | { action: 'fetch' };

/**
 * Decide how the editor should handle a matching Realtime event without
 * entering its initial loading flow.
 */
export function decideRealtimeNoteUpdate(
  change: RealtimeChange,
  currentContent: string,
  hasPendingLocalEdit: boolean,
): RealtimeNoteDecision {
  if (hasPendingLocalEdit) return { action: 'ignore' };
  if (change.eventType === 'DELETE') return { action: 'clear' };

  const incoming = change.new?.content;
  if (typeof incoming === 'string') {
    return incoming === currentContent
      ? { action: 'ignore' }
      : { action: 'apply', content: incoming };
  }

  // Some Realtime configurations omit non-key columns. Fetch quietly rather
  // than treating the event as an initial editor load.
  return { action: 'fetch' };
}

export async function subscribeToStudentNotes(
  studentId: string,
  onChange: (change: RealtimeChange) => void,
): Promise<() => void> {
  // Guard: WebSocket must exist in this runtime.
  const WS: typeof WebSocket | undefined =
    typeof WebSocket !== 'undefined' ? WebSocket : undefined;
  if (!WS) {
    return () => {};
  }

  let closed = false;
  let socket: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let ref = 0;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    try {
      socket?.close();
    } catch {
      // ignore
    }
    socket = null;
  };

  try {
    const token = (await getValidAccessToken().catch(() => null)) ?? SUPABASE_ANON_KEY;
    // Realtime lives on the direct project host, not the REST worker proxy.
    const wsBase = SUPABASE_DIRECT_URL.replace(/^http/, 'ws');
    const url =
      `${wsBase}/realtime/v1/websocket` +
      `?apikey=${encodeURIComponent(SUPABASE_ANON_KEY)}` +
      `&vsn=1.0.0`;

    socket = new WS(url);
    const topic = `realtime:my-notes:${studentId}`;

    socket.onopen = () => {
      if (closed || !socket) return;
      // Join a postgres_changes channel filtered to this student's rows.
      const joinPayload = {
        topic,
        event: 'phx_join',
        ref: String(++ref),
        payload: {
          config: {
            postgres_changes: [
              {
                event: '*',
                schema: 'public',
                table: 'student_lecture_notes',
                filter: `student_id=eq.${studentId}`,
              },
            ],
          },
          access_token: token,
        },
      };
      try {
        socket.send(JSON.stringify(joinPayload));
      } catch {
        cleanup();
        return;
      }
      // Phoenix heartbeat keeps the socket alive.
      heartbeat = setInterval(() => {
        if (closed || !socket) return;
        try {
          socket.send(
            JSON.stringify({
              topic: 'phoenix',
              event: 'heartbeat',
              ref: String(++ref),
              payload: {},
            }),
          );
        } catch {
          cleanup();
        }
      }, 25000);
    };

    socket.onmessage = (evt: { data?: unknown }) => {
      if (closed) return;
      try {
        const msg = JSON.parse(String(evt.data));
        if (msg?.event !== 'postgres_changes') return;
        const data = msg?.payload?.data ?? msg?.payload;
        if (!data) return;
        onChange({
          eventType: data.type ?? data.eventType ?? 'UNKNOWN',
          new: data.record ?? data.new ?? null,
          old: data.old_record ?? data.old ?? null,
        });
      } catch {
        // Ignore malformed frames.
      }
    };

    socket.onerror = () => {
      // Non-fatal — leave the socket to close naturally.
    };
    socket.onclose = () => {
      cleanup();
    };
  } catch {
    cleanup();
  }

  return cleanup;
}
