import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REVIEW_LAST_SHOWN_KEY = '@review_last_shown';
const REVIEW_MIN_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export async function maybeRequestReview(reason: 'badge' | 'course_complete' | 'session'): Promise<void> {
  try {
    const canReview = await StoreReview.isAvailableAsync();
    if (!canReview) return;

    const lastShownRaw = await AsyncStorage.getItem(REVIEW_LAST_SHOWN_KEY);
    if (lastShownRaw) {
      const lastShown = parseInt(lastShownRaw, 10);
      if (Date.now() - lastShown < REVIEW_MIN_INTERVAL_MS) {
        return;
      }
    }

    await StoreReview.requestReview();
    await AsyncStorage.setItem(REVIEW_LAST_SHOWN_KEY, Date.now().toString());

    console.log(`[InAppReview] Review dialog triggered — reason: ${reason}`);
  } catch (err) {
    console.warn('[InAppReview] Failed to request review:', err);
  }
}
