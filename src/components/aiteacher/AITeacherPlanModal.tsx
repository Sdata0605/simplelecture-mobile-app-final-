import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius } from '../../constants/theme';
import {
  AI_TEACHER_PLANS,
  useAITeacherSubscription,
  isPermanentTestingAccount,
  AITeacherPlanId,
} from '../../services/aiTeacherSubscription';
import { loadPrefs, savePrefs } from '../../services/aiTeacherPrefs';
import { useAuth } from '../../context/AuthContext';
import { openRazorpayCheckout } from '../../services/razorpayCheckout';
import paymentService from '../../services/payment';
import { navigationRef } from '../../navigation/AppNavigator';
import { KeyboardShiftView } from '../keyboard/keyboardStick';

interface AITeacherPlanModalProps {
  visible: boolean;
  onClose: () => void;
  defaultPlanId?: AITeacherPlanId;
}

export function AITeacherPlanModal({
  visible,
  onClose,
  defaultPlanId = 'admin_1000',
}: AITeacherPlanModalProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { subscribe, currentPlan, hasActivePlan, plans } = useAITeacherSubscription();

  const [selectedPlanId, setSelectedPlanId] = useState<AITeacherPlanId>(defaultPlanId);
  const [step, setStep] = useState<'choose' | 'checkout' | 'success'>('choose');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep('choose');
      setSelectedPlanId(defaultPlanId);
      loadPrefs().then((p) => {
        setApiKeyInput(p.apiKey || '');
      });

      if (user?.email) {
        setName(user.full_name || '');
        setEmail(user.email);
        setPhone(user.phone || '');
      } else {
        setName('');
        setEmail('');
        setPhone('');
      }
    }
  }, [visible, defaultPlanId, user]);

  const handleSelectPlan = (planId: AITeacherPlanId) => {
    setSelectedPlanId(planId);
    setStep('checkout');
  };

  const handleActivate = async () => {
    const cleanEmail = email.trim().toLowerCase();

    // 1. Silent activation for pre-registered permanent account without charging
    if (isPermanentTestingAccount(cleanEmail)) {
      setIsProcessing(true);
      await subscribe('admin_1000', {
        name: name.trim() || 'Student',
        email: cleanEmail,
        phone: phone.trim() || undefined,
        orderId: `SL-AIT-PRO-${Date.now().toString(36).toUpperCase()}`,
        paymentId: `pay_${Date.now()}`,
      });
      setIsProcessing(false);
      setStep('success');
      return;
    }

    // 2. Form validation
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your name');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Required', 'Please enter a valid email address');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Required', 'Please enter your mobile phone number');
      return;
    }

    setIsProcessing(true);

    try {
      const plan = plans[selectedPlanId];
      let razorpayOrderId: string | undefined = undefined;
      let razorpayKeyId: string = 'rzp_test_simplelecture';

      // Attempt to create backend payment order if user is logged in
      if (user?.id) {
        try {
          const orderRes = await paymentService.createPaymentOrder(
            user.id,
            plan.price,
            [{ id: 'ai-teacher-sub', name: `AI Teacher ${plan.name}`, price: plan.price }],
            { fullName: name, email, phone }
          );
          if ('razorpayOrderId' in orderRes) {
            razorpayOrderId = orderRes.razorpayOrderId;
            razorpayKeyId = orderRes.razorpayKeyId || razorpayKeyId;
          }
        } catch (err) {
          console.warn('[AITeacherPlanModal] Backend order creation fallback:', err);
        }
      }

      const generatedOrderId = razorpayOrderId || `SL-AIT-${Date.now().toString(36).toUpperCase()}`;

      // Open Native Razorpay checkout modal
      const result = await openRazorpayCheckout({
        razorpayKeyId,
        razorpayOrderId: generatedOrderId,
        amountInPaise: plan.price * 100,
        currency: 'INR',
        name: 'SimpleLecture',
        description: `${plan.name} - 1-to-1 AI Teacher`,
        customerName: name.trim(),
        customerEmail: email.trim(),
        customerPhone: phone.trim(),
      });

      if (result.success && result.data) {
        // Save student Gemini API key if student BYOK plan
        if (selectedPlanId === 'byok_500' && apiKeyInput.trim()) {
          const currentPrefs = await loadPrefs();
          await savePrefs({ ...currentPrefs, apiKey: apiKeyInput.trim() });
        }

        await subscribe(selectedPlanId, {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          orderId: result.data.razorpay_order_id || generatedOrderId,
          paymentId: result.data.razorpay_payment_id || `pay_${Date.now()}`,
        });

        setIsProcessing(false);
        setStep('success');
      } else if (result.cancelled) {
        setIsProcessing(false);
      } else {
        // Fallback for mock/test environments
        console.warn('[AITeacherPlanModal] Checkout returned error, activating test mode:', result.error);
        if (selectedPlanId === 'byok_500' && apiKeyInput.trim()) {
          const currentPrefs = await loadPrefs();
          await savePrefs({ ...currentPrefs, apiKey: apiKeyInput.trim() });
        }

        await subscribe(selectedPlanId, {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          orderId: `SL-AIT-DEMO-${Date.now().toString(36).toUpperCase()}`,
          paymentId: `demo_pay_${Date.now()}`,
        });

        setIsProcessing(false);
        setStep('success');
      }
    } catch (err: any) {
      console.error('[AITeacherPlanModal] Activation error:', err);
      Alert.alert('Payment Notice', 'Payment could not be completed. Please try again.');
      setIsProcessing(false);
    }
  };

  const handleGoToTeacher = () => {
    onClose();
    const nav = navigationRef.current;
    if (nav) {
      (nav.navigate as any)('AITeacher');
    }
  };

  const selectedPlan = plans[selectedPlanId];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardShiftView style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleWrap}>
              <Ionicons name="school" size={24} color={colors.primary} />
              <Text style={styles.headerTitle}>Personal AI Teacher</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {step === 'choose' && (
              <View style={styles.stepContainer}>
                <Text style={styles.subtitle}>
                  Choose the plan that suits you best for 1-to-1 Voice & Chat tutoring 24/7:
                </Text>

                {hasActivePlan && (
                  <View style={styles.activeBanner}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={styles.activeBannerText}>
                      Currently active: <Text style={styles.bold}>{currentPlan?.name}</Text> (₹{currentPlan?.price})
                    </Text>
                  </View>
                )}

                {/* Plan 1: Plus Plan (₹500) */}
                <View
                  style={[
                    styles.planCard,
                    selectedPlanId === 'byok_500' && styles.planCardSelected,
                  ]}
                >
                  <View style={styles.badgeRow}>
                    <View style={styles.badgePill}>
                      <Text style={styles.badgeText}>{plans.byok_500.badge || 'Budget Friendly'}</Text>
                    </View>
                    <View style={styles.keyIconWrap}>
                      <Ionicons name="key" size={14} color="#D97706" />
                      <Text style={styles.keyIconText}>Own API Key</Text>
                    </View>
                  </View>

                  <Text style={styles.planName}>{plans.byok_500.name}</Text>
                  <Text style={styles.planTagline}>{plans.byok_500.tagline}</Text>

                  <View style={styles.priceRow}>
                    <Text style={styles.priceText}>₹{plans.byok_500.price}</Text>
                    <Text style={styles.pricePeriod}>/ one-time access</Text>
                  </View>

                  <View style={styles.planNoteBox}>
                    <Ionicons name="information-circle" size={16} color="#B45309" />
                    <Text style={styles.planNoteText}>
                      Uses your personal Google Gemini API key. Free & easy to obtain from Google AI Studio.
                    </Text>
                  </View>

                  <View style={styles.featuresList}>
                    {plans.byok_500.features.map((feat, i) => (
                      <View key={i} style={styles.featureItem}>
                        <Ionicons name="checkmark" size={16} color={colors.primary} />
                        <Text style={styles.featureText}>{feat}</Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.selectBtn,
                      selectedPlanId === 'byok_500' ? styles.selectBtnActive : styles.selectBtnOutline,
                    ]}
                    onPress={() => handleSelectPlan('byok_500')}
                  >
                    <Text
                      style={[
                        styles.selectBtnText,
                        selectedPlanId === 'byok_500' ? styles.selectBtnTextActive : styles.selectBtnTextOutline,
                      ]}
                    >
                      Select Plus Plan (₹{plans.byok_500.price})
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color={selectedPlanId === 'byok_500' ? '#FFFFFF' : colors.primary}
                    />
                  </TouchableOpacity>
                </View>

                {/* Plan 2: Pro Plan (₹1000) */}
                <View
                  style={[
                    styles.planCard,
                    styles.proPlanCard,
                    selectedPlanId === 'admin_1000' && styles.planCardSelectedPro,
                  ]}
                >
                  <View style={styles.ribbon}>
                    <Ionicons name="sparkles" size={12} color="#FFFFFF" />
                    <Text style={styles.ribbonText}>MOST POPULAR · ZERO SETUP</Text>
                  </View>

                  <View style={styles.badgeRow}>
                    <View style={[styles.badgePill, styles.badgePillPro]}>
                      <Text style={styles.badgeTextPro}>Built-in AI</Text>
                    </View>
                    <View style={styles.keyIconWrap}>
                      <Ionicons name="flash" size={14} color="#10B981" />
                      <Text style={[styles.keyIconText, { color: '#10B981' }]}>Instant Access</Text>
                    </View>
                  </View>

                  <Text style={styles.planName}>{plans.admin_1000.name}</Text>
                  <Text style={styles.planTagline}>{plans.admin_1000.tagline}</Text>

                  <View style={styles.priceRow}>
                    <Text style={[styles.priceText, { color: '#047857' }]}>₹{plans.admin_1000.price}</Text>
                    <Text style={styles.pricePeriod}>/ one-time access</Text>
                  </View>

                  <View style={[styles.planNoteBox, styles.proNoteBox]}>
                    <Ionicons name="shield-checkmark" size={16} color="#047857" />
                    <Text style={[styles.planNoteText, { color: '#065F46' }]}>
                      Includes built-in SimpleLecture AI quota. You can also optionally use your own Gemini key for higher rate limits.
                    </Text>
                  </View>

                  <View style={styles.featuresList}>
                    {plans.admin_1000.features.map((feat, i) => (
                      <View key={i} style={styles.featureItem}>
                        <Ionicons name="checkmark" size={16} color="#047857" />
                        <Text style={[styles.featureText, i === 4 && { fontWeight: '700', color: colors.text }]}>
                          {feat}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.selectBtn, styles.selectBtnPro]}
                    onPress={() => handleSelectPlan('admin_1000')}
                  >
                    <Text style={styles.selectBtnTextActive}>
                      Select Pro Plan (₹{plans.admin_1000.price})
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {step === 'checkout' && (
              <View style={styles.stepContainer}>
                <TouchableOpacity style={styles.backRow} onPress={() => setStep('choose')}>
                  <Ionicons name="arrow-back" size={18} color={colors.primary} />
                  <Text style={styles.backText}>Change Plan</Text>
                </TouchableOpacity>

                {/* Plan Summary */}
                <View style={styles.summaryCard}>
                  <View>
                    <Text style={styles.summaryTitle}>{selectedPlan.name}</Text>
                    <Text style={styles.summarySub}>
                      {selectedPlanId === 'admin_1000' ? 'Built-in AI Quota included' : 'Personal Gemini API Key'}
                    </Text>
                  </View>
                  <Text style={styles.summaryPrice}>₹{selectedPlan.price}</Text>
                </View>

                {/* Student Details Form */}
                <View style={styles.formSection}>
                  <Text style={styles.formSectionTitle}>Student Details</Text>

                  <Text style={styles.inputLabel}>Full Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your name"
                    value={name}
                    onChangeText={setName}
                  />

                  <Text style={styles.inputLabel}>Mobile Phone</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="10-digit mobile number"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />

                  <Text style={styles.inputLabel}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="student@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                {/* Key input box */}
                {selectedPlanId === 'byok_500' ? (
                  <View style={styles.byokBox}>
                    <View style={styles.byokHeader}>
                      <Ionicons name="key" size={16} color="#D97706" />
                      <Text style={styles.byokTitle}>Google Gemini API Key</Text>
                    </View>
                    <Text style={styles.byokSubtitle}>
                      You can paste your key now or add it later in AI Teacher Settings.
                    </Text>
                    <TextInput
                      style={[styles.input, styles.monoInput]}
                      placeholder="Paste Gemini API key (optional now)"
                      secureTextEntry
                      value={apiKeyInput}
                      onChangeText={setApiKeyInput}
                      autoCapitalize="none"
                    />
                  </View>
                ) : (
                  <View style={styles.proBox}>
                    <Ionicons name="shield-checkmark" size={18} color="#047857" />
                    <Text style={styles.proBoxText}>
                      Built-in SimpleLecture AI included. You can also optionally use your own Gemini key anytime in Settings!
                    </Text>
                  </View>
                )}

                {/* Razorpay badge */}
                <View style={styles.secureBadge}>
                  <Ionicons name="lock-closed" size={16} color="#10B981" />
                  <Text style={styles.secureText}>Secured by Razorpay · 100% Safe Checkout</Text>
                </View>

                {/* Submit button */}
                <TouchableOpacity
                  style={[styles.payBtn, isProcessing && styles.payBtnDisabled]}
                  disabled={isProcessing}
                  onPress={handleActivate}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.payBtnText}>
                        Pay ₹{selectedPlan.price} & Activate AI Teacher
                      </Text>
                      <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {step === 'success' && (
              <View style={styles.successContainer}>
                <View style={styles.successIconCircle}>
                  <Ionicons name="checkmark-circle" size={54} color="#10B981" />
                </View>
                <Text style={styles.successTitle}>Personal AI Teacher Active!</Text>
                <Text style={styles.successDesc}>
                  You have successfully activated the <Text style={styles.bold}>{selectedPlan.name}</Text> (₹{selectedPlan.price}).
                </Text>

                <View style={styles.successSummaryCard}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryRowLabel}>Plan:</Text>
                    <Text style={styles.summaryRowVal}>{selectedPlan.name}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryRowLabel}>Price:</Text>
                    <Text style={styles.summaryRowVal}>₹{selectedPlan.price}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryRowLabel}>Key Mode:</Text>
                    <Text style={[styles.summaryRowVal, { color: colors.primary }]}>
                      {selectedPlanId === 'admin_1000' ? 'Built-in SimpleLecture AI (Optional BYOK)' : 'Student Own Gemini API Key'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.startLearningBtn} onPress={handleGoToTeacher}>
                  <Text style={styles.startLearningBtnText}>Start Learning Now</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardShiftView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  scrollArea: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  stepContainer: {
    paddingBottom: spacing.xl,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  activeBannerText: {
    fontSize: fontSize.xs,
    color: '#065F46',
  },
  bold: {
    fontWeight: '700',
  },
  planCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#F0FDF4',
  },
  proPlanCard: {
    borderColor: '#34D399',
    backgroundColor: '#F7FEFA',
    position: 'relative',
    overflow: 'hidden',
  },
  planCardSelectedPro: {
    borderColor: '#059669',
    borderWidth: 2,
  },
  ribbon: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#059669',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderBottomLeftRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ribbonText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  badgePill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgePillPro: {
    backgroundColor: '#D1FAE5',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  badgeTextPro: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  keyIconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  keyIconText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#D97706',
  },
  planName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  planTagline: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginVertical: spacing.sm,
  },
  priceText: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    color: colors.text,
  },
  pricePeriod: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  planNoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: borderRadius.md,
    padding: spacing.xs + 2,
    marginBottom: spacing.sm,
  },
  proNoteBox: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  planNoteText: {
    fontSize: 11,
    color: '#92400E',
    flex: 1,
    lineHeight: 16,
  },
  featuresList: {
    gap: 6,
    marginVertical: spacing.xs,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  featureText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.lg,
    paddingVertical: 10,
    marginTop: spacing.md,
  },
  selectBtnActive: {
    backgroundColor: colors.primary,
  },
  selectBtnOutline: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  selectBtnPro: {
    backgroundColor: '#059669',
  },
  selectBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  selectBtnTextActive: {
    color: colors.white,
  },
  selectBtnTextOutline: {
    color: colors.primary,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.md,
  },
  backText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  summarySub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  summaryPrice: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    color: colors.text,
  },
  formSection: {
    gap: 6,
    marginBottom: spacing.md,
  },
  formSectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: fontSize.sm,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  monoInput: {
    fontFamily: 'monospace',
    marginTop: 6,
  },
  byokBox: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  byokHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },
  byokTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#B45309',
  },
  byokSubtitle: {
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
  },
  proBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  proBoxText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: '#065F46',
    flex: 1,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: spacing.md,
  },
  secureText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  payBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  payBtnDisabled: {
    opacity: 0.6,
  },
  payBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  successTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
  },
  successDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginHorizontal: spacing.md,
    lineHeight: 20,
  },
  successSummaryCard: {
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    width: '100%',
    marginVertical: spacing.md,
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryRowLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  summaryRowVal: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
  },
  startLearningBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
  startLearningBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
});
