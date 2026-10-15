/**
 * Hook for loading and managing AI Study Notes for a topic.
 *
 * Data flow:
 *   fetchTopicNotesJob   → presentation_json.sections
 *   fetchTopicQuestions  → bucketed into sections
 *   fetchTopicSubtopics  → used for subtopic-title → section-title matching
 *   buildNotePages       → NotePage[]
 */

import { useState, useEffect, useCallback, useRef } from 'react';

import {
  fetchTopicNotesJob,
  fetchTopicQuestions,
  fetchTopicSubtopics,
  generateTopicNotesQuestions,
} from '../services/topicNotesService';
import { buildNotePages, buildSectionIndex } from '../utils/notePagination';
import { TopicNotesState, NotesQuestion } from '../types/topicNotes';
import type { NotesRawQuestion } from '../services/topicNotesService';

// ---------------------------------------------------------------------------
// Question bucketing
// ---------------------------------------------------------------------------

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

/**
 * Map questions to sections by matching subtopic title to section title.
 * Unmapped questions are distributed round-robin across all sections.
 * Deduplicates by normalized question_text.
 *
 * Returns a Map from sectionId → question array (already capped: 2 important + 3 practice).
 */
function bucketQuestions(
  questions: NotesRawQuestion[],
  sections: Array<{ section_id?: string | number; title?: string }>,
  subtopicMap: Map<string, string>, // subtopicId → title
): Map<string, NotesQuestion[]> {
  const map = new Map<string, NotesQuestion[]>();
  const sectionKeys = sections.map((sec, i) => String(sec.section_id ?? i));
  sectionKeys.forEach((key) => map.set(key, []));

  // Deduplicate by normalised question_text
  const seen = new Set<string>();
  const unique = questions.filter((q) => {
    const key = normalizeTitle(q.question_text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const unmapped: NotesRawQuestion[] = [];

  for (const q of unique) {
    let placed = false;

    if (q.subtopic_id) {
      const subtopicTitle = subtopicMap.get(q.subtopic_id);
      if (subtopicTitle) {
        const normSub = normalizeTitle(subtopicTitle);
        for (let i = 0; i < sections.length; i++) {
          const normTitle = normalizeTitle(sections[i].title ?? '');
          if (
            normTitle &&
            normSub &&
            (normTitle.includes(normSub) || normSub.includes(normTitle))
          ) {
            map.get(sectionKeys[i])!.push(q as NotesQuestion);
            placed = true;
            break;
          }
        }
      }
    }

    if (!placed) unmapped.push(q);
  }

  // Round-robin distribution for unmatched questions
  unmapped.forEach((q, i) => {
    const key = sectionKeys[i % sectionKeys.length];
    if (key !== undefined) {
      map.get(key)?.push(q as NotesQuestion);
    }
  });

  // Cap each section: up to 2 important + up to 3 practice (verified first)
  for (const [key, qs] of map) {
    const important = qs.filter((q) => q.is_important).slice(0, 2);
    const practice = qs
      .filter((q) => !q.is_important)
      .sort((a, b) => Number(b.is_verified === true) - Number(a.is_verified === true))
      .slice(0, 3);
    map.set(key, [...important, ...practice]);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseTopicNotesReturn extends TopicNotesState {
  refetch: () => Promise<void>;
  generatingSection: string | null;
  generateQuestions: (params: {
    sectionId: string | number;
    sectionTitle: string;
    sectionText: string;
    keyPoints: string[];
    chapterId?: string;
    subjectId?: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export function useTopicNotes(topicId: string | undefined): UseTopicNotesReturn {
  const [state, setState] = useState<TopicNotesState>({
    loading: true,
    pages: [],
    sectionTitles: [],
    sectionFirstPageIndexes: [],
    error: null,
    jobTitle: null,
    isEmpty: false,
  });
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadNotes = useCallback(async () => {
    if (!topicId) {
      setState({
        loading: false,
        pages: [],
        sectionTitles: [],
        sectionFirstPageIndexes: [],
        error: null,
        jobTitle: null,
        isEmpty: true,
      });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const [job, questions, subtopics] = await Promise.all([
        fetchTopicNotesJob(topicId),
        fetchTopicQuestions(topicId),
        fetchTopicSubtopics(topicId),
      ]);

      if (!mountedRef.current) return;

      if (!job || !job.presentation_json) {
        setState({
          loading: false,
          pages: [],
          sectionTitles: [],
          sectionFirstPageIndexes: [],
          error: null,
          jobTitle: null,
          isEmpty: true,
        });
        return;
      }

      const sections = Array.isArray(job.presentation_json.sections)
        ? job.presentation_json.sections
        : [];

      const subtopicMap = new Map<string, string>(
        subtopics.map((st) => [st.id, st.title]),
      );

      const questionsBySection = bucketQuestions(questions, sections, subtopicMap);
      const pages = buildNotePages(sections, questionsBySection);
      const { sectionTitles, sectionFirstPageIndexes } = buildSectionIndex(pages);

      setState({
        loading: false,
        pages,
        sectionTitles,
        sectionFirstPageIndexes,
        error: null,
        jobTitle: job.document_name,
        isEmpty: pages.length === 0,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setState((s) => ({
        ...s,
        loading: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load study notes. Please try again.',
      }));
    }
  }, [topicId]);

  useEffect(() => {
    mountedRef.current = true;
    loadNotes();
    return () => {
      mountedRef.current = false;
    };
  }, [loadNotes]);

  const generateQuestions = useCallback(
    async (params: {
      sectionId: string | number;
      sectionTitle: string;
      sectionText: string;
      keyPoints: string[];
      chapterId?: string;
      subjectId?: string;
    }): Promise<{ success: boolean; error?: string }> => {
      if (!topicId || generatingSection !== null) {
        return { success: false, error: 'Already generating' };
      }

      const sectionKey = String(params.sectionId);
      setGeneratingSection(sectionKey);

      try {
        const result = await generateTopicNotesQuestions({
          topic_id: topicId,
          chapter_id: params.chapterId,
          subject_id: params.subjectId,
          section_id: params.sectionId,
          section_title: params.sectionTitle,
          section_text: params.sectionText,
          key_points: params.keyPoints,
          count: 5,
        });

        // Refetch so newly-inserted questions appear automatically
        if (result.success) {
          await loadNotes();
        }

        return result;
      } finally {
        if (mountedRef.current) setGeneratingSection(null);
      }
    },
    [topicId, generatingSection, loadNotes],
  );

  return { ...state, refetch: loadNotes, generatingSection, generateQuestions };
}
