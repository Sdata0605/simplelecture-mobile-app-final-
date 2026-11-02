// Data hooks for the study plan creator (WP1). Moved from StudyTimetableScreen.tsx
// (subject/chapter/topic hooks 197-235 and 1002-1019, useScopeContent 1028-1146)
// with three changes: an optional subjectIds filter, a concurrency limit of 4 for the
// per-subject RPC fan-out, and fetchWithTimeout on raw network calls.

import { useState, useEffect } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../services/supabase';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { PlanItem, ScopeMode } from '../components/timetable/planWizard/state';

export interface SelectOption { id: string; name: string }

const RPC_CONCURRENCY = 4;
const NET_TIMEOUT_MS = 15000;

/** Runs fn over items with at most `limit` in flight at once. Keeps order. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function useSubjectsForCourse(courseId: string | null) {
  const [subjects, setSubjects] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) { setSubjects([]); setError(null); return; }
    setLoading(true);
    setError(null);
    supabase.getCourseSubjects(courseId)
      .then(res => {
        if (cancelled) return;
        if (res.success && res.subjects) {
          setSubjects(res.subjects.map(s => ({ id: s.subject.id, name: s.subject.name })));
        } else {
          setSubjects([]);
          setError(res.error ?? 'Could not load subjects');
        }
      })
      .catch(() => { if (!cancelled) { setSubjects([]); setError('Could not load subjects'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseId, attempt]);

  return { subjects, loading, error, reload: () => setAttempt(n => n + 1) };
}

export function useChaptersForSubject(subjectId: string | null) {
  const [chapters, setChapters] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!subjectId) { setChapters([]); return; }
    let cancelled = false;
    setLoading(true);
    fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/subject_chapters?select=id,title,chapter_number&subject_id=eq.${subjectId}&order=chapter_number.asc`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
      NET_TIMEOUT_MS,
    )
      .then(r => r.json())
      .then(data => {
        if (!cancelled && Array.isArray(data)) {
          setChapters(data.map((c: any) => ({ id: c.id, name: c.title })));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [subjectId]);
  return { chapters, loading };
}

export function useTopicsForChapter(chapterId: string | null) {
  const [topics, setTopics] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!chapterId) { setTopics([]); return; }
    let cancelled = false;
    setLoading(true);
    supabase.getChapterTopics([chapterId])
      .then(res => {
        if (!cancelled && res.success && res.topics) {
          setTopics(res.topics.map((t: any) => ({ id: t.id, name: t.title })));
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [chapterId]);
  return { topics, loading };
}

/**
 * Resolves the topics inside the chosen scope and builds the items[] payload the
 * edge function iterates over. Only topics with at least one published AI lecture
 * are included (real durations from get_published_lecture_stats). A scope with no
 * published lectures yields an empty list, never a blank plan.
 *
 * `subjectIds` limits the scope for 'course' and 'subjects' modes; 'chapter' and
 * 'topic' modes filter by chapterId / topicId inside the given subjects.
 */
export function useScopeContent(
  courseId: string | null,
  scopeMode: ScopeMode,
  subjectIds: string[],
  chapterId: string | null,
  topicId: string | null,
) {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [lectureCount, setLectureCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const subjectKey = subjectIds.join(',');

  useEffect(() => {
    let cancelled = false;

    function clear() {
      if (!cancelled) { setItems([]); setLectureCount(0); }
    }

    async function run() {
      const ids = subjectKey ? subjectKey.split(',') : [];
      if (!courseId || ids.length === 0) { clear(); setError(null); return; }
      if (scopeMode === 'chapter' && !chapterId) { clear(); return; }
      if (scopeMode === 'topic' && !topicId) { clear(); return; }

      setLoading(true);
      setError(null);
      try {
        const token = await supabase.getAccessToken();
        const headers = {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
        };

        // 1. Chapters of the chosen subjects (keep subject_id so items carry it)
        const chapRes = await fetchWithTimeout(
          `${SUPABASE_URL}/rest/v1/subject_chapters?select=id,subject_id&subject_id=in.(${ids.join(',')})`,
          { headers },
          NET_TIMEOUT_MS,
        );
        const chapData = await chapRes.json();
        let chapterRows: { id: string; subject_id: string }[] =
          Array.isArray(chapData) ? chapData.map((c: any) => ({ id: c.id, subject_id: c.subject_id })) : [];
        if (scopeMode === 'chapter' || scopeMode === 'topic') {
          chapterRows = chapterRows.filter(c => c.id === chapterId);
        }
        if (chapterRows.length === 0) { clear(); return; }
        const chapterSubject: Record<string, string> = {};
        chapterRows.forEach(c => { chapterSubject[c.id] = c.subject_id; });

        // 2. Topics in those chapters
        const topicsRes = await supabase.getChapterTopics(chapterRows.map(c => c.id));
        let topics: any[] = topicsRes.success && topicsRes.topics ? topicsRes.topics : [];
        if (scopeMode === 'topic') topics = topics.filter(t => t.id === topicId);
        if (topics.length === 0) { clear(); return; }

        // 3. Real published-lecture stats. The RPC is keyed by subject, so one call per
        //    subject, at most RPC_CONCURRENCY in flight (Android allows 5 per host).
        const rpcResults = await mapWithLimit(ids, RPC_CONCURRENCY, async (sid) => {
          const r = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/get_published_lecture_stats`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_subject_id: sid }),
          }, NET_TIMEOUT_MS);
          const d = await r.json();
          return Array.isArray(d) ? d : [];
        });
        const durationByTopic: Record<string, number> = {};
        const lectureCountByTopic: Record<string, number> = {};
        rpcResults.flat().forEach((row: any) => {
          const tid = row?.topic_id;
          if (!tid) return;
          durationByTopic[tid] = (durationByTopic[tid] ?? 0) + (Number(row.total_duration_minutes) || 0);
          lectureCountByTopic[tid] = (lectureCountByTopic[tid] ?? 0) + (Number(row.lecture_count) || 0);
        });

        // 4. Items for in-scope topics with at least one published lecture.
        const built: PlanItem[] = topics
          .filter(t => (durationByTopic[t.id] ?? 0) > 0)
          .map(t => ({
            id: `topic-${t.id}`,
            title: t.title,
            durationMinutes: durationByTopic[t.id],
            subject_id: chapterSubject[t.chapter_id] ?? ids[0],
            chapter_id: t.chapter_id,
            topic_id: t.id,
          }));
        const totalLectures = built.reduce((s, it) => s + (lectureCountByTopic[it.topic_id] ?? 1), 0);

        if (!cancelled) {
          setItems(built);
          setLectureCount(totalLectures);
        }
      } catch {
        if (!cancelled) { clear(); setError('Could not count the lectures'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [courseId, scopeMode, subjectKey, chapterId, topicId, attempt]);

  const totalMinutes = items.reduce((s, it) => s + it.durationMinutes, 0);
  return {
    items,
    totalMinutes,
    lectureCount,
    loading,
    error,
    retry: () => setAttempt(n => n + 1),
  };
}
