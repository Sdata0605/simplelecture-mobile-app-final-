// Reminder channel helpers for study timetable plans and sessions (WP4).
// Plan default lives in study_timetables.plan_metadata.reminderChannel (jsonb, no migration needed).
// Session channel lives in study_timetable_sessions.reminder_channel.
import {
  authHeaders,
  restFetch,
  patchSession,
  patchSessions,
  patchPlanMetadata,
  type StudyTimetablePlan,
  type StudyTimetablePlanMetadata,
  type StudyTimetableSession,
  type ReminderChoiceValue,
} from '../hooks/useStudyTimetable';
import { SUPABASE_URL } from './supabase';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { ReminderChannel } from '../types/reminder';

/** What the student picks: a channel, or 'none' (Off). null in the data model means legacy, not off. */
export type ReminderChoice = ReminderChoiceValue;
/** Summary for a plan: its default, 'mixed' when sessions disagree, or null when nothing is set. */
export type PlanChannelSummary = ReminderChoice | 'mixed' | null;

const CHOICES: ReadonlyArray<ReminderChoice> = ['call', 'message', 'notification', 'email', 'none'];

export function isReminderChoice(v: unknown): v is ReminderChoice {
  return typeof v === 'string' && (CHOICES as ReadonlyArray<string>).includes(v);
}

/**
 * Runs a write with `value`. If 'none' is rejected by the CHECK constraint (SQLSTATE 23514, migration
 * 20261105100000 not applied yet), retries with null (legacy) and reports noneUnsupported: true.
 */
async function withNoneFallback<T>(
  choice: ReminderChoice | null,
  run: (value: ReminderChannel | 'none' | null) => Promise<T>,
): Promise<{ result: T; noneUnsupported: boolean }> {
  if (choice !== 'none') return { result: await run(choice), noneUnsupported: false };
  try {
    return { result: await run('none'), noneUnsupported: false };
  } catch (e: any) {
    if (String(e?.message ?? e).includes('23514')) {
      return { result: await run(null), noneUnsupported: true };
    }
    throw e;
  }
}

/** Only pending, study-type sessions from now on. Done/skipped and test sessions are never touched. */
function upcomingFilter(planId: string, nowIso: string): string {
  return (
    `timetable_id=eq.${planId}&status=eq.pending&session_type=eq.study` +
    `&scheduled_at=gt.${encodeURIComponent(nowIso)}`
  );
}

/**
 * Sets the channel on every upcoming pending study session of a plan, then stores the default in plan_metadata.
 * opts.onlyMatching: undefined = all upcoming sessions; null = only sessions with no channel; a value = only sessions on that channel.
 * opts.keepDefault: true = change the sessions only and leave the stored plan default alone (used by the master Off switch).
 * Returns how many sessions changed, and noneUnsupported when the 'none' write fell back to null.
 */
export async function applyPlanChannel(
  planId: string,
  choice: ReminderChoice,
  opts?: { onlyMatching?: ReminderChoice | null; keepDefault?: boolean },
): Promise<{ changed: number; noneUnsupported: boolean }> {
  const nowIso = new Date().toISOString();
  let filter = upcomingFilter(planId, nowIso);
  const only = opts?.onlyMatching;
  if (only === null) filter += '&reminder_channel=is.null';
  else if (only !== undefined) filter += `&reminder_channel=eq.${only}`;

  const { result: changed, noneUnsupported } = await withNoneFallback(choice, value =>
    patchSessions(filter, { reminder_channel: value, updated_at: nowIso }),
  );

  if (opts?.keepDefault) return { changed, noneUnsupported };

  const rows = await restFetch<Pick<StudyTimetablePlan, 'plan_metadata'>>(
    `study_timetables?select=plan_metadata&id=eq.${planId}`,
  );
  const oldMeta: StudyTimetablePlanMetadata = rows[0]?.plan_metadata ?? {};
  await patchPlanMetadata(planId, { ...oldMeta, reminderChannel: choice });
  return { changed, noneUnsupported };
}

/**
 * Server prepares the day-1 call voice for a plan (reminder-audio-prefetch, plan mode).
 * Never throws: any network, timeout, or HTTP error comes back as { ok: false }.
 */
export async function prepareDayOneAudio(
  timetableId: string,
): Promise<{ ok: boolean; ready?: number; failed?: number }> {
  try {
    const headers = await authHeaders();
    const res = await fetchWithTimeout(
      `${SUPABASE_URL}/functions/v1/reminder-audio-prefetch`,
      { method: 'POST', headers, body: JSON.stringify({ timetable_id: timetableId, days: 1 }) },
      30000,
    );
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { ready?: unknown; failed?: unknown };
    return {
      ok: true,
      ready: typeof body?.ready === 'number' ? body.ready : undefined,
      failed: typeof body?.failed === 'number' ? body.failed : undefined,
    };
  } catch {
    return { ok: false };
  }
}

/** Sets one session's channel. Undo calls this again with the previous value. */
export async function setSessionChannel(sessionId: string, choice: ReminderChoice | null): Promise<void> {
  await withNoneFallback(choice, value =>
    patchSession(sessionId, { reminder_channel: value }),
  );
}

/** Restores exact previous channels after an undo. Groups ids by value so each value is one PATCH. */
export async function restoreSessionChannels(
  previous: ReadonlyArray<{ id: string; channel: ReminderChoice | null }>,
): Promise<void> {
  const groups = new Map<ReminderChoice | null, string[]>();
  for (const p of previous) {
    const key = p.channel ?? null;
    groups.set(key, [...(groups.get(key) ?? []), p.id]);
  }
  for (const [value, ids] of groups) {
    await withNoneFallback(value, v =>
      patchSessions(`id=in.(${ids.join(',')})`, { reminder_channel: v, updated_at: new Date().toISOString() }),
    );
  }
}

/**
 * Plan default. Uses plan_metadata.reminderChannel when it is set.
 * Otherwise the most common channel among sessions with a value. A tie between the top two gives 'mixed'.
 */
export function planDefaultChannel(
  plan: StudyTimetablePlan,
  sessions: StudyTimetableSession[],
): PlanChannelSummary {
  const stored = plan.plan_metadata?.reminderChannel;
  if (isReminderChoice(stored)) return stored;

  const counts = new Map<ReminderChoice, number>();
  for (const s of sessions) {
    const c = s.reminder_channel;
    if (isReminderChoice(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return 'mixed';
  return sorted[0][0];
}

/** Sessions whose own channel differs from the plan default. A null default counts every session that has a channel. */
export function countOverrides(sessions: StudyTimetableSession[], planDefault: ReminderChoice | null): number {
  return sessions.filter(s => (s.reminder_channel ?? null) !== planDefault).length;
}

/** Upcoming pending study sessions of one plan, next 30 days, soonest first. */
export async function fetchUpcomingSessions(planId: string, limit: number): Promise<StudyTimetableSession[]> {
  const now = new Date();
  const until = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return restFetch<StudyTimetableSession>(
    `study_timetable_sessions?select=*&${upcomingFilter(planId, now.toISOString())}` +
    `&scheduled_at=lt.${encodeURIComponent(until.toISOString())}&order=scheduled_at.asc&limit=${limit}`,
  );
}

/** "Mon 3 Nov, 7:00 AM" in the phone's locale. Falls back to the raw string if the date is invalid. */
export function formatSessionWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

export const CHANNEL_LABEL: Record<ReminderChoice | 'mixed', string> = {
  call: 'Call',
  message: 'Message',
  notification: 'Notification',
  email: 'Email',
  none: 'Off',
  mixed: 'Mixed',
};
