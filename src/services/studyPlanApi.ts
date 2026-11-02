// Edge-function calls for the study plan creator (WP1). `edgePost` moved here from
// StudyTimetableScreen.tsx (102-115). Auth uses the same bearer as the rest of the app.

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

const FEASIBILITY_TIMEOUT_MS = 30000;
// Plan generation is AI work on the server; give it room, but never wait forever.
const GENERATE_TIMEOUT_MS = 120000;

export interface FeasibilityResult { verdict?: string; message?: string }
export interface GenerateResult { timetable_id?: string; sessions_created?: number }

async function edgePost(fnName: string, body: object, timeoutMs: number): Promise<any> {
  const token = await supabase.getAccessToken();
  const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  }, timeoutMs);
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  try { return JSON.parse(text); } catch { return text; }
}

export async function evaluateFeasibility(args: {
  scopeLabel: string;
  contentDurationMinutes: number;
  startDate: string;
  deadline: string;
  dailyHours: number;
}): Promise<FeasibilityResult> {
  const data = await edgePost('study-timetable-ai', { action: 'evaluate_feasibility', ...args }, FEASIBILITY_TIMEOUT_MS);
  return (data && typeof data === 'object') ? data as FeasibilityResult : {};
}

/** Body built by toGeneratePayload() in planWizard/state.ts. */
export async function generatePlan(payload: object): Promise<GenerateResult> {
  const data = await edgePost('study-timetable-ai', payload, GENERATE_TIMEOUT_MS);
  return (data && typeof data === 'object') ? data as GenerateResult : {};
}
