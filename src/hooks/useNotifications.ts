import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { type EventSubscription } from 'expo-modules-core';
import Constants from 'expo-constants';
import {
  saveNotification,
  getNotifications,
  getUnreadCount,
  StoredNotification,
} from '../services/notificationStorage';

export function useNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationListener = useRef<EventSubscription | undefined>(undefined);
  const responseListener = useRef<EventSubscription | undefined>(undefined);
  const lastResponseId = useRef<string | null>(null);

  const refreshNotifications = useCallback(async () => {
    const stored = await getNotifications();
    setNotifications(stored);
    const count = await getUnreadCount();
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    refreshNotifications();

    Notifications.getLastNotificationResponseAsync().then(async (response) => {
      if (response && response.notification.request.identifier !== lastResponseId.current) {
        lastResponseId.current = response.notification.request.identifier;
        await storeFromNotification(response.notification);
        await refreshNotifications();
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(async (notif) => {
      setNotification(notif);
      await storeFromNotification(notif);
      await refreshNotifications();
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const notif = response.notification;
      if (notif.request.identifier !== lastResponseId.current) {
        lastResponseId.current = notif.request.identifier;
        await storeFromNotification(notif);
        await refreshNotifications();
      }
    });

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshNotifications();
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      subscription.remove();
    };
  }, []);

  const storeFromNotification = async (notif: Notifications.Notification) => {
    const content = notif.request.content;
    await saveNotification({
      title: content.title || 'Notification',
      body: content.body || '',
      type: (content.data?.type as string) || 'general',
      data: (content.data as Record<string, any>) || {},
    });
  };

  const registerForPushNotifications = async (): Promise<string | null> => {
    if (!Device.isDevice) {
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    setPermissionStatus(finalStatus);

    if (finalStatus !== 'granted') {
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Simple Lecture',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2BBD6E',
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      ?? Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId || undefined,
    });
    const token = tokenData.data;
    setExpoPushToken(token);
    return token;
  };

  return {
    expoPushToken,
    permissionStatus,
    notification,
    notifications,
    unreadCount,
    registerForPushNotifications,
    refreshNotifications,
  };
}
