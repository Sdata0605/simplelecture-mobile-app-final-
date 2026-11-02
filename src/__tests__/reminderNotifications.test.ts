jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0 },
  AndroidAudioUsage: { NOTIFICATION_COMMUNICATION_REQUEST: 7 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'scheduled-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
}));

import * as Notifications from 'expo-notifications';
import {
  applySchedulePlan,
  buildReminderContent,
  cancelAllReminderNotifications,
  planForeground,
  planResponse,
  readReminderData,
  type ReminderNotificationData,
  type ReminderScheduleItem,
} from '../services/reminders/notifications';

const mocked = Notifications as unknown as {
  scheduleNotificationAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  getAllScheduledNotificationsAsync: jest.Mock;
};

const DATE_TRIGGER_AT = new Date('2026-11-15T04:00:00.000Z');

function makeItem(over: Partial<ReminderScheduleItem> = {}): ReminderScheduleItem {
  const id = over.id ?? 'r1';
  return {
    id,
    identifier: `reminder-${id}`,
    kind: 'call',
    trigger: { type: 'date', date: DATE_TRIGGER_AT, channelId: 'reminder-call-v2' },
    fp: 'fp-1',
    nextFire: DATE_TRIGGER_AT,
    text: 'Go to college for your submission',
    ...over,
  };
}

function pendingRequest(identifier: string, fp?: string) {
  return { identifier, content: { data: fp === undefined ? {} : { fp } }, trigger: null };
}

const callData: ReminderNotificationData = { type: 'reminder', v: 2, reminderId: 'r1', kind: 'call', fp: 'fp-1' };
const messageData: ReminderNotificationData = { ...callData, kind: 'message' };
const notificationData: ReminderNotificationData = { ...callData, kind: 'notification' };

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('readReminderData', () => {
  it('accepts a v2 reminder payload', () => {
    expect(readReminderData({ type: 'reminder', v: 2, reminderId: 'r1', kind: 'message', fp: 'x' })).toEqual({
      type: 'reminder', v: 2, reminderId: 'r1', kind: 'message', fp: 'x',
    });
  });

  it('rejects v1 call reminders, other types, and unknown kinds', () => {
    expect(readReminderData({ type: 'call_reminder', reminderId: 'r1' })).toBeNull();
    expect(readReminderData({ type: 'study_reminder', screen: 'StudyTimetable' })).toBeNull();
    expect(readReminderData({ type: 'reminder', v: 2, reminderId: 'r1', kind: 'sms', fp: 'x' })).toBeNull();
    expect(readReminderData(null)).toBeNull();
  });
});

describe('buildReminderContent (kind to content)', () => {
  it('call: fixed title and body, ring sound, call category, time sensitive', () => {
    const c = buildReminderContent(makeItem({ kind: 'call' })) as Record<string, unknown>;
    expect(c.title).toBe('Simple Lecture Teacher');
    expect(c.body).toBe('Incoming reminder call. Tap to answer.');
    expect(c.sound).toBe('reminder_ring_27s.wav');
    expect(c.categoryIdentifier).toBe('reminder-call');
    expect(c.interruptionLevel).toBe('timeSensitive');
    expect(c.data).toEqual({ type: 'reminder', v: 2, reminderId: 'r1', kind: 'call', fp: 'fp-1' });
  });

  it('message: full text in the body, message category', () => {
    const c = buildReminderContent(makeItem({ kind: 'message', text: '  Buy milk  ' })) as Record<string, unknown>;
    expect(c.title).toBe('Reminder from Simple Lecture');
    expect(c.body).toBe('Buy milk');
    expect(c.sound).toBe('default');
    expect(c.categoryIdentifier).toBe('reminder-message');
    expect(c.interruptionLevel).toBe('timeSensitive');
  });

  it('notification: title is the text cut to 60 characters, empty body, no category', () => {
    const text = 'x'.repeat(100);
    const c = buildReminderContent(makeItem({ kind: 'notification', text })) as Record<string, unknown>;
    expect(c.title).toBe('x'.repeat(60));
    expect(c.body).toBe('');
    expect(c.categoryIdentifier).toBeUndefined();
    expect(c.interruptionLevel).toBe('active');
  });
});

describe('applySchedulePlan (diff against the OS queue)', () => {
  it('keeps matching requests, replaces changed ones, removes stale and legacy ids, never touches other prefixes', async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValue([
      pendingRequest('reminder-keep', 'same'),
      pendingRequest('reminder-changed', 'old'),
      pendingRequest('reminder-gone', 'x'),
      pendingRequest('call-reminder-legacy'),
      pendingRequest('study-reminder-s1'),
      pendingRequest('motivational_recurring'),
    ]);

    const result = await applySchedulePlan([
      makeItem({ id: 'keep', fp: 'same' }),
      makeItem({ id: 'changed', fp: 'new' }),
      makeItem({ id: 'added', fp: 'fresh' }),
    ]);

    expect(result).toEqual({ added: 2, kept: 1, removed: 2, failed: 0 });

    const cancelled = mocked.cancelScheduledNotificationAsync.mock.calls.map(c => c[0]).sort();
    expect(cancelled).toEqual(['call-reminder-legacy', 'reminder-changed', 'reminder-gone']);

    const scheduledIds = mocked.scheduleNotificationAsync.mock.calls.map(c => c[0].identifier).sort();
    expect(scheduledIds).toEqual(['reminder-added', 'reminder-changed']);
  });

  it('maps a daily plan to a native DAILY trigger with the channel id', async () => {
    await applySchedulePlan([
      makeItem({
        id: 'gym',
        kind: 'message',
        fp: 'd1',
        trigger: { type: 'daily', hour: 6, minute: 30, channelId: 'reminder-message' },
      }),
    ]);

    const request = mocked.scheduleNotificationAsync.mock.calls[0][0];
    expect(request.identifier).toBe('reminder-gym');
    expect(request.trigger).toEqual({ type: 'daily', hour: 6, minute: 30, channelId: 'reminder-message' });
  });

  it('counts a refused OS request as failed and keeps going', async () => {
    mocked.scheduleNotificationAsync
      .mockRejectedValueOnce(new Error('budget exceeded'))
      .mockResolvedValueOnce('ok');

    const result = await applySchedulePlan([makeItem({ id: 'a' }), makeItem({ id: 'b' })]);

    expect(result).toEqual({ added: 1, kept: 0, removed: 0, failed: 1 });
  });
});

describe('cancelAllReminderNotifications', () => {
  it('cancels reminder-* and legacy call-reminder-* only', async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValue([
      pendingRequest('reminder-a'),
      pendingRequest('call-reminder-b'),
      pendingRequest('study-reminder-c'),
      pendingRequest('motivational_recurring'),
    ]);

    const count = await cancelAllReminderNotifications();

    expect(count).toBe(2);
    const cancelled = mocked.cancelScheduledNotificationAsync.mock.calls.map(c => c[0]).sort();
    expect(cancelled).toEqual(['call-reminder-b', 'reminder-a']);
  });
});

describe('planResponse (tap and action routing per kind)', () => {
  const DEFAULT = 'expo.modules.notifications.actions.DEFAULT';

  it('call: Answer and a body tap open the ring screen with autoplay and record answered', () => {
    for (const action of ['answer', DEFAULT]) {
      expect(planResponse(callData, action)).toEqual({
        type: 'answer',
        reminderId: 'r1',
        outcome: 'answered',
        nav: { name: 'ReminderCall', params: { reminderId: 'r1', autoplay: true, mode: 'call' } },
      });
    }
  });

  it('call: Decline records declined and does not navigate', () => {
    expect(planResponse(callData, 'decline')).toEqual({
      type: 'decline', reminderId: 'r1', outcome: 'declined', dismiss: true,
    });
  });

  it('message: a body tap opens message mode without autoplay; Done only records delivery', () => {
    expect(planResponse(messageData, DEFAULT)).toEqual({
      type: 'listen',
      reminderId: 'r1',
      outcome: 'delivered',
      nav: { name: 'ReminderCall', params: { reminderId: 'r1', autoplay: false, mode: 'message' } },
    });
    expect(planResponse(messageData, 'done')).toEqual({
      type: 'done', reminderId: 'r1', outcome: 'delivered', dismiss: true,
    });
  });

  it('notification: a tap opens the Reminders screen on that reminder', () => {
    expect(planResponse(notificationData, DEFAULT)).toEqual({
      type: 'open',
      reminderId: 'r1',
      outcome: 'delivered',
      nav: { name: 'Reminders', params: { highlightId: 'r1' } },
    });
  });

  it('ignores unknown actions (for example a dismiss or a Done on a call)', () => {
    expect(planResponse(callData, 'done').type).toBe('ignore');
    expect(planResponse(notificationData, 'answer').type).toBe('ignore');
  });
});

describe('planForeground (received while the app is open)', () => {
  it('call: opens the in-app ringing screen', () => {
    expect(planForeground(callData, { name: 'Dashboard' })).toEqual({
      name: 'IncomingCall',
      params: { reminderId: 'r1' },
    });
  });

  it('call: does nothing when the same reminder is already ringing or on the call screen', () => {
    expect(planForeground(callData, { name: 'IncomingCall', params: { reminderId: 'r1' } })).toBeNull();
    expect(planForeground(callData, { name: 'ReminderCall', params: { reminderId: 'r1' } })).toBeNull();
  });

  it('call: a different reminder still rings', () => {
    expect(planForeground(callData, { name: 'IncomingCall', params: { reminderId: 'other' } })).toEqual({
      name: 'IncomingCall',
      params: { reminderId: 'r1' },
    });
  });

  it('message and notification: never take over the screen (the normal banner shows)', () => {
    expect(planForeground(messageData, { name: 'Dashboard' })).toBeNull();
    expect(planForeground(notificationData, undefined)).toBeNull();
  });
});
