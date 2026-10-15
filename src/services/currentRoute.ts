// The name of the screen the student is on, for things that float above the navigator (the AI button) and so
// cannot ask the navigator themselves. AppNavigator publishes it on every navigation.
import { useSyncExternalStore } from 'react';

let current: string | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function setCurrentRoute(name: string | null | undefined): void {
  const next = name ?? null;
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

/** The focused screen (a tab's own name inside MainTabs), or null before the navigator is ready. */
export function useCurrentRouteName(): string | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
