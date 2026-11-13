import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export type AnswerStatus = 'correct' | 'wrong' | 'unanswered' | 'recorded';

export interface NormalisedAnswer {
  student: string;
  isCorrect: boolean | null;
  marksAwarded?: number | null;
  maxMarks?: number | null;
  feedback?: string | null;
  imageUrl?: string | null;
}

export interface OptionEntry {
  key: string;
  text: string;
}

export interface ReviewItem {
  key: string;
  index: number;
  question: any | null;
  answer: NormalisedAnswer | null;
  status: AnswerStatus;
  isMcq: boolean;
  options: OptionEntry[];
}

export function getScoreColor(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || Number.isNaN(percent)) return colors.textMuted;
  if (percent >= 70) return colors.success;
  if (percent >= 40) return colors.warning;
  return colors.error;
}

export function parsePercent(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace('%', '').trim());
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return '--';
  const total = Math.max(0, Math.round(Number(seconds)));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatReviewDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h12}:${minutes} ${ampm}`;
}

export function getGradingStatusLabel(status: string | null | undefined): string {
  switch ((status || '').toLowerCase()) {
    case 'graded':
      return 'Graded';
    case 'ai_graded':
    case 'ai-graded':
    case 'ai':
      return 'AI graded';
    case 'pending':
      return 'Pending';
    case '':
      return 'Graded';
    default:
      return status!.charAt(0).toUpperCase() + status!.slice(1);
  }
}

export function getCategoryMeta(category: string | null | undefined): { label: string; icon: IconName; color: string } {
  switch (category) {
    case 'dpp':
      return { label: 'DPP', icon: 'flame', color: colors.warning };
    case 'practice':
      return { label: 'Practice', icon: 'clipboard', color: colors.info };
    case 'exam':
      return { label: 'Exam', icon: 'school', color: colors.primary };
    case 'previous_year':
      return { label: 'Previous year', icon: 'school', color: colors.primaryDark };
    case 'assignment':
      return { label: 'Assignment', icon: 'document-text', color: colors.gray600 };
    default:
      return { label: 'Test', icon: 'document-text', color: colors.gray600 };
  }
}

/** Accepts a plain string or {student_answer, ...} and returns the normalised shape. */
export function normaliseRawAnswer(raw: any): NormalisedAnswer | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' || typeof raw === 'number') {
    return { student: String(raw), isCorrect: null };
  }
  if (typeof raw === 'object') {
    const student = raw.student_answer ?? '';
    return {
      student: String(student),
      isCorrect: typeof raw.is_correct === 'boolean' ? raw.is_correct : null,
      marksAwarded: raw.marks_awarded ?? null,
      maxMarks: raw.max_marks ?? null,
      feedback: raw.feedback ?? null,
      imageUrl: raw.image_url ?? null,
    };
  }
  return null;
}

export function getOptionEntries(options: any): OptionEntry[] {
  if (!options) return [];
  const toText = (v: any): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return String(v.text ?? v.option_text ?? v.value ?? JSON.stringify(v));
    return String(v);
  };
  if (Array.isArray(options)) {
    return options
      .map((o, i) => ({ key: String.fromCharCode(65 + i), text: toText(o) }))
      .filter((o) => o.text.trim() !== '');
  }
  if (typeof options === 'object') {
    return Object.keys(options)
      .map((k) => ({ key: k, text: toText(options[k]) }))
      .filter((o) => o.text.trim() !== '');
  }
  return [];
}

const MCQ_TYPES = ['mcq', 'multiple_choice', 'single_choice'];

export function isMcqQuestion(question: any | null): boolean {
  if (!question) return false;
  if (getOptionEntries(question.options).length > 0) return true;
  const type = String(question.question_type || '').toLowerCase();
  const format = String(question.question_format || '').toLowerCase();
  return MCQ_TYPES.includes(type) || MCQ_TYPES.includes(format);
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** True when a student value refers to an option, by key ("b") or by option text. */
function optionMatches(value: string, opt: OptionEntry): boolean {
  const v = norm(value);
  return v !== '' && (v === norm(opt.key) || v === norm(opt.text));
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Index of the option (in options) matched by value, or -1. */
export function findOptionIndex(value: string, options: OptionEntry[]): number {
  return options.findIndex((o) => optionMatches(value, o));
}

export function evaluateAnswer(
  question: any | null,
  answer: NormalisedAnswer | null,
  options: OptionEntry[],
  isMcq: boolean,
): AnswerStatus {
  if (!answer || (answer.student.trim() === '' && !answer.imageUrl)) return 'unanswered';
  if (typeof answer.isCorrect === 'boolean') return answer.isCorrect ? 'correct' : 'wrong';

  const correct = question?.correct_answer;
  if (correct === null || correct === undefined || String(correct).trim() === '') return 'recorded';

  if (isMcq || options.length > 0) {
    if (answer.student.trim() === '') return 'unanswered';
    const correctIdx = findOptionIndex(String(correct), options);
    const studentIdx = findOptionIndex(answer.student, options);
    if (correctIdx >= 0 && studentIdx >= 0) return correctIdx === studentIdx ? 'correct' : 'wrong';
    return norm(answer.student) === norm(correct) ? 'correct' : 'wrong';
  }

  const a = toNumber(answer.student);
  const b = toNumber(correct);
  if (a !== null && b !== null) return a === b ? 'correct' : 'wrong';

  return 'recorded';
}

/** Builds one review row per question, then appends answer-only rows (question text unavailable). */
export function buildReviewItems(
  questions: any[],
  answerMap: Record<string, any>,
): ReviewItem[] {
  const items: ReviewItem[] = [];
  const seen = new Set<string>();

  questions.forEach((q, i) => {
    const key = String(q.id);
    seen.add(key);
    const options = getOptionEntries(q.options);
    const mcq = isMcqQuestion(q);
    const answer = normaliseRawAnswer(answerMap[key]);
    items.push({
      key,
      index: i + 1,
      question: q,
      answer,
      status: evaluateAnswer(q, answer, options, mcq),
      isMcq: mcq,
      options,
    });
  });

  Object.keys(answerMap || {}).forEach((key) => {
    if (seen.has(key)) return;
    const answer = normaliseRawAnswer(answerMap[key]);
    items.push({
      key,
      index: items.length + 1,
      question: null,
      answer,
      status: evaluateAnswer(null, answer, [], false),
      isMcq: false,
      options: [],
    });
  });

  return items;
}

export function countStatuses(items: ReviewItem[]) {
  const counts = { correct: 0, wrong: 0, unanswered: 0, recorded: 0 };
  items.forEach((it) => {
    counts[it.status] += 1;
  });
  return counts;
}

/** Readable title: exam name, else a category-based fallback. */
export function getResultTitle(result: any): string {
  const name = result?.paper?.exam_name;
  if (typeof name === 'string' && name.trim() !== '') return name.trim();
  switch (result?.paper_category) {
    case 'dpp':
      return 'DPP';
    case 'practice':
      return 'Practice test';
    default:
      return 'Test';
  }
}
