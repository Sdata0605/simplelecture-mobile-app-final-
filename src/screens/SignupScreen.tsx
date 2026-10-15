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
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { useGoogleAuth } from '../hooks/useGoogleAuth';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Signup'>;

export default function SignupScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { loginWithGoogle } = useAuth();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [otpMethod, setOtpMethod] = useState<'phone' | 'email' | null>(null);
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
    const result = await loginWithGoogle(idToken, true);
    setIsGoogleLoading(false);
    if (result.success) {
      (navigation as any).navigate('InterestSelection');
    } else {
      setError(result.error || 'Google sign-in failed');
    }
  };

  const validateForm = (): boolean => {
    if (!fullName.trim()) {
      setError('Please enter your full name');
      return false;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return false;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return false;
    }
    return true;
  };

  const handleSendOtp = async (method: 'phone' | 'email') => {
    setError('');
    if (!validateForm()) return;

    setOtpMethod(method);
    setIsLoading(true);

    const cleanPhone = phone.replace(/\D/g, '');
    const signupData = {
      full_name: fullName.trim(),
      phone: cleanPhone,
      email: email.trim(),
    };

    let result;
    if (method === 'phone') {
      result = await supabase.sendPhoneOtp(cleanPhone, 'signup');
    } else {
      result = await supabase.sendEmailOtp(email.trim(), 'signup');
    }

    setIsLoading(false);
    setOtpMethod(null);

    if (result.success) {
      (navigation as any).navigate('OtpVerification', {
        type: method,
        identifier: method === 'phone' ? cleanPhone : email.trim(),
        purpose: 'signup',
        signupData,
      });
    } else {
      setError(result.error || 'Failed to send OTP. Please try again.');
    }
  };

  const isFormComplete = fullName.trim().length > 0
    && phone.replace(/\D/g, '').length === 10
    && email.trim().length > 0
    && email.includes('@');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          data-testid="button-back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            Sign up to start your learning journey
          </Text>
        </View>

        {isGoogleAvailable && (
          <>
            <TouchableOpacity
              style={[styles.googleButton, (isGoogleLoading || isLoading) && styles.googleButtonDisabled]}
              onPress={() => promptAsync()}
              disabled={!request || isGoogleLoading || isLoading}
              data-testid="button-google-signup"
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

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or sign up with OTP</Text>
              <View style={styles.dividerLine} />
            </View>
          </>
        )}

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              placeholderTextColor={colors.textMuted}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              data-testid="input-fullname"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.phonePrefix}>+91</Text>
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              placeholderTextColor={colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={10}
              data-testid="input-phone"
            />
          </View>

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
              data-testid="input-email"
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={styles.otpChoiceLabel}>Choose how to verify your account:</Text>

          <TouchableOpacity
            style={[styles.otpButton, (!isFormComplete || isLoading) && styles.otpButtonDisabled]}
            onPress={() => handleSendOtp('phone')}
            disabled={!isFormComplete || isLoading}
            data-testid="button-otp-phone"
          >
            {isLoading && otpMethod === 'phone' ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="call-outline" size={20} color={(!isFormComplete || isLoading) ? colors.textMuted : colors.white} />
                <Text style={[styles.otpButtonText, (!isFormComplete || isLoading) && styles.otpButtonTextDisabled]}>
                  Send OTP to Phone
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.otpButtonOutline, (!isFormComplete || isLoading) && styles.otpButtonOutlineDisabled]}
            onPress={() => handleSendOtp('email')}
            disabled={!isFormComplete || isLoading}
            data-testid="button-otp-email"
          >
            {isLoading && otpMethod === 'email' ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <>
                <Ionicons name="mail-outline" size={20} color={(!isFormComplete || isLoading) ? colors.textMuted : colors.primary} />
                <Text style={[styles.otpButtonOutlineText, (!isFormComplete || isLoading) && styles.otpButtonOutlineTextDisabled]}>
                  Send OTP to Email
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Login</Text>
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
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.xxl,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  googleButton: {
    height: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.gray300,
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
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.gray300,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  form: {
    gap: spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    height: 56,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  phonePrefix: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginRight: spacing.sm,
    paddingRight: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: colors.gray300,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
  },
  errorText: {
    color: '#EF4444',
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  otpChoiceLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  otpButton: {
    height: 56,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  otpButtonDisabled: {
    backgroundColor: colors.gray300,
    shadowOpacity: 0,
    elevation: 0,
  },
  otpButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  otpButtonTextDisabled: {
    color: colors.textMuted,
  },
  otpButtonOutline: {
    height: 56,
    backgroundColor: 'transparent',
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  otpButtonOutlineDisabled: {
    borderColor: colors.gray300,
  },
  otpButtonOutlineText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  otpButtonOutlineTextDisabled: {
    color: colors.textMuted,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  loginLink: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
});
