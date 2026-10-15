// One "Ask AI" for the whole app. The lecture player's Ask AI screen (AskAIAssistant) is the only Ask AI there
// is: every button that offers it (the floating AI button on Home, the tab bar, the side menu, a subject's AI
// Teacher card, the topic's AI tab...) just calls openAskAI() and <AskAIHost /> shows that screen. Same idea as
// the web app's lib/askAIStore.ts. Kept free of heavy imports so any screen can use it.
import { useSyncExternalStore } from 'react';
import type { TeacherSubject } from './aiTeacherService';

/** What the button knows about where the student is. All optional: the screen asks for whatever is missing. */
export interface AskAIRequest {
  subjectId?: string | null;
  subjectName?: string | null;
  topicTitle?: string | null;
}

let current: AskAIRequest | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function openAskAI(request: AskAIRequest = {}): void {
  current = { ...request };
  emit();
}

export function closeAskAI(): void {
  if (current === null) return;
  current = null;
  emit();
}

/** The open request, or null while Ask AI is closed. */
export function useAskAIRequest(): AskAIRequest | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

export type SubjectChoice =
  | { kind: 'subject'; subject: TeacherSubject }
  /** The student has to pick; `unknown` is the subject they were on when it is not one the teacher can teach. */
  | { kind: 'pick'; unknown: string | null };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Other ways students name a subject, keyed by the normalized subject name. */
const ALIASES: Record<string, string[]> = {
  'social science': ['social studies', 'sst', 'social'],
  maths: ['math', 'mathematics'],
  mathematics: ['math', 'maths'],
  science: ['general science'],
};

const namesFor = (s: { name: string }): string[] => {
  const n = norm(s.name);
  return [n, ...(ALIASES[n] ?? [])].filter(Boolean);
};

/** Finds a subject by the name a screen knows it by (exact, then a known short name, then a close match). */
export function matchSubjectByName<T extends { id: string; name: string }>(name: string, subjects: T[]): T | null {
  const n = norm(name);
  if (!n) return null;
  const exact = subjects.find((s) => norm(s.name) === n);
  if (exact) return exact;
  // Longest name first, so "social science" wins over "science".
  const candidates = subjects.flatMap((s) => namesFor(s).map((alias) => ({ s, alias }))).sort((a, b) => b.alias.length - a.alias.length);
  for (const { s, alias } of candidates) if (` ${n} `.includes(` ${alias} `)) return s;
  return subjects.find((s) => norm(s.name).includes(n) || n.includes(norm(s.name))) ?? null;
}

/**
 * Which subject Ask AI teaches. The one the student is on if the teacher knows it, the only one there is,
 * otherwise the student picks (and is told when the subject they were on is not available yet).
 */
export function chooseSubject(request: AskAIRequest, subjects: TeacherSubject[]): SubjectChoice {
  const byId = request.subjectId ? subjects.find((s) => s.id === request.subjectId) : undefined;
  const name = request.subjectName?.trim() || null;
  const subject = byId ?? (name ? matchSubjectByName(name, subjects) : null);
  if (subject) return { kind: 'subject', subject };
  if (subjects.length === 1 && !request.subjectId && !name) return { kind: 'subject', subject: subjects[0] };
  return { kind: 'pick', unknown: name };
}

/** A subject with the courses it belongs to, as the database returns it (a course is null when it is not visible to the student). */
export interface SubjectCourseRow {
  id: string;
  course_subjects: { courses: { name: string | null } | null }[] | null;
}

/** subject id -> names of the courses it belongs to (visible courses only, no repeats, in the order given). */
export function courseNamesBySubject(rows: SubjectCourseRow[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    const names = (row.course_subjects ?? [])
      .map((link) => link.courses?.name?.trim() ?? '')
      .filter((name, index, all) => name !== '' && all.indexOf(name) === index);
    if (names.length) result[row.id] = names;
  }
  return result;
}
