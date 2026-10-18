import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
  Keyboard,
  BackHandler,
  AccessibilityInfo,
  LayoutChangeEvent,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { KeyboardShiftView } from '../components/keyboard/keyboardStick';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Signup'>;

/**
 * Sign-up is two steps on one screen. Step 1 collects the details and keeps a single
 * Continue button pinned above the keyboard; step 2 (keyboard closed) is where the
 * student picks phone or email for the OTP. Previously both OTP buttons sat at the
 * bottom of one tall form and were covered as soon as a field was focused.
 */
type Step = 'details' | 'method';
type Field = 'name' | 'phone' | 'email';
type OtpMethod = 'phone' | 'email';

export default function SignupScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { loginWithGoogle } = useAuth();

  const [step, setStep] = useState<Step>('details');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [otpMethod, setOtpMethod] = useState<OtpMethod | null>(null);
  const [error, setError] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const { isAvailable: isGoogleAvailable, request, idToken, googleError, promptAsync } = useGoogleAuth();

  const scrollRef = useRef<ScrollView>(null);
  const nameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const focusedField = useRef<Field | null>(null);
  const formY = useRef(0);
  const fieldY = useRef<Partial<Record<Field, number>>>({});

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

  /** Bring a field to the top of the visible scroll area (the pinned footer + keyboard take the rest). */
  const scrollToField = useCallback((field: Field) => {
    const y = formY.current + (fieldY.current[field] ?? 0) - spacing.md;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
  }, []);

  useEffect(() => {
    // iOS reports the keyboard early (Will*) so the footer settles in step with it; Android only has Did*.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    // Scroll only once the keyboard has finished appearing and the padding has settled.
    const onShown = Keyboard.addListener('keyboardDidShow', () => {
      const field = focusedField.current;
      if (field) requestAnimationFrame(() => scrollToField(field));
    });
    return () => {
      onShow.remove();
      onHide.remove();
      onShown.remove();
    };
  }, [scrollToField]);

  const goToDetails = useCallback(() => {
    setError('');
    setStep('details');
  }, []);

  // Android hardware back: step 2 -> step 1 first, and never mid-request.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isLoading) return true;
        if (step === 'method') {
          goToDetails();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [step, isLoading, goToDetails]),
  );

  // iOS swipe-back on step 2 would silently throw away the typed details.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: step === 'details' && !isLoading });
  }, [navigation, step, isLoading]);

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

  /** Mirrors validateForm's checks, in the same order, so the first failing field can take focus. */
  const getFirstInvalidField = (): Field | null => {
    if (!fullName.trim()) return 'name';
    if (phone.replace(/\D/g, '').length !== 10) return 'phone';
    if (!email.trim() || !email.includes('@')) return 'email';
    return null;
  };

  const handleContinue = () => {
    if (isGoogleLoading) return;
    setError('');
    if (!validateForm()) {
      const invalid = getFirstInvalidField();
      if (invalid === 'name') nameRef.current?.focus();
      else if (invalid === 'phone') phoneRef.current?.focus();
      else if (invalid === 'email') emailRef.current?.focus();
      return;
    }
    Keyboard.dismiss();
    setStep('method');
    AccessibilityInfo.announceForAccessibility('Step 2 of 2. Choose where to get your OTP.');
  };

  const handleSendOtp = async (method: OtpMethod) => {
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

  const handleNameChange = (text: string) => {
    setFullName(text);
    setError('');
  };

  const handlePhoneChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 10);
    const hadTenDigits = phone.length === 10;
    setPhone(digits);
    setError('');
    // phone-pad has no "next" key on iOS, so move on by ourselves once the number is complete.
    if (digits.length === 10 && !hadTenDigits) emailRef.current?.focus();
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    setError('');
  };

  const handleFieldFocus = (field: Field) => {
    focusedField.current = field;
    // If the keyboard is already up (moving between fields) it will not fire "shown" again.
    if (keyboardOpen) requestAnimationFrame(() => scrollToField(field));
  };

  const handleFieldBlur = (field: Field) => {
    if (focusedField.current === field) focusedField.current = null;
  };

  const trackFieldLayout = (field: Field) => (e: LayoutChangeEvent) => {
    fieldY.current[field] = e.nativeEvent.layout.y;
  };

  const phoneDigits = phone.replace(/\D/g, '');
  const formattedPhone = `+91 ${phoneDigits.slice(0, 5)} ${phoneDigits.slice(5)}`.trim();
  const firstName = fullName.trim().split(/\s+/)[0];

  const handleBack = () => {
    if (step === 'method') {
      if (!isLoading) goToDetails();
    } else {
      navigation.goBack();
    }
  };

  const renderTopBar = () => (
    <>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={step === 'method' ? 'Back to your details' : 'Go back'}
          testID="button-back"
          data-testid="button-back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.stepLabel} testID="text-step-indicator">
          {step === 'details' ? 'Step 1 of 2' : 'Step 2 of 2'}
        </Text>
      </View>

      <Text style={styles.title}>{step === 'details' ? 'Create your account' : 'Verify your account'}</Text>
      <Text style={styles.subtitle}>
        {step === 'details'
          ? "Next, you'll choose where to get your OTP."
          : firstName
            ? `Hi ${firstName}, where should we send your 6-digit OTP?`
            : 'Where should we send your 6-digit OTP?'}
      </Text>
    </>
  );

  const renderMethodCard = (method: OtpMethod) => {
    const isPhone = method === 'phone';
    const busy = isLoading && otpMethod === method;
    const dimmed = isLoading && otpMethod !== method;
    const title = isPhone ? 'Send OTP to Phone' : 'Send OTP to Email';
    const value = isPhone ? formattedPhone : email.trim();

    return (
      <TouchableOpacity
        key={method}
        style={[styles.methodCard, busy && styles.methodCardBusy, dimmed && styles.methodCardDimmed]}
        onPress={() => handleSendOtp(method)}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${value}`}
        accessibilityState={{ disabled: isLoading, busy }}
        testID={`button-otp-${method}`}
        data-testid={`button-otp-${method}`}
      >
        <View style={styles.methodIcon}>
          <Ionicons name={isPhone ? 'call-outline' : 'mail-outline'} size={22} color={colors.primary} />
        </View>
        <View style={styles.methodText}>
          <Text style={styles.methodTitle}>{title}</Text>
          <Text style={styles.methodValue} numberOfLines={1} ellipsizeMode="middle">
            {value}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardShiftView style={styles.container}>
      {step === 'details' ? (
        <>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + spacing.md }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            testID="signup-step-details"
          >
            {renderTopBar()}

            {isGoogleAvailable && (
              <>
                <TouchableOpacity
                  style={[styles.googleButton, (isGoogleLoading || isLoading) && styles.googleButtonDisabled]}
                  onPress={() => promptAsync()}
                  disabled={!request || isGoogleLoading || isLoading}
                  testID="button-google-signup"
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

            <View
              style={[styles.form, !isGoogleAvailable && styles.formNoGoogle]}
              onLayout={(e) => {
                formY.current = e.nativeEvent.layout.y;
              }}
            >
              <View style={styles.inputContainer} onLayout={trackFieldLayout('name')}>
                <Ionicons name="person-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  ref={nameRef}
                  style={styles.input}
                  placeholder="Full name"
                  placeholderTextColor={colors.textMuted}
                  value={fullName}
                  onChangeText={handleNameChange}
                  onFocus={() => handleFieldFocus('name')}
                  onBlur={() => handleFieldBlur('name')}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => phoneRef.current?.focus()}
                  accessibilityLabel="Full name"
                  testID="input-fullname"
                  data-testid="input-fullname"
                />
              </View>

              <View style={styles.inputContainer} onLayout={trackFieldLayout('phone')}>
                <Text style={styles.phonePrefix}>+91</Text>
                <TextInput
                  ref={phoneRef}
                  style={styles.input}
                  placeholder="10-digit mobile number"
                  placeholderTextColor={colors.textMuted}
                  value={phone}
                  onChangeText={handlePhoneChange}
                  onFocus={() => handleFieldFocus('phone')}
                  onBlur={() => handleFieldBlur('phone')}
                  keyboardType="phone-pad"
                  maxLength={10}
                  autoComplete="tel-national"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  accessibilityLabel="Mobile number, 10 digits"
                  testID="input-phone"
                  data-testid="input-phone"
                />
              </View>

              <View style={styles.inputContainer} onLayout={trackFieldLayout('email')}>
                <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  ref={emailRef}
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={handleEmailChange}
                  onFocus={() => handleFieldFocus('email')}
                  onBlur={() => handleFieldBlur('email')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="go"
                  submitBehavior="blurAndSubmit"
                  onSubmitEditing={handleContinue}
                  accessibilityLabel="Email address"
                  testID="input-email"
                  data-testid="input-email"
                />
              </View>
            </View>
          </ScrollView>

          {/* Pinned outside the ScrollView so Continue is never covered by the keyboard. */}
          <View
            style={[
              styles.pinnedFooter,
              { paddingBottom: keyboardOpen ? spacing.sm : Math.max(insets.bottom, spacing.md) },
            ]}
          >
            {error ? (
              <Text
                style={styles.errorText}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                testID="text-signup-error"
              >
                {error}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.otpButton, isGoogleLoading && styles.otpButtonDisabled]}
              onPress={handleContinue}
              disabled={isGoogleLoading}
              accessibilityRole="button"
              testID="button-continue"
              data-testid="button-continue"
            >
              <Text style={[styles.otpButtonText, isGoogleLoading && styles.otpButtonTextDisabled]}>Continue</Text>
              <Ionicons
                name="arrow-forward"
                size={20}
                color={isGoogleLoading ? colors.textMuted : colors.white}
              />
            </TouchableOpacity>

            {!keyboardOpen && (
              <View style={styles.loginRow}>
                <Text style={styles.footerText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Login')} testID="button-login-link">
                  <Text style={styles.loginLink}>Login</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + spacing.md, paddingBottom: Math.max(insets.bottom, spacing.lg) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          testID="signup-step-method"
        >
          {renderTopBar()}

          <View style={styles.methodList}>
            {renderMethodCard('phone')}
            {renderMethodCard('email')}
          </View>

          {error ? (
            <Text
              style={[styles.errorText, styles.methodError]}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              testID="text-signup-error"
            >
              {error}
            </Text>
          ) : null}

          <View style={styles.editRow}>
            <Text style={styles.footerText}>Wrong number or email? </Text>
            <TouchableOpacity
              onPress={goToDetails}
              disabled={isLoading}
              hitSlop={12}
              testID="button-edit-details"
            >
              <Text style={styles.loginLink}>Edit details</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </KeyboardShiftView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
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
    marginVertical: spacing.md,
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
  formNoGoogle: {
    marginTop: spacing.xs,
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
  pinnedFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  methodError: {
    marginTop: spacing.md,
    marginBottom: 0,
  },
  otpButton: {
    minHeight: 56,
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
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  methodList: {
    gap: spacing.md,
  },
  methodCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  methodCardBusy: {
    borderColor: colors.primary,
  },
  methodCardDimmed: {
    opacity: 0.5,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  methodText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  methodTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  methodValue: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: 2,
  },
  editRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
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
