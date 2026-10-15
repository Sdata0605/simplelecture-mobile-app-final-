import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, User } from '../services/supabase';
import { sendWelcomeLoginNotification } from '../services/scheduledNotifications';
import { registerFcmToken, removeFcmToken } from '../services/fcmService';
import { maybeRequestReview } from '../utils/inAppReview';

const SESSION_COUNT_KEY = '@session_count';
const REVIEW_SESSION_THRESHOLD = 3;

async function incrementSessionAndMaybeReview() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_COUNT_KEY);
    const count = raw ? parseInt(raw, 10) : 0;
    const newCount = count + 1;
    await AsyncStorage.setItem(SESSION_COUNT_KEY, newCount.toString());
    if (newCount >= REVIEW_SESSION_THRESHOLD) {
      maybeRequestReview('session');
    }
  } catch {
    // non-critical, ignore
  }
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasSelectedInterests: boolean;
  hasSeenOnboarding: boolean;
  isNewSignup: boolean;
  hasEnrolledCourses: boolean | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  signup: (email: string, password: string, fullName: string, phone: string) => Promise<{ success: boolean; error?: string }>;
  loginWithOtp: (user: User, isSignup?: boolean) => void;
  loginWithGoogle: (idToken: string, isSignup?: boolean) => Promise<{ success: boolean; error?: string; user?: User }>;
  logout: () => Promise<void>;
  markInterestsSelected: () => void;
  markOnboardingSeen: () => Promise<void>;
  refreshUser: () => Promise<void>;
  resolveLandingTab: (userId: string) => Promise<'Dashboard' | 'Home'>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSelectedInterests, setHasSelectedInterests] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [isNewSignup, setIsNewSignup] = useState(false);
  const [hasEnrolledCourses, setHasEnrolledCourses] = useState<boolean | null>(null);

  useEffect(() => {
    // When the refresh token is definitively invalid/revoked (e.g. password
    // changed, logged out elsewhere), force a clean re-login.
    supabase.setSessionInvalidHandler(() => {
      supabase.logout();
      setUser(null);
      setHasEnrolledCourses(null);
    });
    return () => supabase.setSessionInvalidHandler(null);
  }, []);

  useEffect(() => {
    checkAuth();
  }, []);

  // Keep the session alive while the app is in use: refresh whenever the app
  // returns to the foreground and on a recurring timer (well under the ~1h
  // access-token lifetime). Without this the token expires after an hour and
  // API calls start failing with "JWT expired" until a full app restart.
  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.ensureFreshToken();
      }
    });
    const interval = setInterval(() => {
      supabase.ensureFreshToken();
    }, 10 * 60 * 1000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [user?.id]);

  useEffect(() => {
    let isCurrent = true;
    if (user) {
      setHasEnrolledCourses(null);
      supabase.checkHasEnrollments(user.id).then((result) => {
        console.log('[Auth] hasEnrolledCourses resolved:', result, 'for user', user.id);
        if (isCurrent) setHasEnrolledCourses(result);
      });
    } else {
      setHasEnrolledCourses(null);
    }
    return () => { isCurrent = false; };
  }, [user?.id]);

  // Resolves the tab a user should land on after auth, awaited so callers can
  // navigate deterministically (avoids the race where hasEnrolledCourses is
  // still null at the moment of navigation). Also syncs the context flag so the
  // navigator stays consistent.
  const resolveLandingTab = async (userId: string): Promise<'Dashboard' | 'Home'> => {
    try {
      const enrolled = await supabase.checkHasEnrollments(userId);
      setHasEnrolledCourses(enrolled);
      console.log('[Auth] resolveLandingTab ->', enrolled ? 'Dashboard' : 'Home', 'for user', userId);
      return enrolled ? 'Dashboard' : 'Home';
    } catch (e) {
      console.log('[Auth] resolveLandingTab error, defaulting Home:', e);
      return 'Home';
    }
  };

  const markOnboardingSeen = async () => {
    await AsyncStorage.setItem('@onboarding_seen', 'true');
    setHasSeenOnboarding(true);
  };

  const checkAuth = async () => {
    console.log('[Auth] checkAuth started');
    try {
      const storedUser = await supabase.getStoredUser();
      const interestsFlag = await AsyncStorage.getItem('@interests_selected');
      const onboardingFlag = await AsyncStorage.getItem('@onboarding_seen');
      setHasSelectedInterests(interestsFlag === 'true');
      setHasSeenOnboarding(onboardingFlag === 'true');
      console.log('[Auth] storedUser:', storedUser ? 'found' : 'none', '| interests:', interestsFlag, '| onboarding:', onboardingFlag);
      if (storedUser) {
        setUser(storedUser);
        // Count this app launch as a session for retained (auto-restored) users
        incrementSessionAndMaybeReview();
        const refreshWithTimeout = Promise.race([
          supabase.refreshSession(),
          new Promise<{ success: false; error: string }>((resolve) =>
            setTimeout(() => resolve({ success: false, error: 'Auth check timeout' }), 5000)
          ),
        ]);
        const refreshResult = await refreshWithTimeout;
        console.log('[Auth] refreshSession result:', refreshResult.success, refreshResult.error || '');
        if (!refreshResult.success) {
          const freshUser = await supabase.getStoredUser();
          if (freshUser) setUser(freshUser);
        }
      }
    } catch (error) {
      // A transient error here (storage read blip, refresh hiccup) must NOT log
      // the user out. Only an explicit logout or a definitive invalid-refresh
      // signal (handled by setSessionInvalidHandler) may clear the user. So we
      // deliberately do NOT setUser(null) here — we keep whatever was restored.
      console.log('[Auth] checkAuth error (session preserved):', error);
    } finally {
      console.log('[Auth] checkAuth complete, setting isLoading=false');
      setIsLoading(false);
    }
  };

  const markInterestsSelected = () => {
    setHasSelectedInterests(true);
    setIsNewSignup(false);
  };

  const login = async (email: string, password: string) => {
    const result = await supabase.login(email, password);
    if (result.success && result.user) {
      setUser(result.user);
      sendWelcomeLoginNotification();
      registerFcmToken(result.user.id);
      incrementSessionAndMaybeReview();
    }
    return { success: result.success, error: result.error, user: result.user };
  };

  const signup = async (email: string, password: string, fullName: string, phone: string) => {
    const result = await supabase.signup(email, password, fullName, phone);
    if (result.success && result.user) {
      setUser(result.user);
      setIsNewSignup(true);
      sendWelcomeLoginNotification();
      registerFcmToken(result.user.id);
      incrementSessionAndMaybeReview();
    }
    return { success: result.success, error: result.error };
  };

  const loginWithOtp = (userData: User, isSignup: boolean = false) => {
    setUser(userData);
    if (isSignup) setIsNewSignup(true);
    sendWelcomeLoginNotification();
    registerFcmToken(userData.id);
    incrementSessionAndMaybeReview();
  };

  const loginWithGoogle = async (idToken: string, isSignup: boolean = false) => {
    const result = await supabase.signInWithGoogle(idToken);
    if (result.success && result.user) {
      setUser(result.user);
      if (isSignup) setIsNewSignup(true);
      sendWelcomeLoginNotification();
      registerFcmToken(result.user.id);
      incrementSessionAndMaybeReview();
    }
    return { success: result.success, error: result.error, user: result.user };
  };

  const refreshUser = async () => {
    const result = await supabase.getUserProfile();
    if (result.success && result.user) {
      setUser(result.user);
    }
  };

  const logout = async () => {
    if (user) {
      await removeFcmToken(user.id);
    }
    await supabase.logout();
    setUser(null);
    setHasEnrolledCourses(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        hasSelectedInterests,
        hasSeenOnboarding,
        isNewSignup,
        hasEnrolledCourses,
        login,
        signup,
        loginWithOtp,
        loginWithGoogle,
        logout,
        markInterestsSelected,
        markOnboardingSeen,
        refreshUser,
        resolveLandingTab,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
