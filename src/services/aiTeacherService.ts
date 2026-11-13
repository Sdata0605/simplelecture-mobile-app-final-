import { SUPABASE_URL, SUPABASE_ANON_KEY, getValidAccessToken } from './supabase';
import { TeacherPrefs, personaPayload } from './aiTeacherPrefs';

export interface TeacherSubject {
  id: string;
  name: string;
  topics: number;
}

export interface OutlineTopic {
  id: string;
  label: string;
  title: string;
}

export interface OutlineChapter {
  id: string;
  number: number;
  title: string;
  topics: OutlineTopic[];
}

export interface QuizData {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
}

export interface BigQuestionData {
  question: string;
  model_answer: string;
}

export interface ChatResult {
  found: boolean;
  topics: { topic_id: string; chapter_title: string | null; topic_title: string | null; summary: string | null }[];
  answer?: string;
  quiz?: QuizData;
  bigq?: BigQuestionData;
}

export interface PreparedChat extends Omit<ChatResult, 'answer' | 'quiz' | 'bigq'> {
  mode: string;
  prepare: { system: string; contents: unknown[]; json: boolean; models: string[] };
}

export class TeacherApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'TeacherApiError';
    this.status = status;
  }
}

/**
 * Invokes the edge function `ai-teacher` with proper auth headers and retries.
 */
export async function teacherApi<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = (await getValidAccessToken()) || SUPABASE_ANON_KEY;
  const url = `${SUPABASE_URL}/functions/v1/ai-teacher`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...body }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data?.error || data?.message || `Server returned error ${response.status}`;
        throw new TeacherApiError(String(errorMsg), response.status);
      }

      if (data?.error) {
        throw new TeacherApiError(String(data.error));
      }

      return data as T;
    } catch (error: any) {
      if (error instanceof TeacherApiError) {
        throw error;
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      throw new TeacherApiError(
        error?.message || 'Connection problem. Please check your internet and try again.'
      );
    }
  }

  throw new TeacherApiError('The AI teacher is not responding right now. Please try again.');
}

/**
 * Retrieves the list of subjects available for AI Teacher.
 */
export async function getSubjects(): Promise<{ subjects: TeacherSubject[] }> {
  return teacherApi<{ subjects: TeacherSubject[] }>('subjects');
}

/**
 * Retrieves the syllabus outline (chapters & topics) for a given subject.
 */
export async function getOutline(subjectId: string): Promise<{ chapters: OutlineChapter[] }> {
  return teacherApi<{ chapters: OutlineChapter[] }>('outline', { subjectId });
}

/**
 * Sends a chat message to the AI Teacher. The server runs it on the student's own saved Gemini keys.
 */
export async function sendChatMessage(params: {
  subjectId: string;
  question: string;
  messages?: { role: 'user' | 'assistant'; text: string }[];
  mode?: 'chat' | 'quiz' | 'bigq';
  prefs: TeacherPrefs;
}): Promise<ChatResult> {
  const { subjectId, question, messages, mode = 'chat', prefs } = params;

  return teacherApi<ChatResult>('chat', {
    subjectId,
    question,
    messages: messages?.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    })),
    mode,
    persona: personaPayload(prefs),
  });
}
