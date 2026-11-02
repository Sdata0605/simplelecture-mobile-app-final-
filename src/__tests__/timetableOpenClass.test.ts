jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0 },
  AndroidAudioUsage: { NOTIFICATION_COMMUNICATION_REQUEST: 7 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
}));

import { planOpenClass, openClassLabel, openClassLevel } from '../services/reminders/openClass';
import { planResponse, planForeground, readReminderData, buildReminderContent } from '../services/reminders/notifications';
import { fingerprint, type ReminderTrigger } from '../services/reminders/schedule';
import type { Reminder, ReminderTarget } from '../types/reminder';

const COURSE = '11111111-1111-4111-8111-111111111111';
const SUBJECT = '22222222-2222-4222-8222-222222222222';
const CHAPTER = '33333333-3333-4333-8333-333333333333';
const TOPIC = '44444444-4444-4444-8444-444444444444';
const FULL: ReminderTarget = { courseId: COURSE, subjectId: SUBJECT, chapterId: CHAPTER, topicId: TOPIC, topicTitle: 'Photosynthesis' };

describe('planOpenClass', () => {
  it('routes an exact topic to TopicDetails on the videos tab', () => {
    const plan = planOpenClass(FULL, 'r1');
    expect(plan.level).toBe('topic');
    expect(plan.intent).toEqual({
      name: 'TopicDetails',
      params: { topicId: TOPIC, subjectId: SUBJECT, chapterId: CHAPTER, courseId: COURSE, topicTitle: 'Photosynthesis', openTab: 'videos' },
    });
  });

  it('falls back to the subject and gives a reason when there is no topic id', () => {
    const plan = planOpenClass({ ...FULL, topicId: null }, 'r2');
    expect(plan.level).toBe('subject');
    expect(plan.reason).toBe('reminder has no topic id');
    expect(plan.intent).toEqual({ name: 'TopicDetails', params: { subjectId: SUBJECT, chapterId: CHAPTER, courseId: COURSE, openTab: 'videos' } });
  });

  it('keeps the chapter when falling back to the subject', () => {
    const plan = planOpenClass({ ...FULL, topicId: null }, 'r5');
    expect(plan.intent).toEqual({
      name: 'TopicDetails',
      params: { subjectId: SUBJECT, chapterId: CHAPTER, courseId: COURSE, openTab: 'videos' },
    });
  });

  it('a chapter-only target without a subject falls back to the Study Timetable', () => {
    const plan = planOpenClass({ courseId: null, subjectId: null, chapterId: CHAPTER, topicId: null }, 'r6');
    expect(plan.level).toBe('timetable');
  });

  it('opens the Study Timetable when there is no topic and no subject', () => {
    const plan = planOpenClass({ courseId: COURSE, subjectId: null, chapterId: null, topicId: null }, 'r3');
    expect(plan.level).toBe('timetable');
    expect(plan.intent.name).toBe('StudyTimetable');
  });

  it('drops ids that are not UUIDs', () => {
    const plan = planOpenClass({ ...FULL, topicId: 'not-a-uuid' }, 'r4');
    expect(plan.level).toBe('subject');
    expect(plan.intent.params).not.toHaveProperty('topicId');
  });

  it('handles a missing target', () => {
    expect(planOpenClass(null).level).toBe('timetable');
    expect(planOpenClass(undefined).level).toBe('timetable');
  });

  it('labels the button by level, without logging', () => {
    expect(openClassLevel(FULL)).toBe('topic');
    expect(openClassLevel({ ...FULL, topicId: null })).toBe('subject');
    expect(openClassLevel(null)).toBe('timetable');
    expect(openClassLabel('topic')).toBe('Open topic');
    expect(openClassLabel('subject')).toBe('Open subject');
    expect(openClassLabel('timetable')).toBe('Open timetable');
  });
});

describe('timetable tap routing', () => {
  const trigger: ReminderTrigger = { type: 'date', date: new Date('2030-01-01T10:00:00Z'), channelId: 'reminder-message' };
  const base = { id: 'r1', kind: 'message', text: 'Hey', fp: 'x' } as const;

  it('a tapped timetable call takes the Answer path (voice first) and carries the target', () => {
    const data = readReminderData({ type: 'reminder', v: 2, reminderId: 'r1', kind: 'call', fp: 'x', src: 'tt', t: FULL });
    expect(data).not.toBeNull();
    const plan = planResponse(data!, 'expo.modules.notifications.actions.DEFAULT');
    expect(plan).toEqual({
      type: 'answer',
      reminderId: 'r1',
      outcome: 'answered',
      nav: { name: 'ReminderCall', params: { reminderId: 'r1', autoplay: true, mode: 'call', src: 'tt', target: FULL } },
    });
  });

  it('a timetable call Answer also carries the target', () => {
    const data = readReminderData({ type: 'reminder', v: 2, reminderId: 'r1', kind: 'call', fp: 'x', src: 'tt', t: FULL })!;
    expect(planResponse(data, 'answer')).toMatchObject({
      type: 'answer',
      nav: { name: 'ReminderCall', params: { src: 'tt', target: FULL } },
    });
  });

  it('a foreground timetable call rings IncomingCall with src and target', () => {
    const data = readReminderData({ type: 'reminder', v: 2, reminderId: 'r1', kind: 'call', fp: 'x', src: 'tt', t: FULL })!;
    expect(planForeground(data, undefined)).toEqual({
      name: 'IncomingCall',
      params: { reminderId: 'r1', src: 'tt', target: FULL },
    });
  });

  it('a user call foreground keeps the plain IncomingCall params', () => {
    const data = readReminderData({ type: 'reminder', v: 2, reminderId: 'r1', kind: 'call', fp: 'x' })!;
    expect(planForeground(data, undefined)).toEqual({ name: 'IncomingCall', params: { reminderId: 'r1' } });
  });

  it('keeps the Answer action on a timetable call going to the call screen', () => {
    const data = readReminderData({ type: 'reminder', v: 2, reminderId: 'r1', kind: 'call', fp: 'x', src: 'tt', t: FULL })!;
    expect(planResponse(data, 'answer')).toMatchObject({ type: 'answer', nav: { name: 'ReminderCall' } });
  });

  it('a tapped timetable notification goes to the topic, marked delivered', () => {
    const data = readReminderData({ type: 'reminder', v: 2, reminderId: 'r1', kind: 'notification', fp: 'x', src: 'tt', t: FULL })!;
    expect(planResponse(data, 'expo.modules.notifications.actions.DEFAULT')).toMatchObject({ type: 'classes', outcome: 'delivered' });
  });

  it('user reminders keep their old routing and payload shape', () => {
    const data = readReminderData({ type: 'reminder', v: 2, reminderId: 'r1', kind: 'notification', fp: 'x' });
    expect(data).toEqual({ type: 'reminder', v: 2, reminderId: 'r1', kind: 'notification', fp: 'x' });
    expect(planResponse(data!, 'expo.modules.notifications.actions.DEFAULT')).toMatchObject({ type: 'open' });
  });

  it('puts src and target into the notification data for timetable rows only', () => {
    const tt = buildReminderContent({ ...base, src: 'tt', target: FULL }) as { data: Record<string, unknown> };
    expect(tt.data).toMatchObject({ src: 'tt', t: FULL });
    const user = buildReminderContent(base) as { data: Record<string, unknown> };
    expect(user.data).not.toHaveProperty('src');
    expect(user.data).not.toHaveProperty('t');
    expect(trigger.type).toBe('date');
  });
});

describe('fingerprint', () => {
  const r = { kind: 'call', message_text: 'Hey', language: 'en-IN', voice: 'shubh', enabled: true } as Pick<Reminder, 'kind' | 'message_text' | 'language' | 'voice' | 'enabled'>;
  const trigger: ReminderTrigger = { type: 'date', date: new Date('2030-01-01T10:00:00Z'), channelId: 'reminder-call-v2' };

  it('is unchanged for user reminders', () => {
    expect(fingerprint({ ...r, source: 'user' }, trigger)).toBe(fingerprint(r, trigger));
  });

  it('changes when a timetable reminder target changes', () => {
    const a = fingerprint({ ...r, source: 'timetable', target: FULL }, trigger);
    const b = fingerprint({ ...r, source: 'timetable', target: { ...FULL, topicId: null } }, trigger);
    expect(a).not.toBe(b);
  });
});
