// React hook over the Reminders facade. Spec: _scratch/reminders-v2-plan.md F.4.
// Derived lists are computed from the snapshot; the screens never touch the store directly.

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Reminder, ReminderKind } from '../types/reminder';
import {
  commitDelete,
  getSnapshot,
  saveReminder,
  setReminderEnabled,
  softDeleteReminder,
  subscribe,
  syncReminders,
  undoDelete,
  type PlannedState,
  type RemindersSnapshot,
} from '../services/reminders';

function localDateKey(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${da}`;
}

/** Local day of the reminder's last ring, or of its creation when it has never rung. */
function eventDateKey(r: Reminder): string {
  return localDateKey(new Date(r.last_fired_at ?? r.updated_at));
}

export function useReminders(): {
  snapshot: RemindersSnapshot;
  reminders: Reminder[];
  daily: { upcoming: Reminder[]; paused: Reminder[]; earlierToday: Reminder[] };
  dotsForMonth(year: number, month: number): Record<string, ReminderKind[] | 'past'>;
  agendaFor(dateKey: string): { oneOffs: Reminder[]; daily: Reminder[] };
  stateOf(id: string): PlannedState;
  save: typeof saveReminder;
  remove: typeof softDeleteReminder;
  undo: typeof undoDelete;
  commit: typeof commitDelete;
  setEnabled: typeof setReminderEnabled;
  refresh(): Promise<void>;
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { reminders, plan } = snapshot;

  const daily = useMemo(() => {
    const today = localDateKey(new Date());
    const upcoming: Reminder[] = [];
    const paused: Reminder[] = [];
    const earlierToday: Reminder[] = [];
    for (const r of reminders) {
      if (r.repeat_rule === 'daily') {
        (r.enabled ? upcoming : paused).push(r);
      } else if (r.section === 'daily') {
        if (r.status === 'scheduled') upcoming.push(r);
        else if (eventDateKey(r) === today) earlierToday.push(r);
      }
    }
    const byTime = (a: Reminder, b: Reminder) =>
      (a.time_of_day ?? a.scheduled_at).localeCompare(b.time_of_day ?? b.scheduled_at);
    upcoming.sort(byTime);
    paused.sort(byTime);
    earlierToday.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    return { upcoming, paused, earlierToday };
  }, [reminders]);

  const dotsForMonth = useCallback(
    (year: number, month: number): Record<string, ReminderKind[] | 'past'> => {
      const todayKey = localDateKey(new Date());
      const out: Record<string, ReminderKind[] | 'past'> = {};
      for (const r of reminders) {
        if (r.section !== 'calendar' || r.repeat_rule !== 'none' || r.status !== 'scheduled') continue;
        const at = new Date(r.scheduled_at);
        if (at.getFullYear() !== year || at.getMonth() !== month) continue;
        const key = localDateKey(at);
        if (key < todayKey) {
          out[key] = 'past';
          continue;
        }
        const current = out[key];
        const kinds: ReminderKind[] = Array.isArray(current) ? current : [];
        if (!kinds.includes(r.kind)) kinds.push(r.kind);
        out[key] = kinds;
      }
      return out;
    },
    [reminders],
  );

  const agendaFor = useCallback(
    (dateKey: string) => {
      const oneOffs = reminders
        .filter(r => r.section === 'calendar' && r.repeat_rule === 'none' && localDateKey(new Date(r.scheduled_at)) === dateKey)
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
      const dailyList = reminders
        .filter(r => r.repeat_rule === 'daily')
        .sort((a, b) => (a.time_of_day ?? '').localeCompare(b.time_of_day ?? ''));
      return { oneOffs, daily: dailyList };
    },
    [reminders],
  );

  const stateOf = useCallback((id: string): PlannedState => plan[id]?.state ?? 'scheduled', [plan]);

  const refresh = useCallback(() => syncReminders('manual'), []);

  return {
    snapshot,
    reminders,
    daily,
    dotsForMonth,
    agendaFor,
    stateOf,
    save: saveReminder,
    remove: softDeleteReminder,
    undo: undoDelete,
    commit: commitDelete,
    setEnabled: setReminderEnabled,
    refresh,
  };
}
