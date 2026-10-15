import {
  AI_TEACHER_PLANS,
  STORAGE_KEY,
  PRICING_STORAGE_KEY,
  isPermanentTestingAccount,
  loadSavedPricing,
  savePlanPricing,
  loadSubscription,
  saveSubscription,
  clearSubscription,
  getCachedSubscription,
  recordSubscriptionInDb,
  AITeacherSubscription,
} from '../aiTeacherSubscription';
import {
  __reset,
  __setStore,
  __getStore,
} from './asyncStorageMock';

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  })),
}));

describe('aiTeacherSubscription Service', () => {
  beforeEach(() => {
    __reset();
    // Reset global fetch mock
    (global as any).__fetchImpl = async () => {
      throw new Error('fetch not programmed for this test');
    };
  });

  describe('AI_TEACHER_PLANS defaults and structure', () => {
    it('defines the correct plans with required properties', () => {
      expect(AI_TEACHER_PLANS).toBeDefined();
      expect(AI_TEACHER_PLANS.byok_500).toBeDefined();
      expect(AI_TEACHER_PLANS.admin_1000).toBeDefined();
    });

    it('has valid structure for byok_500 plan', () => {
      const plan = AI_TEACHER_PLANS.byok_500;
      expect(plan.id).toBe('byok_500');
      expect(plan.name).toBe('Plus Plan');
      expect(typeof plan.price).toBe('number');
      expect(plan.currency).toBe('₹');
      expect(plan.keyModel).toBe('own');
      expect(plan.isPopular).toBe(false);
      expect(Array.isArray(plan.features)).toBe(true);
      expect(plan.features.length).toBeGreaterThan(0);
      expect(plan.tagline).toBeDefined();
      expect(plan.keyTitle).toBeDefined();
      expect(plan.keyDescription).toBeDefined();
    });

    it('has valid structure for admin_1000 plan', () => {
      const plan = AI_TEACHER_PLANS.admin_1000;
      expect(plan.id).toBe('admin_1000');
      expect(plan.name).toBe('Pro Plan');
      expect(typeof plan.price).toBe('number');
      expect(plan.currency).toBe('₹');
      expect(plan.keyModel).toBe('admin');
      expect(plan.isPopular).toBe(true);
      expect(Array.isArray(plan.features)).toBe(true);
      expect(plan.features.length).toBeGreaterThan(0);
      expect(plan.tagline).toBeDefined();
      expect(plan.keyTitle).toBeDefined();
      expect(plan.keyDescription).toBeDefined();
    });
  });

  describe('isPermanentTestingAccount', () => {
    it('returns true for pramod0605@gmail.com regardless of case or whitespace', () => {
      expect(isPermanentTestingAccount('pramod0605@gmail.com')).toBe(true);
      expect(isPermanentTestingAccount('PRAMOD0605@GMAIL.COM')).toBe(true);
      expect(isPermanentTestingAccount(' Pramod0605@gmail.com ')).toBe(true);
      expect(isPermanentTestingAccount('pramod0605@GMAIL.com')).toBe(true);
    });

    it('returns false for non-testing accounts or empty/null values', () => {
      expect(isPermanentTestingAccount('other@example.com')).toBe(false);
      expect(isPermanentTestingAccount('test@simplelecture.com')).toBe(false);
      expect(isPermanentTestingAccount('pramod0605@yahoo.com')).toBe(false);
      expect(isPermanentTestingAccount('')).toBe(false);
      expect(isPermanentTestingAccount('   ')).toBe(false);
      expect(isPermanentTestingAccount(null)).toBe(false);
      expect(isPermanentTestingAccount(undefined)).toBe(false);
    });
  });

  describe('loadSavedPricing and savePlanPricing', () => {
    it('returns default pricing when storage is empty', async () => {
      const pricing = await loadSavedPricing();
      expect(pricing).toBeDefined();
      expect(typeof pricing.byok_price).toBe('number');
      expect(typeof pricing.admin_price).toBe('number');
    });

    it('persists updated pricing to AsyncStorage and updates AI_TEACHER_PLANS', async () => {
      await savePlanPricing({ byok_price: 499, admin_price: 999 });

      const store = __getStore();
      expect(store[PRICING_STORAGE_KEY]).toBeDefined();
      const parsed = JSON.parse(store[PRICING_STORAGE_KEY]);
      expect(parsed.byok_price).toBe(499);
      expect(parsed.admin_price).toBe(999);

      expect(AI_TEACHER_PLANS.byok_500.price).toBe(499);
      expect(AI_TEACHER_PLANS.admin_1000.price).toBe(999);

      const loaded = await loadSavedPricing();
      expect(loaded.byok_price).toBe(499);
      expect(loaded.admin_price).toBe(999);
    });

    it('handles malformed pricing JSON gracefully', async () => {
      __setStore({ [PRICING_STORAGE_KEY]: 'invalid json{' });
      const pricing = await loadSavedPricing();
      expect(pricing).toBeDefined();
      expect(typeof pricing.byok_price).toBe('number');
    });
  });

  describe('loadSubscription, saveSubscription, clearSubscription', () => {
    const mockSubscription: AITeacherSubscription = {
      planId: 'admin_1000',
      planName: 'Pro Managed Plan',
      price: 1000,
      purchasedAt: '2026-10-12T10:00:00.000Z',
      customerName: 'Test Student',
      customerEmail: 'student@example.com',
      customerPhone: '9876543210',
      orderId: 'ORDER_12345',
      paymentId: 'PAY_67890',
    };

    it('returns null when no subscription exists in storage', async () => {
      await clearSubscription();
      const sub = await loadSubscription();
      expect(sub).toBeNull();
      expect(getCachedSubscription()).toBeNull();
    });

    it('saves subscription to AsyncStorage and updates in-memory cache', async () => {
      await saveSubscription(mockSubscription);

      const store = __getStore();
      expect(store[STORAGE_KEY]).toBeDefined();
      const parsed = JSON.parse(store[STORAGE_KEY]);
      expect(parsed.planId).toBe('admin_1000');
      expect(parsed.customerEmail).toBe('student@example.com');
      expect(parsed.orderId).toBe('ORDER_12345');

      expect(getCachedSubscription()).toEqual(mockSubscription);

      const loaded = await loadSubscription();
      expect(loaded).toEqual(mockSubscription);
    });

    it('clears subscription from AsyncStorage and resets cache', async () => {
      await saveSubscription(mockSubscription);
      expect(getCachedSubscription()).not.toBeNull();

      await clearSubscription();

      const store = __getStore();
      expect(store[STORAGE_KEY]).toBeUndefined();
      expect(getCachedSubscription()).toBeNull();

      const loaded = await loadSubscription();
      expect(loaded).toBeNull();
    });

    it('ignores invalid or corrupted subscription data in storage', async () => {
      __setStore({ [STORAGE_KEY]: JSON.stringify({ planId: 'invalid_plan_id' }) });
      const sub = await loadSubscription();
      expect(sub).toBeNull();

      __setStore({ [STORAGE_KEY]: 'corrupted-json}{' });
      const sub2 = await loadSubscription();
      expect(sub2).toBeNull();
    });
  });

  describe('recordSubscriptionInDb', () => {
    it('returns true immediately without fetch if customer email is missing', async () => {
      const subWithoutEmail: AITeacherSubscription = {
        planId: 'byok_500',
        planName: 'Student Key Plan',
        price: 500,
        purchasedAt: new Date().toISOString(),
      };
      const result = await recordSubscriptionInDb(subWithoutEmail);
      expect(result).toBe(true);
    });

    it('sends POST request to sales_leads table and returns true on success', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      (global as any).__fetchImpl = async (url: string, init: any) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({}),
          text: async () => '',
        };
      };

      const testSub: AITeacherSubscription = {
        planId: 'admin_1000',
        planName: 'Pro Managed Plan',
        price: 1000,
        purchasedAt: '2026-10-12T10:00:00.000Z',
        customerName: 'Praveen',
        customerEmail: 'praveen@test.com',
        customerPhone: '9999999999',
        orderId: 'ORDER_999',
      };

      const result = await recordSubscriptionInDb(testSub);
      expect(result).toBe(true);
      expect(capturedUrl).toContain('/rest/v1/sales_leads');
      expect(capturedBody).toBeDefined();
      expect(capturedBody[0].email).toBe('praveen@test.com');
      expect(capturedBody[0].lead_status).toBe('converted_plan_1000');
    });

    it('returns false gracefully when DB write fails or throws', async () => {
      (global as any).__fetchImpl = async () => {
        return {
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        };
      };

      const testSub: AITeacherSubscription = {
        planId: 'byok_500',
        planName: 'Student Key Plan',
        price: 500,
        purchasedAt: '2026-10-12T10:00:00.000Z',
        customerEmail: 'fail@test.com',
      };

      const result = await recordSubscriptionInDb(testSub);
      expect(result).toBe(false);

      // And when fetch throws network error
      (global as any).__fetchImpl = async () => {
        throw new Error('Network error');
      };
      const result2 = await recordSubscriptionInDb(testSub);
      expect(result2).toBe(false);
    });
  });
});
