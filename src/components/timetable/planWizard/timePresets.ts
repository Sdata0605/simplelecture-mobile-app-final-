// Pure helpers for the study-time step of the plan wizard. No React Native imports (jest runs in node).
// Times are 'HH:MM' 24-hour strings internally, which is the contract the study-timetable-ai edge function expects.
// Spec: _scratch/timetable-ux-plan.md D.4 and H.1.

export type WindowKey = 'morning' | 'afternoon' | 'evening';
export const WINDOW_KEYS: readonly WindowKey[] = ['morning', 'afternoon', 'evening'];
export const WINDOW_LABEL: Record<WindowKey, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export type WeekendMode = 'same' | 'different' | 'rest';

export interface TimeWindow {
  enabled: boolean;
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  presetId: string | null;
}

export type DayWindows = Record<WindowKey, TimeWindow>;

export interface TimePreset {
  id: string;
  start: string;
  end: string;
}

export const PRESETS: Record<WindowKey, readonly TimePreset[]> = {
  morning: [
    { id: 'm-6-8', start: '06:00', end: '08:00' },
    { id: 'm-7-9', start: '07:00', end: '09:00' },
    { id: 'm-8-10', start: '08:00', end: '10:00' },
  ],
  afternoon: [
    { id: 'a-13-15', start: '13:00', end: '15:00' },
    { id: 'a-14-16', start: '14:00', end: '16:00' },
    { id: 'a-15-17', start: '15:00', end: '17:00' },
  ],
  evening: [
    { id: 'e-17-19', start: '17:00', end: '19:00' },
    { id: 'e-19-21', start: '19:00', end: '21:00' },
    { id: 'e-20-22', start: '20:00', end: '22:00' },
  ],
};

export const MIN_WINDOW_MINUTES = 30;
const LAST_MINUTE = 23 * 60 + 45; // 23:45, the latest time the pickers can give

export const WEEKDAY_DEFAULT: DayWindows = {
  morning: { enabled: true, start: '07:00', end: '09:00', presetId: 'm-7-9' },
  afternoon: { enabled: false, start: '14:00', end: '16:00', presetId: 'a-14-16' },
  evening: { enabled: true, start: '19:00', end: '21:00', presetId: 'e-19-21' },
};

export const WEEKEND_DEFAULT: DayWindows = {
  morning: { enabled: true, start: '09:00', end: '11:00', presetId: null },
  afternoon: { enabled: true, start: '15:00', end: '17:00', presetId: 'a-15-17' },
  evening: { enabled: false, start: '20:00', end: '22:00', presetId: 'e-20-22' },
};

const CANONICAL_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const LOOSE_RE = /^(\d{1,2}):(\d{2})$/;

/** Builds the zero-padded 'HH:MM' string from hour and minute numbers. */
export function timeKeyFromParts(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Accepts a typed or picked value such as '7:00' or '07:00' and returns the canonical 'HH:MM'.
 * Returns null for anything that is not a real clock time ('24:00', '12:60', '', 'ab:cd', '7 am').
 */
export function normalizeTime(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const m = LOOSE_RE.exec(raw.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return timeKeyFromParts(hour, minute);
}

/** Strict parser for canonical 'HH:MM' only. Returns minutes after midnight, or null. */
export function toMinutes(time: string): number | null {
  if (typeof time !== 'string' || !CANONICAL_RE.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const clamped = Math.min(Math.max(Math.round(total), 0), LAST_MINUTE);
  return timeKeyFromParts(Math.floor(clamped / 60), clamped % 60);
}

/** Rounds minutes to the nearest 15 and keeps the result inside 00:00 to 23:45. */
export function roundToQuarter(total: number): number {
  const r = Math.round(total / 15) * 15;
  return Math.min(Math.max(r, 0), LAST_MINUTE);
}

export function presetIdFor(key: WindowKey, start: string, end: string): string | null {
  const hit = PRESETS[key].find(p => p.start === start && p.end === end);
  return hit ? hit.id : null;
}

/** Returns a one-line error for a single window, or null when it is valid. */
export function validateWindow(start: string, end: string): string | null {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null) return 'Pick a valid time';
  if (e <= s) return 'End time must be after start time';
  if (e - s < MIN_WINDOW_MINUTES) return 'Make it at least 30 minutes';
  return null;
}

/**
 * Per-window errors for one day. Only enabled windows are checked. Two enabled windows that
 * overlap get an overlap message on both. Touching edges (10:00 and 10:00) are allowed.
 */
export function validateDay(day: DayWindows): Record<WindowKey, string | null> {
  const out: Record<WindowKey, string | null> = { morning: null, afternoon: null, evening: null };
  for (const k of WINDOW_KEYS) {
    const w = day[k];
    if (w.enabled) out[k] = validateWindow(w.start, w.end);
  }
  for (let i = 0; i < WINDOW_KEYS.length; i++) {
    for (let j = i + 1; j < WINDOW_KEYS.length; j++) {
      const a = WINDOW_KEYS[i];
      const b = WINDOW_KEYS[j];
      const wa = day[a];
      const wb = day[b];
      if (!wa.enabled || !wb.enabled || out[a] || out[b]) continue;
      const aS = toMinutes(wa.start) as number;
      const aE = toMinutes(wa.end) as number;
      const bS = toMinutes(wb.start) as number;
      const bE = toMinutes(wb.end) as number;
      if (aS < bE && bS < aE) {
        out[a] = `Overlaps with your ${WINDOW_LABEL[b]} time`;
        out[b] = `Overlaps with your ${WINDOW_LABEL[a]} time`;
      }
    }
  }
  return out;
}

/** Minutes for one enabled, valid window. 0 otherwise. */
export function windowMinutes(w: TimeWindow): number {
  if (!w.enabled || validateWindow(w.start, w.end) !== null) return 0;
  return (toMinutes(w.end) as number) - (toMinutes(w.start) as number);
}

/** Total study minutes for one day (only enabled, valid windows count). */
export function dayMinutes(day: DayWindows): number {
  return WINDOW_KEYS.reduce((sum, k) => sum + windowMinutes(day[k]), 0);
}

/** Weekly study minutes: 5 weekdays, plus the weekend according to the chosen mode. */
export function weeklyMinutes(p: {
  weekday: DayWindows;
  weekendMode: WeekendMode;
  saturday: DayWindows;
  sunday: DayWindows;
}): number {
  const weekday = dayMinutes(p.weekday);
  let weekend = 0;
  if (p.weekendMode === 'same') weekend = weekday * 2;
  else if (p.weekendMode === 'different') weekend = dayMinutes(p.saturday) + dayMinutes(p.sunday);
  return weekday * 5 + weekend;
}

/** True when at least one weekday window is enabled and valid. */
export function hasWeekdayStudyTime(day: DayWindows): boolean {
  const errors = validateDay(day);
  return WINDOW_KEYS.some(k => day[k].enabled && errors[k] === null);
}

/** 'HH:MM' to a 12-hour label, for example '07:00' to '7:00 AM'. Returns null for invalid input. */
export function format12(time: string): string | null {
  const t = toMinutes(time);
  if (t === null) return null;
  const h = Math.floor(t / 60);
  const m = t % 60;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Compact range label for chips. '07:00','09:00' gives '7–9 AM'. '12:00','14:00' gives '12–2 PM'.
 * '11:30','13:00' gives '11:30 AM–1 PM'.
 */
export function formatRange12(start: string, end: string): string | null {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null) return null;
  const parts = (t: number) => {
    const h = Math.floor(t / 60);
    const m = t % 60;
    return {
      h12: h % 12 === 0 ? 12 : h % 12,
      mm: m === 0 ? '' : `:${String(m).padStart(2, '0')}`,
      suffix: h < 12 ? 'AM' : 'PM',
    };
  };
  const ps = parts(s);
  const pe = parts(e);
  if (ps.suffix === pe.suffix) {
    return `${ps.h12}${ps.mm}–${pe.h12}${pe.mm} ${pe.suffix}`;
  }
  return `${ps.h12}${ps.mm} ${ps.suffix}–${pe.h12}${pe.mm} ${pe.suffix}`;
}

/** Hours for summaries: 240 gives '4 h', 90 gives '1.5 h'. */
export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`;
}

/**
 * If a From time was just set and it is not before To, move To to From + 1 hour (capped at 23:45).
 * If that is still not possible (From is 23:45), From becomes 23:30 and To becomes 23:45.
 */
export function keepRangeValid(start: string, end: string): { start: string; end: string } {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null || e > s) return { start, end };
  const newEnd = Math.min(s + 60, LAST_MINUTE);
  if (newEnd > s) return { start, end: minutesToTime(newEnd) };
  return { start: minutesToTime(LAST_MINUTE - 15), end: minutesToTime(LAST_MINUTE) };
}

/**
 * Edge-function day plan. Enabled, valid windows only, in morning, afternoon, evening order.
 * The evening window is sent as label 'night' so the edge function is unchanged.
 */
export function toDayPlan(day: DayWindows): { intervals: { label: string; start: string; end: string }[] } {
  const intervals: { label: string; start: string; end: string }[] = [];
  for (const k of WINDOW_KEYS) {
    const w = day[k];
    if (!w.enabled || validateWindow(w.start, w.end) !== null) continue;
    intervals.push({ label: k === 'evening' ? 'night' : k, start: w.start, end: w.end });
  }
  return { intervals };
}
