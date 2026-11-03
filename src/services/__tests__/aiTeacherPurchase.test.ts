import {
  AI_TEACHER_ORDER_COURSE_ID,
  purchasePlus,
  withTimeout,
  type PurchaseDeps,
  type PurchasePlusInput,
} from '../aiTeacherPurchase';

const INPUT: PurchasePlusInput = {
  userId: 'user-1',
  name: 'Asha Rao',
  email: 'asha@example.com',
  phone: '9876543210',
  amountRupees: 500,
};

const GOOD_ORDER = {
  orderId: 'db-order-1',
  amount: 500,
  status: 'created',
  paymentId: 'db-pay-1',
  razorpayOrderId: 'order_ABC',
  razorpayKeyId: 'rzp_live_key',
};

const SUCCESS_CHECKOUT = {
  success: true,
  data: {
    razorpay_payment_id: 'pay_XYZ',
    razorpay_order_id: 'order_ABC',
    razorpay_signature: 'sig_123',
  },
};

const SUB = {
  planId: 'byok_500' as const,
  planName: 'Plus Plan',
  price: 500,
  purchasedAt: '2026-11-03T00:00:00.000Z',
  orderId: 'order_ABC',
  paymentId: 'pay_XYZ',
};

function makeDeps(overrides: Partial<PurchaseDeps> = {}): PurchaseDeps {
  return {
    createOrder: jest.fn().mockResolvedValue(GOOD_ORDER),
    openCheckout: jest.fn().mockResolvedValue(SUCCESS_CHECKOUT),
    verify: jest.fn().mockResolvedValue({ verified: true }),
    subscribe: jest.fn().mockResolvedValue(SUB),
    recordSubscriptionInDb: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('purchasePlus', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.useRealTimers();
  });

  it('grants the plan once on a verified successful payment', async () => {
    const deps = makeDeps();
    const result = await purchasePlus(INPUT, deps);

    expect(result).toEqual({ status: 'success' });
    expect(deps.createOrder).toHaveBeenCalledWith(
      'user-1',
      500,
      [{ id: AI_TEACHER_ORDER_COURSE_ID, name: 'AI Teacher Plus', price: 500 }],
      { fullName: 'Asha Rao', email: 'asha@example.com', phone: '9876543210' },
    );
    expect(deps.verify).toHaveBeenCalledWith(
      'user-1',
      { razorpay_order_id: 'order_ABC', razorpay_payment_id: 'pay_XYZ', razorpay_signature: 'sig_123' },
      'order_ABC',
      [],
    );
    expect(deps.subscribe).toHaveBeenCalledTimes(1);
    expect(deps.subscribe).toHaveBeenCalledWith(
      'byok_500',
      expect.objectContaining({ orderId: 'order_ABC', paymentId: 'pay_XYZ' }),
    );
    expect(deps.recordSubscriptionInDb).toHaveBeenCalledWith(SUB);
  });

  it('does not grant when the user cancels checkout', async () => {
    const deps = makeDeps({
      openCheckout: jest.fn().mockResolvedValue({ success: false, cancelled: true, error: 'Payment cancelled' }),
    });
    const result = await purchasePlus(INPUT, deps);

    expect(result).toEqual({ status: 'cancelled', message: 'Payment cancelled. You have not been charged.' });
    expect(deps.verify).not.toHaveBeenCalled();
    expect(deps.subscribe).not.toHaveBeenCalled();
  });

  it('does not grant when Razorpay reports an error', async () => {
    const deps = makeDeps({
      openCheckout: jest.fn().mockResolvedValue({ success: false, cancelled: false, error: 'Payment could not be processed.' }),
    });
    const result = await purchasePlus(INPUT, deps);

    expect(result).toEqual({
      status: 'error',
      message: 'Payment could not be processed. You have not been charged.',
    });
    expect(deps.verify).not.toHaveBeenCalled();
    expect(deps.subscribe).not.toHaveBeenCalled();
  });

  it('does not open checkout or grant when the order request fails', async () => {
    const deps = makeDeps({
      createOrder: jest.fn().mockResolvedValue({ error: 'User not authenticated. Please login again.' }),
    });
    const result = await purchasePlus(INPUT, deps);

    expect(result).toEqual({ status: 'error', message: 'We could not start the payment. Please try again in a minute.' });
    expect(warnSpy).toHaveBeenCalledWith('[AITeacherPlus] order failed:', 'User not authenticated. Please login again.');
    expect(deps.openCheckout).not.toHaveBeenCalled();
    expect(deps.subscribe).not.toHaveBeenCalled();
  });

  it('does not open checkout or grant when the order has no Razorpay order id', async () => {
    const deps = makeDeps({
      createOrder: jest.fn().mockResolvedValue({ ...GOOD_ORDER, razorpayOrderId: '' }),
    });
    const result = await purchasePlus(INPUT, deps);

    expect(result).toEqual({ status: 'error', message: 'We could not start the payment. Please try again in a minute.' });
    expect(deps.openCheckout).not.toHaveBeenCalled();
    expect(deps.subscribe).not.toHaveBeenCalled();
  });

  it('gives up after the order timeout without opening checkout', async () => {
    jest.useFakeTimers();
    const deps = makeDeps({
      createOrder: jest.fn().mockReturnValue(new Promise(() => {})),
    });
    const pending = purchasePlus(INPUT, deps);
    await jest.advanceTimersByTimeAsync(15000);
    const result = await pending;

    expect(result).toEqual({
      status: 'error',
      message: 'The payment server is taking too long. Please check your internet and try again.',
    });
    expect(deps.openCheckout).not.toHaveBeenCalled();
    expect(deps.subscribe).not.toHaveBeenCalled();
  });

  it('does not grant when the server says the payment is not verified', async () => {
    const deps = makeDeps({
      verify: jest.fn().mockResolvedValue({ verified: false, error: 'Signature mismatch' }),
    });
    const result = await purchasePlus(INPUT, deps);

    expect(result).toEqual({
      status: 'error',
      message: 'We could not confirm your payment. If money was deducted, contact support with payment ID pay_XYZ.',
    });
    expect(deps.verify).toHaveBeenCalledTimes(1);
    expect(deps.subscribe).not.toHaveBeenCalled();
  });

  it('retries verification after a network failure and grants on success', async () => {
    const deps = makeDeps({
      verify: jest
        .fn()
        .mockResolvedValueOnce({ verified: false, error: 'Payment verification failed', networkError: true })
        .mockResolvedValueOnce({ verified: true }),
    });
    const result = await purchasePlus(INPUT, deps);

    expect(result).toEqual({ status: 'success' });
    expect(deps.verify).toHaveBeenCalledTimes(2);
    expect(deps.subscribe).toHaveBeenCalledTimes(1);
  });

  it('retries when verify throws, and grants the plan if it still cannot be reached', async () => {
    const deps = makeDeps({
      verify: jest.fn().mockRejectedValue(new Error('Network request failed')),
    });
    const result = await purchasePlus(INPUT, deps);

    expect(result).toEqual({ status: 'success' });
    expect(deps.verify).toHaveBeenCalledTimes(2);
    expect(deps.subscribe).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing name or a bad phone number before any network call', async () => {
    const deps = makeDeps();

    expect(await purchasePlus({ ...INPUT, name: '  ' }, deps)).toEqual({ status: 'error', message: 'Please enter your name.' });
    expect(await purchasePlus({ ...INPUT, phone: '12345' }, deps)).toEqual({
      status: 'error',
      message: 'Please enter your 10-digit mobile number.',
    });
    expect(await purchasePlus({ ...INPUT, userId: '' }, deps)).toEqual({
      status: 'error',
      message: 'Please log in to buy AI Teacher Plus.',
    });
    expect(deps.createOrder).not.toHaveBeenCalled();
    expect(deps.subscribe).not.toHaveBeenCalled();
  });
});

describe('withTimeout', () => {
  it('rejects with the given message when the promise is too slow', async () => {
    jest.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 1000, 'too slow');
    const assertion = expect(pending).rejects.toThrow('too slow');
    await jest.advanceTimersByTimeAsync(1000);
    await assertion;
    jest.useRealTimers();
  });

  it('resolves with the value when the promise is fast enough', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'too slow')).resolves.toBe(42);
  });
});
