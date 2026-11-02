// Timetable call links: the server's course_id / subject_id / chapter_id / topic_id become reminder.target,
// and the target never reaches the database (wireBody). Mocks mirror reminderStore.test.ts.

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'uuid-1') }));

jest.mock('../services/reminders/api', () => ({
  upsert: jest.fn(async (row: unknown) => row),
  patch: jest.fn(async () => null),
  remove: jest.fn(async () => undefined),
  fetchAll: jest.fn(async () => []),
  fetchOne: jest.fn(async () => null),
  authHeaders: jest.fn(async () => ({})),
  currentUserId: jest.fn(async () => 'user-1'),
}));

jest.mock('../services/reminders/audio', () => ({
  prefetchVoices: jest.fn(async () => []),
  resolveVoiceSource: jest.fn(),
  gcAudio: jest.fn(async () => undefined),
  clearAllAudio: jest.fn(async () => undefined),
  previewVoice: jest.fn(),
}));

jest.mock('../services/reminders/notifications', () => ({
  ensureReminderChannels: jest.fn(async () => undefined),
  applySchedulePlan: jest.fn(async () => ({ added: 0, kept: 0, removed: 0 })),
  cancelAllReminderNotifications: jest.fn(async () => 0),
  cancelReminderNotification: jest.fn(async () => undefined),
  scheduleReminderRequest: jest.fn(async () => undefined),
}));

import { normalizeRow } from '../services/reminders/store';
import { wireBody } from '../services/reminders';
import type { Reminder } from '../types/reminder';

const COURSE = '11111111-1111-4111-8111-111111111111';
const SUBJECT = '22222222-2222-4222-8222-222222222222';
const CHAPTER = '33333333-3333-4333-8333-333333333333';
const TOPIC = '44444444-4444-4444-8444-444444444444';

function row(extra: Partial<Reminder>): Partial<Reminder> & { id: string } {
  return {
    id: 'r1',
    user_id: 'user-1',
    title: '  Chemical Equations  ',
    message_text: 'Time to study',
    source: 'timetable',
    session_id: 's1',
    kind: 'call',
    status: 'scheduled',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...extra,
  } as Partial<Reminder> & { id: string };
}

describe('normalizeRow target mapping', () => {
  it('builds the full target from the four server ids, with the trimmed title as topicTitle', () => {
    const r = normalizeRow(row({ course_id: COURSE, subject_id: SUBJECT, chapter_id: CHAPTER, topic_id: TOPIC }));
    expect(r.target).toEqual({
      courseId: COURSE,
      subjectId: SUBJECT,
      chapterId: CHAPTER,
      topicId: TOPIC,
      topicTitle: 'Chemical Equations',
    });
  });

  it('maps a subject-only timetable row with null for the other ids', () => {
    const r = normalizeRow(row({ course_id: null, subject_id: SUBJECT, chapter_id: null, topic_id: null }));
    expect(r.target).toEqual({ courseId: null, subjectId: SUBJECT, chapterId: null, topicId: null, topicTitle: 'Chemical Equations' });
  });

  it('gives a user row a null target even when it carries no ids', () => {
    const r = normalizeRow(row({ source: 'user', session_id: null }));
    expect(r.target).toBeNull();
  });

  it('keeps a cached target when the raw id columns are absent', () => {
    const cached = { courseId: COURSE, subjectId: SUBJECT, chapterId: null, topicId: TOPIC, topicTitle: 'Old' };
    const r = normalizeRow(row({ target: cached }));
    expect(r.target).toEqual(cached);
  });

  it('a timetable row with no ids and no cache gets a null target', () => {
    expect(normalizeRow(row({})).target).toBeNull();
  });
});

describe('wireBody', () => {
  it('never sends target to the database, but keeps the id columns', () => {
    const full = normalizeRow(row({ course_id: COURSE, subject_id: SUBJECT, chapter_id: CHAPTER, topic_id: TOPIC }));
    const body = wireBody(full);
    expect(body).not.toHaveProperty('target');
    expect(body).not.toHaveProperty('created_at');
    expect(body).toMatchObject({ course_id: COURSE, subject_id: SUBJECT, chapter_id: CHAPTER, topic_id: TOPIC });
  });
});
