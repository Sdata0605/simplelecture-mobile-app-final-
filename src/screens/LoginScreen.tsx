import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { useGoogleAuth } from '../hooks/useGoogleAuth';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

type AuthTab = 'phone' | 'emailOtp' | 'password';

export default function LoginScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { login, loginWithGoogle, resolveLandingTab } = useAuth();

  const [activeTab, setActiveTab] = useState<AuthTab>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const { isAvailable: isGoogleAvailable, request, idToken, googleError, promptAsync } = useGoogleAuth();

  useEffect(() => {
    if (idToken) {
      handleGoogleSignIn(idToken);
    }
  }, [idToken]);

  useEffect(() => {
    if (googleError) {
      setError(googleError);
      setIsGoogleLoading(false);
    }
  }, [googleError]);

  const handleGoogleSignIn = async (idToken: string) => {
    setIsGoogleLoading(true);
    setError('');
    const result = await loginWithGoogle(idToken, false);
    setIsGoogleLoading(false);
    if (result.success) {
      const initialTab = result.user ? await resolveLandingTab(result.user.id) : 'Home';
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { initialTab } }] });
    } else {
      setError(result.error || 'Google sign-in failed');
    }
  };

  const handleSendPhoneOtp = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }
    setIsLoading(true);
    setError('');
    const result = await supabase.sendPhoneOtp(cleanPhone, 'login');
    setIsLoading(false);
    if (result.success) {
      navigation.navigate('OtpVerification', {
        type: 'phone',
        identifier: cleanPhone,
        purpose: 'login',
      });
    } else {
      setError(result.error || 'Failed to send OTP');
    }
  };

  const handleSendEmailOtp = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    setIsLoading(true);
    setError('');
    const result = await supabase.sendEmailOtp(email, 'login');
    setIsLoading(false);
    if (result.success) {
      navigation.navigate('OtpVerification', {
        type: 'email',
        identifier: email,
        purpose: 'login',
      });
    } else {
      setError(result.error || 'Failed to send OTP');
    }
  };

  const handlePasswordLogin = async () => {
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }
    setIsLoading(true);
    setError('');
    const result = await login(email, password);
    setIsLoading(false);
    if (result.success) {
      const initialTab = result.user ? await resolveLandingTab(result.user.id) : 'Home';
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { initialTab } }] });
    } else {
      setError(result.error || 'Login failed');
    }
  };

  const tabs: { key: AuthTab; label: string; icon: string }[] = [
    { key: 'phone', label: 'Phone', icon: 'call-outline' },
    { key: 'emailOtp', label: 'Email OTP', icon: 'mail-outline' },
    { key: 'password', label: 'Password', icon: 'lock-closed-outline' },
  ];

  const renderPhoneTab = () => (
    <>
      <View style={styles.inputContainer}>
        <View style={styles.prefixContainer}>
          <Text style={styles.prefixText}>+91</Text>
        </View>
        <TextInput
          style={styles.phoneInput}
          placeholder="Phone number"
          placeholderTextColor={colors.textMuted}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={10}
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.actionButton, isLoading && styles.actionButtonDisabled]}
        onPress={handleSendPhoneOtp}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.actionButtonText}>Send OTP</Text>
        )}
      </TouchableOpacity>
    </>
  );

  const renderEmailOtpTab = () => (
    <>
      <View style={styles.inputContainer}>
        <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.actionButton, isLoading && styles.actionButtonDisabled]}
        onPress={handleSendEmailOtp}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.actionButtonText}>Send OTP</Text>
        )}
      </TouchableOpacity>
    </>
  );

  const renderPasswordTab = () => (
    <>
      <View style={styles.inputContainer}>
        <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
          <Ionicons
            name={showPassword ? 'eye-outline' : 'eye-off-outline'}
            size={20}
            color={colors.textMuted}
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.forgotPassword}
        onPress={() => navigation.navigate('ForgotPassword')}
      >
        <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
      </TouchableOpacity>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.actionButton, isLoading && styles.actionButtonDisabled]}
        onPress={handlePasswordLogin}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.actionButtonText}>Login</Text>
        )}
      </TouchableOpacity>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Welcome Back!</Text>
          <Text style={styles.subtitle}>
            Sign in to continue your learning journey
          </Text>
        </View>

        <View style={styles.tabContainer}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => {
                setActiveTab(tab.key);
                setError('');
              }}
            >
              <Ionicons
                name={tab.icon as any}
                size={16}
                color={activeTab === tab.key ? colors.white : colors.primary}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.key && styles.tabTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.form}>
          {activeTab === 'phone' && renderPhoneTab()}
          {activeTab === 'emailOtp' && renderEmailOtpTab()}
          {activeTab === 'password' && renderPasswordTab()}
        </View>

        {isGoogleAvailable && (
          <>
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.googleButton, (isGoogleLoading || isLoading) && styles.googleButtonDisabled]}
              onPress={() => promptAsync()}
              disabled={!request || isGoogleLoading || isLoading}
              data-testid="button-google-login"
            >
              {isGoogleLoading ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
            <Text style={styles.signUpText}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: spacing.xxl * 2,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.xxxl,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.gray[100],
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  tabActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  tabTextActive: {
    color: colors.white,
  },
  form: {
    gap: spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    height: 56,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  prefixContainer: {
    paddingRight: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: colors.gray[300],
    marginRight: spacing.sm,
    height: 30,
    justifyContent: 'center',
  },
  prefixText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  phoneInput: {
    flex: 1,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
  },
  forgotPasswordText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  actionButton: {
    backgroundColor: colors.primary,
    height: 56,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  errorText: {
    color: '#ef4444',
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.gray[300],
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  googleButton: {
    height: 56,
    backgroundColor: colors.white || '#FFFFFF',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.gray[300],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 'auto',
    paddingVertical: spacing.lg,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  signUpText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
