// Permissions for Reminders: notifications (all platforms) and exact alarms (Android 12+).
// Spec: _scratch/reminders-v2-plan.md sections D-13, D-14, F.4.
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { NavigationContext } from '@react-navigation/native';
import {
  canScheduleExactAlarms,
  openExactAlarmSettings as openExactAlarmSettingsNative,
} from '../../modules/exact-alarm';
import { syncReminders } from '../services/reminders';

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';
export type ExactAlarmPermission = 'granted' | 'denied' | 'not-applicable';

const ANDROID_EXACT_ALARM_API = 31; // Android 12

function exactAlarmsApplicable(): boolean {
  return Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= ANDROID_EXACT_ALARM_API;
}

function toNotificationPermission(status: string): NotificationPermission {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

export function useReminderPermissions(): {
  notifications: NotificationPermission;
  exactAlarms: ExactAlarmPermission;
  requestNotifications(): Promise<boolean>;
  openNotificationSettings(): void;
  openExactAlarmSettings(): void;
  recheck(): Promise<void>;
} {
  const [notifications, setNotifications] = useState<NotificationPermission>('undetermined');
  // Optimistic 'granted' until the first check, so the banner does not flash on screen open.
  const [exactAlarms, setExactAlarms] = useState<ExactAlarmPermission>(
    exactAlarmsApplicable() ? 'granted' : 'not-applicable',
  );

  // Last known states. null means "not checked yet", so the first check never triggers a sync.
  const prevNotification = useRef<NotificationPermission | null>(null);
  const prevExact = useRef<ExactAlarmPermission | null>(null);
  const mounted = useRef(false);

  const recheck = useCallback(async (): Promise<void> => {
    let nextNotification: NotificationPermission | null = null;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      nextNotification = toNotificationPermission(status);
    } catch {
      nextNotification = null; // keep the last known value on error
    }

    let nextExact: ExactAlarmPermission = 'not-applicable';
    if (exactAlarmsApplicable()) {
      try {
        nextExact = (await canScheduleExactAlarms()) ? 'granted' : 'denied';
      } catch {
        nextExact = 'granted'; // native check failed: do not warn
      }
    }

    if (!mounted.current) return;

    const becameGranted =
      (nextNotification === 'granted' && prevNotification.current !== null && prevNotification.current !== 'granted') ||
      (nextExact === 'granted' && prevExact.current !== null && prevExact.current !== 'granted');

    if (nextNotification !== null) {
      prevNotification.current = nextNotification;
      setNotifications(nextNotification);
    }
    prevExact.current = nextExact;
    setExactAlarms(nextExact);

    // Permission flipped to granted: re-schedule so alarms become exact / notifications can ring.
    if (becameGranted) {
      syncReminders('permission').catch(() => undefined);
    }
  }, []);

  const requestNotifications = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      await recheck();
      return status === 'granted';
    } catch {
      return false;
    }
  }, [recheck]);

  const openNotificationSettings = useCallback((): void => {
    Linking.openSettings().catch(() => undefined);
  }, []);

  const openExactAlarmSettings = useCallback((): void => {
    openExactAlarmSettingsNative();
  }, []);

  // Check on mount and whenever the app returns to the foreground.
  useEffect(() => {
    mounted.current = true;
    void recheck();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recheck();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [recheck]);

  // Check when the hosting screen gains focus. Safe outside a navigator (no context, no listener).
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    if (!navigation) return undefined;
    return navigation.addListener('focus', () => {
      void recheck();
    });
  }, [navigation, recheck]);

  return {
    notifications,
    exactAlarms,
    requestNotifications,
    openNotificationSettings,
    openExactAlarmSettings,
    recheck,
  };
}
