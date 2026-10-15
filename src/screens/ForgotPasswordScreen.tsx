import { useState, useRef, useEffect } from 'react';
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
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { supabase } from '../services/supabase';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ForgotPassword'>;

type Step = 1 | 2 | 3;

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [email, setEmail] = useState('');

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(TextInput | null)[]>([]);
  const [resetToken, setResetToken] = useState('');
  const [userId, setUserId] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSendResetOtp = async () => {
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError('');
    const result = await supabase.sendPasswordResetOtp(email.trim());
    setIsLoading(false);

    if (result.success) {
      setStep(2);
      setError('');
    } else {
      setError(result.error || 'Failed to send reset OTP');
    }
  };

  const handleOtpChange = (text: string, index: number) => {
    if (text.length > 1) {
      const digits = text.replace(/[^0-9]/g, '').split('').slice(0, 6);
      const newOtp = [...otp];
      digits.forEach((digit, i) => {
        if (index + i < 6) newOtp[index + i] = digit;
      });
      setOtp(newOtp);
      const nextIndex = Math.min(index + digits.length, 5);
      otpRefs.current[nextIndex]?.focus();
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = text.replace(/[^0-9]/g, '');
    setOtp(newOtp);

    if (text && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit OTP');
      return;
    }

    setIsLoading(true);
    setError('');
    const result = await supabase.verifyPasswordResetOtp(email.trim(), otpCode);
    setIsLoading(false);

    if (result.success && result.resetToken && result.userId) {
      setResetToken(result.resetToken);
      setUserId(result.userId);
      setStep(3);
      setError('');
    } else {
      setError(result.error || 'OTP verification failed');
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword) {
      setError('Please enter a new password');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError('');
    const result = await supabase.resetPasswordWithToken(resetToken, newPassword, userId);
    setIsLoading(false);

    if (result.success) {
      setSuccessMessage('Password reset successfully!');
      setTimeout(() => {
        navigation.navigate('Login');
      }, 2000);
    } else {
      setError(result.error || 'Password reset failed');
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 1: return 'Forgot Password';
      case 2: return 'Verify OTP';
      case 3: return 'Reset Password';
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case 1: return 'Enter your email address and we\'ll send you an OTP to reset your password.';
      case 2: return `Enter the 6-digit OTP sent to ${email}`;
      case 3: return 'Enter your new password below.';
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (step > 1) {
              setStep((step - 1) as Step);
              setError('');
            } else {
              navigation.goBack();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.stepIndicator}>
          {[1, 2, 3].map((s) => (
            <View key={s} style={styles.stepRow}>
              <View style={[styles.stepDot, step >= s && styles.stepDotActive]}>
                {step > s ? (
                  <Ionicons name="checkmark" size={14} color={colors.white} />
                ) : (
                  <Text style={[styles.stepDotText, step >= s && styles.stepDotTextActive]}>
                    {s}
                  </Text>
                )}
              </View>
              {s < 3 && (
                <View style={[styles.stepLine, step > s && styles.stepLineActive]} />
              )}
            </View>
          ))}
        </View>

        <View style={styles.header}>
          <Ionicons
            name={step === 1 ? 'mail-outline' : step === 2 ? 'keypad-outline' : 'lock-closed-outline'}
            size={48}
            color={colors.primary}
          />
          <Text style={styles.title}>{getStepTitle()}</Text>
          <Text style={styles.subtitle}>{getStepDescription()}</Text>
        </View>

        {successMessage ? (
          <View style={styles.successContainer}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
            <Text style={styles.successText}>{successMessage}</Text>
            <Text style={styles.redirectText}>Redirecting to login...</Text>
          </View>
        ) : (
          <>
            {error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {step === 1 && (
              <View style={styles.form}>
                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor={colors.textMuted}
                    value={email}
                    onChangeText={(text) => { setEmail(text); setError(''); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleSendResetOtp}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send Reset OTP</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {step === 2 && (
              <View style={styles.form}>
                <View style={styles.otpContainer}>
                  {otp.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => { otpRefs.current[index] = ref; }}
                      style={[styles.otpInput, digit ? styles.otpInputFilled : null]}
                      value={digit}
                      onChangeText={(text) => handleOtpChange(text, index)}
                      onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, index)}
                      keyboardType="number-pad"
                      maxLength={1}
                      textContentType="oneTimeCode"
                    />
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Verify OTP</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.resendButton}
                  onPress={handleSendResetOtp}
                  disabled={isLoading}
                >
                  <Text style={styles.resendText}>Resend OTP</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 3 && (
              <View style={styles.form}>
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="New password"
                    placeholderTextColor={colors.textMuted}
                    value={newPassword}
                    onChangeText={(text) => { setNewPassword(text); setError(''); }}
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} style={styles.eyeButton}>
                    <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm password"
                    placeholderTextColor={colors.textMuted}
                    value={confirmPassword}
                    onChangeText={(text) => { setConfirmPassword(text); setError(''); }}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeButton}>
                    <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleResetPassword}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Reset Password</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        <TouchableOpacity
          style={styles.backToLogin}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.backToLoginText}>
            Back to <Text style={styles.linkText}>Login</Text>
          </Text>
        </TouchableOpacity>
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
    paddingTop: spacing.xxl,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: colors.primary,
  },
  stepDotText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  stepDotTextActive: {
    color: colors.white,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: colors.gray200,
    marginHorizontal: spacing.xs,
  },
  stepLineActive: {
    backgroundColor: colors.primary,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  form: {
    gap: spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  eyeButton: {
    padding: spacing.sm,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  otpInputFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  resendButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  resendText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.md,
    flex: 1,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  successText: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.success,
  },
  redirectText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  backToLogin: {
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
  },
  backToLoginText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  linkText: {
    color: colors.primary,
    fontWeight: '600',
  },
});
