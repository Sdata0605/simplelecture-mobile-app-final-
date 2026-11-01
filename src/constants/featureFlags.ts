import { Platform } from 'react-native';

/**
 * Compile-time feature flags. Keep every flag `false` in any build that is
 * shipped before the feature is released.
 */
export const FEATURES = {
  callReminders: false,
} as const;

/**
 * True only when the "Call reminders" feature is switched on and the platform
 * can schedule local notifications (web cannot).
 */
export function isCallRemindersEnabled(): boolean {
  return FEATURES.callReminders && Platform.OS !== 'web';
}
