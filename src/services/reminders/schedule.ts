// Pure scheduling core for Reminders v2. Spec: _scratch/reminders-v2-plan.md sections D.1 to D.3.
// Every function takes "now" explicitly. No React Native imports, so it is unit-tested with jest.

import {
  CHANNELS,
  LIMITS,
  REMINDER_NOTIF_PREFIX,
  type Reminder,
  type ReminderInput,
  type ReminderKind,
  type ReminderMode,
  type ReminderSection,
} from '../../types/reminder';
import { spokenScript } from './spokenScript';

// Shape of a row as written to the database (before the server adds audio and timestamps).
export type ReminderDraft = Omit<Reminder, 'user_id' | 'created_at' | 'updated_at'>;

// Expo trigger inputs (SchedulableTriggerInputTypes.DAILY = 'daily', DATE = 'date').
export type ReminderTrigger =
  | { type: 'daily'; hour: number; minute: number; channelId: string }
  | { type: 'date'; date: Date; channelId: string };

export interface PlannedRequest {
  id: string;
  identifier: string;          // `reminder-${id}`
  kind: ReminderKind;
  trigger: ReminderTrigger;
  fp: string;
  nextFire: Date;
}

export interface SchedulePlan {
  scheduled: PlannedRequest[];
  queued: string[];
}

export interface ValidationError {
  field: 'text' | 'date' | 'time' | 'daily';
  message: string;
}

const DAILY_RULES: ReadonlyArray<string> = ['daily', 'weekdays', 'weekly'];
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const FALLBACK_TZ = 'Asia/Kolkata';

function isDailyRule(rule: string): boolean {
  return DAILY_RULES.includes(rule);
}

/** Parses 'HH:MM' or 'HH:MM:SS' (PostgREST). Returns null when invalid. */
export function parseTime(value: string | null | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const m = TIME_RE.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = m[3] === undefined ? 0 : Number(m[3]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute };
}

/** Code-point count, which is what the user sees (an emoji counts as 1). */
function codePointLength(text: string): number {
  return Array.from(text).length;
}

/** First line of the (already trimmed) text, cut to LIMITS.titleMax UTF-16 units on a code-point boundary. */
function titleOf(text: string): string {
  const firstLine = text.split(/\r?\n/)[0].trim();
  let out = '';
  let units = 0;
  for (const ch of firstLine) {
    if (units + ch.length > LIMITS.titleMax) break;
    out += ch;
    units += ch.length;
  }
  return out;
}

/** 12-hour label, for example (6, 0) -> "6:00 AM", (21, 30) -> "9:30 PM". */
export function formatTime12(hour: number, minute: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/**
 * Local Date for 'YYYY-MM-DD' plus 'HH:MM'. JS normalises a non-existent DST time
 * (for example 02:30 on a spring-forward day becomes 03:30). Returns null when the input is invalid.
 */
export function localDateTime(dateKey: string, time: string): Date | null {
  const t = parseTime(time);
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!t || !dm) return null;
  const year = Number(dm[1]);
  const month = Number(dm[2]);
  const day = Number(dm[3]);
  const d = new Date(year, month - 1, day, t.hour, t.minute, 0, 0);
  // JS maps years 0-99 to 1900-1999 in the constructor; set the year explicitly.
  if (year < 100) d.setFullYear(year, month - 1, day);
  // Reject dates that JS would roll over (for example month 13 or 2026-02-31).
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

/** Device IANA zone, falling back to Asia/Kolkata. */
export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || FALLBACK_TZ;
  } catch {
    return FALLBACK_TZ;
  }
}

function withTime(day: Date, hour: number, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Next wall-clock occurrence of hour:minute strictly more than 5 s after now. */
function nextDailyFire(hour: number, minute: number, now: Date): Date {
  let c = withTime(now, hour, minute);
  if (c.getTime() <= now.getTime() + 5_000) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    c = withTime(tomorrow, hour, minute);
  }
  return c;
}

/**
 * "Today only" fire time: today at the chosen time if it is more than 60 s away, else tomorrow.
 */
function todayOnlyFire(time: string, now: Date): Date | null {
  const t = parseTime(time);
  if (!t) return null;
  const today = withTime(now, t.hour, t.minute);
  if (today.getTime() > now.getTime() + LIMITS.minLeadMs) return today;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return withTime(tomorrow, t.hour, t.minute);
}

/** Label for the Today-only mode: "Tomorrow only" once the chosen time has passed. */
export function todayOnlyLabel(time: string, now: Date): 'Today only' | 'Tomorrow only' {
  const t = parseTime(time);
  if (!t) return 'Today only';
  const today = withTime(now, t.hour, t.minute);
  return today.getTime() > now.getTime() + LIMITS.minLeadMs ? 'Today only' : 'Tomorrow only';
}

/** Maps a stored row to the UI mode. Legacy weekdays and weekly rows count as daily. */
export function rowToMode(r: Pick<Reminder, 'section' | 'repeat_rule'>): ReminderMode {
  if (isDailyRule(r.repeat_rule)) return 'daily';
  return r.section === 'daily' ? 'today_only' : 'once';
}

/**
 * Next time this reminder should ring, or null when it will not ring.
 * Daily: next wall-clock occurrence (5 s rule). One-off: the stored instant, if still in the future.
 */
export function nextFire(
  r: Pick<Reminder, 'status' | 'enabled' | 'repeat_rule' | 'time_of_day' | 'scheduled_at'>,
  now: Date,
): Date | null {
  if (r.status === 'cancelled' || !r.enabled) return null;
  if (isDailyRule(r.repeat_rule)) {
    let t = parseTime(r.time_of_day);
    if (!t) {
      const stored = new Date(r.scheduled_at);
      if (Number.isNaN(stored.getTime())) return null;
      t = { hour: stored.getHours(), minute: stored.getMinutes() };
    }
    return nextDailyFire(t.hour, t.minute, now);
  }
  if (r.status !== 'scheduled') return null;
  const t = Date.parse(r.scheduled_at);
  if (Number.isNaN(t)) return null;
  return t > now.getTime() ? new Date(t) : null;
}

/**
 * Trigger for the OS request. Daily uses a repeating DAILY trigger (one slot for every day).
 * One-off uses a DATE trigger at the stored instant. Returns null when the row cannot be scheduled.
 */
export function buildTrigger(
  r: Pick<Reminder, 'kind' | 'repeat_rule' | 'time_of_day' | 'scheduled_at'> & Partial<Pick<Reminder, 'status'>>,
): ReminderTrigger | null {
  // inputToRow marks a row with no valid time as cancelled, so it never gets an OS slot.
  if (r.status === 'cancelled') return null;
  const channelId = CHANNELS[r.kind];
  if (isDailyRule(r.repeat_rule)) {
    let t = parseTime(r.time_of_day);
    if (!t) {
      const stored = new Date(r.scheduled_at);
      if (Number.isNaN(stored.getTime())) return null;
      t = { hour: stored.getHours(), minute: stored.getMinutes() };
    }
    return { type: 'daily', hour: t.hour, minute: t.minute, channelId };
  }
  const date = new Date(r.scheduled_at);
  if (Number.isNaN(date.getTime())) return null;
  return { type: 'date', date, channelId };
}

/** djb2 over kind|text|language|voice|trigger|enabled. Stored in content.data.fp. */
export function fingerprint(
  r: Pick<Reminder, 'kind' | 'message_text' | 'language' | 'voice' | 'enabled'>,
  trigger: ReminderTrigger,
): string {
  const source = [r.kind, r.message_text, r.language, r.voice, JSON.stringify(trigger), String(r.enabled)].join('|');
  let hash = 5381;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Budget planner. Every enabled daily reminder is always scheduled. One-offs fill the
 * remaining slots soonest first; the rest are queued.
 */
export function planSchedule(
  reminders: ReadonlyArray<Reminder>,
  now: Date,
  budget: number = LIMITS.budget,
): SchedulePlan {
  const dailies: PlannedRequest[] = [];
  const oneOffs: PlannedRequest[] = [];

  for (const r of reminders) {
    const fire = nextFire(r, now);
    if (!fire) continue;
    const trigger = buildTrigger(r);
    if (!trigger) continue;
    const planned: PlannedRequest = {
      id: r.id,
      identifier: `${REMINDER_NOTIF_PREFIX}${r.id}`,
      kind: r.kind,
      trigger,
      fp: fingerprint(r, trigger),
      nextFire: fire,
    };
    if (isDailyRule(r.repeat_rule)) dailies.push(planned);
    else oneOffs.push(planned);
  }

  oneOffs.sort((a, b) => a.nextFire.getTime() - b.nextFire.getTime() || a.id.localeCompare(b.id));
  const remaining = Math.max(0, budget - dailies.length);
  const scheduledOneOffs = oneOffs.slice(0, remaining);
  const queued = oneOffs.slice(remaining).map(p => p.id);

  return { scheduled: [...dailies, ...scheduledOneOffs], queued };
}

/**
 * Save-time validation. existingDailyCount is the number of OTHER enabled daily reminders
 * (exclude the one being edited). Returns null when the input is valid.
 */
export function validateInput(
  input: ReminderInput,
  now: Date,
  existingDailyCount: number,
): ValidationError | null {
  const text = input.text.trim();
  if (text.length === 0) return { field: 'text', message: 'Write what you want to be reminded about.' };
  if (codePointLength(text) > LIMITS.textMax) return { field: 'text', message: `Keep it under ${LIMITS.textMax} characters.` };
  if (input.kind === 'call' && spokenScript(text, input.language).length === 0) {
    return { field: 'text', message: 'Add some words so the voice can read it.' };
  }

  if (!parseTime(input.time)) return { field: 'time', message: 'Pick a time.' };

  if (input.mode === 'once') {
    const at = input.date ? localDateTime(input.date, input.time) : null;
    if (!at) return { field: 'date', message: 'Pick a date.' };
    if (at.getTime() <= now.getTime() + LIMITS.minLeadMs) {
      return { field: 'time', message: 'That time has passed. Pick a later time.' };
    }
    return null;
  }

  if (input.mode === 'daily' && existingDailyCount >= LIMITS.dailyMax) {
    return {
      field: 'daily',
      message: `You can have up to ${LIMITS.dailyMax} daily reminders. Turn one off or delete one first.`,
    };
  }

  // today_only never errors: it switches to tomorrow (see todayOnlyLabel).
  return null;
}

/**
 * UI input to database row. The caller supplies the id (input.id when editing, or a fresh UUID).
 * scheduled_at is the fire instant for one-offs, and the next daily fire (informational) for daily.
 */
export function inputToRow(
  input: ReminderInput,
  id: string,
  now: Date,
  tz: string = deviceTimeZone(),
): ReminderDraft {
  const text = input.text.trim();
  const title = titleOf(text);

  let section: ReminderSection;
  let repeat: 'none' | 'daily';
  let scheduledAt: Date | null;
  let timeOfDay: string | null = null;

  if (input.mode === 'once') {
    section = 'calendar';
    repeat = 'none';
    scheduledAt = input.date ? localDateTime(input.date, input.time) : null;
  } else if (input.mode === 'today_only') {
    section = 'daily';
    repeat = 'none';
    scheduledAt = todayOnlyFire(input.time, now);
  } else {
    section = 'daily';
    repeat = 'daily';
    const t = parseTime(input.time);
    if (t) {
      timeOfDay = `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
      scheduledAt = nextDailyFire(t.hour, t.minute, now);
    } else {
      scheduledAt = null;
    }
  }

  // No valid time or date: the row is stored as cancelled so it never gets an OS trigger.
  const unschedulable = scheduledAt === null;

  return {
    id,
    title,
    message_text: text,
    scheduled_at: (scheduledAt ?? now).toISOString(),
    repeat_rule: repeat,
    kind: input.kind,
    section,
    time_of_day: timeOfDay,
    tz,
    enabled: true,
    call_enabled: input.kind === 'call',
    voice: input.voice,
    language: input.language,
    audio_path: null,
    audio_hash: null,
    audio_status: 'none',
    status: unschedulable ? 'cancelled' : 'scheduled',
    last_fired_at: null,
  };
}
