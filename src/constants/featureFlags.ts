import { Platform } from 'react-native';

/**
 * Compile-time feature flags. Keep every flag `false` in any build that is
 * shipped before the feature is released.
 */
export const FEATURES = {
  callReminders: false,
  // Reminders v2. Only the development and preview EAS profiles set
  // EXPO_PUBLIC_REMINDERS_V2=1 (eas.json), so production stays off.
  reminders: process.env.EXPO_PUBLIC_REMINDERS_V2 === '1',
  // Study-timetable reminder channels. Needs the reminders flag AND EXPO_PUBLIC_TT_REMINDERS=1.
  // Never set in production.
  timetableReminders: process.env.EXPO_PUBLIC_REMINDERS_V2 === '1' && process.env.EXPO_PUBLIC_TT_REMINDERS === '1',
} as const;

/**
 * True only when the "Call reminders" feature is switched on and the platform
 * can schedule local notifications (web cannot).
 */
export function isCallRemindersEnabled(): boolean {
  return FEATURES.callReminders && Platform.OS !== 'web';
}
