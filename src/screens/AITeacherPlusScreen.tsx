import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import { openAskAI } from '../services/askAIStore';
import { KeyboardShiftView } from '../components/keyboard/keyboardStick';
import paymentService from '../services/payment';
import { openRazorpayCheckout } from '../services/razorpayCheckout';
import { useAITeacherSubscription, recordSubscriptionInDb } from '../services/aiTeacherSubscription';
import { useAiTeacherPlan } from '../services/aiTeacherPlan';
import { purchasePlus, PurchaseDeps } from '../services/aiTeacherPurchase';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const PLUS_PRICE_RUPEES = 500;

const BENEFITS = [
  '1-to-1 voice and chat teacher',
  'All your subjects',
  'Up to 10 of your own free Gemini keys',
  'Automatic switch to the next key if one runs out',
];

const STEPS = ['Pay', 'Add your free Gemini key', 'Start learning'];

export default function AITeacherPlusScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const fromAskAI = !!(route.params as { fromAskAI?: boolean } | undefined)?.fromAskAI;
  const { user } = useAuth();
  const { subscribe } = useAITeacherSubscription();
  // The server's answer on the Plus plan. Pay only shows when it said 'inactive'.
  const { state: planState, refresh: refreshPlan } = useAiTeacherPlan(!!user);

  // Opened from Ask AI: leaving this screen without buying reopens Ask AI.
  // A successful purchase clears this so the flow continues to AI Teacher settings instead.
  const fromAskAIRef = useRef(fromAskAI);
  useEffect(() => {
    return () => {
      if (fromAskAIRef.current) openAskAI();
    };
  }, []);

  // Already active on the server: go straight to the settings (replacing this screen, not reopening Ask AI).
  useEffect(() => {
    if (planState === 'active') {
      fromAskAIRef.current = false;
      navigation.replace('AITeacherSettings', { fromAskAI });
    }
  }, [planState, navigation, fromAskAI]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const email = user?.email || '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName((prev) => prev || user.full_name || '');
      setPhone((prev) => prev || user.phone || '');
    }
  }, [user]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handlePay = async () => {
    if (busy) return;
    if (!user?.id) {
      setError('Please log in again to buy AI Teacher Plus.');
      return;
    }
    setError(null);
    setBusy(true);

    const deps: PurchaseDeps = {
      createOrder: (userId, amount, courses, customerInfo) =>
        paymentService.createPaymentOrder(userId, amount, courses, customerInfo),
      openCheckout: openRazorpayCheckout,
      verify: (userId, paymentData, orderId, courses) =>
        paymentService.verifyPayment(userId, paymentData, orderId, courses),
      subscribe,
      recordSubscriptionInDb,
    };

    try {
      const result = await purchasePlus(
        {
          userId: user.id,
          name: name.trim(),
          email,
          phone: phone.trim(),
          amountRupees: PLUS_PRICE_RUPEES,
        },
        deps
      );

      if (!mountedRef.current) return;

      if (result.status === 'success') {
        fromAskAIRef.current = false;
        navigation.replace('AITeacherSettings', { fromAskAI, justPurchased: true });
        return;
      }
      setError(result.message || (result.status === 'cancelled' ? 'Payment was cancelled.' : 'Payment could not be completed. Please try again.'));
    } catch (err: any) {
      if (!mountedRef.current) return;
      setError(String(err?.message || 'Payment could not be completed. Please try again.'));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  // Until the server answers, show only a spinner: no price, no Pay button.
  if (planState === 'loading' || planState === 'active') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AI Teacher Plus</Text>
        </View>
        <View style={styles.checking}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardShiftView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Teacher Plus</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="school" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>Your personal AI Teacher</Text>
          <Text style={styles.heroSubtitle}>1-to-1 voice and chat tutor, 24/7</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>Rs {PLUS_PRICE_RUPEES}</Text>
            <Text style={styles.priceNote}>one-time</Text>
          </View>
        </LinearGradient>

        {/* Benefits */}
        <View style={styles.card}>
          {BENEFITS.map((text) => (
            <View key={text} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text style={styles.benefitText}>{text}</Text>
            </View>
          ))}
        </View>

        {/* How it works */}
        <Text style={styles.sectionTitle}>How it works</Text>
        <View style={styles.card}>
          {STEPS.map((text, i) => (
            <View key={text} style={styles.stepRow}>
              <View style={styles.stepCircle}>
                <Text style={styles.stepNumber}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{text}</Text>
            </View>
          ))}
        </View>

        {/* Details */}
        <Text style={styles.sectionTitle}>Your details</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            editable={!busy}
          />

          <Text style={[styles.label, styles.labelSpaced]}>Mobile phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Mobile number"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            editable={!busy}
          />

          <Text style={[styles.label, styles.labelSpaced]}>Email (must match your account)</Text>
          <View style={[styles.input, styles.inputReadonly]}>
            <Text style={styles.readonlyText}>{email || '-'}</Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={20} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Footer */}
      {planState === 'unknown' ? (
        <View style={[styles.footer, { paddingBottom: spacing.md + insets.bottom }]}>
          <Text style={styles.unknownText}>Could not check your plan.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void refreshPlan()} activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color={colors.primary} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <View style={[styles.footer, { paddingBottom: spacing.md + insets.bottom }]}>
        <TouchableOpacity
          style={[styles.payBtn, busy && styles.payBtnBusy]}
          onPress={handlePay}
          disabled={busy}
          activeOpacity={0.8}
        >
          {busy ? (
            <>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.payText}>Opening Razorpay...</Text>
            </>
          ) : (
            <>
              <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
              <Text style={styles.payText}>Pay Rs {PLUS_PRICE_RUPEES}</Text>
            </>
          )}
        </TouchableOpacity>
        <View style={styles.secureRow}>
          <Ionicons name="lock-closed" size={14} color={colors.success} />
          <Text style={styles.secureText}>Secured by Razorpay</Text>
        </View>
      </View>
      )}
    </KeyboardShiftView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  checking: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unknownText: {
    fontSize: fontSize.md,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  retryText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginLeft: spacing.xs,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  hero: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontSize: fontSize.md,
    color: '#FFFFFF',
    marginTop: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.md,
  },
  price: {
    fontSize: fontSize.xxxl,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  priceNote: {
    fontSize: fontSize.sm,
    color: '#FFFFFF',
    marginLeft: spacing.sm,
    marginBottom: 6,
  },
  card: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  benefitText: {
    fontSize: fontSize.md,
    color: colors.text,
    marginLeft: spacing.sm,
    flex: 1,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepText: {
    fontSize: fontSize.md,
    color: colors.text,
    marginLeft: spacing.sm,
    flex: 1,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  labelSpaced: {
    marginTop: spacing.md,
  },
  input: {
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.lg,
    color: colors.text,
    justifyContent: 'center',
  },
  inputReadonly: {
    opacity: 0.8,
  },
  readonlyText: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    marginLeft: spacing.sm,
  },
  footer: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  payBtn: {
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  payBtnBusy: {
    opacity: 0.6,
  },
  payText: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: 4,
  },
  secureText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
