// Pure state machine for the full-screen study plan creator (WP1).
// No React Native imports: this file is safe to unit-test under jest's node env.
// Contract: _scratch/timetable-ux-plan.md section E.4.

import type { ReminderChannel } from '../../../types/reminder';

export type StepId = 'scope' | 'dates' | 'times' | 'reminder' | 'review';
export type ScopeMode = 'course' | 'subjects' | 'chapter' | 'topic';
/** 'none' = the student turned reminders off. Until the DB migration is applied the
 *  client falls back to null (see WP4). Kept here so WP1 can type the step. */
export type ReminderChoice = ReminderChannel | 'none';
export type WeekendMode = 'same' | 'different' | 'rest';
export type PatternId = 'sequential' | 'pair' | 'mixed';
export type FeasibilityState = 'ok' | 'generous' | 'too_short' | null;

export interface TimeWindow { enabled: boolean; start: string; end: string; presetId: string | null } // 'HH:MM' 24h
export interface DayWindows { morning: TimeWindow; afternoon: TimeWindow; evening: TimeWindow }

export interface PlanItem {
  id: string;
  title: string;
  durationMinutes: number;
  subject_id: string;
  chapter_id: string;
  topic_id: string;
}

export interface WizardState {
  stepIndex: number; steps: StepId[];
  courseId: string | null; courseName: string;
  scopeMode: ScopeMode; subjectIds: string[]; allSubjectIds: string[];
  chapterId: string | null; topicId: string | null;
  startDate: string; deadline: string;              // 'YYYY-MM-DD' local
  weekday: DayWindows; weekendMode: WeekendMode; saturday: DayWindows; sunday: DayWindows;
  reminder: ReminderChoice | null;                   // null = not chosen yet; the reminder step is compulsory
  pattern: PatternId; feedbackMessage: string;
  returnToReview: boolean; dirty: boolean;
  status: 'editing' | 'saving' | 'saved' | 'error'; error: string | null;
}

export type WizardAction =
  | { type: 'next' } | { type: 'back' } | { type: 'goto'; step: StepId }
  | { type: 'setScopeMode'; mode: ScopeMode } | { type: 'toggleSubject'; id: string }
  | { type: 'setSubjects'; ids: string[] } | { type: 'setAllSubjects'; ids: string[] }
  | { type: 'setChapter'; id: string | null } | { type: 'setTopic'; id: string | null }
  | { type: 'setStart'; date: string } | { type: 'setDeadline'; date: string }
  | { type: 'setWindow'; day: 'weekday' | 'saturday' | 'sunday'; key: keyof DayWindows; patch: Partial<TimeWindow> }
  | { type: 'setWeekendMode'; mode: WeekendMode } | { type: 'setReminder'; value: ReminderChoice }
  | { type: 'setPattern'; value: PatternId } | { type: 'setFeedback'; text: string }
  | { type: 'saveStart' } | { type: 'saveOk' } | { type: 'saveFail'; error: string } | { type: 'reset' };

export interface StepCheck { ok: boolean; reason: string | null }
export interface StepContext {
  contentItems: number;
  contentLoading: boolean;
  feasibility: FeasibilityState;
  /** 'YYYY-MM-DD'. Defaults to the device's local today. */
  today?: string;
}

// ─── constants ───────────────────────────────────────────────────────────────

export const STEP_TITLE: Record<StepId, string> = {
  scope: 'What to study',
  dates: 'Dates',
  times: 'Study times',
  reminder: 'Reminders',
  review: 'Review',
};

export const REMINDER_LABEL: Record<ReminderChoice, string> = {
  call: 'Call',
  message: 'Message',
  notification: 'Notification',
  email: 'Email',
  none: 'No reminders',
};

/** Presets from the plan (D.4). Evening replaces the old "night" name in the UI only. */
const WEEKDAY_DEFAULT: DayWindows = {
  morning:   { enabled: true,  start: '07:00', end: '09:00', presetId: 'm-7-9' },
  afternoon: { enabled: false, start: '14:00', end: '16:00', presetId: 'a-14-16' },
  evening:   { enabled: true,  start: '19:00', end: '21:00', presetId: 'e-19-21' },
};
const WEEKEND_DEFAULT: DayWindows = {
  morning:   { enabled: true,  start: '09:00', end: '11:00', presetId: null },
  afternoon: { enabled: true,  start: '15:00', end: '17:00', presetId: null },
  evening:   { enabled: false, start: '20:00', end: '22:00', presetId: null },
};

const DAY_KEYS: (keyof DayWindows)[] = ['morning', 'afternoon', 'evening'];
const WINDOW_NAME: Record<keyof DayWindows, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
/** Edge function labels: evening is sent as 'night' (study-timetable-ai is unchanged). */
const EDGE_LABEL: Record<keyof DayWindows, string> = { morning: 'morning', afternoon: 'afternoon', evening: 'night' };

const MIN_WINDOW_MINUTES = 30;

function cloneDay(d: DayWindows): DayWindows {
  return { morning: { ...d.morning }, afternoon: { ...d.afternoon }, evening: { ...d.evening } };
}

// ─── dates (local, 'YYYY-MM-DD') ─────────────────────────────────────────────

export function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDaysYmd(s: string, n: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return formatYmd(d);
}

/** Calendar-month add. Clamps the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsYmd(s: string, n: number): string {
  const base = parseYmd(s);
  const day = base.getDate();
  const target = new Date(base.getFullYear(), base.getMonth() + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return formatYmd(target);
}

/** Whole days from a to b (b - a). */
export function daysBetweenYmd(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000);
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon 3 Nov" */
export function formatDayShort(s: string): string {
  const d = parseYmd(s);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
}

/** "3 Nov" */
export function formatDayMonth(s: string): string {
  const d = parseYmd(s);
  return `${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
}

// ─── time helpers ────────────────────────────────────────────────────────────

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Strict 'HH:MM' parser. Rejects '7:00', '24:00', '', etc. Returns minutes or null. */
export function toMinutesStrict(hhmm: string): number | null {
  const m = HHMM.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Human message for a bad window, or null when it is fine (or disabled). */
export function windowProblem(w: TimeWindow): string | null {
  if (!w.enabled) return null;
  const a = toMinutesStrict(w.start);
  const b = toMinutesStrict(w.end);
  if (a === null || b === null) return 'Pick a start and end time';
  if (b <= a) return 'End time must be after start time';
  if (b - a < MIN_WINDOW_MINUTES) return 'Make it at least 30 minutes';
  return null;
}

export function dayMinutes(d: DayWindows): number {
  return DAY_KEYS.reduce((sum, k) => {
    const w = d[k];
    if (!w.enabled || windowProblem(w) !== null) return sum;
    return sum + ((toMinutesStrict(w.end) ?? 0) - (toMinutesStrict(w.start) ?? 0));
  }, 0);
}

/** Saturday and Sunday as they will be saved (rest = empty, same = weekdays). */
export function effectiveWeekend(s: Pick<WizardState, 'weekendMode' | 'weekday' | 'saturday' | 'sunday'>): { saturday: DayWindows; sunday: DayWindows } {
  if (s.weekendMode === 'same') return { saturday: s.weekday, sunday: s.weekday };
  if (s.weekendMode === 'rest') {
    const none: DayWindows = {
      morning: { ...WEEKEND_DEFAULT.morning, enabled: false },
      afternoon: { ...WEEKEND_DEFAULT.afternoon, enabled: false },
      evening: { ...WEEKEND_DEFAULT.evening, enabled: false },
    };
    return { saturday: none, sunday: none };
  }
  return { saturday: s.saturday, sunday: s.sunday };
}

/** Study minutes in a normal week (5 weekdays + weekend as effective). */
export function weeklyMinutes(s: WizardState): number {
  const we = effectiveWeekend(s);
  return dayMinutes(s.weekday) * 5 + dayMinutes(we.saturday) + dayMinutes(we.sunday);
}

/** Same rounding as the old wizard: at least 1 h a day. */
export function estimateDailyHours(s: WizardState): number {
  return Math.round((weeklyMinutes(s) / 7) / 60) || 1;
}

/** "2 h", "1 h 30m", "45m" */
export function formatMinutesLabel(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h > 0 && m > 0) return `${h} h ${m}m`;
  if (h > 0) return `${h} h`;
  return `${m}m`;
}

// ─── state construction ─────────────────────────────────────────────────────

export function buildSteps(remindersOn: boolean): StepId[] {
  return remindersOn
    ? ['scope', 'dates', 'times', 'reminder', 'review']
    : ['scope', 'dates', 'times', 'review'];
}

export function initialState(p: { courseId: string | null; courseName: string; remindersOn: boolean; today: Date }): WizardState {
  return {
    stepIndex: 0,
    steps: buildSteps(p.remindersOn),
    courseId: p.courseId,
    courseName: p.courseName,
    scopeMode: 'course',
    subjectIds: [],
    allSubjectIds: [],
    chapterId: null,
    topicId: null,
    startDate: formatYmd(p.today),
    deadline: addDaysYmd(formatYmd(p.today), 30),
    weekday: cloneDay(WEEKDAY_DEFAULT),
    weekendMode: 'same',
    saturday: cloneDay(WEEKEND_DEFAULT),
    sunday: cloneDay(WEEKEND_DEFAULT),
    reminder: null,
    pattern: 'sequential',
    feedbackMessage: '',
    returnToReview: false,
    dirty: false,
    status: 'editing',
    error: null,
  };
}

// ─── validation ─────────────────────────────────────────────────────────────

const OK: StepCheck = { ok: true, reason: null };
const fail = (reason: string): StepCheck => ({ ok: false, reason });

/** Message for the first pair of enabled windows that overlap (touching edges are fine). */
export function overlapProblem(d: DayWindows): string | null {
  for (let i = 0; i < DAY_KEYS.length; i++) {
    for (let j = i + 1; j < DAY_KEYS.length; j++) {
      const a = d[DAY_KEYS[i]];
      const b = d[DAY_KEYS[j]];
      if (!a.enabled || !b.enabled || windowProblem(a) !== null || windowProblem(b) !== null) continue;
      const aStart = toMinutesStrict(a.start) ?? 0;
      const aEnd = toMinutesStrict(a.end) ?? 0;
      const bStart = toMinutesStrict(b.start) ?? 0;
      const bEnd = toMinutesStrict(b.end) ?? 0;
      if (aStart < bEnd && bStart < aEnd) {
        return `Overlaps with your ${WINDOW_NAME[DAY_KEYS[j]]} time`;
      }
    }
  }
  return null;
}

/** Checks for one day's windows: problems with each enabled window, then overlaps. */
function dayProblem(d: DayWindows): string | null {
  for (const k of DAY_KEYS) {
    const p = windowProblem(d[k]);
    if (p) return p;
  }
  return overlapProblem(d);
}

/**
 * Validates one step. The reducer uses the same checks for `next` (with no content or
 * feasibility context), so a step that is invalid for state reasons never advances.
 */
export function validateStep(s: WizardState, step: StepId, ctx: StepContext): StepCheck {
  switch (step) {
    case 'scope': {
      if (!s.courseId) return fail('Pick a course first');
      if (ctx.contentLoading) return fail('Counting lectures...');
      if (s.scopeMode === 'subjects' && s.subjectIds.length === 0) return fail('Pick at least one subject');
      if (s.scopeMode === 'chapter' && !s.chapterId) return fail('Pick a chapter');
      if (s.scopeMode === 'topic' && !s.topicId) return fail('Pick a topic');
      if (ctx.contentItems === 0) return fail('These subjects have no published lectures yet. Pick other subjects.');
      if (s.allSubjectIds.length === 0) return fail('This course has no subjects yet');
      return OK;
    }
    case 'dates': {
      const today = ctx.today ?? formatYmd(new Date());
      if (s.startDate < today) return fail('The start date cannot be in the past');
      if (s.deadline <= s.startDate) return fail('Finish date must be at least 1 day after the start');
      return OK;
    }
    case 'times': {
      const enabledWeekday = DAY_KEYS.filter(k => s.weekday[k].enabled);
      if (enabledWeekday.length === 0) return fail('Turn on at least one study time on weekdays');
      const weekdayProblem = dayProblem(s.weekday);
      if (weekdayProblem) return fail(weekdayProblem);
      if (s.weekendMode === 'different') {
        const satProblem = dayProblem(s.saturday);
        if (satProblem) return fail(satProblem);
        const sunProblem = dayProblem(s.sunday);
        if (sunProblem) return fail(sunProblem);
      }
      return OK;
    }
    case 'reminder':
      if (s.reminder === null) return fail('Pick a reminder, or No reminders');
      return OK;
    case 'review': {
      if (s.steps.includes('reminder') && s.reminder === null) return fail('Pick a reminder, or No reminders');
      if (ctx.feasibility === null) return fail('Checking your plan...');
      if (ctx.feasibility === 'too_short') return fail('Add more study time or move the finish date');
      return OK;
    }
  }
}

// ─── reducer ────────────────────────────────────────────────────────────────

function currentStep(s: WizardState): StepId {
  return s.steps[s.stepIndex];
}

/**
 * `next` only refuses to leave the dates, times and reminder steps when their state is invalid.
 * Scope (needs the loaded lecture list) and review (needs the feasibility check) are gated
 * by the screen through validateStep with the real context. The past-date check is skipped
 * here so the reducer does not depend on the clock.
 */
function reducerGuard(s: WizardState, step: StepId): boolean {
  if (step !== 'dates' && step !== 'times' && step !== 'reminder') return true;
  return validateStep(s, step, { contentItems: 1, contentLoading: false, feasibility: 'ok', today: '0000-01-01' }).ok;
}

function touch(s: WizardState): WizardState {
  return s.dirty ? s : { ...s, dirty: true };
}

export function wizardReducer(s: WizardState, a: WizardAction): WizardState {
  // While saving, only the save outcome may change anything.
  if (s.status === 'saving' && a.type !== 'saveOk' && a.type !== 'saveFail') return s;

  switch (a.type) {
    case 'next': {
      if (!reducerGuard(s, currentStep(s))) return s;
      if (s.returnToReview) {
        const reviewIdx = s.steps.indexOf('review');
        return reviewIdx >= 0 ? { ...s, stepIndex: reviewIdx, returnToReview: false } : s;
      }
      if (s.stepIndex >= s.steps.length - 1) return s;
      return { ...s, stepIndex: s.stepIndex + 1 };
    }

    case 'back': {
      if (s.stepIndex <= 0) return s;
      return { ...s, stepIndex: s.stepIndex - 1, returnToReview: false };
    }

    case 'goto': {
      const idx = s.steps.indexOf(a.step);
      if (idx < 0) return s;
      const fromReview = currentStep(s) === 'review' && a.step !== 'review';
      return { ...s, stepIndex: idx, returnToReview: fromReview };
    }

    case 'setScopeMode': {
      let subjectIds = s.subjectIds;
      if (a.mode === 'course') subjectIds = s.allSubjectIds;
      else if (a.mode === 'subjects' && s.scopeMode !== 'subjects') subjectIds = s.allSubjectIds;
      return touch({ ...s, scopeMode: a.mode, subjectIds });
    }

    case 'toggleSubject': {
      const has = s.subjectIds.includes(a.id);
      const subjectIds = has ? s.subjectIds.filter(x => x !== a.id) : [...s.subjectIds, a.id];
      return touch({ ...s, subjectIds });
    }

    case 'setSubjects':
      return touch({ ...s, subjectIds: a.ids });

    case 'setAllSubjects': {
      // Loaded from the server, not a student edit: no dirty flag.
      const subjectIds = s.scopeMode === 'course' ? a.ids : s.subjectIds;
      return { ...s, allSubjectIds: a.ids, subjectIds };
    }

    case 'setChapter':
      return touch({ ...s, chapterId: a.id, topicId: null });

    case 'setTopic':
      return touch({ ...s, topicId: a.id });

    case 'setStart': {
      const deadline = s.deadline <= a.date ? addDaysYmd(a.date, 30) : s.deadline;
      return touch({ ...s, startDate: a.date, deadline });
    }

    case 'setDeadline':
      return touch({ ...s, deadline: a.date });

    case 'setWindow': {
      const day = s[a.day];
      const next: DayWindows = { ...day, [a.key]: { ...day[a.key], ...a.patch } };
      return touch({ ...s, [a.day]: next });
    }

    case 'setWeekendMode':
      return touch({ ...s, weekendMode: a.mode });

    case 'setReminder':
      return touch({ ...s, reminder: a.value });

    case 'setPattern':
      return touch({ ...s, pattern: a.value });

    case 'setFeedback':
      return touch({ ...s, feedbackMessage: a.text });

    case 'saveStart':
      if (s.status === 'saving') return s;
      return { ...s, status: 'saving', error: null };

    case 'saveOk':
      return { ...s, status: 'saved', error: null };

    case 'saveFail':
      // Back to editing with the answers kept and the reason shown.
      return { ...s, status: 'editing', error: a.error };

    case 'reset': {
      const fresh = initialState({
        courseId: s.courseId,
        courseName: s.courseName,
        remindersOn: s.steps.includes('reminder'),
        today: new Date(),
      });
      const subjectIds = fresh.scopeMode === 'course' ? s.allSubjectIds : [];
      return { ...fresh, allSubjectIds: s.allSubjectIds, subjectIds };
    }
  }
}

// ─── payload & labels ───────────────────────────────────────────────────────

/** Edge-function day plan shape: { intervals: [{ label, start, end }] }. */
export function dayToEdgePlan(d: DayWindows): { intervals: { label: string; start: string; end: string }[] } {
  return {
    intervals: DAY_KEYS
      .filter(k => d[k].enabled && windowProblem(d[k]) === null)
      .map(k => ({ label: EDGE_LABEL[k], start: d[k].start, end: d[k].end })),
  };
}

/** Human scope label: "Entire course", "Maths, Science +2", a chapter or a topic name. */
export function scopeLabelFor(
  s: WizardState,
  names: { subjects: Record<string, string>; chapter?: string | null; topic?: string | null },
): string {
  if (s.scopeMode === 'chapter') return names.chapter || 'Chapter';
  if (s.scopeMode === 'topic') return names.topic ? (names.chapter ? `${names.chapter} • ${names.topic}` : names.topic) : 'Topic';
  const allChosen = s.allSubjectIds.length > 0 && s.allSubjectIds.every(id => s.subjectIds.includes(id));
  if (allChosen || s.subjectIds.length === 0) return 'Entire course';
  const labels = s.subjectIds.map(id => names.subjects[id]).filter((x): x is string => !!x);
  if (labels.length === 0) return `${s.subjectIds.length} subjects`;
  const extra = labels.length - 2;
  return extra > 0 ? `${labels.slice(0, 2).join(', ')} +${extra}` : labels.join(', ');
}

/**
 * Body for `generate_plan`. Same keys as the old wizard (StudyTimetableScreen 1389-1404),
 * except scopeType is 'course' for whole-course and multi-subject plans.
 */
export function toGeneratePayload(s: WizardState, items: PlanItem[], scopeLabel: string): object {
  const scopeType = s.scopeMode === 'chapter' ? 'chapter' : s.scopeMode === 'topic' ? 'topic' : 'course';
  const scopeId = s.scopeMode === 'chapter' ? s.chapterId : s.scopeMode === 'topic' ? s.topicId : null;
  const we = effectiveWeekend(s);
  return {
    action: 'generate_plan',
    courseId: s.courseId,
    scopeLabel,
    scopeType,
    scopeId,
    startDate: s.startDate,
    deadline: s.deadline,
    tzOffsetMinutes: new Date().getTimezoneOffset(),
    weekday: dayToEdgePlan(s.weekday),
    saturday: dayToEdgePlan(we.saturday),
    sunday: dayToEdgePlan(we.sunday),
    items,
    feedbackMessage: s.feedbackMessage.trim() || undefined,
    pattern: s.pattern,
  };
}
