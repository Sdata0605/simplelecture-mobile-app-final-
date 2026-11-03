import type { StudyTimetableSession, SessionPatch } from '../hooks/useStudyTimetable';
import type { ReminderChoice } from '../types/reminder';
import { localDateKey } from '../utils/calendar';

// Session editor: pure validation and patch building (no RN imports), plus the save service.
// Spec: _scratch/timetable-ui-fix-plan.md sections E.2 and E.3.

export const DURATION_MIN = 5;
export const DURATION_MAX = 240;
export const TITLE_MAX = 120;
const MINUTES_PER_DAY = 24 * 60;
const PAST_GRACE_MS = 60 * 1000;
const REMINDER_WINDOW_MS = 8 * 24 * 60 * 60 * 1000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Source row: the subset of StudyTimetableSession the editor reads. */
export type SessionEditSource = Pick<
  StudyTimetableSession,
  'id' | 'timetable_id' | 'title' | 'scheduled_at' | 'duration_minutes' | 'status' | 'notes' | 'reminder_channel'
>;

export interface SessionEditDraft {
  title: string;
  startMin: number;        // minutes after local midnight, 0..1439
  durationMin: number;
  notes: string;
  channel: ReminderChoice | null;
}

/** Anything that occupies time on the same day: a session (pending or done) or a self test. */
export interface OverlapCandidate {
  id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  status?: string;
}

export type SessionEditField = 'title' | 'start' | 'duration';

export interface SessionEditValidation {
  ok: boolean;
  errors: { title?: string; start?: string; duration?: string };
  changedFields: Array<'title' | 'start' | 'duration' | 'notes' | 'channel'>;
  startChanged: boolean;
  durationChanged: boolean;
}

// ---------- time helpers (local, so this file has no dependency on the picker work) ----------

/** Minutes after local midnight for an ISO timestamp. */
export function localMinutesOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** 'HH:MM' (24-hour, zero-padded) for minutes after midnight. */
export function minutesToHHMM(min: number): string {
  const clamped = Math.min(Math.max(Math.round(min), 0), MINUTES_PER_DAY - 1);
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** Strict 'HH:MM' to minutes. Returns null for anything else. */
export function hhmmToMinutes(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** '7:07 AM' style label. 1440 (end of day) reads as 12:00 AM. */
export function formatClock12(min: number): string {
  const total = ((Math.round(min) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(total / 60);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(total % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** '7:30-8:00 AM' when both ends share a period, otherwise '11:30 AM-12:15 PM'. */
export function formatRange12(startMin: number, endMin: number): string {
  const a = formatClock12(startMin);
  const b = formatClock12(endMin);
  const periodA = a.slice(-2);
  const periodB = b.slice(-2);
  return periodA === periodB ? `${a.slice(0, -3)}-${b}` : `${a}-${b}`;
}

/** 'Tue 4 Nov 2026' for a local 'YYYY-MM-DD' key. */
export function formatDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Local Date for a 'YYYY-MM-DD' day key plus minutes after midnight. */
export function combineLocal(dayKey: string, min: number): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(min / 60), min % 60, 0, 0);
}

/** UTC ISO range covering one local calendar day, for fetchDaySessions. */
export function dayBounds(dayKey: string): { fromIso: string; toIso: string } {
  const [y, m, d] = dayKey.split('-').map(Number);
  return {
    fromIso: new Date(y, m - 1, d, 0, 0, 0, 0).toISOString(),
    toIso: new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString(),
  };
}

/** Touching edges do not count as overlap. */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ---------- validation (E.2) ----------

export function validateSessionEdit(input: {
  session: SessionEditSource;
  draft: SessionEditDraft;
  daySessions: ReadonlyArray<OverlapCandidate>;
  dayTests: ReadonlyArray<OverlapCandidate>;
  now: Date;
}): SessionEditValidation {
  const { session, draft, daySessions, dayTests, now } = input;
  const dayKey = localDateKey(session.scheduled_at);
  const errors: SessionEditValidation['errors'] = {};

  const title = draft.title.trim();
  const titleChanged = title !== session.title.trim();
  if (!title) {
    errors.title = 'Title cannot be empty';
  } else if (title.length > TITLE_MAX) {
    errors.title = `Title must be ${TITLE_MAX} characters or fewer`;
  }

  const startChanged = draft.startMin !== localMinutesOf(session.scheduled_at);
  const durationChanged = draft.durationMin !== session.duration_minutes;
  const notesChanged = (draft.notes.trim() || null) !== (session.notes?.trim() || null);
  const channelChanged = draft.channel !== (session.reminder_channel ?? null);

  const startValid = Number.isInteger(draft.startMin) && draft.startMin >= 0 && draft.startMin < MINUTES_PER_DAY;
  const durationValid =
    Number.isInteger(draft.durationMin) && draft.durationMin >= DURATION_MIN && draft.durationMin <= DURATION_MAX;

  if (!durationValid) {
    errors.duration = `Duration must be between ${DURATION_MIN} and ${DURATION_MAX} minutes`;
  }
  if (!startValid) {
    errors.start = 'Pick a valid start time';
  } else if (durationValid && draft.startMin + draft.durationMin > MINUTES_PER_DAY) {
    errors.start = 'This session would run past midnight. Start earlier or make it shorter';
  }

  // Time and length are locked once a session is done or skipped.
  if (session.status !== 'pending' && (startChanged || durationChanged)) {
    errors.start = 'Only to-do sessions can change time or length. Mark as to do to change the time';
  }

  // Past check: only when the start moved (E.2 rule 4).
  if (!errors.start && startChanged && session.status === 'pending') {
    if (combineLocal(dayKey, draft.startMin).getTime() < now.getTime() - PAST_GRACE_MS) {
      errors.start = 'Pick a time later than now';
    }
  }

  // Overlap: only when this edit changes the time range, so old clashes never block unrelated saves (J.11).
  if (!errors.start && !errors.duration && (startChanged || durationChanged)) {
    const aEnd = draft.startMin + draft.durationMin;
    const others = [
      ...daySessions.filter(s => s.id !== session.id && (s.status === 'pending' || s.status === 'done')),
      ...dayTests.filter(t => t.id !== session.id),
    ]
      .filter(s => localDateKey(s.scheduled_at) === dayKey)
      .map(s => ({ s, start: localMinutesOf(s.scheduled_at) }))
      .sort((a, b) => a.start - b.start);
    const clash = others.find(({ s, start }) =>
      rangesOverlap(draft.startMin, aEnd, start, start + s.duration_minutes),
    );
    if (clash) {
      errors.start = `Overlaps "${clash.s.title}" at ${formatRange12(clash.start, clash.start + clash.s.duration_minutes)}`;
    }
  }

  const changedFields: SessionEditValidation['changedFields'] = [];
  if (titleChanged) changedFields.push('title');
  if (startChanged) changedFields.push('start');
  if (durationChanged) changedFields.push('duration');
  if (notesChanged) changedFields.push('notes');
  if (channelChanged) changedFields.push('channel');

  return {
    ok: Object.keys(errors).length === 0 && changedFields.length > 0,
    errors,
    changedFields,
    startChanged,
    durationChanged,
  };
}

// ---------- patch (E.3 step 1) ----------

/** PATCH body for study_timetable_sessions. Only changed fields are included. Channel is excluded (saved via setSessionChannel). */
export function buildSessionPatch(session: SessionEditSource, draft: SessionEditDraft): SessionPatch {
  const dayKey = localDateKey(session.scheduled_at);
  const patch: SessionPatch = {};
  const title = draft.title.trim();
  const notes = draft.notes.trim() || null;

  if (title !== session.title.trim()) patch.title = title;
  if (notes !== (session.notes?.trim() || null)) patch.notes = notes;
  if (draft.durationMin !== session.duration_minutes) patch.duration_minutes = draft.durationMin;

  // A new start resets the three sent-flags so server reminders can fire again at the new time.
  if (draft.startMin !== localMinutesOf(session.scheduled_at)) {
    patch.scheduled_at = combineLocal(dayKey, draft.startMin).toISOString();
    patch.reminder_sent_at = null;
    patch.reminder_24h_sent_at = null;
    patch.reminder_1h_sent_at = null;
  }

  return patch;
}

// ---------- save (E.3) ----------

export interface SaveSessionEditResult {
  movedReminder: boolean;
  newStartIso?: string;
  /** Snackbar copy for the screen to show. */
  message: string;
}

/** Copy for a failed save. TypeError is how fetch reports no network. */
export function saveErrorMessage(err: unknown): string {
  if (err instanceof TypeError) return 'No internet. Your changes are kept. Try again.';
  return 'Could not save. Try again.';
}

/**
 * Call after a session's channel was saved as 'call'. Prepares the day-1 call voice on the server, then re-syncs
 * local reminders so the call alarm gets scheduled. Never throws: the channel save has already succeeded.
 */
export async function afterCallChannelSaved(timetableId: string | null | undefined): Promise<void> {
  try {
    const [{ prepareDayOneAudio }, { syncReminders }, { FEATURES }] = await Promise.all([
      import('./timetableReminders'),
      import('./reminders'),
      import('../constants/featureFlags'),
    ]);
    if (!FEATURES.timetableReminders || !timetableId) return;
    const audio = await prepareDayOneAudio(timetableId);
    if (!audio.ok) console.warn('[SessionEdit] day-one call audio not ready', timetableId);
    await syncReminders('mutation');
  } catch (e) {
    console.warn('[SessionEdit] call channel follow-up failed', e);
  }
}

export async function saveSessionEdit(
  session: SessionEditSource,
  draft: SessionEditDraft,
  now: Date = new Date(),
): Promise<SaveSessionEditResult> {
  const patch = buildSessionPatch(session, draft);
  const startChanged = draft.startMin !== localMinutesOf(session.scheduled_at);
  const channelChanged = draft.channel !== (session.reminder_channel ?? null);
  const newStartIso =
    startChanged && patch.scheduled_at ? patch.scheduled_at : null;

  // Loaded here, not at module top, so the pure helpers above stay importable without the Expo and Supabase runtime.
  const [{ patchSession }, { setSessionChannel }, { scheduleStudyReminders }, { syncReminders }, { FEATURES }] =
    await Promise.all([
      import('../hooks/useStudyTimetable'),
      import('./timetableReminders'),
      import('./scheduledNotifications'),
      import('./reminders'),
      import('../constants/featureFlags'),
    ]);

  if (Object.keys(patch).length > 0) {
    await patchSession(session.id, patch);
  }
  if (channelChanged) {
    await setSessionChannel(session.id, draft.channel);
  }

  // The save already succeeded, so reminder refresh failures are logged, not reported as a failed save.
  try {
    await scheduleStudyReminders();
  } catch (e) {
    console.warn('[SessionEdit] scheduleStudyReminders failed', e);
  }
  if (FEATURES.reminders) {
    try {
      // 'session-edit' is not in SyncReason; 'mutation' is the closest existing reason.
      await syncReminders('mutation');
    } catch (e) {
      console.warn('[SessionEdit] syncReminders failed', e);
    }
  }
  if (channelChanged && draft.channel === 'call') {
    await afterCallChannelSaved(session.timetable_id);
  }

  const reminderExists = draft.channel !== 'none';
  const beyondWindow = !!newStartIso && new Date(newStartIso).getTime() - now.getTime() > REMINDER_WINDOW_MS;
  const movedReminder = startChanged && reminderExists && !beyondWindow;

  let message = 'Saved.';
  if (startChanged && reminderExists && beyondWindow) {
    message = 'Saved. No reminder: this session is more than 8 days away. It will be set closer to the day.';
  } else if (movedReminder) {
    message = `Saved. Reminder moved to ${formatClock12(draft.startMin)}`;
  }

  return { movedReminder, newStartIso: newStartIso ?? undefined, message };
}
