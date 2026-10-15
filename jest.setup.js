/**
 * Runs before the module-under-test is imported (jest `setupFiles`).
 *
 * The auth retry interceptor in supabase.ts wraps `global.fetch` at import
 * time and captures whatever it finds as its "original" fetch. We install a
 * stable delegator here so that:
 *   - the interceptor's captured original always forwards to the CURRENT
 *     `global.__fetchImpl`, and
 *   - each test can swap `global.__fetchImpl` to control network behaviour
 *     without losing the installed interceptor.
 */
global.__fetchImpl = async () => {
  throw new Error('fetch not programmed for this test — set global.__fetchImpl');
};
global.fetch = (input, init) => global.__fetchImpl(input, init);
