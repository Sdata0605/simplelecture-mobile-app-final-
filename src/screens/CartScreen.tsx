import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useCart } from '../context/CartContext';
import paymentService, { PromoCodeResult, CustomerInfo, calculateGST, GST_RATE } from '../services/payment';
import { openRazorpayCheckout } from '../services/razorpayCheckout';
import { useAuth } from '../context/AuthContext';

export default function CartScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { cartItems, removeFromCart, clearCart, cartTotal } = useCart();
  const { user } = useAuth();
  
  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState<PromoCodeResult | null>(null);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    fullName: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    state: '',
    city: '',
  });

  const { discountAmount, finalPrice } = promoResult 
    ? paymentService.calculateDiscount(cartTotal, promoResult)
    : { discountAmount: 0, finalPrice: cartTotal };

  const gstAmount = calculateGST(finalPrice);
  const totalWithGST = finalPrice + gstAmount;

  const formatPrice = (price: number) => {
    return `₹${price.toLocaleString('en-IN')}`;
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    
    setIsApplyingPromo(true);
    const result = await paymentService.validatePromoCode(promoCode.trim());
    setPromoResult(result);
    setIsApplyingPromo(false);
    
    if (!result.valid) {
      Alert.alert('Invalid Code', result.message);
    }
  };

  const handleRemovePromo = () => {
    setPromoCode('');
    setPromoResult(null);
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'Please add courses to your cart first.');
      return;
    }

    if (!user?.id) {
      Alert.alert('Login Required', 'Please login to continue with checkout.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Login', onPress: () => navigation.navigate('Login') },
      ]);
      return;
    }

    if (!customerInfo.fullName || !customerInfo.email || !customerInfo.phone || !customerInfo.state || !customerInfo.city) {
      Alert.alert('Missing Information', 'Please fill in all required fields: name, email, phone, state, and city.');
      return;
    }

    setIsCheckingOut(true);
    
    try {
      const orderResult = await paymentService.createPaymentOrder(
        user.id,
        totalWithGST,
        cartItems,
        customerInfo,
        promoResult?.valid ? promoCode : undefined
      );

      if ('error' in orderResult) {
        Alert.alert('Error', orderResult.error);
        return;
      }

      const paymentResult = await openRazorpayCheckout({
        razorpayKeyId: orderResult.razorpayKeyId,
        razorpayOrderId: orderResult.razorpayOrderId,
        amountInPaise: orderResult.amount * 100,
        description: `Payment for ${cartItems.length} course(s)`,
        customerName: customerInfo.fullName,
        customerEmail: customerInfo.email,
        customerPhone: customerInfo.phone,
      });

      if (paymentResult.cancelled) {
        Alert.alert('Payment Cancelled', 'You cancelled the payment. Your order is saved and you can try again.');
        return;
      }

      if (!paymentResult.success || !paymentResult.data) {
        Alert.alert('Payment Failed', paymentResult.error || 'Something went wrong during payment. Please try again.');
        return;
      }

      const verifyResult = await paymentService.verifyPayment(
        user.id,
        paymentResult.data,
        orderResult.orderId,
        cartItems.map(c => ({ id: c.id }))
      );

      if (verifyResult.verified) {
        clearCart();
        Alert.alert(
          'Payment Successful',
          'Your payment has been verified and courses have been added to your account.',
          [{ text: 'OK', onPress: () => navigation.navigate('MainTabs', { screen: 'Home' }) }]
        );
      } else {
        Alert.alert('Verification Failed', verifyResult.error || 'Payment was received but verification failed. Please contact support.');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (cartItems.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Cart</Text>
          <View style={{ width: 40 }} />
        </View>
        
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="cart-outline" size={60} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySubtitle}>Browse our courses and find something you love!</Text>
          <TouchableOpacity onPress={() => navigation.navigate('MyCourses')}>
            <LinearGradient
              colors={[colors.primary, '#4ADE80']}
              style={styles.browseButton}
            >
              <Text style={styles.browseButtonText}>Browse Courses</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cart ({cartItems.length})</Text>
        <TouchableOpacity onPress={clearCart} style={styles.clearButton}>
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {cartItems.map((item) => (
          <View key={item.id} style={styles.cartItem}>
            {item.thumbnail_url && !item.thumbnail_url?.startsWith('data:') ? (
              <Image source={{ uri: item.thumbnail_url }} style={styles.itemImage} />
            ) : (
              <View style={styles.itemImagePlaceholder}>
                <Ionicons name="book" size={28} color={colors.primary} />
              </View>
            )}
            <View style={styles.itemInfo}>
              <Text style={styles.itemTitle} numberOfLines={2}>{item.name}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.currentPrice}>{formatPrice(item.price)}</Text>
                {item.originalPrice && item.originalPrice > item.price && (
                  <Text style={styles.originalPrice}>{formatPrice(item.originalPrice)}</Text>
                )}
              </View>
            </View>
            <TouchableOpacity 
              onPress={() => removeFromCart(item.id)} 
              style={styles.removeButton}
            >
              <Ionicons name="close-circle" size={24} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.promoSection}>
          <Text style={styles.sectionTitle}>Promo Code</Text>
          <View style={styles.promoInputRow}>
            <TextInput
              style={styles.promoInput}
              placeholder="Enter promo code"
              placeholderTextColor={colors.textMuted}
              value={promoCode}
              onChangeText={setPromoCode}
              autoCapitalize="characters"
              editable={!promoResult?.valid}
            />
            {promoResult?.valid ? (
              <TouchableOpacity onPress={handleRemovePromo} style={styles.removePromoButton}>
                <Ionicons name="close" size={20} color="#EF4444" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                onPress={handleApplyPromo} 
                style={styles.applyButton}
                disabled={isApplyingPromo}
              >
                {isApplyingPromo ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.applyButtonText}>Apply</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          {promoResult?.valid && (
            <View style={styles.promoSuccess}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.promoSuccessText}>{promoResult.description} applied!</Text>
            </View>
          )}
        </View>

        <View style={styles.customerSection}>
          <Text style={styles.sectionTitle}>Your Details</Text>
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor={colors.textMuted}
            value={customerInfo.fullName}
            onChangeText={(text) => setCustomerInfo(prev => ({ ...prev, fullName: text }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            value={customerInfo.email}
            onChangeText={(text) => setCustomerInfo(prev => ({ ...prev, email: text }))}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Phone Number"
            placeholderTextColor={colors.textMuted}
            value={customerInfo.phone}
            onChangeText={(text) => setCustomerInfo(prev => ({ ...prev, phone: text }))}
            keyboardType="phone-pad"
          />
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="State"
              placeholderTextColor={colors.textMuted}
              value={customerInfo.state}
              onChangeText={(text) => setCustomerInfo(prev => ({ ...prev, state: text }))}
            />
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="City"
              placeholderTextColor={colors.textMuted}
              value={customerInfo.city}
              onChangeText={(text) => setCustomerInfo(prev => ({ ...prev, city: text }))}
            />
          </View>
        </View>

        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Course Price</Text>
              <Text style={styles.summaryValue}>{formatPrice(cartTotal)}</Text>
            </View>
            {discountAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.discountLabel}>Discount</Text>
                <Text style={styles.discountValue}>-{formatPrice(discountAmount)}</Text>
              </View>
            )}
            {discountAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>{formatPrice(finalPrice)}</Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>GST ({GST_RATE}%)</Text>
              <Text style={styles.summaryValue}>{formatPrice(gstAmount)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatPrice(totalWithGST)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerPrice}>
          <Text style={styles.footerPriceLabel}>Total (incl. GST)</Text>
          <Text style={styles.footerPriceValue}>{formatPrice(totalWithGST)}</Text>
        </View>
        <TouchableOpacity 
          onPress={handleCheckout} 
          style={styles.checkoutButtonContainer}
          disabled={isCheckingOut}
        >
          <LinearGradient
            colors={[colors.primary, '#4ADE80']}
            style={styles.checkoutButton}
          >
            {isCheckingOut ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Text style={styles.checkoutButtonText}>Proceed to Pay</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.white} />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 50,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  clearButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  browseButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  browseButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.white,
  },
  cartItem: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
  },
  itemImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  currentPrice: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
  originalPrice: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  removeButton: {
    padding: spacing.xs,
  },
  promoSection: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  promoInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  promoInput: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  applyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.white,
  },
  removePromoButton: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  promoSuccessText: {
    fontSize: fontSize.sm,
    color: '#10B981',
    fontWeight: '500',
  },
  customerSection: {
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfInput: {
    flex: 1,
  },
  summarySection: {
    marginBottom: spacing.md,
  },
  summaryCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  summaryLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  discountLabel: {
    fontSize: fontSize.sm,
    color: '#10B981',
  },
  discountValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: '#10B981',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginVertical: spacing.sm,
  },
  totalLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.primary,
  },
  bottomSpacer: {
    height: 120,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  footerPrice: {
    flex: 1,
  },
  footerPriceLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  footerPriceValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.primary,
  },
  checkoutButtonContainer: {
    flex: 1,
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  checkoutButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
});
