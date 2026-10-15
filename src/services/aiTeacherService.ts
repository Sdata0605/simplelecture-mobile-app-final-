import { SUPABASE_URL, SUPABASE_ANON_KEY, getValidAccessToken } from './supabase';
import { TeacherPrefs, personaPayload } from './aiTeacherPrefs';
import { loadSubscription } from './aiTeacherSubscription';

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

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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

function parseJsonObject(text: string): any | null {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}

function validQuiz(j: any): QuizData | null {
  if (!j || typeof j.question !== 'string' || !Array.isArray(j.options) || j.options.length !== 4) return null;
  const ci = Number(j.correct_index);
  if (!Number.isInteger(ci) || ci < 0 || ci > 3) return null;
  return {
    question: j.question.trim(),
    options: j.options.map((o: unknown) => String(o).trim()),
    correct_index: ci,
    explanation: typeof j.explanation === 'string' ? j.explanation.trim() : null,
  };
}

function validBigQ(j: any): BigQuestionData | null {
  if (!j || typeof j.question !== 'string' || typeof j.model_answer !== 'string') return null;
  return { question: j.question.trim(), model_answer: j.model_answer.trim() };
}

/**
 * Calls Gemini directly from the device with the student's own API key.
 */
async function generateWithOwnKey(apiKey: string, prep: PreparedChat['prepare']): Promise<string> {
  let lastStatus = 0;
  const models = prep.models && prep.models.length > 0 ? prep.models : ['gemini-2.5-flash', 'gemini-1.5-flash'];

  for (const model of models) {
    for (const noThinking of [true, false]) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      try {
        const res = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: prep.system }] },
            contents: prep.contents,
            generationConfig: {
              temperature: prep.json ? 0.7 : 0.3,
              maxOutputTokens: 2048,
              ...(prep.json ? { responseMimeType: 'application/json' } : {}),
              ...(noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          }),
        });

        const body = await res.json().catch(() => ({}));

        if (res.ok) {
          const text = (body.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();
          if (text) return text;
          break;
        }

        lastStatus = res.status;
        if (res.status === 400 && noThinking) {
          if (/api key/i.test(body?.error?.message ?? '')) {
            throw new TeacherApiError('Your API key was not accepted by Google. Please check it in Settings.', 400);
          }
          continue;
        }
        if (res.status === 401 || res.status === 403) {
          throw new TeacherApiError('Your API key was not accepted by Google. Please check it in Settings.', res.status);
        }
        break;
      } catch (e) {
        if (e instanceof TeacherApiError) throw e;
        break;
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  throw new TeacherApiError(
    lastStatus === 429
      ? 'Your API key has hit its rate limit. Please try again in a moment.'
      : 'The AI teacher could not answer right now. Please try again.',
    lastStatus || undefined
  );
}

/**
 * Sends a chat message to the AI Teacher.
 */
export async function sendChatMessage(params: {
  subjectId: string;
  question: string;
  messages?: { role: 'user' | 'assistant'; text: string }[];
  mode?: 'chat' | 'quiz' | 'bigq';
  prefs: TeacherPrefs;
  isByok: boolean;
  apiKey?: string;
}): Promise<ChatResult> {
  const { subjectId, question, messages, mode = 'chat', prefs, isByok, apiKey } = params;

  const common = {
    subjectId,
    question,
    messages: messages?.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    })),
    mode,
    persona: personaPayload(prefs),
  };

  if (!isByok) {
    // Pro Managed ₹1000 Plan: runs on Admin's key pool via edge function
    return teacherApi<ChatResult>('chat', common);
  }

  // BYOK ₹500 Plan: user provides their own key
  const studentKey = apiKey?.trim() || prefs.apiKey?.trim();
  if (!studentKey) {
    throw new TeacherApiError('Your ₹500 plan requires your Google Gemini API key. Please add your key in Settings.');
  }

  const prep = await teacherApi<PreparedChat>('chat', { ...common, byok: true });
  const text = await generateWithOwnKey(studentKey, prep.prepare);
  const out: ChatResult = { found: prep.found, topics: prep.topics };

  if (prep.mode === 'quiz') {
    const quiz = validQuiz(parseJsonObject(text));
    if (!quiz) throw new TeacherApiError('Could not construct quiz question this time. Please try again.');
    return { ...out, quiz };
  }
  if (prep.mode === 'bigq') {
    const bigq = validBigQ(parseJsonObject(text));
    if (!bigq) throw new TeacherApiError('Could not construct descriptive question this time. Please try again.');
    return { ...out, bigq };
  }

  return { ...out, answer: text };
}

/**
 * Tests a student's Gemini API key directly against Google's endpoint.
 */
export async function testGeminiApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${GEMINI_API_BASE}/gemini-2.5-flash`, {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKey.trim() },
      signal: controller.signal,
    });

    if (res.ok) {
      return { ok: true, message: 'Your Gemini API key is valid and working!' };
    }

    const body = await res.json().catch(() => ({}));
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Google did not accept this key. Please check you copied the entire key.' };
    }
    return { ok: false, message: String(body?.error?.message || `Google responded with status ${res.status}.`) };
  } catch (err: any) {
    return { ok: false, message: 'Could not connect to Google. Please check your internet connection.' };
  } finally {
    clearTimeout(timeoutId);
  }
}
