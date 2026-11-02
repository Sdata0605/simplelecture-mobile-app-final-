// JS bridge for the local ExactAlarm Expo module (Android only).
// Safe when the native module is missing (Expo Go, iOS, web, or a build without autolinking):
// canScheduleExactAlarms() then resolves true, so no false "may ring late" banner is shown.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

interface ExactAlarmNativeModule {
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): void;
}

const native = requireOptionalNativeModule<ExactAlarmNativeModule>('ExactAlarm');

export async function canScheduleExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android' || !native) return true;
  try {
    return native.canScheduleExactAlarms() !== false;
  } catch {
    return true;
  }
}

export function openExactAlarmSettings(): void {
  if (Platform.OS !== 'android' || !native) return;
  try {
    native.openExactAlarmSettings();
  } catch {
    // Settings screen could not be opened; the banner stays visible.
  }
}
