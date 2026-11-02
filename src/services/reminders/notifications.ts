// OS notification layer for Reminders v2: channels, categories, content per kind,
// diff-based scheduling of one request per reminder, and pure response/foreground routing.
// Spec: _scratch/reminders-v2-plan.md sections D.3, D.4 and F.2.
// Only ids with the `reminder-` or legacy `call-reminder-` prefix are touched here.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  ACTIONS,
  CATEGORIES,
  CHANNELS,
  LEGACY_NOTIF_PREFIX,
  REMINDER_NOTIF_PREFIX,
  RING_SOUND_FILE,
  type ReminderKind,
} from '../../types/reminder';
import type { PlannedRequest } from './schedule';
import { planOpenClass } from './openClass';
import type { ReminderTarget } from '../../types/reminder';

/** A planned reminder plus the text needed to build its notification content. */
export interface ReminderScheduleItem extends PlannedRequest {
  text: string;
}

export type ReminderNotificationData = {
  type: 'reminder';
  v: 2;
  reminderId: string;
  kind: ReminderKind;
  fp: string;
  src?: 'tt';            // study-timetable reminder
  t?: ReminderTarget;    // where a tap goes (timetable reminders only)
};

export interface ApplyScheduleResult {
  added: number;     // requests scheduled (new or changed)
  kept: number;      // requests already pending with the same fingerprint
  removed: number;   // stale reminder-* and legacy call-reminder-* requests cancelled
  failed: number;    // requests the OS refused
}

/** Navigation intent returned by the pure routing functions. The bridge executes it. */
export interface NavigationIntent {
  name: 'IncomingCall' | 'ReminderCall' | 'Reminders' | 'TopicDetails' | 'StudyTimetable';
  params: Record<string, unknown>;
}

export type ResponsePlan =
  | { type: 'ignore' }
  | { type: 'decline'; reminderId: string; outcome: 'declined'; dismiss: true }
  | { type: 'answer'; reminderId: string; outcome: 'answered'; nav: NavigationIntent }
  | { type: 'listen'; reminderId: string; outcome: 'delivered'; nav: NavigationIntent }
  | { type: 'done'; reminderId: string; outcome: 'delivered'; dismiss: true }
  | { type: 'open'; reminderId: string; outcome: 'delivered'; nav: NavigationIntent }
  // Timetable reminder tapped: goes straight to the topic's Classes tab.
  | { type: 'classes'; reminderId: string; outcome: 'answered' | 'delivered'; nav: NavigationIntent };

const NOTIFICATION_TITLE_MAX = 60;
const CALL_TITLE = 'Simple Lecture Teacher';
const CALL_BODY = 'Incoming reminder call. Tap to answer.';
const MESSAGE_TITLE = 'Reminder from Simple Lecture';

let channelsReady: Promise<void> | null = null;

function isSupported(): boolean {
  return Platform.OS !== 'web';
}

function fingerprintOf(n: Notifications.NotificationRequest): string | null {
  const data = n.content?.data as Record<string, unknown> | undefined;
  return data && typeof data.fp === 'string' ? data.fp : null;
}

/** Validates the `data` payload of a reminder notification. Returns null for other notifications. */
export function readReminderData(data: unknown): ReminderNotificationData | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.type !== 'reminder' || d.v !== 2) return null;
  if (typeof d.reminderId !== 'string' || typeof d.fp !== 'string') return null;
  if (d.kind !== 'call' && d.kind !== 'message' && d.kind !== 'notification') return null;
  const out: ReminderNotificationData = { type: 'reminder', v: 2, reminderId: d.reminderId, kind: d.kind, fp: d.fp };
  // Timetable fields are optional. Older payloads keep their exact shape.
  if (d.src === 'tt') {
    out.src = 'tt';
    if (d.t && typeof d.t === 'object') out.t = d.t as ReminderTarget;
  }
  return out;
}

/** Channels (Android) and action categories (both platforms). Safe to call repeatedly. */
export function ensureReminderChannels(): Promise<void> {
  if (!isSupported()) return Promise.resolve();
  if (!channelsReady) {
    channelsReady = (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNELS.call, {
          name: 'Reminder calls',
          importance: Notifications.AndroidImportance.MAX,
          sound: RING_SOUND_FILE,
          vibrationPattern: [0, 1000, 800, 1000, 800, 1000],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          lightColor: '#2BBD6E',
          audioAttributes: {
            usage: Notifications.AndroidAudioUsage.NOTIFICATION_COMMUNICATION_REQUEST,
          },
        });
        await Notifications.setNotificationChannelAsync(CHANNELS.message, {
          name: 'Reminder messages',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
          lightColor: '#2BBD6E',
        });
        await Notifications.setNotificationChannelAsync(CHANNELS.notification, {
          name: 'Reminder notifications',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: 'default',
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        });
      }
      await Notifications.setNotificationCategoryAsync(CATEGORIES.call, [
        { identifier: ACTIONS.answer, buttonTitle: 'Answer', options: { opensAppToForeground: true } },
        {
          identifier: ACTIONS.decline,
          buttonTitle: 'Decline',
          options: { opensAppToForeground: false, isDestructive: true },
        },
      ]);
      await Notifications.setNotificationCategoryAsync(CATEGORIES.message, [
        { identifier: ACTIONS.done, buttonTitle: 'Done', options: { opensAppToForeground: false } },
      ]);
    })().catch(error => {
      channelsReady = null;
      throw error;
    });
  }
  return channelsReady;
}

/** Notification content for one reminder, per kind (D.4). */
export function buildReminderContent(
  item: Pick<ReminderScheduleItem, 'id' | 'kind' | 'text' | 'fp'> & Partial<Pick<ReminderScheduleItem, 'src' | 'target'>>,
): Notifications.NotificationContentInput {
  const data: ReminderNotificationData = {
    type: 'reminder',
    v: 2,
    reminderId: item.id,
    kind: item.kind,
    fp: item.fp,
  };
  if (item.src === 'tt') {
    data.src = 'tt';
    if (item.target) data.t = item.target;
  }
  const text = item.text.trim();

  if (item.kind === 'call') {
    return {
      title: CALL_TITLE,
      body: CALL_BODY,
      sound: RING_SOUND_FILE,
      categoryIdentifier: CATEGORIES.call,
      interruptionLevel: 'timeSensitive',
      data,
    };
  }
  if (item.kind === 'message') {
    return {
      title: MESSAGE_TITLE,
      body: text,
      sound: 'default',
      categoryIdentifier: CATEGORIES.message,
      interruptionLevel: 'timeSensitive',
      data,
    };
  }
  return {
    title: text.slice(0, NOTIFICATION_TITLE_MAX),
    body: '',
    sound: 'default',
    interruptionLevel: 'active',
    data,
  };
}

function toExpoTrigger(item: PlannedRequest): Notifications.NotificationTriggerInput {
  const t = item.trigger;
  if (t.type === 'daily') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: t.hour,
      minute: t.minute,
      channelId: t.channelId,
    };
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: t.date,
    channelId: t.channelId,
  };
}

/** Cancels any pending request for this reminder, then schedules it again. */
export async function scheduleReminderRequest(item: ReminderScheduleItem): Promise<void> {
  if (!isSupported()) return;
  await ensureReminderChannels();
  await Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    identifier: item.identifier,
    content: buildReminderContent(item),
    trigger: toExpoTrigger(item),
  });
}

/** Cancels the request for one reminder id. Never throws. */
export async function cancelReminderNotification(id: string): Promise<void> {
  if (!isSupported()) return;
  await Notifications.cancelScheduledNotificationAsync(`${REMINDER_NOTIF_PREFIX}${id}`).catch(() => undefined);
}

/** Ids of reminders that currently have a pending OS request (prefix stripped). */
export async function getPendingReminderIds(): Promise<string[]> {
  if (!isSupported()) return [];
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  return pending
    .map(n => n.identifier)
    .filter(id => id.startsWith(REMINDER_NOTIF_PREFIX))
    .map(id => id.slice(REMINDER_NOTIF_PREFIX.length));
}

/** Cancels every reminder-* and legacy call-reminder-* request. Returns how many were cancelled. */
export async function cancelAllReminderNotifications(): Promise<number> {
  if (!isSupported()) return 0;
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  let cancelled = 0;
  for (const n of pending) {
    if (n.identifier.startsWith(REMINDER_NOTIF_PREFIX) || n.identifier.startsWith(LEGACY_NOTIF_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined);
      cancelled++;
    }
  }
  return cancelled;
}

/**
 * Makes the OS queue match the plan. A pending request is kept when its data.fp equals the
 * planned fingerprint. Otherwise it is replaced. Legacy call-reminder-* ids are always cancelled.
 * Ids with any other prefix are never touched.
 */
export async function applySchedulePlan(items: ReminderScheduleItem[]): Promise<ApplyScheduleResult> {
  const result: ApplyScheduleResult = { added: 0, kept: 0, removed: 0, failed: 0 };
  if (!isSupported()) return result;
  await ensureReminderChannels();

  const wanted = new Map(items.map(item => [item.identifier, item]));
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const pendingByIdentifier = new Map<string, Notifications.NotificationRequest>();

  for (const n of pending) {
    const id = n.identifier;
    if (id.startsWith(LEGACY_NOTIF_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
      result.removed++;
      continue;
    }
    if (!id.startsWith(REMINDER_NOTIF_PREFIX)) continue;
    if (!wanted.has(id)) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
      result.removed++;
      continue;
    }
    pendingByIdentifier.set(id, n);
  }

  for (const item of items) {
    const existing = pendingByIdentifier.get(item.identifier);
    if (existing && fingerprintOf(existing) === item.fp) {
      result.kept++;
      continue;
    }
    try {
      if (existing) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => undefined);
      }
      await Notifications.scheduleNotificationAsync({
        identifier: item.identifier,
        content: buildReminderContent(item),
        trigger: toExpoTrigger(item),
      });
      result.added++;
    } catch (error) {
      result.failed++;
      console.warn(`[Reminders] Could not schedule ${item.identifier}:`, error);
    }
  }

  return result;
}

/**
 * Plans what happens when the user taps a notification or one of its action buttons.
 * Call reminders: Answer or a body tap opens the call screen, Decline records the decline.
 * Message reminders: a body tap opens the call screen in message mode, Done only records delivery.
 * Notification reminders: a tap opens the Reminders screen on that reminder.
 */
export function planResponse(data: ReminderNotificationData, actionIdentifier: string): ResponsePlan {
  const { reminderId, kind } = data;
  const isDefaultTap = actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER;

  // Timetable reminder, body tap (any kind): go straight to the topic's Classes tab.
  // Call Answer and message Done keep their existing behaviour below.
  if (data.src === 'tt' && isDefaultTap) {
    return {
      type: 'classes',
      reminderId,
      outcome: kind === 'call' ? 'answered' : 'delivered',
      nav: planOpenClass(data.t, reminderId).intent,
    };
  }

  if (kind === 'call') {
    if (actionIdentifier === ACTIONS.decline) {
      return { type: 'decline', reminderId, outcome: 'declined', dismiss: true };
    }
    if (actionIdentifier === ACTIONS.answer || isDefaultTap) {
      return {
        type: 'answer',
        reminderId,
        outcome: 'answered',
        nav: { name: 'ReminderCall', params: { reminderId, autoplay: true, mode: 'call' } },
      };
    }
    return { type: 'ignore' };
  }

  if (kind === 'message') {
    if (actionIdentifier === ACTIONS.done) {
      return { type: 'done', reminderId, outcome: 'delivered', dismiss: true };
    }
    if (isDefaultTap) {
      return {
        type: 'listen',
        reminderId,
        outcome: 'delivered',
        nav: { name: 'ReminderCall', params: { reminderId, autoplay: false, mode: 'message' } },
      };
    }
    return { type: 'ignore' };
  }

  if (isDefaultTap) {
    return {
      type: 'open',
      reminderId,
      outcome: 'delivered',
      nav: { name: 'Reminders', params: { highlightId: reminderId } },
    };
  }
  return { type: 'ignore' };
}

/**
 * Foreground routing for a received notification. Only call reminders take over the screen
 * (in-app ringing). Skipped when the same reminder is already ringing or on the call screen.
 */
export function planForeground(
  data: ReminderNotificationData,
  currentRoute: { name: string; params?: unknown } | undefined,
): NavigationIntent | null {
  if (data.kind !== 'call') return null;
  const params = currentRoute?.params as { reminderId?: unknown } | undefined;
  const alreadyShowing =
    (currentRoute?.name === 'IncomingCall' || currentRoute?.name === 'ReminderCall') &&
    params?.reminderId === data.reminderId;
  if (alreadyShowing) return null;
  return { name: 'IncomingCall', params: { reminderId: data.reminderId } };
}
