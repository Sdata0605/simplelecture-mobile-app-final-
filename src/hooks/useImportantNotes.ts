import { useQuery } from '@tanstack/react-query';
import { SUPABASE_DIRECT_URL, SUPABASE_ANON_KEY } from '../services/supabase';

/**
 * Important Notes data layer — port of the web app's
 * `src/hooks/useImportantNotes.ts`.
 *
 * Hits the same external notes API through the same `ai-teaching-proxy` edge
 * function the AI tab already uses (see getReadyPregenQuestions in
 * services/supabase.ts). The proxy exists because the notes API is plain HTTP —
 * calling it directly fails on device as cleartext / mixed content.
 *
 * Unlike web, the proxy call needs the Supabase apikey + bearer headers.
 */

const NOTES_API_BASE = 'http://116.202.230.124:8000';
const PROXY_URL = `${SUPABASE_DIRECT_URL}/functions/v1/ai-teaching-proxy`;

const AUTH_HEADERS: Record<string, string> = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

export interface ImportantNoteSection {
  heading?: string;
  key_points?: string[];
  explanation?: string;
  image_descriptions?: string[];
}

export interface ImportantNoteImage {
  url?: string;
  local_url?: string;
  local_path?: string;
}

export interface ImportantNoteQuestion {
  id?: string;
  question_text?: string;
  question_format?: string;
  question_type?: string;
  options?: Record<string, { text?: string } | string>;
  correct_answer?: string;
  difficulty?: string;
  marks?: number;
}

export interface ImportantNoteAnswer {
  question_id?: string;
  question_text?: string;
  answer?: string;
  format?: string;
  difficulty?: string;
  key_points?: string[];
  memory_tip?: string;
  estimated_study_time?: string;
  answer_images?: ImportantNoteImage[];
  formulas_used?: unknown[];
}

export interface ImportantTopicNotes {
  topic_note_id: string;
  topic_id: string;
  topic_number?: string;
  topic_title?: string;
  document_id?: string;
  document_title?: string;
  notes_status?: string;
  generated_at?: string;
  error_message?: string | null;
  note_sections?: ImportantNoteSection[];
  latex_formulas?: unknown[];
  note_images?: ImportantNoteImage[];
  questions?: ImportantNoteQuestion[];
  question_answers?: ImportantNoteAnswer[];
  answer_images?: ImportantNoteImage[];
}

export interface ImportantChapterNotes {
  chapter_id: string;
  subject_id: string;
  total_topics: number;
  topics: ImportantTopicNotes[];
}

export const useImportantNotes = (chapterId?: string | null) =>
  useQuery({
    queryKey: ['important-notes', chapterId],
    enabled: Boolean(chapterId),
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }): Promise<ImportantChapterNotes> => {
      const path = `/notes/chapter/${encodeURIComponent(chapterId!)}`;
      const url = `${PROXY_URL}?path=${encodeURIComponent(path)}&base=${encodeURIComponent(NOTES_API_BASE)}`;
      const response = await fetch(url, { signal, headers: AUTH_HEADERS });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          body?.detail || body?.error || body?.message || 'Important notes request failed';
        throw new Error(message);
      }

      return {
        ...body,
        topics: Array.isArray(body?.topics) ? body.topics : [],
      };
    },
  });

// ---------------------------------------------------------------------------
// Page building — ported verbatim from the web tab so both platforms paginate
// a topic's notes identically.
// ---------------------------------------------------------------------------

export const getImageUrl = (image?: ImportantNoteImage) => image?.url || image?.local_url || '';

export const getQuestionText = (question: ImportantNoteQuestion) => {
  const text = question.question_text || '';
  if (Object.keys(question.options || {}).length === 0) return text;

  const optionStart = text.search(/(?:\n|\s+-\s+)\s*(?:\([aA]\)|[aA][.)])\s+/);
  return optionStart >= 0 ? text.slice(0, optionStart).trim() : text;
};

export const getFormulaText = (formula: unknown): string => {
  if (typeof formula === 'string') return formula;
  if (!formula || typeof formula !== 'object') return '';
  const item = formula as Record<string, unknown>;
  const value =
    item.latex || item.formula || item.expression || item.equation || item.content || item.text;
  return typeof value === 'string' ? value : '';
};

export type SectionBookPage = {
  kind: 'section';
  section: ImportantNoteSection;
  sectionIndex: number;
  images: ImportantNoteImage[];
};

export type FormulaBookPage = {
  kind: 'formulas';
  formulas: string[];
  groupIndex: number;
};

export type QuestionsBookPage = {
  kind: 'questions';
  questions: ImportantNoteQuestion[];
  startIndex: number;
};

export type BookPage = SectionBookPage | FormulaBookPage | QuestionsBookPage;

const chunk = <T,>(items: T[], size: number) => {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
};

export const buildBookPages = (topic: ImportantTopicNotes): BookPage[] => {
  const sections = topic.note_sections || [];
  const images = (topic.note_images || []).filter((image) => getImageUrl(image));
  let imageCursor = 0;

  const sectionPages: SectionBookPage[] = sections.map((section, sectionIndex) => {
    const remainingImages = images.length - imageCursor;
    const remainingSections = sections.length - sectionIndex;
    const describedImages = section.image_descriptions?.length || 0;
    const imageCount =
      describedImages > 0 ? describedImages : remainingImages >= remainingSections ? 1 : 0;
    const sectionImages = images.slice(imageCursor, imageCursor + imageCount);
    imageCursor += imageCount;

    return { kind: 'section', section, sectionIndex, images: sectionImages };
  });

  if (imageCursor < images.length && sectionPages.length > 0) {
    sectionPages[sectionPages.length - 1].images.push(...images.slice(imageCursor));
  }

  const formulas = (topic.latex_formulas || []).map(getFormulaText).filter(Boolean);
  const formulaPages: FormulaBookPage[] = chunk(formulas, 4).map((group, groupIndex) => ({
    kind: 'formulas',
    formulas: group,
    groupIndex,
  }));
  const questionPages: QuestionsBookPage[] = chunk(topic.questions || [], 2).map(
    (questions, groupIndex) => ({
      kind: 'questions',
      questions,
      startIndex: groupIndex * 2,
    }),
  );

  return [...sectionPages, ...formulaPages, ...questionPages];
};
