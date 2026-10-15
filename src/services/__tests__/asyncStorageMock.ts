/**
 * In-memory stand-in for @react-native-async-storage/async-storage used in
 * tests (wired up via jest moduleNameMapper). Implements only the surface the
 * auth layer uses, plus a few test-only helpers (prefixed with `__`).
 */
let store: Record<string, string> = {};
let failNextMultiSet = false;

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store[key] = String(value);
  },
  async removeItem(key: string): Promise<void> {
    delete store[key];
  },
  async multiSet(pairs: [string, string][]): Promise<void> {
    if (failNextMultiSet) {
      // Simulate the app being killed / a write failing mid-save.
      failNextMultiSet = false;
      throw new Error('simulated interrupted multiSet');
    }
    for (const [k, v] of pairs) store[k] = String(v);
  },
  async multiRemove(keys: string[]): Promise<void> {
    for (const k of keys) delete store[k];
  },
  async getAllKeys(): Promise<string[]> {
    return Object.keys(store);
  },
  async clear(): Promise<void> {
    store = {};
  },
};

// ---- test-only helpers -------------------------------------------------
export function __reset(): void {
  store = {};
  failNextMultiSet = false;
}
export function __setStore(next: Record<string, string>): void {
  store = { ...next };
}
export function __getStore(): Record<string, string> {
  return { ...store };
}
export function __failNextMultiSet(): void {
  failNextMultiSet = true;
}

export default AsyncStorage;
