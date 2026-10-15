import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, spacing, borderRadius, fontSize } from '../constants/theme';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

type OtpVerificationParams = {
  type: 'phone' | 'email';
  identifier: string;
  purpose: 'login' | 'signup';
  signupData?: { full_name?: string; email?: string; phone?: string };
};

type Props = NativeStackScreenProps<RootStackParamList, 'OtpVerification'>;

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;
const MAX_RESEND_ATTEMPTS = 3;

export default function OtpVerificationScreen({ route, navigation }: Props) {
  const params = route.params as unknown as OtpVerificationParams;
  const { type, identifier, purpose, signupData } = params;

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(RESEND_COOLDOWN);
  const [resendCount, setResendCount] = useState(0);
  const [isResending, setIsResending] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const { loginWithOtp, resolveLandingTab } = useAuth();

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  useEffect(() => {
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 300);
  }, []);

  const handleOtpChange = useCallback((value: string, index: number) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').split('').slice(0, OTP_LENGTH);
      const newOtp = Array(OTP_LENGTH).fill('');
      digits.forEach((digit, i) => {
        if (i < OTP_LENGTH) newOtp[i] = digit;
      });
      setOtp(newOtp);
      const nextEmpty = digits.length < OTP_LENGTH ? digits.length : OTP_LENGTH - 1;
      inputRefs.current[nextEmpty]?.focus();
      return;
    }

    const digit = value.replace(/\D/g, '');
    setOtp((prev) => {
      const newOtp = [...prev];
      newOtp[index] = digit;
      return newOtp;
    });
    setError(null);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyPress = useCallback((key: string, index: number) => {
    if (key === 'Backspace') {
      setOtp((prev) => {
        if (!prev[index] && index > 0) {
          inputRefs.current[index - 1]?.focus();
          const newOtp = [...prev];
          newOtp[index - 1] = '';
          return newOtp;
        }
        const newOtp = [...prev];
        newOtp[index] = '';
        return newOtp;
      });
    }
  }, []);

  const handleVerify = async () => {
    const otpCode = otp.join('');
    if (otpCode.length !== OTP_LENGTH) {
      setError('Please enter all 6 digits');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      let result;
      if (type === 'phone') {
        const phoneSignupData = signupData
          ? { full_name: signupData.full_name || '', ...(signupData.email ? { email: signupData.email } : {}) }
          : undefined;
        result = await supabase.verifyPhoneOtp(identifier, otpCode, purpose, phoneSignupData);
      } else {
        const emailSignupData = signupData
          ? { full_name: signupData.full_name || '', ...(signupData.phone ? { phone: signupData.phone } : {}) }
          : undefined;
        result = await supabase.verifyEmailOtp(identifier, otpCode, purpose, emailSignupData);
      }

      if (result.success) {
        if (result.user) {
          const isSignupFlow = purpose === 'signup';
          loginWithOtp(result.user, isSignupFlow);
          if (isSignupFlow) {
            navigation.reset({
              index: 0,
              routes: [{ name: 'InterestSelection' }],
            });
          } else {
            const initialTab = await resolveLandingTab(result.user.id);
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs', params: { initialTab } }],
            });
          }
        } else if (purpose === 'signup' && !signupData) {
          navigation.navigate('Signup' as any, {
            otpVerified: true,
            type,
            identifier,
          });
        } else {
          navigation.reset({
            index: 0,
            routes: [{ name: purpose === 'signup' ? 'InterestSelection' : 'MainTabs' }],
          });
        }
      } else {
        setError(result.error || 'Verification failed. Please try again.');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || resendCount >= MAX_RESEND_ATTEMPTS || isResending) return;

    setIsResending(true);
    setError(null);

    try {
      let result;
      if (type === 'phone') {
        result = await supabase.sendPhoneOtp(identifier, purpose);
      } else {
        result = await supabase.sendEmailOtp(identifier, purpose);
      }

      if (result.success) {
        setResendCount((prev) => prev + 1);
        setResendTimer(RESEND_COOLDOWN);
        setOtp(Array(OTP_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
        Alert.alert('OTP Sent', `A new OTP has been sent to your ${type === 'phone' ? 'phone' : 'email'}.`);
      } else {
        setError(result.error || 'Failed to resend OTP.');
      }
    } catch (err) {
      setError('Failed to resend OTP. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const maskedIdentifier =
    type === 'phone'
      ? identifier.replace(/(\d{2})\d+(\d{2})/, '$1****$2')
      : identifier.replace(/(.{2}).+(@)/, '$1****$2');

  const canResend = resendTimer === 0 && resendCount < MAX_RESEND_ATTEMPTS && !isResending;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Verify OTP</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to
            </Text>
            <Text style={styles.identifier}>{maskedIdentifier}</Text>
          </View>

          <View style={styles.otpContainer}>
            {Array.from({ length: OTP_LENGTH }).map((_, index) => (
              <TextInput
                key={index}
                ref={(ref) => { inputRefs.current[index] = ref; }}
                style={[
                  styles.otpInput,
                  otp[index] ? styles.otpInputFilled : null,
                  error ? styles.otpInputError : null,
                ]}
                value={otp[index]}
                onChangeText={(value) => handleOtpChange(value, index)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                keyboardType="number-pad"
                maxLength={index === 0 ? OTP_LENGTH : 1}
                selectTextOnFocus
                testID={`input-otp-${index}`}
              />
            ))}
          </View>

          {error && (
            <Text style={styles.errorText} testID="text-otp-error">
              {error}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.verifyButton, isVerifying && styles.verifyButtonDisabled]}
            onPress={handleVerify}
            disabled={isVerifying}
            testID="button-verify-otp"
          >
            {isVerifying ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.verifyButtonText}>Verify OTP</Text>
            )}
          </TouchableOpacity>

          <View style={styles.resendContainer}>
            {resendTimer > 0 ? (
              <Text style={styles.timerText} testID="text-resend-timer">
                Resend OTP in {resendTimer}s
              </Text>
            ) : (
              <TouchableOpacity
                onPress={handleResend}
                disabled={!canResend}
                testID="button-resend-otp"
              >
                {isResending ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text
                    style={[
                      styles.resendText,
                      !canResend && styles.resendTextDisabled,
                    ]}
                  >
                    {resendCount >= MAX_RESEND_ATTEMPTS
                      ? 'Maximum resend attempts reached'
                      : 'Resend OTP'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            {resendCount > 0 && resendCount < MAX_RESEND_ATTEMPTS && (
              <Text style={styles.attemptsText} testID="text-resend-attempts">
                {MAX_RESEND_ATTEMPTS - resendCount} resend{MAX_RESEND_ATTEMPTS - resendCount !== 1 ? 's' : ''} remaining
              </Text>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  backButton: {
    marginBottom: spacing.lg,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: fontSize.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  title: {
    fontSize: fontSize.xxxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  identifier: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.primary,
    marginTop: spacing.xs,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    textAlign: 'center',
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
  },
  otpInputFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  otpInputError: {
    borderColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  verifyButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  verifyButtonDisabled: {
    opacity: 0.7,
  },
  verifyButtonText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  resendContainer: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  timerText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  resendText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '600',
  },
  resendTextDisabled: {
    color: colors.textMuted,
  },
  attemptsText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
