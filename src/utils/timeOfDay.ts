// Pure helpers for picking any minute of the day (00:00 to 23:59). No React Native imports so jest can run them in node.
// Times are minutes after local midnight (0..1439) in code, and 'HH:MM' 24-hour strings at the storage boundary.
// Spec: _scratch/timetable-ui-fix-plan.md D.1.

export type Clock = '12h' | '24h';
export type Period = 'AM' | 'PM';

export const MINUTES_PER_DAY = 24 * 60;

const STRICT_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DIGITS = /^\d{1,2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Strict 'HH:MM' parser. Returns minutes after midnight (0..1439), or null for anything else. */
export function parseHHMM(s: string): number | null {
  if (typeof s !== 'string') return null;
  const m = STRICT_HHMM.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes to zero-padded 'HH:MM'. Values outside 0..1439 are clamped. */
export function toHHMM(min: number): string {
  const clamped = Math.min(Math.max(Math.round(min), 0), MINUTES_PER_DAY - 1);
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

/** Minutes to a label: '7:07 AM' in 12h mode, '07:07' in 24h mode. */
export function formatTime(min: number, clock: Clock): string {
  const clamped = Math.min(Math.max(Math.round(min), 0), MINUTES_PER_DAY - 1);
  if (clock === '24h') return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
  const { hour12, minute, period } = to12(clamped);
  return `${hour12}:${pad2(minute)} ${period}`;
}

/** Minutes to 12-hour parts. 0 is 12 AM, 720 is 12 PM. */
export function to12(min: number): { hour12: number; minute: number; period: Period } {
  const h = Math.floor(min / 60);
  return {
    hour12: h % 12 === 0 ? 12 : h % 12,
    minute: min % 60,
    period: h < 12 ? 'AM' : 'PM',
  };
}

/** 12-hour parts to minutes. 12 AM is 0, 12 PM is 720. */
export function from12(hour12: number, minute: number, period: Period): number {
  const h = (hour12 % 12) + (period === 'PM' ? 12 : 0);
  return h * 60 + minute;
}

/** Adds minutes and wraps inside the day: 23:59 + 1 is 00:00. */
export function stepMinute(min: number, delta: number): number {
  return (((min + delta) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Adds whole hours and wraps inside the day. */
export function stepHour(min: number, delta: number): number {
  return stepMinute(min, delta * 60);
}

/**
 * Turns typed hour and minute text into minutes. Digits only.
 * 12h: hour 1 to 12 plus AM or PM. 24h: hour 0 to 23. Minute 0 to 59 in both.
 * Returns the minutes, or a short reason string the sheet can show.
 */
export function parseTyped(
  hourText: string,
  minuteText: string,
  clock: Clock,
  period: Period = 'AM',
): number | string {
  const h = hourText.trim();
  const m = minuteText.trim();
  if (h === '') return 'Type an hour';
  if (m === '') return 'Type the minutes';
  if (!DIGITS.test(h)) return 'Hours are numbers only';
  if (!DIGITS.test(m)) return 'Minutes are numbers only';
  const hour = Number(h);
  const minute = Number(m);
  if (minute > 59) return 'Minutes go from 00 to 59';
  if (clock === '12h') {
    if (hour < 1 || hour > 12) return 'Hours go from 1 to 12';
    return from12(hour, minute, period);
  }
  if (hour > 23) return 'Hours go from 0 to 23';
  return hour * 60 + minute;
}

/** Combines a 'YYYY-MM-DD' local day with minutes after midnight, as a local Date. */
export function combineLocal(dateYmd: string, min: number): Date {
  const [y, mo, d] = dateYmd.split('-').map(Number);
  return new Date(y, mo - 1, d, Math.floor(min / 60), min % 60, 0, 0);
}

/** Local minutes after midnight for an ISO timestamp. */
export function localMinutesOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** True when two ranges share time. Touching edges (ending at 480 and starting at 480) do not overlap. */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
