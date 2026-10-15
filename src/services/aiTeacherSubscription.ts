import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { useAuth } from '../context/AuthContext';

export type AITeacherPlanId = 'byok_500' | 'admin_1000';

export interface AITeacherPlanInfo {
  id: AITeacherPlanId;
  name: string;
  price: number;
  currency: string;
  tagline: string;
  badge?: string;
  isPopular?: boolean;
  keyModel: 'own' | 'admin';
  keyTitle: string;
  keyDescription: string;
  features: string[];
}

export interface AITeacherSubscription {
  planId: AITeacherPlanId;
  planName: string;
  price: number;
  purchasedAt: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  orderId?: string;
  paymentId?: string;
}

export const STORAGE_KEY = '@aiteacher_subscription_v1';
export const PRICING_STORAGE_KEY = '@aiteacher_pricing_v1';

export const AI_TEACHER_PLANS: Record<AITeacherPlanId, AITeacherPlanInfo> = {
  byok_500: {
    id: 'byok_500',
    name: 'Plus Plan',
    price: 500,
    currency: '₹',
    tagline: 'Affordable plan using your own Google Gemini API key',
    badge: 'Budget Friendly',
    isPopular: false,
    keyModel: 'own',
    keyTitle: 'Your Own API Key',
    keyDescription: 'Works with your personal Google Gemini API key (Free key from Google AI Studio).',
    features: [
      '1-to-1 Interactive AI Voice Teacher',
      'Interactive 24/7 AI Chat with notes & visual slides',
      'Unlimited practice questions & doubt clearing',
      'All subjects (SSLC, PUC, Maths, Science & more)',
      'Requires your personal Gemini API key (Free to obtain)',
      'Student full control over API usage',
    ],
  },
  admin_1000: {
    id: 'admin_1000',
    name: 'Pro Plan',
    price: 1000,
    currency: '₹',
    tagline: 'All-inclusive AI Teacher with built-in voice & chat, powered by SimpleLecture',
    badge: 'Most Popular · Zero Setup',
    isPopular: true,
    keyModel: 'admin',
    keyTitle: 'Admin Managed AI Key',
    keyDescription: "Pre-configured on SimpleLecture's high-speed servers and Admin API key. No key needed from you!",
    features: [
      '1-to-1 Interactive AI Voice Teacher with low latency',
      'Interactive 24/7 AI Chat with notes & visual slides',
      'Unlimited practice questions & doubt clearing',
      'All subjects (SSLC, PUC, Maths, Science & more)',
      'Works on SimpleLecture Admin Managed Gemini API Key',
      'Zero setup required — start learning in 1 click!',
      'Priority server speed and support',
    ],
  },
};

// In-memory cache for synchronous reads after initial load
let cachedSubscription: AITeacherSubscription | null = null;
let subscriptionLoaded = false;
let cachedPricing: { byok_price: number; admin_price: number } = { byok_price: 500, admin_price: 1000 };

// Listeners for cross-component subscription sync
const listeners = new Set<() => void>();
const notifyListeners = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore
    }
  });
};

export async function loadSavedPricing(): Promise<{ byok_price: number; admin_price: number }> {
  try {
    const raw = await AsyncStorage.getItem(PRICING_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p.byok_price === 'number' && typeof p.admin_price === 'number') {
        cachedPricing = p;
        AI_TEACHER_PLANS.byok_500.price = p.byok_price;
        AI_TEACHER_PLANS.admin_1000.price = p.admin_price;
        return p;
      }
    }
  } catch {
    // fallback
  }
  return cachedPricing;
}

export async function savePlanPricing(p: { byok_price: number; admin_price: number }): Promise<void> {
  try {
    cachedPricing = p;
    AI_TEACHER_PLANS.byok_500.price = p.byok_price;
    AI_TEACHER_PLANS.admin_1000.price = p.admin_price;
    await AsyncStorage.setItem(PRICING_STORAGE_KEY, JSON.stringify(p));
    notifyListeners();
  } catch (err) {
    console.error('Failed to save AI Teacher pricing:', err);
  }
}

export async function loadSubscription(): Promise<AITeacherSubscription | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedSubscription = null;
      subscriptionLoaded = true;
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.planId === 'byok_500' || parsed.planId === 'admin_1000')) {
      cachedSubscription = parsed as AITeacherSubscription;
      subscriptionLoaded = true;
      return cachedSubscription;
    }
    cachedSubscription = null;
    subscriptionLoaded = true;
    return null;
  } catch {
    cachedSubscription = null;
    subscriptionLoaded = true;
    return null;
  }
}

export function getCachedSubscription(): AITeacherSubscription | null {
  return cachedSubscription;
}

export async function saveSubscription(sub: AITeacherSubscription): Promise<void> {
  try {
    cachedSubscription = sub;
    subscriptionLoaded = true;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sub));
    notifyListeners();
  } catch (err) {
    console.error('Failed to save AI Teacher subscription:', err);
  }
}

export async function clearSubscription(): Promise<void> {
  try {
    cachedSubscription = null;
    subscriptionLoaded = true;
    await AsyncStorage.removeItem(STORAGE_KEY);
    notifyListeners();
  } catch (err) {
    console.error('Failed to clear AI Teacher subscription:', err);
  }
}

export function isPermanentTestingAccount(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === 'pramod0605@gmail.com';
}

/**
 * Saves a subscription record into the database (sales_leads table).
 */
export async function recordSubscriptionInDb(sub: AITeacherSubscription): Promise<boolean> {
  try {
    const email = sub.customerEmail;
    if (!email) return true;
    const name = sub.customerName || 'AI Teacher Student';
    const phone = sub.customerPhone || '';
    const leadStatus = sub.planId === 'admin_1000' ? 'converted_plan_1000' : 'converted_plan_500';

    const response = await fetch(`${SUPABASE_URL}/rest/v1/sales_leads`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify([
        {
          name: `${name} (${sub.planName})`,
          email,
          mobile: phone,
          lead_status: leadStatus,
          conversation_history: [
            {
              type: 'ai_teacher_subscription',
              plan_id: sub.planId,
              plan_name: sub.planName,
              price: sub.price,
              order_id: sub.orderId,
              payment_id: sub.paymentId || null,
              activated_at: sub.purchasedAt,
            },
          ],
        },
      ]),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('[AITeacherSubscription] DB record notice:', errText);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[AITeacherSubscription] Could not write to DB:', err);
    return false;
  }
}

export function useAITeacherSubscription() {
  const { user, isAuthenticated } = useAuth();
  const [subscription, setSubscription] = useState<AITeacherSubscription | null>(cachedSubscription);
  const [isVerifying, setIsVerifying] = useState(false);
  const [plans, setPlans] = useState<Record<AITeacherPlanId, AITeacherPlanInfo>>({ ...AI_TEACHER_PLANS });

  const checkUserSubscription = useCallback(async (targetEmail?: string | null) => {
    const email = targetEmail?.toLowerCase().trim();
    if (!email) {
      return;
    }

    setIsVerifying(true);
    try {
      // 1. Silent pre-authorized account check (pramod0605@gmail.com)
      if (isPermanentTestingAccount(email)) {
        const current = cachedSubscription || (await loadSubscription());
        if (!current || current.planId !== 'admin_1000' || current.customerEmail?.toLowerCase() !== email) {
          const autoSub: AITeacherSubscription = {
            planId: 'admin_1000',
            planName: AI_TEACHER_PLANS.admin_1000.name,
            price: AI_TEACHER_PLANS.admin_1000.price,
            purchasedAt: new Date().toISOString(),
            customerEmail: email,
            customerName: user?.full_name || undefined,
            orderId: `SL-AIT-PRO-${Date.now().toString(36).toUpperCase()}`,
          };
          await saveSubscription(autoSub);
          setSubscription(autoSub);
        } else {
          setSubscription(current);
        }
        return;
      }

      // 2. Check if this account already purchased and is recorded in DB
      let current = cachedSubscription;
      if (!subscriptionLoaded) {
        current = await loadSubscription();
      }

      // If cached subscription does not belong to this email, clear it
      if (current && current.customerEmail && current.customerEmail.toLowerCase() !== email) {
        await clearSubscription();
        current = null;
      }

      if (!current || (current.customerEmail && current.customerEmail.toLowerCase() !== email)) {
        const queryUrl = `${SUPABASE_URL}/rest/v1/sales_leads?select=lead_status,conversation_history,created_at&email=eq.${encodeURIComponent(
          email
        )}&lead_status=in.(converted_plan_1000,converted_plan_500)&order=created_at.desc&limit=1`;

        const response = await fetch(queryUrl, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        });

        if (response.ok) {
          const leads = await response.json();
          if (Array.isArray(leads) && leads.length > 0) {
            const lead = leads[0];
            const planId: AITeacherPlanId =
              lead.lead_status === 'converted_plan_1000' ? 'admin_1000' : 'byok_500';
            const plan = AI_TEACHER_PLANS[planId];
            const dbSub: AITeacherSubscription = {
              planId,
              planName: plan.name,
              price: plan.price,
              purchasedAt: lead.created_at || new Date().toISOString(),
              customerEmail: email,
              customerName: user?.full_name || undefined,
              orderId: `SL-AIT-DB-${Date.now().toString(36).toUpperCase()}`,
            };
            await saveSubscription(dbSub);
            setSubscription(dbSub);
          } else {
            await clearSubscription();
            setSubscription(null);
          }
        }
      } else {
        setSubscription(current);
      }
    } catch (e) {
      console.warn('[AITeacherSubscription] Verification notice:', e);
    } finally {
      setIsVerifying(false);
    }
  }, [user]);

  // Sync pricing from ai_settings table
  useEffect(() => {
    loadSavedPricing().then((saved) => {
      setPlans({
        byok_500: { ...AI_TEACHER_PLANS.byok_500, price: saved.byok_price },
        admin_1000: { ...AI_TEACHER_PLANS.admin_1000, price: saved.admin_price },
      });
    });

    const fetchRemotePricing = async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/ai_settings?select=setting_value&setting_key=eq.ai_teacher_1to1_config&limit=1`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        );
        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows) && rows[0]?.setting_value) {
            const val = rows[0].setting_value;
            if (val.plan_pricing) {
              const byok = Number(val.plan_pricing.byok_price) || 500;
              const admin = Number(val.plan_pricing.admin_price) || 1000;
              await savePlanPricing({ byok_price: byok, admin_price: admin });
              setPlans({
                byok_500: { ...AI_TEACHER_PLANS.byok_500, price: byok },
                admin_1000: { ...AI_TEACHER_PLANS.admin_1000, price: admin },
              });
            }
          }
        }
      } catch (err) {
        console.warn('[AITeacherSubscription] Failed to load remote pricing:', err);
      }
    };
    fetchRemotePricing();
  }, []);

  // Listen for local changes and check user subscription on mount / user change
  useEffect(() => {
    const handleUpdate = () => {
      setSubscription(cachedSubscription);
      setPlans({
        byok_500: { ...AI_TEACHER_PLANS.byok_500, price: cachedPricing.byok_price },
        admin_1000: { ...AI_TEACHER_PLANS.admin_1000, price: cachedPricing.admin_price },
      });
    };

    listeners.add(handleUpdate);

    loadSubscription().then((sub) => {
      setSubscription(sub);
      if (user?.email) {
        checkUserSubscription(user.email);
      }
    });

    return () => {
      listeners.delete(handleUpdate);
    };
  }, [user?.email, checkUserSubscription]);

  const subscribe = useCallback(
    async (
      planId: AITeacherPlanId,
      details?: {
        name?: string;
        email?: string;
        phone?: string;
        orderId?: string;
        paymentId?: string;
      }
    ) => {
      const isPreAuth = isPermanentTestingAccount(details?.email);
      const activePlanId = isPreAuth ? 'admin_1000' : planId;
      const activePlan = plans[activePlanId];

      const newSub: AITeacherSubscription = {
        planId: activePlanId,
        planName: activePlan.name,
        price: activePlan.price,
        purchasedAt: new Date().toISOString(),
        customerName: details?.name,
        customerEmail: details?.email,
        customerPhone: details?.phone,
        orderId: details?.orderId || `SL-AIT-${Date.now().toString(36).toUpperCase()}`,
        paymentId: details?.paymentId,
      };

      await saveSubscription(newSub);
      setSubscription(newSub);
      recordSubscriptionInDb(newSub).catch(() => {});
      return newSub;
    },
    [plans]
  );

  const unsubscribe = useCallback(async () => {
    await clearSubscription();
    setSubscription(null);
  }, []);

  const currentPlan = subscription && isAuthenticated ? plans[subscription.planId] : null;

  return {
    subscription: isAuthenticated ? subscription : null,
    currentPlan,
    plans,
    hasActivePlan: !!subscription && isAuthenticated,
    isPlan500: isAuthenticated && subscription?.planId === 'byok_500',
    isPlan1000: isAuthenticated && subscription?.planId === 'admin_1000',
    isVerifying,
    refreshSubscription: () => checkUserSubscription(user?.email),
    subscribe,
    unsubscribe,
  };
}
