import { useState, useEffect } from 'react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../services/supabase';

const REST_HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export interface FreeAccessChapter {
  id: string;
  course_id: string;
  subject_id: string;
  chapter_id: string;
}

export function useCourseFreeAccess(courseId: string) {
  const [freeChapters, setFreeChapters] = useState<FreeAccessChapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!courseId) {
      setFreeChapters([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchFreeChapters() {
      setIsLoading(true);
      try {
        const url = `${SUPABASE_URL}/rest/v1/course_free_access_chapters?select=id,course_id,subject_id,chapter_id&course_id=eq.${courseId}`;
        const response = await fetch(url, { headers: REST_HEADERS });
        if (!response.ok) {
          if (!cancelled) {
            setFreeChapters([]);
          }
          return;
        }
        const data = await response.json();
        if (!cancelled) {
          setFreeChapters(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setFreeChapters([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchFreeChapters();
    return () => { cancelled = true; };
  }, [courseId]);

  return {
    freeChapters,
    freeChapterCount: freeChapters.length,
    isLoading,
  };
}

export function useCourseFreePreviewLimits(courseId: string) {
  const [aiLimit, setAiLimit] = useState<number | null>(null);
  const [doubtsLimit, setDoubtsLimit] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!courseId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchLimits() {
      setIsLoading(true);
      try {
        const url = `${SUPABASE_URL}/rest/v1/courses?select=free_preview_ai_limit,free_preview_doubts_limit&id=eq.${courseId}`;
        const response = await fetch(url, { headers: REST_HEADERS });
        if (!response.ok) return;
        const data = await response.json();
        const row = Array.isArray(data) ? data[0] : null;
        if (!cancelled && row) {
          setAiLimit(row.free_preview_ai_limit ?? null);
          setDoubtsLimit(row.free_preview_doubts_limit ?? null);
        }
      } catch {
        // ignore — columns may not exist yet
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchLimits();
    return () => { cancelled = true; };
  }, [courseId]);

  return { aiLimit, doubtsLimit, isLoading };
}
