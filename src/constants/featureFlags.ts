import { Platform } from 'react-native';

/**
 * Compile-time feature flags. Keep every flag `false` in any build that is
 * shipped before the feature is released.
 */
// Trim so a value such as "1 " (Windows `set VAR=1 && ...`) still counts as on.
const flagOn = (value: string | undefined): boolean => (value ?? '').trim() === '1';

export const FEATURES = {
  callReminders: false,
  // Reminders v2. Only the development and preview EAS profiles set
  // EXPO_PUBLIC_REMINDERS_V2=1 (eas.json), so production stays off.
  reminders: flagOn(process.env.EXPO_PUBLIC_REMINDERS_V2),
  // Study-timetable CALL channel only. Needs the reminders flag AND EXPO_PUBLIC_TT_REMINDERS=1.
  // Message, Email and Notification do not use this flag: their availability is checked at runtime
  // (useTimetableReminderSupport). Never set in production until the call backend is live.
  timetableReminders: flagOn(process.env.EXPO_PUBLIC_REMINDERS_V2) && flagOn(process.env.EXPO_PUBLIC_TT_REMINDERS),
} as const;

/**
 * True only when the "Call reminders" feature is switched on and the platform
 * can schedule local notifications (web cannot).
 */
export function isCallRemindersEnabled(): boolean {
  return FEATURES.callReminders && Platform.OS !== 'web';
}
