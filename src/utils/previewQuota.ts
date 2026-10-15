import AsyncStorage from '@react-native-async-storage/async-storage';

export type PreviewQuotaTab = 'AI' | 'Doubts';

const QUOTA_KEY = (courseId: string, tab: PreviewQuotaTab) =>
  `preview:${courseId}:${tab}`;

export async function getQuotaCount(courseId: string, tab: PreviewQuotaTab): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(QUOTA_KEY(courseId, tab));
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

export async function incrementQuota(courseId: string, tab: PreviewQuotaTab): Promise<number> {
  try {
    const current = await getQuotaCount(courseId, tab);
    const next = current + 1;
    await AsyncStorage.setItem(QUOTA_KEY(courseId, tab), String(next));
    return next;
  } catch {
    return 0;
  }
}

export async function resetQuota(courseId: string, tab: PreviewQuotaTab): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUOTA_KEY(courseId, tab));
  } catch { /* ignore */ }
}

export async function isQuotaExceeded(
  courseId: string,
  tab: PreviewQuotaTab,
  limit: number | null
): Promise<boolean> {
  if (limit === null) return false;
  const count = await getQuotaCount(courseId, tab);
  return count >= limit;
}
