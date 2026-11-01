import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CallReminder, CallReminderInput } from '../types/callReminder';
import * as service from '../services/callReminders';

export const CALL_REMINDERS_QUERY_KEY = ['call-reminders'] as const;

export interface UseCallRemindersResult {
  reminders: CallReminder[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<unknown>;
  save: (
    input: CallReminderInput,
    existing?: CallReminder,
  ) => Promise<{ reminder: CallReminder; audioWarning: boolean }>;
  remove: (id: string) => Promise<void>;
}

/** React Query wrapper around the call reminder service. */
export function useCallReminders(): UseCallRemindersResult {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: CALL_REMINDERS_QUERY_KEY,
    queryFn: service.listReminders,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: CALL_REMINDERS_QUERY_KEY }),
    [queryClient],
  );

  const save = useCallback(
    async (input: CallReminderInput, existing?: CallReminder) => {
      const result = await service.saveReminder(input, existing);
      await queryClient.invalidateQueries({ queryKey: CALL_REMINDERS_QUERY_KEY });
      return result;
    },
    [queryClient],
  );

  const remove = useCallback(
    async (id: string) => {
      await service.deleteReminder(id);
      await queryClient.invalidateQueries({ queryKey: CALL_REMINDERS_QUERY_KEY });
    },
    [queryClient],
  );

  return {
    reminders: query.data ?? [],
    loading: query.isPending,
    error: query.error ?? null,
    refresh,
    save,
    remove,
  };
}
