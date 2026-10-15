import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_TOKEN_KEY, getValidAccessToken } from './supabase';

const isExpoGo = Constants.appOwnership === 'expo';

async function getAccessToken(): Promise<string | null> {
  return getValidAccessToken();
}

export async function requestFcmPermission(): Promise<boolean> {
  if (isExpoGo) {
    console.log('[FCM] Expo Go detected — skipping permission request');
    return false;
  }

  const messaging = (await import('@react-native-firebase/messaging')).default;
  if (Platform.OS === 'ios') {
    const authStatus = await messaging().requestPermission();
    return (
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL
    );
  }
  return true;
}

export async function registerFcmToken(userId: string): Promise<void> {
  if (isExpoGo) {
    console.log('[FCM] Expo Go detected — skipping token registration');
    return;
  }

  try {
    const granted = await requestFcmPermission();
    if (!granted) {
      console.log('[FCM] Permission not granted — skipping token registration');
      return;
    }

    const messaging = (await import('@react-native-firebase/messaging')).default;
    const fcmToken = await messaging().getToken();
    if (!fcmToken) {
      console.warn('[FCM] Empty FCM token — skipping');
      return;
    }

    const accessToken = await getAccessToken();
    // on_conflict param tells PostgREST which unique constraint to use for the upsert
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/user_push_tokens?on_conflict=user_id,platform`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken ?? SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          user_id: userId,
          fcm_token: fcmToken,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.warn('[FCM] Supabase upsert failed:', err);
    } else {
      console.log('[FCM] Token registered for platform:', Platform.OS);
    }
  } catch (e) {
    console.warn('[FCM] Token registration failed:', e);
  }
}

export async function removeFcmToken(userId: string): Promise<void> {
  if (isExpoGo) {
    console.log('[FCM] Expo Go detected — skipping token removal');
    return;
  }

  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/user_push_tokens?user_id=eq.${userId}&platform=eq.${Platform.OS}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken ?? SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.warn('[FCM] Token removal failed:', err);
    } else {
      console.log('[FCM] Token removed for platform:', Platform.OS);
    }
  } catch (e) {
    console.warn('[FCM] Token removal failed:', e);
  }
}

export async function setupFcmForegroundListener(
  onMessage: (title: string, body: string, data?: Record<string, string>) => void
): Promise<() => void> {
  if (isExpoGo) {
    console.log('[FCM] Expo Go detected — skipping foreground listener setup');
    return () => {};
  }

  const messaging = (await import('@react-native-firebase/messaging')).default;
  const unsubscribe = messaging().onMessage(async (remoteMessage) => {
    const title = remoteMessage.notification?.title ?? 'Simple Lecture';
    const body = remoteMessage.notification?.body ?? '';
    const data = remoteMessage.data as Record<string, string> | undefined;
    onMessage(title, body, data);
  });
  return unsubscribe;
}
