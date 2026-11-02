// Runtime check for timetable reminder channels (plan F.1, level 2).
// 'full' = the server has study_timetable_sessions.reminder_channel, so Message and Email can be offered.
// 'basic' = it does not (or we cannot tell): only Notification and Off, stored on this phone.
// The Call channel is only offered in 'full' mode and only when FEATURES.timetableReminders is on.
import { useCallback, useEffect, useRef, useState } from 'react';
import { SUPABASE_URL } from '../services/supabase';
import { authHeaders } from './useStudyTimetable';
import { FEATURES } from '../constants/featureFlags';
import { readSupportCache, writeSupportCache, SUPPORT_TTL_MS } from '../services/localReminderPrefs';
import type { ReminderChoice } from '../types/reminder';

export type ReminderSupportStatus = 'full' | 'basic';

export interface ReminderSupport {
  status: ReminderSupportStatus;
  /** Channels the student may pick. Always includes 'none' (Off). */
  channels: ReminderChoice[];
  /** True only in full mode with the Call flag on. */
  call: boolean;
}

export interface ReminderSupportState {
  status: ReminderSupportStatus | 'loading';
  channels: ReminderChoice[];
  call: boolean;
  refresh(): Promise<void>;
}

/** Channels for a given mode. Basic mode never offers Message, Email or Call. */
export function channelsFor(status: ReminderSupportStatus, call: boolean): ReminderChoice[] {
  if (status === 'basic') return ['notification', 'none'];
  const list: ReminderChoice[] = ['notification', 'message', 'email', 'none'];
  return call ? ['call', ...list] : list;
}

/** Reads a probe response. 2xx = column exists; 400 naming the column = missing; anything else = unknown. */
export function classifyProbe(status: number, bodyText: string): ReminderSupportStatus | 'unknown' {
  if (status >= 200 && status < 300) return 'full';
  if (status === 400 && /reminder_channel|42703|does not exist/i.test(bodyText)) return 'basic';
  return 'unknown';
}

function build(status: ReminderSupportStatus): ReminderSupport {
  const call = status === 'full' && FEATURES.timetableReminders;
  return { status, channels: channelsFor(status, call), call };
}

/**
 * Asks the server whether the reminder_channel column exists. Uses the cached answer for 12 hours
 * unless force is set. On a network error or an unknown answer it falls back to the cached value,
 * and to 'basic' when nothing is cached. Only a clear answer is cached.
 */
export async function probeReminderSupport(opts?: { force?: boolean }): Promise<ReminderSupport> {
  const cached = await readSupportCache();
  if (!opts?.force && cached && Date.now() - cached.at < SUPPORT_TTL_MS) return build(cached.status);
  try {
    const headers = await authHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/study_timetable_sessions?select=reminder_channel&limit=1`,
      { method: 'GET', headers },
    );
    const text = await res.text();
    const verdict = classifyProbe(res.status, text);
    if (verdict !== 'unknown') {
      await writeSupportCache(verdict);
      return build(verdict);
    }
  } catch {
    // Offline or server unreachable: use the last known answer below.
  }
  return build(cached?.status ?? 'basic');
}

export function useTimetableReminderSupport(): ReminderSupportState {
  const [state, setState] = useState<{ status: ReminderSupportStatus | 'loading'; channels: ReminderChoice[]; call: boolean }>({
    status: 'loading',
    channels: channelsFor('basic', false),
    call: false,
  });
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const next = await probeReminderSupport({ force: true });
    if (mounted.current) setState({ status: next.status, channels: next.channels, call: next.call });
  }, []);

  useEffect(() => {
    mounted.current = true;
    probeReminderSupport().then(next => {
      if (mounted.current) setState({ status: next.status, channels: next.channels, call: next.call });
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  return { ...state, refresh };
}
