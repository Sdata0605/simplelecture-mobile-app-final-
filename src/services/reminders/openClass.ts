// "Open topic" routing for study-timetable reminders. Pure: no React Native imports, so it is unit-tested with jest.
// Target is the Classes (videos) tab of TopicDetails (AppNavigator: TopicDetails params, openTab 'videos').

import type { ReminderTarget } from '../../types/reminder';
import type { NavigationIntent } from './notifications';

export type OpenClassLevel = 'topic' | 'subject' | 'timetable';

export interface OpenClassPlan {
  intent: NavigationIntent;
  level: OpenClassLevel;
  reason?: string;   // set when the plan falls back from the topic
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && UUID_RE.test(v) ? v : undefined;
}

/** Pure resolution of the target: no logging. */
function resolveOpenClass(target: ReminderTarget | null | undefined): Omit<OpenClassPlan, 'reason'> & { reason?: string } {
  const courseId = uuidOrUndefined(target?.courseId);
  const subjectId = uuidOrUndefined(target?.subjectId);
  const chapterId = uuidOrUndefined(target?.chapterId);
  const topicId = uuidOrUndefined(target?.topicId);

  if (topicId) {
    const params: Record<string, unknown> = { topicId, openTab: 'videos' };
    if (subjectId) params.subjectId = subjectId;
    if (chapterId) params.chapterId = chapterId;
    if (courseId) params.courseId = courseId;
    const title = typeof target?.topicTitle === 'string' ? target.topicTitle.trim() : '';
    if (title) params.topicTitle = title.slice(0, 120);
    return { intent: { name: 'TopicDetails', params }, level: 'topic' };
  }

  if (subjectId) {
    const params: Record<string, unknown> = { subjectId, openTab: 'videos' };
    if (chapterId) params.chapterId = chapterId;
    if (courseId) params.courseId = courseId;
    return { intent: { name: 'TopicDetails', params }, level: 'subject', reason: 'reminder has no topic id' };
  }

  return { intent: { name: 'StudyTimetable', params: {} }, level: 'timetable', reason: 'reminder has no topic or subject id' };
}

/** Which level a target resolves to. No logging, safe to call while rendering a button label. */
export function openClassLevel(target: ReminderTarget | null | undefined): OpenClassLevel {
  return resolveOpenClass(target).level;
}

/** Button label for a level: "Open topic", "Open subject" or "Open timetable". */
export function openClassLabel(level: OpenClassLevel): string {
  if (level === 'topic') return 'Open topic';
  if (level === 'subject') return 'Open subject';
  return 'Open timetable';
}

/**
 * Exact topic when the reminder has a topic id: TopicDetails {topicId, subjectId, chapterId, courseId, topicTitle, openTab:'videos'}.
 * No topic id: opens the subject on its Classes tab (chapterId kept) and logs why. No subject either: opens the Study Timetable and logs why.
 */
export function planOpenClass(target: ReminderTarget | null | undefined, reminderId?: string): OpenClassPlan {
  const plan = resolveOpenClass(target);
  if (plan.reason) {
    const who = reminderId ? ` ${reminderId}` : '';
    const what = plan.level === 'subject' ? 'opening the subject' : 'opening the Study Timetable';
    console.log(`[Reminders] Open class${who}: ${plan.reason}, ${what}`);
  }
  return plan;
}
