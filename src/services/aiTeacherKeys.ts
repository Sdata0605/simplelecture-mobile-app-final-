import { SUPABASE_URL, SUPABASE_ANON_KEY, getValidAccessToken, supabase } from './supabase';
import { TeacherPrefs, savePrefs } from './aiTeacherPrefs';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { writePlanCache } from './aiTeacherPlan';

/**
 * Student-owned Gemini keys (up to 10) stored on the server and shared with the web app.
 * Every action goes to the `ai-teacher-keys` edge function and returns the full Settings object.
 */

export type AiTeacherKeyStatus = 'untested' | 'active' | 'rate_limited' | 'invalid' | string;

export interface AiTeacherKey {
  id: string;
  label: string;
  masked: string;
  position: number;
  status: AiTeacherKeyStatus;
  lastError: string | null;
  lastErrorAt: string | null;
  lastUsedAt: string | null;
}

/** Student plan state from the server. Keys can only be added once the Plus plan (Rs 500) is bought. */
export interface AiTeacherPlan {
  active: boolean;
  planName: 'plus' | null;
}

export interface AiTeacherSettings {
  prefs: TeacherPrefs;
  keys: AiTeacherKey[];
  activeKeyId: string | null;
  maxKeys: number;
  /** Missing when the server response has no plan field: the plan is then unknown, not inactive. */
  plan?: AiTeacherPlan;
}

/** The plan to assume when a caller needs a boolean and the server has not said (not used for redirects). */
export const DEFAULT_AI_TEACHER_PLAN: AiTeacherPlan = { active: false, planName: null };

export type AiTeacherKeyErrorCode =
  | 'INVALID_KEY'
  | 'KEY_LIMIT'
  | 'DUPLICATE_KEY'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'NO_KEYS'
  | 'ALL_KEYS_FAILED'
  | 'NETWORK'
  | string;

export class AiTeacherKeyError extends Error {
  code: AiTeacherKeyErrorCode;
  constructor(message: string, code: AiTeacherKeyErrorCode = 'NETWORK') {
    super(message);
    this.name = 'AiTeacherKeyError';
    this.code = code;
  }
}

const KEYS_TIMEOUT_MS = 15000;

async function keysApi(action: string, body: Record<string, unknown> = {}): Promise<AiTeacherSettings> {
  const token = (await getValidAccessToken()) || SUPABASE_ANON_KEY;
  const url = `${SUPABASE_URL}/functions/v1/ai-teacher-keys`;

  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...body }),
      },
      KEYS_TIMEOUT_MS,
    );
  } catch (err: any) {
    const timedOut = err?.name === 'AbortError';
    throw new AiTeacherKeyError(
      timedOut ? 'The server took too long. Please try again.' : 'Could not reach the server. Check your internet connection.',
      'NETWORK',
    );
  }

  const data: any = await response.json().catch(() => ({}));

  if (!response.ok || data?.error) {
    const code = (data?.code as string) || (response.status === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST');
    const message = typeof data?.error === 'string' ? data.error : `Server returned error ${response.status}`;
    throw new AiTeacherKeyError(message, code);
  }

  const settings = data as AiTeacherSettings;
  // No plan field (older server): left missing, so the app treats the plan as unknown, not as not bought.
  if (settings?.prefs) {
    // Keep the offline cache of persona prefs fresh; keys are never cached on the device.
    await savePrefs(settings.prefs as TeacherPrefs).catch(() => undefined);
  }
  if (settings?.plan && typeof settings.plan.active === 'boolean') {
    // Keep the per-user plan cache fresh; it is only read when the server cannot be reached.
    const user = await supabase.getStoredUser().catch(() => null);
    if (user?.id) await writePlanCache(user.id, settings.plan.active);
  }
  return settings;
}

export function getAiTeacherSettings(): Promise<AiTeacherSettings> {
  return keysApi('get');
}

export function saveAiTeacherPrefs(prefs: Partial<TeacherPrefs>): Promise<AiTeacherSettings> {
  return keysApi('savePrefs', { prefs });
}

export function addAiTeacherKey(label: string, apiKey: string): Promise<AiTeacherSettings> {
  return keysApi('addKey', { label, apiKey: apiKey.trim() });
}

export function updateAiTeacherKey(
  id: string,
  patch: { label?: string; apiKey?: string },
): Promise<AiTeacherSettings> {
  const body: Record<string, unknown> = { id };
  if (patch.label !== undefined) body.label = patch.label;
  if (patch.apiKey !== undefined) body.apiKey = patch.apiKey.trim();
  return keysApi('updateKey', body);
}

export function deleteAiTeacherKey(id: string): Promise<AiTeacherSettings> {
  return keysApi('deleteKey', { id });
}

export function reorderAiTeacherKeys(ids: string[]): Promise<AiTeacherSettings> {
  return keysApi('reorder', { ids });
}

export function setActiveAiTeacherKey(id: string): Promise<AiTeacherSettings> {
  return keysApi('setActive', { id });
}

export function testAiTeacherKey(id: string): Promise<AiTeacherSettings> {
  return keysApi('testKey', { id });
}

export function reportAiTeacherKeyFailure(id: string, error: string): Promise<AiTeacherSettings> {
  return keysApi('reportFailure', { id, error });
}
