import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { navigationRef } from '../../navigation/AppNavigator';
import { isCallRemindersEnabled } from '../../constants/featureFlags';
import {
  ensureCallChannelAndCategory,
  markStatus,
  reconcileMissed,
  rescheduleAllCallReminders,
} from '../../services/callReminders';
import { CALL_ACTION_ANSWER, CALL_ACTION_DECLINE } from '../../types/callReminder';

const RESYNC_MIN_INTERVAL_MS = 60 * 1000;
// getLastNotificationResponseAsync keeps returning the previous tap on every launch,
// so a cold-start response is only acted on when it is this recent.
const COLD_START_MAX_AGE_MS = 10 * 60 * 1000;
const READY_RETRY_MS = 500;
const READY_MAX_ATTEMPTS = 20;

// A response can arrive through the listener and through getLastNotificationResponseAsync.
// Handle each one once.
const handledResponses = new Set<string>();

type CallData = { type: 'call_reminder'; reminderId: string };

function callDataOf(content: { data?: unknown }): CallData | null {
  const data = content.data as Record<string, unknown> | undefined;
  if (!data || data.type !== 'call_reminder' || typeof data.reminderId !== 'string') return null;
  return { type: 'call_reminder', reminderId: data.reminderId };
}

/** Runs `go` once the root navigator is mounted. Gives up after a few seconds. */
function navigateWhenReady(go: (nav: NonNullable<typeof navigationRef.current>) => void, attempt = 0) {
  const nav = navigationRef.current;
  if (nav?.isReady()) {
    go(nav);
    return;
  }
  if (attempt >= READY_MAX_ATTEMPTS) return;
  setTimeout(() => navigateWhenReady(go, attempt + 1), READY_RETRY_MS);
}

function handleResponse(response: Notifications.NotificationResponse) {
  const call = callDataOf(response.notification.request.content);
  if (!call) return;

  const key = `${response.notification.request.identifier}:${response.notification.date}`;
  if (handledResponses.has(key)) return;
  handledResponses.add(key);

  const { reminderId } = call;
  if (response.actionIdentifier === CALL_ACTION_DECLINE) {
    markStatus(reminderId, 'declined').catch(e => console.warn('[CallReminders] decline failed', e));
    Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});
    return;
  }
  if (
    response.actionIdentifier === CALL_ACTION_ANSWER ||
    response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
  ) {
    markStatus(reminderId, 'answered').catch(e => console.warn('[CallReminders] answer failed', e));
    navigateWhenReady(nav => nav.navigate('ReminderCall', { reminderId, autoplay: true }));
  }
}

function handleColdStartResponse(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  if (Date.now() - response.notification.date > COLD_START_MAX_AGE_MS) return;
  handleResponse(response);
}

function handleReceived(notification: Notifications.Notification) {
  const call = callDataOf(notification.request.content);
  if (!call) return;
  // App is in the foreground: show the in-app ringing screen instead of a banner.
  navigateWhenReady(nav => nav.navigate('IncomingCall', { reminderId: call.reminderId }));
}

/**
 * Mounted once in App.tsx. Renders nothing. Keeps call reminders scheduled,
 * and routes ring, Answer and Decline. Does nothing when the flag is off.
 */
export default function CallReminderNotificationBridge(): null {
  useEffect(() => {
    if (!isCallRemindersEnabled()) return;

    let lastSync = 0;
    const sync = () => {
      lastSync = Date.now();
      ensureCallChannelAndCategory()
        .then(() => reconcileMissed())
        .then(() => rescheduleAllCallReminders())
        .catch(e => console.warn('[CallReminders] sync failed', e));
    };
    sync();

    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && Date.now() - lastSync > RESYNC_MIN_INTERVAL_MS) sync();
    });
    const receivedSub = Notifications.addNotificationReceivedListener(handleReceived);
    const responseSub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    Notifications.getLastNotificationResponseAsync()
      .then(handleColdStartResponse)
      .catch(() => {});

    return () => {
      appStateSub.remove();
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  return null;
}
