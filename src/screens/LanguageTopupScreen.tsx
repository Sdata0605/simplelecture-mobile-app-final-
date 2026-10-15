import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase } from '../services/supabase';
import { openRazorpayCheckout } from '../services/razorpayCheckout';
import { calculateGST, GST_RATE } from '../services/payment';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Language data with native script (no emojis)
const LANGUAGE_DATA: Record<string, { label: string; native: string; code: string }> = {
  english: { label: 'English', native: 'English', code: 'GB' },
  hindi: { label: 'Hindi', native: 'हिन्दी', code: 'IN' },
  kannada: { label: 'Kannada', native: 'ಕನ್ನಡ', code: 'IN' },
  tamil: { label: 'Tamil', native: 'தமிழ்', code: 'IN' },
  telugu: { label: 'Telugu', native: 'తెలుగు', code: 'IN' },
  malayalam: { label: 'Malayalam', native: 'മലയാളം', code: 'IN' },
  marathi: { label: 'Marathi', native: 'मराठी', code: 'IN' },
  bengali: { label: 'Bengali', native: 'বাংলা', code: 'IN' },
  gujarati: { label: 'Gujarati', native: 'ગુજરાતી', code: 'IN' },
  punjabi: { label: 'Punjabi', native: 'ਪੰਜਾਬੀ', code: 'IN' },
  odia: { label: 'Odia', native: 'ଓଡ଼ିଆ', code: 'IN' },
  assamese: { label: 'Assamese', native: 'অসমীয়া', code: 'IN' },
  urdu: { label: 'Urdu', native: 'اردو', code: 'IN' },
};

interface CourseLanguageInfo {
  id: string;
  name: string;
  available_languages: string[];
  language_topup_price: number;
  language_topup_original_price: number;
}

interface TopupPurchase {
  id: string;
  selected_languages: string[];
  status: string;
}

export default function LanguageTopupScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<{ LanguageTopup: { subjectId?: string } }, 'LanguageTopup'>>();
  const { subjectId } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState<CourseLanguageInfo | null>(null);
  const [existingPurchase, setExistingPurchase] = useState<TopupPurchase | null>(null);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);

  // Fetch course info and existing purchases
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        if (!subjectId) {
          Alert.alert('Error', 'Subject information not available');
          navigation.goBack();
          return;
        }

        // Get courseId from subjectId
        const courseResult = await supabase.getCourseFromSubject(subjectId);
        if (!courseResult.success || !courseResult.course) {
          Alert.alert('Error', 'Could not find course information');
          navigation.goBack();
          return;
        }

        setCourse({
          id: courseResult.course.id,
          name: courseResult.course.name,
          available_languages: courseResult.course.available_languages || ['english'],
          language_topup_price: courseResult.course.language_topup_price || 0,
          language_topup_original_price: courseResult.course.language_topup_original_price || 0,
        });

        // Check existing purchases
        const purchaseResult = await supabase.getLanguageTopupPurchases(courseResult.course.id);
        if (purchaseResult.success && purchaseResult.purchase) {
          setExistingPurchase(purchaseResult.purchase);
        }
      } catch (error) {
        console.error('Error fetching language topup data:', error);
        Alert.alert('Error', 'Failed to load language options');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [subjectId]);

  // Languages available to purchase (exclude English and already purchased)
  const languagesToBuy = useMemo(() => {
    if (!course) return [];
    const purchasedLanguages = existingPurchase?.selected_languages || [];
    return course.available_languages.filter(
      lang => lang !== 'english' && !purchasedLanguages.includes(lang)
    );
  }, [course, existingPurchase]);

  // Calculate pricing
  const pricing = useMemo(() => {
    const pricePerLanguage = course?.language_topup_price || 0;
    const originalPricePerLanguage = course?.language_topup_original_price || 0;
    const totalPrice = pricePerLanguage * selectedLanguages.length;
    const totalOriginalPrice = originalPricePerLanguage * selectedLanguages.length;
    const discount = totalOriginalPrice > totalPrice && totalOriginalPrice > 0
      ? Math.round(((totalOriginalPrice - totalPrice) / totalOriginalPrice) * 100)
      : 0;
    const savings = totalOriginalPrice - totalPrice;
    const gstAmount = calculateGST(totalPrice);
    const totalWithGST = totalPrice + gstAmount;

    return { pricePerLanguage, originalPricePerLanguage, totalPrice, totalOriginalPrice, discount, savings, gstAmount, totalWithGST };
  }, [course, selectedLanguages]);

  // Toggle language selection
  const toggleLanguage = (lang: string) => {
    setSelectedLanguages(prev =>
      prev.includes(lang)
        ? prev.filter(l => l !== lang)
        : [...prev, lang]
    );
  };

  // Select all languages
  const selectAll = () => setSelectedLanguages(languagesToBuy);

  // Clear selection
  const clearSelection = () => setSelectedLanguages([]);

  // Handle purchase
  const handlePurchase = async () => {
    if (selectedLanguages.length === 0 || !course) return;

    try {
      setProcessing(true);

      // Create order via edge function
      const orderResult = await supabase.createLanguageTopupOrder(
        course.id,
        selectedLanguages
      );

      if (!orderResult.success || !orderResult.order) {
        Alert.alert('Error', orderResult.error || 'Failed to create order');
        return;
      }

      const paymentResult = await openRazorpayCheckout({
        razorpayKeyId: orderResult.order.razorpayKeyId,
        razorpayOrderId: orderResult.order.razorpayOrderId,
        amountInPaise: orderResult.order.amount * 100,
        description: `Language Top-Up: ${selectedLanguages.length} language(s)`,
      });

      if (paymentResult.cancelled) {
        Alert.alert('Payment Cancelled', 'You cancelled the payment. You can try again anytime.');
        return;
      }

      if (!paymentResult.success || !paymentResult.data) {
        Alert.alert('Payment Failed', paymentResult.error || 'Something went wrong during payment. Please try again.');
        return;
      }

      const verifyResult = await supabase.verifyLanguageTopupPayment(
        paymentResult.data.razorpay_order_id,
        paymentResult.data.razorpay_payment_id,
        paymentResult.data.razorpay_signature,
        orderResult.order.orderId,
        course.id,
        selectedLanguages
      );

      if (verifyResult.success) {
        setExistingPurchase(prev => ({
          id: prev?.id || orderResult.order!.orderId,
          selected_languages: [...(prev?.selected_languages || []), ...selectedLanguages],
          status: 'completed',
        }));
        setSelectedLanguages([]);
        Alert.alert(
          'Languages Unlocked!',
          `You now have access to ${selectedLanguages.length} new language(s) for this course.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Verification Failed', verifyResult.error || 'Payment was received but verification failed. Please contact support.');
      }
    } catch (error) {
      console.error('Error processing purchase:', error);
      Alert.alert('Error', 'Failed to process purchase');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading language options...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const purchasedLanguages = existingPurchase?.selected_languages || [];
  const allLanguagesPurchased = languagesToBuy.length === 0 && purchasedLanguages.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          data-testid="button-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.gray800} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Unlock Languages</Text>
          {pricing.pricePerLanguage > 0 && (
            <Text style={styles.headerSubtitle}>₹{pricing.pricePerLanguage} per language</Text>
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Course Name */}
        {course && (
          <View style={styles.courseCard}>
            <Ionicons name="book-outline" size={20} color={colors.primary} />
            <Text style={styles.courseName}>{course.name}</Text>
          </View>
        )}

        {/* English - Always Free */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Included Free</Text>
          <View style={styles.languageCardFree}>
            <View style={styles.languageInfo}>
              <View style={styles.countryCodeBadge}>
                <Text style={styles.countryCodeText}>GB</Text>
              </View>
              <View>
                <Text style={styles.languageLabel}>English</Text>
                <Text style={styles.languageNative}>English</Text>
              </View>
            </View>
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>FREE</Text>
            </View>
          </View>
        </View>

        {/* Already Purchased Languages */}
        {purchasedLanguages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Already Unlocked</Text>
            <View style={styles.purchasedGrid}>
              {purchasedLanguages.map(lang => {
                const langData = LANGUAGE_DATA[lang];
                if (!langData) return null;
                return (
                  <View key={lang} style={styles.purchasedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={styles.purchasedBadgeText}>{langData.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* All Languages Purchased State */}
        {allLanguagesPurchased && (
          <View style={styles.successCard}>
            <LinearGradient
              colors={['#22c55e', '#16a34a']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.successGradient}
            >
              <Ionicons name="checkmark-circle" size={48} color={colors.white} />
              <Text style={styles.successTitle}>All Languages Unlocked!</Text>
              <Text style={styles.successText}>
                You have access to all available languages for this course.
              </Text>
            </LinearGradient>
          </View>
        )}

        {/* Available Languages to Purchase */}
        {languagesToBuy.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Available Languages</Text>
              <View style={styles.selectionButtons}>
                <TouchableOpacity onPress={selectAll} style={styles.selectionButton}>
                  <Text style={styles.selectionButtonText}>Select All</Text>
                </TouchableOpacity>
                {selectedLanguages.length > 0 && (
                  <TouchableOpacity onPress={clearSelection} style={styles.selectionButton}>
                    <Text style={styles.selectionButtonTextClear}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={styles.languageGrid}>
              {languagesToBuy.map(lang => {
                const langData = LANGUAGE_DATA[lang];
                if (!langData) return null;
                const isSelected = selectedLanguages.includes(lang);
                return (
                  <TouchableOpacity
                    key={lang}
                    style={[styles.languageCard, isSelected && styles.languageCardSelected]}
                    onPress={() => toggleLanguage(lang)}
                    data-testid={`checkbox-language-${lang}`}
                  >
                    <View style={styles.checkboxContainer}>
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color={colors.white} />}
                      </View>
                    </View>
                    <View style={styles.languageInfo}>
                      <View style={styles.countryCodeBadge}>
                        <Text style={styles.countryCodeText}>{langData.code}</Text>
                      </View>
                      <View>
                        <Text style={styles.languageLabel}>{langData.label}</Text>
                        <Text style={styles.languageNative}>{langData.native}</Text>
                      </View>
                    </View>
                    <Text style={styles.languagePrice}>₹{pricing.pricePerLanguage}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Features Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What You Get</Text>
          <View style={styles.featuresGrid}>
            <View style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="videocam" size={24} color={colors.primary} />
              </View>
              <Text style={styles.featureTitle}>AI Lectures</Text>
              <Text style={styles.featureText}>Watch in your language</Text>
            </View>
            <View style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="chatbubbles" size={24} color="#D97706" />
              </View>
              <Text style={styles.featureTitle}>AI Assistant</Text>
              <Text style={styles.featureText}>Ask questions in your language</Text>
            </View>
            <View style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="infinite" size={24} color="#16A34A" />
              </View>
              <Text style={styles.featureTitle}>Lifetime Access</Text>
              <Text style={styles.featureText}>One-time purchase</Text>
            </View>
            <View style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: '#E0E7FF' }]}>
                <Ionicons name="add-circle" size={24} color="#4F46E5" />
              </View>
              <Text style={styles.featureTitle}>Buy More</Text>
              <Text style={styles.featureText}>Add languages anytime</Text>
            </View>
          </View>
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Fixed Purchase Button */}
      {selectedLanguages.length > 0 && (
        <View style={styles.purchaseContainer}>
          <View style={styles.pricingSummary}>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedCount}>
                {selectedLanguages.length} language{selectedLanguages.length > 1 ? 's' : ''} selected
              </Text>
              {pricing.discount > 0 && (
                <View style={styles.discountRow}>
                  <Text style={styles.originalPrice}>₹{pricing.totalOriginalPrice}</Text>
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountText}>{pricing.discount}% OFF</Text>
                  </View>
                </View>
              )}
              <Text style={styles.gstLabel}>₹{pricing.totalPrice} + ₹{pricing.gstAmount} GST ({GST_RATE}%)</Text>
            </View>
            <Text style={styles.totalPrice}>₹{pricing.totalWithGST}</Text>
          </View>
          <TouchableOpacity
            style={styles.purchaseButton}
            onPress={handlePurchase}
            disabled={processing}
            data-testid="button-unlock-languages"
          >
            <LinearGradient
              colors={[colors.primary, '#22C55E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.purchaseButtonGradient}
            >
              {processing ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Ionicons name="lock-open" size={20} color={colors.white} />
                  <Text style={styles.purchaseButtonText}>
                    Unlock {selectedLanguages.length} Language{selectedLanguages.length > 1 ? 's' : ''}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.gray600,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
    backgroundColor: colors.white,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.gray900,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  courseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  courseName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
    flex: 1,
  },
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.gray900,
    marginBottom: spacing.sm,
  },
  selectionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  selectionButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  selectionButtonText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  selectionButtonTextClear: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    fontWeight: '600',
  },
  languageCardFree: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  languageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countryCodeBadge: {
    width: 32,
    height: 24,
    backgroundColor: colors.gray200,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryCodeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.gray700,
  },
  languageLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray900,
  },
  languageNative: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  freeBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  freeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#16A34A',
  },
  purchasedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  purchasedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  purchasedBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: '#16A34A',
  },
  successCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  successGradient: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  successTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.white,
    marginTop: spacing.md,
  },
  successText: {
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.9)',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  languageGrid: {
    gap: spacing.sm,
  },
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.gray200,
  },
  languageCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  checkboxContainer: {
    marginRight: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.gray400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  languagePrice: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.gray900,
    marginLeft: 'auto',
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  featureCard: {
    width: '48%',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  featureTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.gray900,
  },
  featureText: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    textAlign: 'center',
  },
  purchaseContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  pricingSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  selectedCount: {
    fontSize: fontSize.sm,
    color: colors.gray600,
  },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  originalPrice: {
    fontSize: fontSize.sm,
    color: colors.gray400,
    textDecorationLine: 'line-through',
  },
  discountBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 4,
  },
  discountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16A34A',
  },
  gstLabel: {
    fontSize: 11,
    color: colors.gray500,
    marginTop: 2,
  },
  totalPrice: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.gray900,
  },
  purchaseButton: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  purchaseButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  purchaseButtonText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.white,
  },
});
