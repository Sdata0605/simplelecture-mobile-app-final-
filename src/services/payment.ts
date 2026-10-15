import AsyncStorage from '@react-native-async-storage/async-storage';
import { getValidAccessToken } from './supabase';

const SUPABASE_URL = 'https://oxwhqvsoelqqsblmqkxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94d2hxdnNvZWxxcXNibG1xa3h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTU4NTgsImV4cCI6MjA3NTA5MTg1OH0.nZbWSb9AQK5uGAQmc7zXAceTHm9GRQJvqkg4-LNo_DM';
const EDGE_FUNCTIONS_BASE_URL = `${SUPABASE_URL}/functions/v1`;
const AUTH_TOKEN_KEY = 'auth_token';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  thumbnail_url?: string | null;
}

export interface CustomerInfo {
  fullName: string;
  email: string;
  phone: string;
  state?: string;
  city?: string;
}

export interface PromoCodeResult {
  valid: boolean;
  id?: string;
  code?: string;
  description?: string;
  discount_percent?: number;
  discount_amount?: number;
  message: string;
}

export interface PaymentOrderResult {
  orderId: string;
  amount: number;
  status: string;
  paymentId: string;
  razorpayOrderId: string;
  razorpayKeyId: string;
  error?: string;
}

export interface PaymentVerificationResult {
  verified: boolean;
  message?: string;
  error?: string;
}

export interface RazorpayPaymentData {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export const GST_RATE = 18;

export const calculateGST = (amount: number): number => Math.round(amount * 0.18);

export const calculateTotalWithGST = (amount: number): number => amount + calculateGST(amount);

const getAuthToken = async (): Promise<string | null> => {
  try {
    return await getValidAccessToken();
  } catch {
    return null;
  }
};

export const paymentService = {
  validatePromoCode: async (code: string, courseId?: string): Promise<PromoCodeResult> => {
    try {
      const response = await fetch(
        `${EDGE_FUNCTIONS_BASE_URL}/validate-promo-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ 
            code,
            course_id: courseId || null,
          }),
        }
      );
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error validating promo code:', error);
      return { valid: false, message: 'Failed to validate promo code' };
    }
  },

  createPaymentOrder: async (
    userId: string,
    amount: number,
    courses: CartItem[],
    customerInfo: CustomerInfo,
    promoCode?: string
  ): Promise<PaymentOrderResult | { error: string }> => {
    try {
      const authToken = await getAuthToken();
      if (!authToken) {
        return { error: 'User not authenticated. Please login again.' };
      }

      const payload: Record<string, unknown> = {
        amount,
        userId,
        courses: courses.map(c => ({
          id: c.id,
          price: c.price,
        })),
        customerInfo: {
          fullName: customerInfo.fullName || '',
          email: customerInfo.email || '',
          phone: customerInfo.phone || '',
        },
      };

      if (promoCode) {
        payload.promoCode = promoCode;
      }

      const response = await fetch(
        `${EDGE_FUNCTIONS_BASE_URL}/create-payment-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.status === 404) {
        return { error: 'Payment service not available. Please contact support.' };
      }

      const data = await response.json();
      
      if (!response.ok) {
        return { error: data.error || data.message || 'Failed to create payment order. Please try again.' };
      }
      
      return data;
    } catch (error) {
      console.error('Error creating payment order:', error);
      return { error: 'Payment service unavailable. Please check your connection and try again.' };
    }
  },

  verifyPayment: async (
    userId: string,
    paymentData: RazorpayPaymentData,
    orderId: string,
    courses: { id: string }[]
  ): Promise<PaymentVerificationResult> => {
    try {
      const authToken = await getAuthToken();
      if (!authToken) {
        return { verified: false, error: 'User not authenticated' };
      }

      const response = await fetch(
        `${EDGE_FUNCTIONS_BASE_URL}/verify-payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            razorpay_order_id: paymentData.razorpay_order_id,
            razorpay_payment_id: paymentData.razorpay_payment_id,
            razorpay_signature: paymentData.razorpay_signature,
            orderId,
            userId,
            courses,
          }),
        }
      );

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error verifying payment:', error);
      return { verified: false, error: 'Payment verification failed' };
    }
  },

  calculateDiscount: (
    originalPrice: number,
    promoResult: PromoCodeResult
  ): { discountAmount: number; finalPrice: number } => {
    if (!promoResult.valid) {
      return { discountAmount: 0, finalPrice: originalPrice };
    }

    let discountAmount = 0;
    
    if (promoResult.discount_percent) {
      discountAmount = Math.round(originalPrice * (promoResult.discount_percent / 100));
    } else if (promoResult.discount_amount) {
      discountAmount = promoResult.discount_amount;
    }

    const finalPrice = Math.max(0, originalPrice - discountAmount);
    return { discountAmount, finalPrice };
  },
};

export default paymentService;
