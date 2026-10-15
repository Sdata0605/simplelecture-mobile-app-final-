import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_TOKEN_KEY, getValidAccessToken } from '../services/supabase';

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

export async function restFetch<T>(path: string, options?: RequestInit): Promise<T[]> {
  const headers = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export interface StudyTimetablePlanMetadata {
  scopeType?: string | null;
  scopeId?: string | null;
  scopeLabel?: string | null;
  deadline?: string | null;
  pattern?: string | null;
  weekday?: any;
  saturday?: any;
  sunday?: any;
  tzOffsetMinutes?: number | null;
  items?: any[];
  items_original?: any[];
  unscheduled_items?: any[];
  [key: string]: any;
}

export interface StudyTimetablePlan {
  id: string;
  student_id: string;
  course_id: string;
  mode: 'auto' | 'manual';
  plan_metadata: StudyTimetablePlanMetadata | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudyTimetableSession {
  id: string;
  timetable_id: string;
  student_id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  subject_id: string | null;
  chapter_id: string | null;
  topic_id: string | null;
  status: 'pending' | 'done' | 'skipped';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SelfTest {
  id: string;
  student_id: string;
  course_id: string;
  subject_id: string | null;
  title: string;
  test_type: 'topic' | 'chapter';
  chapter_ids: string[] | null;
  topic_ids: string[] | null;
  scheduled_at: string;
  duration_minutes: number;
  total_questions: number;
  mcq_count: number | null;
  written_count: number | null;
  submitted_at: string | null;
  mcq_score: number | null;
  written_score: number | null;
  total_score: number | null;
  percentage: number | null;
  status: string;
  created_at: string;
}

function useSupabaseQuery<T>(
  fetcher: () => Promise<T[]>,
  deps: any[]
) {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error');
      setData([]);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
}

export function useStudyTimetablePlans(courseId: string | null) {
  return useSupabaseQuery<StudyTimetablePlan>(
    async () => {
      if (!courseId) return [];
      return restFetch<StudyTimetablePlan>(
        `study_timetables?select=*&course_id=eq.${courseId}&is_active=eq.true&order=created_at.desc`
      );
    },
    [courseId]
  );
}

/** Fetch sessions for a given course, optionally filtered to specific plan IDs.
 *  The course_id join guarantees rows belong to this course even when
 *  timetableIds is undefined (all plans for the course). */
export function useStudyTimetableSessions(courseId: string | null, timetableIds?: string[]) {
  return useSupabaseQuery<StudyTimetableSession>(
    async () => {
      if (!courseId) return [];
      // If timetableIds is an empty array we have a course with no plans → no sessions
      if (timetableIds !== undefined && timetableIds.length === 0) return [];

      if (timetableIds && timetableIds.length > 0) {
        // Explicit plan filter — most precise
        const idList = timetableIds.join(',');
        return restFetch<StudyTimetableSession>(
          `study_timetable_sessions?select=*&timetable_id=in.(${idList})&order=scheduled_at.asc`
        );
      }

      // Fallback: fetch all sessions whose parent plan belongs to this course
      // using an inner join through study_timetables
      return restFetch<StudyTimetableSession>(
        `study_timetable_sessions?select=*,study_timetables!inner(course_id)` +
        `&study_timetables.course_id=eq.${courseId}&order=scheduled_at.asc`
      );
    },
    [courseId, JSON.stringify(timetableIds)]
  );
}

export function useSelfTests(courseId: string | null) {
  return useSupabaseQuery<SelfTest>(
    async () => {
      if (!courseId) return [];
      const now = new Date().toISOString();
      return restFetch<SelfTest>(
        `self_tests?select=*&course_id=eq.${courseId}&submitted_at=is.null&scheduled_at=gte.${now}&order=scheduled_at.asc`
      );
    },
    [courseId]
  );
}

export async function patchSession(
  sessionId: string,
  patch: Partial<Pick<StudyTimetableSession, 'status' | 'notes' | 'title' | 'duration_minutes'>>
): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/study_timetable_sessions?id=eq.${sessionId}`,
    { method: 'PATCH', headers, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/study_timetable_sessions?id=eq.${sessionId}`,
    { method: 'DELETE', headers }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
}

export async function deletePlan(planId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/study_timetables?id=eq.${planId}`,
    { method: 'DELETE', headers }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
}

