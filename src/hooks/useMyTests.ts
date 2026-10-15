import { useState, useEffect, useCallback } from 'react';
import { SUPABASE_URL, supabase } from '../services/supabase';
import { authHeaders, restFetch, SelfTest } from './useStudyTimetable';

export type { SelfTest } from './useStudyTimetable';

export interface SelfTestQuestion {
  id: string;
  self_test_id: string;
  question_id: string | null;
  chapter_id: string | null;
  topic_id: string | null;
  order_number: number;
  section: 'mcq' | 'written';
  question_text: string;
  options: any;
  correct_answer: string | null;
  marks: number | null;
}

export interface SelfTestAnswer {
  id: string;
  self_test_id: string;
  self_test_question_id: string;
  student_id: string;
  chapter_id: string | null;
  topic_id: string | null;
  selected_option: string | null;
  answer_text: string | null;
  answer_image_url: string | null;
  is_correct: boolean | null;
  marks_awarded: number | null;
  max_marks: number | null;
  ai_feedback: string | null;
  extracted_text: string | null;
}

export interface SelfTestWithLabels extends SelfTest {
  chapter_names: string[];
  topic_names: string[];
}

export type SelfTestStatus = 'upcoming' | 'live' | 'missed' | 'submitted';

/** Status derived from the schedule + duration, never from the DB status column. */
export function deriveStatus(test: SelfTest, now: number = Date.now()): SelfTestStatus {
  if (test.submitted_at) return 'submitted';
  const start = new Date(test.scheduled_at).getTime();
  const end = start + (test.duration_minutes || 0) * 60 * 1000;
  if (now < start) return 'upcoming';
  if (now <= end) return 'live';
  return 'missed';
}

/** Normalize MCQ options that may be { A: 'text' }, { A: { text } }, or ['..']. */
export function normalizeOptions(options: any): { key: string; text: string }[] {
  if (!options) return [];
  if (Array.isArray(options)) {
    return options.map((o, i) => ({
      key: String.fromCharCode(65 + i),
      text: typeof o === 'object' && o ? String(o.text ?? '') : String(o),
    }));
  }
  if (typeof options === 'object') {
    return Object.entries(options).map(([key, val]) => ({
      key,
      text: typeof val === 'object' && val ? String((val as any).text ?? '') : String(val),
    }));
  }
  return [];
}

function useSupabaseQuery<T>(fetcher: () => Promise<T[]>, deps: any[]) {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await fetcher());
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

/** Hydrate chapter & topic titles for the given ids. Returns lookup maps so any
 *  screen can label chapters/topics consistently with the list screen. */
export function useChapterTopicNames(chapterIds: string[], topicIds: string[]) {
  const [chapterMap, setChapterMap] = useState<Map<string, string>>(new Map());
  const [topicMap, setTopicMap] = useState<Map<string, string>>(new Map());

  const chapterKey = chapterIds.filter(Boolean).sort().join(',');
  const topicKey = topicIds.filter(Boolean).sort().join(',');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cIds = chapterKey ? chapterKey.split(',') : [];
      const tIds = topicKey ? topicKey.split(',') : [];
      try {
        const [chapters, topics] = await Promise.all([
          cIds.length
            ? restFetch<{ id: string; title: string }>(
                `subject_chapters?select=id,title&id=in.(${cIds.join(',')})`
              )
            : Promise.resolve([]),
          tIds.length
            ? restFetch<{ id: string; title: string }>(
                `subject_topics?select=id,title&id=in.(${tIds.join(',')})`
              )
            : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setChapterMap(new Map(chapters.map((c) => [c.id, c.title])));
        setTopicMap(new Map(topics.map((t) => [t.id, t.title])));
      } catch {
        if (!cancelled) {
          setChapterMap(new Map());
          setTopicMap(new Map());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterKey, topicKey]);

  return { chapterMap, topicMap };
}

/** All scheduled self-tests for the current student, newest first, with hydrated
 *  chapter / topic names. RLS scopes rows to the owner via the student JWT. */
export function useAllSelfTests() {
  const [data, setData] = useState<SelfTestWithLabels[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const tests = await restFetch<SelfTest>(
        `self_tests?select=*&order=scheduled_at.desc`
      );

      const chapterIds = Array.from(
        new Set(tests.flatMap((t) => t.chapter_ids ?? []).filter(Boolean))
      );
      const topicIds = Array.from(
        new Set(tests.flatMap((t) => t.topic_ids ?? []).filter(Boolean))
      );

      const [chapters, topics] = await Promise.all([
        chapterIds.length
          ? restFetch<{ id: string; title: string }>(
              `subject_chapters?select=id,title&id=in.(${chapterIds.join(',')})`
            )
          : Promise.resolve([]),
        topicIds.length
          ? restFetch<{ id: string; title: string }>(
              `subject_topics?select=id,title&id=in.(${topicIds.join(',')})`
            )
          : Promise.resolve([]),
      ]);

      const chapterMap = new Map(chapters.map((c) => [c.id, c.title]));
      const topicMap = new Map(topics.map((t) => [t.id, t.title]));

      setData(
        tests.map((t) => ({
          ...t,
          chapter_names: (t.chapter_ids ?? []).map((id) => chapterMap.get(id) ?? '').filter(Boolean),
          topic_names: (t.topic_ids ?? []).map((id) => topicMap.get(id) ?? '').filter(Boolean),
        }))
      );
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error');
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
}

export interface AutoChapterTest {
  id: string;
  chapter_title: string | null;
  self_test_id: string;
  status: string;
  triggered_at: string;
  self_tests: {
    id: string;
    title: string;
    duration_minutes: number;
    scheduled_at: string;
    submitted_at: string | null;
    total_questions: number;
    test_type: 'topic' | 'chapter';
  } | null;
}

/** Auto-generated chapter tests that the student has not yet submitted. RLS
 *  scopes rows to the owner. We also drop any whose underlying self-test has
 *  already been submitted, since submission patches self_tests (not this row). */
export function useAutoChapterTests() {
  return useSupabaseQuery<AutoChapterTest>(
    async () => {
      const rows = await restFetch<AutoChapterTest>(
        `auto_chapter_tests?select=id,chapter_title,self_test_id,status,triggered_at,` +
          `self_tests(id,title,duration_minutes,scheduled_at,submitted_at,total_questions,test_type)` +
          `&status=neq.submitted&order=triggered_at.desc`
      );
      return rows.filter((r) => r.self_tests && !r.self_tests.submitted_at);
    },
    []
  );
}

export function useSelfTest(id: string | null) {
  const { data, isLoading, error, refetch } = useSupabaseQuery<SelfTest>(
    async () => {
      if (!id) return [];
      return restFetch<SelfTest>(`self_tests?select=*&id=eq.${id}`);
    },
    [id]
  );
  return { test: data[0] ?? null, isLoading, error, refetch };
}

export function useSelfTestQuestions(id: string | null) {
  return useSupabaseQuery<SelfTestQuestion>(
    async () => {
      if (!id) return [];
      return restFetch<SelfTestQuestion>(
        `self_test_questions?select=*&self_test_id=eq.${id}&order=order_number.asc`
      );
    },
    [id]
  );
}

export function useSelfTestAnswers(id: string | null) {
  return useSupabaseQuery<SelfTestAnswer>(
    async () => {
      if (!id) return [];
      return restFetch<SelfTestAnswer>(
        `self_test_answers?select=*&self_test_id=eq.${id}`
      );
    },
    [id]
  );
}

/** Upsert answer rows. Conflict key (self_test_question_id, student_id) prevents
 *  duplicate rows when a test is re-submitted. */
async function upsertAnswers(rows: any[]): Promise<void> {
  if (!rows.length) return;
  const headers = await authHeaders();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/self_test_answers?on_conflict=self_test_question_id,student_id`,
    {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    }
  );
  if (!res.ok) throw new Error(await res.text());
}

async function patchSelfTest(id: string, patch: Record<string, any>): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/self_tests?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export interface SubmitAnswerInput {
  selected_option?: string | null;
  answer_text?: string | null;
  answer_image_url?: string | null;
}

/** Grade + persist a self-test. MCQs are graded locally; written answers are
 *  OCR'd (when only an image is present) then AI-graded. */
export async function submitSelfTest(params: {
  selfTestId: string;
  studentId: string;
  questions: SelfTestQuestion[];
  answers: Record<string, SubmitAnswerInput>;
}): Promise<void> {
  const { selfTestId, studentId, questions, answers } = params;

  if (!questions.length) {
    throw new Error('No questions loaded for this test — submission aborted.');
  }

  const rows: any[] = [];
  let mcqScore = 0;
  let writtenScore = 0;
  let totalMaxMarks = 0;

  for (const q of questions) {
    const maxMarks = q.marks ?? 1;
    totalMaxMarks += maxMarks;
    const ans = answers[q.id] ?? {};

    if (q.section === 'mcq') {
      const isCorrect = !!ans.selected_option && norm(ans.selected_option) === norm(q.correct_answer);
      const marks = isCorrect ? maxMarks : 0;
      mcqScore += marks;
      rows.push({
        self_test_id: selfTestId,
        self_test_question_id: q.id,
        student_id: studentId,
        chapter_id: q.chapter_id,
        topic_id: q.topic_id,
        selected_option: ans.selected_option ?? null,
        answer_text: null,
        answer_image_url: null,
        is_correct: isCorrect,
        marks_awarded: marks,
        max_marks: maxMarks,
        ai_feedback: null,
        extracted_text: null,
      });
    } else {
      let studentAnswer = (ans.answer_text ?? '').trim();
      let extractedText: string | null = null;

      if (!studentAnswer && ans.answer_image_url) {
        const ocr = await supabase.extractAnswerFromImage({
          imageUrl: ans.answer_image_url,
          questionContext: q.question_text,
        });
        extractedText = (ocr.extractedText ?? '').trim() || null;
        studentAnswer = extractedText ?? '';
      }

      let isCorrect = false;
      let marks = 0;
      let feedback: string | null = null;

      if (studentAnswer) {
        const graded = await supabase.gradeSubjectiveAnswer({
          questionId: q.question_id || q.id,
          questionText: q.question_text,
          questionType: 'subjective',
          correctAnswer: q.correct_answer ?? '',
          studentAnswer,
          maxMarks,
        });
        if (graded.success && graded.result) {
          marks = graded.result.marks_awarded ?? 0;
          isCorrect = !!graded.result.is_correct;
          feedback = graded.result.feedback ?? null;
        } else {
          feedback = 'Pending AI review — grading could not be completed at this time.';
        }
      } else {
        feedback = 'No answer provided.';
      }

      writtenScore += marks;
      rows.push({
        self_test_id: selfTestId,
        self_test_question_id: q.id,
        student_id: studentId,
        chapter_id: q.chapter_id,
        topic_id: q.topic_id,
        selected_option: null,
        answer_text: ans.answer_text ?? null,
        answer_image_url: ans.answer_image_url ?? null,
        is_correct: isCorrect,
        marks_awarded: marks,
        max_marks: maxMarks,
        ai_feedback: feedback,
        extracted_text: extractedText,
      });
    }
  }

  await upsertAnswers(rows);

  const totalScore = mcqScore + writtenScore;
  const percentage = totalMaxMarks > 0 ? Math.round((totalScore / totalMaxMarks) * 100) : 0;

  await patchSelfTest(selfTestId, {
    submitted_at: new Date().toISOString(),
    mcq_score: mcqScore,
    written_score: writtenScore,
    total_score: totalScore,
    total_max_marks: totalMaxMarks,
    percentage,
    status: 'submitted',
  });
}

/** Re-grade an already-submitted test (e.g. written answers that failed AI at
 *  submit time) via the regrade-self-test edge function. */
export async function regradeSelfTest(selfTestId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/regrade-self-test`, {
    method: 'POST',
    headers: {
      apikey: headers.apikey,
      Authorization: headers.Authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ self_test_id: selfTestId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `Re-evaluation request failed (${res.status})`);
  }
}
