// Device-side reminder state (plan F.1). Two jobs:
// 1. Cache the runtime answer to "does this server have the reminder_channel column?" for 12 hours.
// 2. Remember "No reminders" for a course on this phone when the server cannot store it (basic mode).
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CachedSupportStatus = 'full' | 'basic';

export const SUPPORT_CACHE_KEY = 'tt_reminder_support_v1';
export const SUPPORT_TTL_MS = 12 * 60 * 60 * 1000;
const OFF_PREFIX = 'tt_reminders_off:';

export async function readSupportCache(): Promise<{ status: CachedSupportStatus; at: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(SUPPORT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if ((parsed?.status === 'full' || parsed?.status === 'basic') && typeof parsed?.at === 'number') {
      return { status: parsed.status, at: parsed.at };
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeSupportCache(status: CachedSupportStatus): Promise<void> {
  try {
    await AsyncStorage.setItem(SUPPORT_CACHE_KEY, JSON.stringify({ status, at: Date.now() }));
  } catch {
    // Storage full or unavailable: the next launch simply probes again.
  }
}

/** True when the student chose "No reminders" for this course on this phone (basic mode). */
export async function isCourseRemindersOff(courseId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(OFF_PREFIX + courseId)) === '1';
  } catch {
    return false;
  }
}

export async function setCourseRemindersOff(courseId: string, off: boolean): Promise<void> {
  if (off) await AsyncStorage.setItem(OFF_PREFIX + courseId, '1');
  else await AsyncStorage.removeItem(OFF_PREFIX + courseId);
}

/** Course ids that are switched off on this phone. */
export async function getOffCourseIds(): Promise<string[]> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter(k => k.startsWith(OFF_PREFIX)).map(k => k.slice(OFF_PREFIX.length));
  } catch {
    return [];
  }
}
