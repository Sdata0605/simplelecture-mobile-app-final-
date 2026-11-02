// Pure helpers for calendar day markers. No React Native imports.
import { colors } from '../constants/theme';
import { localDateKey } from './calendar';

/** Session counts for one local day (from study_timetable_sessions). */
export interface SessionDayMarkers {
  pending: number;
  done: number;
  skipped: number;
  tests: number;
}

/** Reminders-calendar variant: one colour per reminder kind present that day. */
export interface ColourDayMarkers {
  colours: string[];
}

export type DayMarkers = SessionDayMarkers | ColourDayMarkers;

export const MAX_DOTS = 3;

function isColourMarkers(m: DayMarkers): m is ColourDayMarkers {
  return 'colours' in m;
}

/**
 * Dot colours under a day number, at most 3.
 * Order: pending, done, skipped, then test (amber). When a test is present it
 * always keeps the last slot, so a test is never hidden.
 */
export function markerDots(m: DayMarkers, _selected?: boolean): string[] {
  if (isColourMarkers(m)) return m.colours.slice(0, MAX_DOTS);
  const present: string[] = [];
  if (m.pending > 0) present.push(colors.primary);
  if (m.done > 0) present.push(colors.success);
  if (m.skipped > 0) present.push(colors.gray300);
  if (m.tests > 0) {
    if (present.length >= MAX_DOTS) present.length = MAX_DOTS - 1;
    present.push(colors.warning);
  }
  return present.slice(0, MAX_DOTS);
}

/** Screen-reader text for a day, e.g. "3 sessions, 1 test" or "no sessions". */
export function markerA11y(m: DayMarkers | undefined): string {
  if (!m) return 'no sessions';
  if (isColourMarkers(m)) {
    const n = m.colours.length;
    return n === 0 ? 'no reminders' : `${n} reminder${n === 1 ? '' : 's'}`;
  }
  const sessions = m.pending + m.done + m.skipped;
  const parts: string[] = [];
  if (sessions > 0) parts.push(`${sessions} session${sessions === 1 ? '' : 's'}`);
  if (m.tests > 0) parts.push(`${m.tests} test${m.tests === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(', ') : 'no sessions';
}

interface SessionLike {
  scheduled_at: string;
  status: string;
}

/** Counts sessions and tests per local day, keyed 'YYYY-MM-DD'. Unknown statuses are ignored. */
export function buildSessionMarkers(
  sessions: SessionLike[],
  tests: { scheduled_at: string }[],
): Record<string, SessionDayMarkers> {
  const out: Record<string, SessionDayMarkers> = {};
  const ensure = (key: string): SessionDayMarkers => {
    if (!out[key]) out[key] = { pending: 0, done: 0, skipped: 0, tests: 0 };
    return out[key];
  };
  for (const s of sessions) {
    if (s.status !== 'pending' && s.status !== 'done' && s.status !== 'skipped') continue;
    const m = ensure(localDateKey(s.scheduled_at));
    m[s.status] += 1;
  }
  for (const t of tests) {
    ensure(localDateKey(t.scheduled_at)).tests += 1;
  }
  return out;
}
