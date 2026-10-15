import { useState, useCallback } from 'react';
import { restFetch, StudyTimetableSession } from './useStudyTimetable';
import { colors } from '../constants/theme';

// ─── Subject colors ───────────────────────────────────────────────────────────
// Deterministic per subject id so the same subject always renders with the same
// chip color across days/sessions.
const SUBJECT_PALETTE: { bg: string; fg: string }[] = [
  { bg: '#E0F2FE', fg: '#0369A1' }, // sky
  { bg: '#FCE7F3', fg: '#BE185D' }, // pink
  { bg: '#DCFCE7', fg: '#15803D' }, // green
  { bg: '#FEF3C7', fg: '#B45309' }, // amber
  { bg: '#EDE9FE', fg: '#6D28D9' }, // violet
  { bg: '#FEE2E2', fg: '#B91C1C' }, // red
  { bg: '#CCFBF1', fg: '#0F766E' }, // teal
  { bg: '#FFEDD5', fg: '#C2410C' }, // orange
];

export function colorForSubject(id: string | null): { bg: string; fg: string } {
  if (!id) return { bg: colors.gray100, fg: colors.textSecondary };
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return SUBJECT_PALETTE[hash % SUBJECT_PALETTE.length];
}

// ─── date helpers ─────────────────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
/** Local-time 'YYYY-MM-DD' key for an ISO timestamp (sessions are stored UTC). */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── public types ─────────────────────────────────────────────────────────────
export interface DashboardPlanSession extends StudyTimetableSession {
  course_id: string | null;
  subjectName: string | null;
  chapterTitle: string | null;
  topicTitle: string | null;
  displayLabel: string;
  subjectColorBg: string;
  subjectColorFg: string;
  playable: boolean;
}

export type PlanDayLabel = 'Yesterday' | 'Today' | 'Tomorrow';

export interface DashboardPlanDay {
  key: string;
  label: PlanDayLabel;
  isToday: boolean;
  date: Date;
  sessions: DashboardPlanSession[];
}

function buildEmptyDays(): DashboardPlanDay[] {
  const now = new Date();
  const yesterday = startOfDay(addDays(now, -1));
  const today = startOfDay(now);
  const tomorrow = startOfDay(addDays(now, 1));
  return [
    { key: localDateKey(yesterday), label: 'Yesterday', isToday: false, date: yesterday, sessions: [] },
    { key: localDateKey(today), label: 'Today', isToday: true, date: today, sessions: [] },
    { key: localDateKey(tomorrow), label: 'Tomorrow', isToday: false, date: tomorrow, sessions: [] },
  ];
}

/** Loads the logged-in student's study sessions for the 3-day window
 *  (yesterday → tomorrow) across all enrolled courses, with subject/chapter/topic
 *  titles and deterministic subject colors resolved. Sessions are scoped through
 *  the parent plan's course_id (mirrors useStudyTimetableSessions) plus RLS. */
export function useDashboardStudyPlan(userId: string | null) {
  const [days, setDays] = useState<DashboardPlanDay[]>(buildEmptyDays);
  const [hasAny, setHasAny] = useState(false);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) {
      setDays(buildEmptyDays());
      setHasAny(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1. Enrolled courses for this student.
      const enrollments = await restFetch<{ course_id: string }>(
        `enrollments?select=course_id&student_id=eq.${userId}&is_active=eq.true`
      );
      const courseIds = Array.from(
        new Set(enrollments.map(e => e.course_id).filter(Boolean))
      );
      if (courseIds.length === 0) {
        setDays(buildEmptyDays());
        setHasAny(false);
        return;
      }

      // 2. Sessions within the 3-day window across those courses (scoped via the
      //    parent plan's course_id join, ordered ascending by scheduled_at).
      const now = new Date();
      const windowStart = startOfDay(addDays(now, -1));
      const windowEnd = startOfDay(addDays(now, 2)); // exclusive
      const rows = await restFetch<StudyTimetableSession & { study_timetables?: { course_id: string } | null }>(
        `study_timetable_sessions?select=*,study_timetables!inner(course_id)` +
          `&study_timetables.course_id=in.(${courseIds.join(',')})` +
          `&scheduled_at=gte.${windowStart.toISOString()}` +
          `&scheduled_at=lt.${windowEnd.toISOString()}` +
          `&order=scheduled_at.asc`
      );

      // 3. Resolve titles for the unique subject/chapter/topic ids found.
      const subjectIds = Array.from(new Set(rows.map(r => r.subject_id).filter(Boolean))) as string[];
      const chapterIds = Array.from(new Set(rows.map(r => r.chapter_id).filter(Boolean))) as string[];
      const topicIds = Array.from(new Set(rows.map(r => r.topic_id).filter(Boolean))) as string[];

      const [subjRows, chapRows, topRows] = await Promise.all([
        subjectIds.length
          ? restFetch<{ id: string; name: string }>(`popular_subjects?select=id,name&id=in.(${subjectIds.join(',')})`)
          : Promise.resolve([] as { id: string; name: string }[]),
        chapterIds.length
          ? restFetch<{ id: string; title: string }>(`subject_chapters?select=id,title&id=in.(${chapterIds.join(',')})`)
          : Promise.resolve([] as { id: string; title: string }[]),
        topicIds.length
          ? restFetch<{ id: string; title: string }>(`subject_topics?select=id,title&id=in.(${topicIds.join(',')})`)
          : Promise.resolve([] as { id: string; title: string }[]),
      ]);

      const subjMap = new Map(subjRows.map(s => [s.id, s.name]));
      const chapMap = new Map(chapRows.map(c => [c.id, c.title]));
      const topMap = new Map(topRows.map(t => [t.id, t.title]));

      const mapped: DashboardPlanSession[] = rows.map(r => {
        const course_id = r.study_timetables?.course_id ?? null;
        const subjectName = r.subject_id ? subjMap.get(r.subject_id) ?? null : null;
        const chapterTitle = r.chapter_id ? chapMap.get(r.chapter_id) ?? null : null;
        const topicTitle = r.topic_id ? topMap.get(r.topic_id) ?? null : null;
        const playable = !!(course_id && (r.topic_id || r.chapter_id));
        const palette = colorForSubject(r.subject_id);
        return {
          ...r,
          course_id,
          subjectName,
          chapterTitle,
          topicTitle,
          displayLabel: subjectName || topicTitle || chapterTitle || r.title || 'Study session',
          subjectColorBg: palette.bg,
          subjectColorFg: palette.fg,
          playable,
        };
      });

      // 4. Bucket sessions into the three day cards by local date.
      const dayDefs = buildEmptyDays();
      for (const s of mapped) {
        const k = localDateKey(new Date(s.scheduled_at));
        const day = dayDefs.find(d => d.key === k);
        if (day) day.sessions.push(s);
      }
      setDays(dayDefs);
      setHasAny(mapped.length > 0);
    } catch (e) {
      console.error('Error loading dashboard study plan:', e);
      setDays(buildEmptyDays());
      setHasAny(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return { days, hasAny, loading, refetch };
}
