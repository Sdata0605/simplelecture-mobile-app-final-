import { useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from '../../navigation/AppNavigator';
import { FEATURES } from '../../constants/featureFlags';
import { syncReminders, markOutcome, getReminderLocal } from '../../services/reminders';
import {
  readReminderData,
  planResponse,
  planForeground,
  type NavigationIntent,
  type ResponsePlan,
} from '../../services/reminders/notifications';

const FOREGROUND_SYNC_MIN_INTERVAL_MS = 60 * 1000;
// getLastNotificationResponseAsync keeps returning the previous tap on every launch,
// so a cold-start response is only acted on when it is this recent.
const COLD_START_MAX_AGE_MS = 10 * 60 * 1000;
const READY_RETRY_MS = 500;
const READY_MAX_ATTEMPTS = 20;
const HANDLED_KEYS_STORAGE = 'reminders.handledResponses';
const HANDLED_KEYS_MAX = 20;

// A response can arrive through the listener and through getLastNotificationResponseAsync.
// Handle each one once, also across app restarts.
const handledInMemory = new Set<string>();

type LooseNavigator = { navigate(name: string, params?: object): void; getCurrentRoute(): { name: string; params?: unknown } | undefined };

/**
 * Runs `run` once the root navigator is mounted. Gives up after a few seconds.
 * Resolves true when `run` completed, false when the navigator never became ready or `run` threw.
 */
function navigateWhenReady(run: (nav: LooseNavigator) => void, attempt = 0): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const tryOnce = (n: number) => {
      const nav = navigationRef.current;
      if (nav && nav.isReady()) {
        try {
          run(nav as unknown as LooseNavigator);
          resolve(true);
        } catch {
          resolve(false);
        }
        return;
      }
      if (n >= READY_MAX_ATTEMPTS) {
        resolve(false);
        return;
      }
      setTimeout(() => tryOnce(n + 1), READY_RETRY_MS);
    };
    tryOnce(attempt);
  });
}

function go(intent: NavigationIntent): Promise<boolean> {
  return navigateWhenReady(nav => nav.navigate(intent.name, intent.params));
}

/** Local calendar day of a stored instant, as 'YYYY-MM-DD'. */
function localDayKey(iso: string): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Records a response key. Returns false when it was already handled, in this session or before. */
async function claimResponse(key: string): Promise<boolean> {
  if (handledInMemory.has(key)) return false;
  handledInMemory.add(key);
  try {
    const raw = await AsyncStorage.getItem(HANDLED_KEYS_STORAGE);
    const keys: string[] = raw ? JSON.parse(raw) : [];
    if (keys.includes(key)) return false;
    await AsyncStorage.setItem(HANDLED_KEYS_STORAGE, JSON.stringify([key, ...keys].slice(0, HANDLED_KEYS_MAX)));
  } catch (e) {
    console.warn('[Reminders] could not persist response key', e);
  }
  return true;
}

function dismiss(identifier: string) {
  Notifications.dismissNotificationAsync(identifier).catch(() => {});
}

async function runPlan(plan: ResponsePlan, identifier: string) {
  switch (plan.type) {
    case 'ignore':
      return;
    case 'decline':
      dismiss(identifier);
      await markOutcome(plan.reminderId, 'declined').catch((e: unknown) => console.warn('[Reminders] decline failed', e));
      break;
    case 'answer':
      // Only record the answer once the call screen is actually shown. Otherwise the reminder stays pending for a later sync.
      if (await go(plan.nav)) {
        await markOutcome(plan.reminderId, 'answered').catch((e: unknown) => console.warn('[Reminders] answer failed', e));
      } else {
        console.warn('[Reminders] call screen not reached; reminder left pending', plan.reminderId);
      }
      break;
    case 'listen':
      // Only record delivery once the call screen is actually shown. Otherwise the reminder stays pending for a later sync.
      if (await go(plan.nav)) {
        await markOutcome(plan.reminderId, 'delivered').catch((e: unknown) => console.warn('[Reminders] delivered failed', e));
      } else {
        console.warn('[Reminders] message screen not reached; reminder left pending', plan.reminderId);
      }
      break;
    case 'done':
      dismiss(identifier);
      await markOutcome(plan.reminderId, 'delivered').catch((e: unknown) => console.warn('[Reminders] done failed', e));
      break;
    case 'open': {
      const reminder = await getReminderLocal(plan.reminderId).catch(() => null);
      const focusDate = reminder ? localDayKey(reminder.scheduled_at) : undefined;
      const tab = reminder?.section === 'daily' ? 'daily' : 'calendar';
      go({ name: 'Reminders', params: { ...plan.nav.params, tab, ...(focusDate ? { focusDate } : {}) } });
      await markOutcome(plan.reminderId, 'delivered').catch((e: unknown) => console.warn('[Reminders] open failed', e));
      break;
    }
  }
  syncReminders('response').catch((e: unknown) => console.warn('[Reminders] sync after response failed', e));
}

async function handleResponse(response: Notifications.NotificationResponse) {
  const data = readReminderData(response.notification.request.content.data);
  if (!data) return;

  const key = `${response.notification.request.identifier}:${response.notification.date}`;
  if (!(await claimResponse(key))) return;

  const plan = planResponse(data, response.actionIdentifier);
  await runPlan(plan, response.notification.request.identifier);
}

function handleReceived(notification: Notifications.Notification) {
  const data = readReminderData(notification.request.content.data);
  if (!data) return;
  // App is in the foreground: call reminders show the in-app ringing screen instead of a banner.
  navigateWhenReady(nav => {
    const route = nav.getCurrentRoute();
    const intent = planForeground(data, route);
    if (!intent) return;
    // A second call while IncomingCall is open for another reminder: record the first one as missed so it is not lost.
    if (route?.name === 'IncomingCall') {
      const openId = (route.params as { reminderId?: unknown } | undefined)?.reminderId;
      if (typeof openId === 'string' && openId !== data.reminderId) {
        markOutcome(openId, 'missed').catch((e: unknown) => console.warn('[Reminders] missed failed', e));
      }
    }
    nav.navigate(intent.name, intent.params);
  });
}

/**
 * Mounted once in App.tsx. Renders nothing. Routes reminder ring, Answer, Decline, Done and taps,
 * and runs a throttled foreground sync. Does nothing when the reminders flag is off.
 */
export default function ReminderNotificationBridge(): null {
  useEffect(() => {
    if (!FEATURES.reminders || Platform.OS === 'web') return;

    let lastForegroundSync = 0;
    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (now - lastForegroundSync < FOREGROUND_SYNC_MIN_INTERVAL_MS) return;
      lastForegroundSync = now;
      syncReminders('foreground').catch((e: unknown) => console.warn('[Reminders] foreground sync failed', e));
    });

    const receivedSub = Notifications.addNotificationReceivedListener(handleReceived);
    const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
      handleResponse(response).catch((e: unknown) => console.warn('[Reminders] response failed', e));
    });
    Notifications.getLastNotificationResponseAsync()
      .then(response => {
        if (!response) return;
        if (Date.now() - response.notification.date > COLD_START_MAX_AGE_MS) return;
        return handleResponse(response);
      })
      .catch(() => {});

    return () => {
      appStateSub.remove();
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  return null;
}
