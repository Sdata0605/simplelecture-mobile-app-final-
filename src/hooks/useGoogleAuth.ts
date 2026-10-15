import { useEffect, useState, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest, ResponseType } from 'expo-auth-session';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

function getClientIdForPlatform(): string | undefined {
  if (Platform.OS === 'android') return GOOGLE_ANDROID_CLIENT_ID || GOOGLE_CLIENT_ID;
  if (Platform.OS === 'ios') return GOOGLE_IOS_CLIENT_ID || GOOGLE_CLIENT_ID;
  return GOOGLE_CLIENT_ID;
}

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const hasGoogleCredentials = !!getClientIdForPlatform();

export function useGoogleAuth() {
  const [googleError, setGoogleError] = useState<string | null>(null);

  const clientId = getClientIdForPlatform() || 'not-configured';
  const redirectUri = makeRedirectUri({ scheme: 'com.edulearn.mobile' });

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId,
      responseType: ResponseType.IdToken,
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
    },
    discovery
  );

  const idToken =
    response?.type === 'success' ? response.params?.id_token ?? null : null;

  useEffect(() => {
    if (!hasGoogleCredentials) return;

    if (response?.type === 'error') {
      setGoogleError(response.error?.message || 'Google sign-in failed');
    } else if (response?.type === 'dismiss') {
      setGoogleError(null);
    } else if (response?.type === 'success' && !response.params?.id_token) {
      setGoogleError('Google sign-in did not return a valid token');
    } else {
      setGoogleError(null);
    }
  }, [response]);

  return {
    isAvailable: hasGoogleCredentials,
    request: hasGoogleCredentials ? request : null,
    response,
    promptAsync,
    idToken,
    googleError,
  };
}
