import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAiTeacherSettings, AiTeacherSettings } from './aiTeacherKeys';
import { supabase } from './supabase';

/**
 * Whether the student has the Plus plan (Rs 500), as the server says it.
 * - 'loading': no answer yet, show a spinner. Never a purchase card.
 * - 'active': the server said yes.
 * - 'inactive': the server said no. Only this state may send the student to the purchase page.
 * - 'unknown': the check failed or the response had no plan field. Never a purchase card.
 */
export type PlanState = 'loading' | 'active' | 'inactive' | 'unknown';

export interface PlanCacheEntry {
  active: boolean;
  checkedAt: string;
}

const PLAN_CACHE_PREFIX = '@aiteacher_plan_v1:';

export function resolvePlanState({
  serverActive,
  error,
  cached,
}: {
  serverActive?: boolean | null;
  error?: unknown;
  cached?: { active: boolean } | null;
}): PlanState {
  if (serverActive === true) return 'active';
  if (serverActive === false) return 'inactive';
  // The check failed, or the response had no plan field: fall back to the last answer for this user, if any.
  if (error || serverActive === undefined || serverActive === null) {
    if (cached) return cached.active ? 'active' : 'inactive';
    return 'unknown';
  }
  return 'unknown';
}

export async function readPlanCache(userId: string): Promise<PlanCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(PLAN_CACHE_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.active === 'boolean') {
      return { active: parsed.active, checkedAt: String(parsed.checkedAt ?? '') };
    }
    return null;
  } catch {
    return null;
  }
}

export async function writePlanCache(userId: string, active: boolean): Promise<void> {
  try {
    const entry: PlanCacheEntry = { active, checkedAt: new Date().toISOString() };
    await AsyncStorage.setItem(PLAN_CACHE_PREFIX + userId, JSON.stringify(entry));
  } catch {
    // The cache is only a fallback for when the server cannot be reached; losing a write is harmless.
  }
}

/**
 * Asks the server for the plan state. Runs once on mount (when `enabled`) and again whenever `refresh` is called.
 * Logged out (`enabled` false) counts as 'inactive', as before. Stale answers from an older request are ignored.
 */
export function useAiTeacherPlan(enabled: boolean): {
  state: PlanState;
  settings: AiTeacherSettings | null;
  refresh: () => void;
} {
  const [state, setState] = useState<PlanState>(enabled ? 'loading' : 'inactive');
  const [settings, setSettings] = useState<AiTeacherSettings | null>(null);
  const requestRef = useRef(0);

  const refresh = useCallback(() => {
    if (!enabled) {
      requestRef.current += 1;
      setSettings(null);
      setState('inactive');
      return;
    }
    const id = ++requestRef.current;
    void (async () => {
      let answer: AiTeacherSettings | null = null;
      let error: unknown = null;
      try {
        answer = await getAiTeacherSettings();
      } catch (err) {
        error = err;
      }
      const serverActive =
        answer?.plan && typeof answer.plan.active === 'boolean' ? answer.plan.active : undefined;

      let cached: PlanCacheEntry | null = null;
      if (serverActive === undefined) {
        const user = await supabase.getStoredUser().catch(() => null);
        if (user?.id) cached = await readPlanCache(user.id);
      }

      if (id !== requestRef.current) return;
      setSettings(answer);
      setState(resolvePlanState({ serverActive, error, cached }));
    })();
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { state, settings, refresh };
}
