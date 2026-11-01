const mockFlags = { enabled: true };

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

jest.mock('../constants/featureFlags', () => ({
  isCallRemindersEnabled: () => mockFlags.enabled,
}));

jest.mock('../services/supabase', () => ({
  SUPABASE_URL: 'https://proxy.test',
  SUPABASE_ANON_KEY: 'anon-test-key',
  getValidAccessToken: jest.fn(async () => 'aaa.bbb.ccc'),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { MAX: 5 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidAudioUsage: { NOTIFICATION_COMMUNICATION_REQUEST: 7 },
  AndroidNotificationPriority: { MAX: 'max' },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'scheduled-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => undefined),
  downloadAsync: jest.fn(async () => ({ status: 200 })),
  deleteAsync: jest.fn(async () => undefined),
}));

import * as Notifications from 'expo-notifications';
import {
  nextOccurrence,
  scheduleCallReminder,
  cancelCallReminder,
  rescheduleAllCallReminders,
  generateAudio,
  CallReminderAudioError,
} from '../services/callReminders';
import type { CallReminder } from '../types/callReminder';

const mockedNotifications = Notifications as unknown as {
  scheduleNotificationAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  getAllScheduledNotificationsAsync: jest.Mock;
};

// Local-time constructors keep these tests independent of the machine time zone.
// 2026-11-01 is a Sunday, so 2026-11-06 is a Friday and 2026-11-09 a Monday.
const at = (y: number, m: number, d: number, h: number, min: number) =>
  new Date(y, m - 1, d, h, min, 0, 0);

function makeReminder(overrides: Partial<CallReminder> = {}): CallReminder {
  return {
    id: 'abc',
    user_id: 'user-1',
    title: 'Physics revision',
    message_text: 'Start with chapter 3.',
    scheduled_at: at(2026, 11, 6, 18, 30).toISOString(),
    repeat_rule: 'none',
    call_enabled: true,
    voice: 'shubh',
    language: 'en-IN',
    audio_path: null,
    audio_hash: null,
    audio_status: 'none',
    status: 'scheduled',
    last_fired_at: null,
    created_at: at(2026, 11, 1, 9, 0).toISOString(),
    updated_at: at(2026, 11, 1, 9, 0).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFlags.enabled = true;
});

describe('nextOccurrence', () => {
  it('returns the time itself for a future one-off reminder', () => {
    const r = makeReminder({ scheduled_at: at(2026, 11, 6, 18, 30).toISOString() });
    expect(nextOccurrence(r, at(2026, 11, 6, 18, 0))?.getTime()).toBe(at(2026, 11, 6, 18, 30).getTime());
  });

  it('returns null for a one-off reminder already in the past', () => {
    const r = makeReminder({ scheduled_at: at(2026, 11, 6, 18, 30).toISOString() });
    expect(nextOccurrence(r, at(2026, 11, 6, 19, 0))).toBeNull();
  });

  it('returns null for an invalid scheduled_at', () => {
    const r = makeReminder({ scheduled_at: 'not-a-date', repeat_rule: 'daily' });
    expect(nextOccurrence(r, at(2026, 11, 6, 19, 0))).toBeNull();
  });

  it('daily: moves to the next day at the same time once today has passed', () => {
    const r = makeReminder({ repeat_rule: 'daily' });
    expect(nextOccurrence(r, at(2026, 11, 6, 19, 0))?.getTime()).toBe(at(2026, 11, 7, 18, 30).getTime());
  });

  it('daily: lands on the next future day after a long gap', () => {
    const r = makeReminder({ repeat_rule: 'daily', scheduled_at: at(2026, 1, 1, 8, 0).toISOString() });
    expect(nextOccurrence(r, at(2026, 11, 1, 9, 0))?.getTime()).toBe(at(2026, 11, 2, 8, 0).getTime());
  });

  it('weekdays: rolls Friday evening over the weekend to Monday', () => {
    const r = makeReminder({ repeat_rule: 'weekdays' });
    const next = nextOccurrence(r, at(2026, 11, 6, 19, 0));
    expect(next?.getTime()).toBe(at(2026, 11, 9, 18, 30).getTime());
    expect(next?.getDay()).toBe(1);
  });

  it('weekdays: a future start on a Saturday is pushed to Monday', () => {
    const r = makeReminder({ repeat_rule: 'weekdays', scheduled_at: at(2026, 11, 7, 18, 30).toISOString() });
    expect(nextOccurrence(r, at(2026, 11, 1, 9, 0))?.getTime()).toBe(at(2026, 11, 9, 18, 30).getTime());
  });

  it('weekly: keeps the same weekday and advances by seven days', () => {
    const r = makeReminder({ repeat_rule: 'weekly', scheduled_at: at(2026, 11, 2, 18, 30).toISOString() });
    expect(nextOccurrence(r, at(2026, 11, 6, 19, 0))?.getTime()).toBe(at(2026, 11, 9, 18, 30).getTime());
  });
});

describe('notification scheduling', () => {
  it('schedules a DATE notification with id call-reminder-<id> on the study-call channel', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await scheduleCallReminder(makeReminder({ scheduled_at: future }));

    expect(mockedNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = mockedNotifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.identifier).toBe('call-reminder-abc');
    expect(arg.trigger.channelId).toBe('study-call');
    expect(arg.content.categoryIdentifier).toBe('study-call');
    expect(arg.content.sound).toBe('study_call_ring.wav');
    expect(arg.content.data).toMatchObject({ type: 'call_reminder', reminderId: 'abc', screen: 'ReminderCall' });
    expect(arg.trigger.type).toBe('date');
    expect(arg.trigger.date.getTime()).toBe(new Date(future).getTime());
  });

  it('cancels instead of scheduling a reminder whose status is not scheduled', async () => {
    await scheduleCallReminder(makeReminder({ status: 'answered' }));
    expect(mockedNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockedNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('call-reminder-abc');
  });

  it('cancelCallReminder uses the same id format', async () => {
    await cancelCallReminder('xyz');
    expect(mockedNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('call-reminder-xyz');
  });

  it('does nothing at all when the feature flag is off', async () => {
    mockFlags.enabled = false;
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchSpy;

    await scheduleCallReminder(makeReminder({ scheduled_at: new Date(Date.now() + 3600000).toISOString() }));
    await rescheduleAllCallReminders();
    await cancelCallReminder('abc');

    expect(mockedNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockedNotifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('generateAudio', () => {
  it('rejects a non-JSON response with code non_json and never parses it', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
      ok: false,
      status: 502,
      headers: { get: () => 'text/html' },
      json: async () => {
        throw new Error('should not be called');
      },
    }));

    await expect(generateAudio({ text: 'hello' })).rejects.toMatchObject({
      name: 'CallReminderAudioError',
      code: 'non_json',
      status: 502,
    });
    await expect(generateAudio({ text: 'hello' })).rejects.toBeInstanceOf(CallReminderAudioError);
  });
});
