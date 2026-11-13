import { useCallback, useEffect, useRef, useState } from 'react';
import { getAiTeacherSettings, AiTeacherSettings } from './aiTeacherKeys';

/**
 * Whether the student may use the AI Teacher, as the server says it (`plan.active` in the ai-teacher-keys "get" action).
 * The rule matches the website: logged in AND at least one active, unexpired course enrollment.
 * - 'loading': no answer yet. Shows a spinner.
 * - 'logged_out': no session. The screens show the log-in prompt; the server is not asked.
 * - 'active': the server said yes (enrolled).
 * - 'inactive': the server said no (not enrolled). Only this state shows the Enroll prompt.
 * - 'error': the check failed or the response had no plan field. Shows a retry, never the Enroll prompt.
 *
 * Nothing is cached on the device for gating: a stale "inactive" from before enrolment must not block the student.
 */
export type PlanState = 'loading' | 'logged_out' | 'active' | 'inactive' | 'error';

export function resolvePlanState({
  serverActive,
}: {
  serverActive?: boolean | null;
}): PlanState {
  if (serverActive === true) return 'active';
  if (serverActive === false) return 'inactive';
  // Failed request, or a response with no plan field: unknown, not "not enrolled".
  return 'error';
}

/**
 * Asks the server for the enrollment state. Runs on mount (when `enabled`) and again on every `refresh` call.
 * Stale answers from an older request are ignored. Logged out (`enabled` false) never calls the server.
 */
export function useAiTeacherPlan(enabled: boolean): {
  state: PlanState;
  settings: AiTeacherSettings | null;
  refresh: () => void;
} {
  const [state, setState] = useState<PlanState>(enabled ? 'loading' : 'logged_out');
  const [settings, setSettings] = useState<AiTeacherSettings | null>(null);
  const requestRef = useRef(0);

  const refresh = useCallback(() => {
    if (!enabled) {
      requestRef.current += 1;
      setSettings(null);
      setState('logged_out');
      return;
    }
    // Keep the current answer on screen during a re-check; only the first check shows the spinner.
    setState((prev) => (prev === 'logged_out' ? 'loading' : prev));
    const id = ++requestRef.current;
    void (async () => {
      let answer: AiTeacherSettings | null = null;
      try {
        answer = await getAiTeacherSettings();
      } catch {
        answer = null;
      }
      const serverActive =
        answer?.plan && typeof answer.plan.active === 'boolean' ? answer.plan.active : undefined;

      if (id !== requestRef.current) return;
      setSettings(answer);
      setState(resolvePlanState({ serverActive }));
    })();
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { state, settings, refresh };
}
