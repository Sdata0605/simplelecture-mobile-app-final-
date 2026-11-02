// "Open class" routing for study-timetable reminders. Pure: no React Native imports, so it is unit-tested with jest.
// Target is the Classes (videos) tab of TopicDetails (AppNavigator: TopicDetails params, openTab 'videos').

import type { ReminderTarget } from '../../types/reminder';
import type { NavigationIntent } from './notifications';

export interface OpenClassPlan {
  intent: NavigationIntent;
  level: 'topic' | 'subject' | 'timetable';
  reason?: string;   // set when the plan falls back from the topic
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && UUID_RE.test(v) ? v : undefined;
}

/**
 * Exact topic when the reminder has a topic id: TopicDetails {topicId, subjectId, chapterId, courseId, topicTitle, openTab:'videos'}.
 * No topic id: opens the subject on its Classes tab and logs why. No subject either: opens the Study Timetable and logs why.
 */
export function planOpenClass(target: ReminderTarget | null | undefined, reminderId?: string): OpenClassPlan {
  const courseId = uuidOrUndefined(target?.courseId);
  const subjectId = uuidOrUndefined(target?.subjectId);
  const chapterId = uuidOrUndefined(target?.chapterId);
  const topicId = uuidOrUndefined(target?.topicId);
  const who = reminderId ? ` ${reminderId}` : '';

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
    const reason = 'reminder has no topic id';
    console.log(`[Reminders] Open class${who}: ${reason}, opening the subject`);
    const params: Record<string, unknown> = { subjectId, openTab: 'videos' };
    if (courseId) params.courseId = courseId;
    return { intent: { name: 'TopicDetails', params }, level: 'subject', reason };
  }

  const reason = 'reminder has no topic or subject id';
  console.log(`[Reminders] Open class${who}: ${reason}, opening the Study Timetable`);
  return { intent: { name: 'StudyTimetable', params: {} }, level: 'timetable', reason };
}
