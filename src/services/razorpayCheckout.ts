import RazorpayCheckout from 'react-native-razorpay';

export interface RazorpayOptions {
  razorpayKeyId: string;
  razorpayOrderId: string;
  amountInPaise: number;
  currency?: string;
  name?: string;
  description?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

export interface RazorpaySuccessData {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayResult {
  success: boolean;
  data?: RazorpaySuccessData;
  cancelled?: boolean;
  error?: string;
}

export async function openRazorpayCheckout(options: RazorpayOptions): Promise<RazorpayResult> {
  const razorpayOptions: Record<string, any> = {
    key: options.razorpayKeyId,
    amount: String(options.amountInPaise),
    currency: options.currency || 'INR',
    name: options.name || 'Simple Lecture',
    description: options.description || 'Course Payment',
    order_id: options.razorpayOrderId,
    prefill: {
      name: options.customerName || '',
      email: options.customerEmail || '',
      contact: options.customerPhone || '',
    },
    theme: {
      color: '#2BBD6E',
    },
    retry: {
      enabled: true,
      max_count: 3,
    },
  };

  try {
    const data = await RazorpayCheckout.open(razorpayOptions);
    return {
      success: true,
      data: {
        razorpay_payment_id: data.razorpay_payment_id,
        razorpay_order_id: data.razorpay_order_id,
        razorpay_signature: data.razorpay_signature,
      },
    };
  } catch (error: any) {
    console.log('[Razorpay] Payment error:', JSON.stringify(error));

    const errorObj = error?.error || error;
    const reason = errorObj?.reason || '';
    const description = errorObj?.description || error?.description || '';
    const code = errorObj?.code || error?.code;

    if (code === 2 || description.includes('cancelled') || description.includes('dismissed') || reason === 'payment_cancelled') {
      return {
        success: false,
        cancelled: true,
        error: 'Payment cancelled',
      };
    }

    let friendlyMessage = 'Payment could not be completed. Please try again or use a different payment method.';
    if (reason === 'payment_error' || code === 'BAD_REQUEST_ERROR') {
      friendlyMessage = 'Payment could not be processed. Please try again or use a different payment method.';
    } else if (description.includes('network') || description.includes('timeout')) {
      friendlyMessage = 'Payment failed due to a network issue. Please check your connection and try again.';
    } else if (description.includes('insufficient')) {
      friendlyMessage = 'Payment failed due to insufficient funds. Please try a different payment method.';
    }

    return {
      success: false,
      cancelled: false,
      error: friendlyMessage,
    };
  }
}
