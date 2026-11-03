import type {
  CartItem,
  CustomerInfo,
  PaymentOrderResult,
  PaymentVerificationResult,
  RazorpayPaymentData,
} from './payment';
import type { RazorpayOptions, RazorpayResult } from './razorpayCheckout';
import type { AITeacherPlanId, AITeacherSubscription } from './aiTeacherSubscription';

/** Same course id the web app uses for AI Teacher orders. */
export const AI_TEACHER_ORDER_COURSE_ID = '9403f48c-2f2f-49a0-bcf6-46c232480ff9';

const PLUS_PLAN_ID: AITeacherPlanId = 'byok_500';
const PLUS_PLAN_NAME = 'AI Teacher Plus';
const ORDER_TIMEOUT_MS = 15000;
const VERIFY_ATTEMPTS = 2;

const MSG_NOT_LOGGED_IN = 'Please log in to buy AI Teacher Plus.';
const MSG_NAME = 'Please enter your name.';
const MSG_PHONE = 'Please enter your 10-digit mobile number.';
const MSG_ORDER_TIMEOUT = 'The payment server is taking too long. Please check your internet and try again.';
const MSG_ORDER_FAILED = 'We could not start the payment. Please try again in a minute.';
const MSG_CANCELLED = 'Payment cancelled. You have not been charged.';
const MSG_NOT_CHARGED = 'You have not been charged.';

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export interface PurchasePlusInput {
  userId: string;
  name: string;
  email: string;
  phone: string;
  amountRupees: number;
}

export interface PurchaseDeps {
  createOrder: (
    userId: string,
    amount: number,
    courses: CartItem[],
    customerInfo: CustomerInfo,
  ) => Promise<PaymentOrderResult | { error: string }>;
  openCheckout: (options: RazorpayOptions) => Promise<RazorpayResult>;
  verify: (
    userId: string,
    paymentData: RazorpayPaymentData,
    orderId: string,
    courses: { id: string }[],
  ) => Promise<PaymentVerificationResult>;
  subscribe: (
    planId: AITeacherPlanId,
    details?: {
      name?: string;
      email?: string;
      phone?: string;
      orderId?: string;
      paymentId?: string;
    },
  ) => Promise<AITeacherSubscription>;
  recordSubscriptionInDb: (sub: AITeacherSubscription) => Promise<boolean>;
  /** Optional: returns true for the one pre-registered account that gets the plan without paying. */
  isPermanentTestingAccount?: (email?: string | null) => boolean;
}

export type PurchasePlusResult =
  | { status: 'success' }
  | { status: 'cancelled'; message: string }
  | { status: 'error'; message: string };

export async function purchasePlus(
  input: PurchasePlusInput,
  deps: PurchaseDeps,
): Promise<PurchasePlusResult> {
  const name = input.name.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();

  if (!input.userId) {
    return { status: 'error', message: MSG_NOT_LOGGED_IN };
  }

  // Silent activation for the pre-registered testing account (no order, no charge).
  if (deps.isPermanentTestingAccount?.(email.toLowerCase())) {
    const orderId = `SL-AIT-PRO-${Date.now().toString(36).toUpperCase()}`;
    const paymentId = `pay_${Date.now()}`;
    try {
      const sub = await deps.subscribe(PLUS_PLAN_ID, {
        name: name || 'Student',
        email: email.toLowerCase(),
        phone: phone || undefined,
        orderId,
        paymentId,
      });
      await safeRecord(deps, sub);
      return { status: 'success' };
    } catch (err) {
      console.warn('[AITeacherPlus] silent activation failed:', err);
      return { status: 'error', message: `We could not activate your plan. Please contact support with payment ID ${paymentId}.` };
    }
  }

  if (!name) {
    return { status: 'error', message: MSG_NAME };
  }
  if (!/^\d{10}$/.test(phone)) {
    return { status: 'error', message: MSG_PHONE };
  }

  // 1. Create the order on the server.
  let order: PaymentOrderResult | { error: string };
  try {
    order = await withTimeout(
      deps.createOrder(
        input.userId,
        input.amountRupees,
        [{ id: AI_TEACHER_ORDER_COURSE_ID, name: PLUS_PLAN_NAME, price: input.amountRupees }],
        { fullName: name, email, phone },
      ),
      ORDER_TIMEOUT_MS,
      MSG_ORDER_TIMEOUT,
    );
  } catch (err: any) {
    const timedOut = err?.message === MSG_ORDER_TIMEOUT;
    console.warn('[AITeacherPlus] order failed:', err?.message ?? err);
    return { status: 'error', message: timedOut ? MSG_ORDER_TIMEOUT : MSG_ORDER_FAILED };
  }

  const usable =
    order &&
    'razorpayOrderId' in order &&
    !!order.razorpayOrderId &&
    !!order.razorpayKeyId;
  if (!usable) {
    const reason = order && 'error' in order ? order.error : 'missing razorpayOrderId or razorpayKeyId';
    console.warn('[AITeacherPlus] order failed:', reason);
    return { status: 'error', message: MSG_ORDER_FAILED };
  }

  const orderId = (order as PaymentOrderResult).razorpayOrderId;

  // 2. Open Razorpay checkout.
  const checkout = await deps.openCheckout({
    razorpayKeyId: (order as PaymentOrderResult).razorpayKeyId,
    razorpayOrderId: orderId,
    amountInPaise: input.amountRupees * 100,
    currency: 'INR',
    name: 'SimpleLecture',
    description: `${PLUS_PLAN_NAME} - 1-to-1 AI Teacher`,
    customerName: name,
    customerEmail: email,
    customerPhone: phone,
  });

  if (!checkout.success || !checkout.data) {
    if (checkout.cancelled) {
      return { status: 'cancelled', message: MSG_CANCELLED };
    }
    return { status: 'error', message: `${checkout.error || 'Payment could not be completed.'} ${MSG_NOT_CHARGED}` };
  }

  const paymentId = checkout.data.razorpay_payment_id;
  const paymentData: RazorpayPaymentData = {
    razorpay_order_id: checkout.data.razorpay_order_id || orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: checkout.data.razorpay_signature,
  };

  // 3. Verify the payment on the server. Only a verified:true answer grants the plan,
  //    except when verification cannot be reached at all: Razorpay's success callback counts then.
  let verified: boolean | null = null; // null = verification never answered
  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS && verified === null; attempt++) {
    try {
      const res = await deps.verify(input.userId, paymentData, orderId, []);
      if (res.networkError) {
        console.warn(`[AITeacherPlus] verify network error (attempt ${attempt}):`, res.error);
        continue;
      }
      verified = res.verified === true;
    } catch (err) {
      console.warn(`[AITeacherPlus] verify threw (attempt ${attempt}):`, err);
    }
  }

  if (verified === false) {
    return {
      status: 'error',
      message: `We could not confirm your payment. If money was deducted, contact support with payment ID ${paymentId}.`,
    };
  }

  // 4. Grant the plan.
  try {
    const sub = await deps.subscribe(PLUS_PLAN_ID, {
      name,
      email,
      phone,
      orderId,
      paymentId,
    });
    await safeRecord(deps, sub);
    return { status: 'success' };
  } catch (err) {
    console.warn('[AITeacherPlus] subscribe failed:', err);
    return {
      status: 'error',
      message: `Your payment went through but we could not activate your plan. Please contact support with payment ID ${paymentId}.`,
    };
  }
}

async function safeRecord(deps: PurchaseDeps, sub: AITeacherSubscription): Promise<void> {
  try {
    await deps.recordSubscriptionInDb(sub);
  } catch (err) {
    console.warn('[AITeacherPlus] recordSubscriptionInDb failed:', err);
  }
}
