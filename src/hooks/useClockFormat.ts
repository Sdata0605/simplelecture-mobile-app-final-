// Reads whether the phone shows 12-hour or 24-hour times. Uses Intl only (no native module).
// Falls back to 12h, which is the default for the app's Indian students. expo-localization is not used yet (plan J.3).
import { useMemo } from 'react';
import type { Clock } from '../utils/timeOfDay';

export function detectClock(): Clock {
  try {
    const opts = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions() as {
      hourCycle?: string;
      hour12?: boolean;
    };
    if (opts.hour12 === false) return '24h';
    if (opts.hourCycle === 'h23' || opts.hourCycle === 'h24') return '24h';
    return '12h';
  } catch {
    return '12h';
  }
}

export function useClockFormat(): Clock {
  return useMemo(detectClock, []);
}
