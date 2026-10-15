/**
 * Token-lifecycle / "session never ends on its own" tests.
 *
 * These exercise the REAL auth logic in supabase.ts (only AsyncStorage and
 * fetch are mocked). The guiding invariant: a logged-in user is logged out
 * ONLY by an explicit logout or a definitive invalid-refresh-token signal —
 * never by token expiry, app relaunch, flaky network, transient server errors,
 * or normal refresh-token rotation.
 */
import { supabase, AUTH_TOKEN_KEY } from '../supabase';
import {
  __reset,
  __setStore,
  __getStore,
  __failNextMultiSet,
} from './asyncStorageMock';

// Storage keys (mirrors the private consts in supabase.ts).
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user_data';

const SUPABASE_URL = 'https://supabase-proxy.utuberpraveen.workers.dev';

// ---- helpers -----------------------------------------------------------

/** Build a JWT whose `exp` is `secondsFromNow` away from now. */
function makeJwt(secondsFromNow: number): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + secondsFromNow,
    }),
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

function jsonResponse(status: number, body: any): any {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

type FetchHandler = (url: string, init: any) => Promise<any>;

/** Install a fetch handler the installed interceptor will forward to. */
function setFetch(handler: FetchHandler): jest.Mock {
  const mock = jest.fn(handler);
  (globalThis as any).__fetchImpl = mock;
  return mock;
}

function getAuthHeader(init: any): string {
  const h = (init && init.headers) || {};
  return h.Authorization || h.authorization || '';
}

/** Seed a logged-in user with the given access/refresh tokens. */
function seedSession(accessToken: string, refreshToken: string): void {
  __setStore({
    [AUTH_TOKEN_KEY]: accessToken,
    [REFRESH_TOKEN_KEY]: refreshToken,
    [USER_KEY]: JSON.stringify({ id: 'user-1', email: 'u@example.com' }),
  });
}

beforeEach(() => {
  __reset();
  // Fully isolate the singleton between tests.
  (supabase as any).proactiveCooldownUntil = 0;
  (supabase as any).refreshPromise = null;
  supabase.setSessionInvalidHandler(null);
  (globalThis as any).__fetchImpl = async () => {
    throw new Error('fetch not programmed for this test');
  };
});

describe('session persistence — token lifecycle', () => {
  // 1. Expired access token + valid refresh token → transparently refreshed.
  test('expired access token is auto-refreshed on access (session kept)', async () => {
    seedSession(makeJwt(-10), 'r-old');
    const newAccess = makeJwt(3600);
    setFetch(async (url) => {
      if (url.includes('grant_type=refresh_token')) {
        return jsonResponse(200, {
          access_token: newAccess,
          refresh_token: 'r-new',
        });
      }
      throw new Error('unexpected url ' + url);
    });

    const token = await supabase.getAccessToken();
    expect(token).toBe(newAccess);
    expect(__getStore()[REFRESH_TOKEN_KEY]).toBe('r-new');
  });

  // 2. Cold start (app relaunched): stored session survives and refreshes.
  test('cold start restores user and refreshes the session', async () => {
    seedSession(makeJwt(-100), 'r-cold');
    setFetch(async (url) => {
      if (url.includes('grant_type=refresh_token')) {
        return jsonResponse(200, {
          access_token: makeJwt(3600),
          refresh_token: 'r-cold-2',
          user: { id: 'user-1', email: 'u@example.com' },
        });
      }
      throw new Error('unexpected url ' + url);
    });

    const user = await supabase.getStoredUser();
    expect(user?.id).toBe('user-1');

    const result = await supabase.refreshSession();
    expect(result.success).toBe(true);
    expect(__getStore()[REFRESH_TOKEN_KEY]).toBe('r-cold-2');
  });

  // 3. Network failure during refresh → session KEPT (transient).
  test('network failure during refresh keeps the session', async () => {
    seedSession(makeJwt(-10), 'r-keep');
    const onInvalid = jest.fn();
    supabase.setSessionInvalidHandler(onInvalid);
    setFetch(async () => {
      throw new Error('network down');
    });

    const result = await supabase.refreshSession();
    expect(result.success).toBe(false);
    expect(result.invalidRefreshToken).toBeUndefined();
    expect(onInvalid).not.toHaveBeenCalled();
    expect(__getStore()[REFRESH_TOKEN_KEY]).toBe('r-keep');
  });

  // 4a. Transient 5xx → session KEPT even if body mentions "refresh token".
  test('5xx server error keeps the session (not treated as invalid)', async () => {
    seedSession(makeJwt(-10), 'r-keep');
    const onInvalid = jest.fn();
    supabase.setSessionInvalidHandler(onInvalid);
    setFetch(async () =>
      jsonResponse(500, { msg: 'temporary refresh token service error' }),
    );

    const result = await supabase.refreshSession();
    expect(result.success).toBe(false);
    expect(result.invalidRefreshToken).toBeUndefined();
    expect(onInvalid).not.toHaveBeenCalled();
    expect(__getStore()[REFRESH_TOKEN_KEY]).toBe('r-keep');
  });

  // 4b. Transient 400 with a generic body (no invalid-grant signal) → KEPT.
  test('generic 400 without invalid-grant signal keeps the session', async () => {
    seedSession(makeJwt(-10), 'r-keep');
    const onInvalid = jest.fn();
    supabase.setSessionInvalidHandler(onInvalid);
    setFetch(async () => jsonResponse(400, { error_description: 'bad request' }));

    const result = await supabase.refreshSession();
    expect(result.success).toBe(false);
    expect(result.invalidRefreshToken).toBeUndefined();
    expect(onInvalid).not.toHaveBeenCalled();
    expect(__getStore()[REFRESH_TOKEN_KEY]).toBe('r-keep');
  });

  // 5a. Definitive invalid_grant CODE → logout.
  test('invalid_grant code logs the user out', async () => {
    seedSession(makeJwt(-10), 'r-dead');
    const onInvalid = jest.fn();
    supabase.setSessionInvalidHandler(onInvalid);
    setFetch(async () =>
      jsonResponse(400, { error: 'invalid_grant', error_description: 'bad' }),
    );

    const result = await supabase.refreshSession();
    expect(result.success).toBe(false);
    expect(result.invalidRefreshToken).toBe(true);
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });

  // 5b. Definitive invalid-refresh-token description on a 400 → logout.
  test('invalid refresh token description on 400 logs the user out', async () => {
    seedSession(makeJwt(-10), 'r-dead');
    const onInvalid = jest.fn();
    supabase.setSessionInvalidHandler(onInvalid);
    setFetch(async () =>
      jsonResponse(400, {
        error_description: 'Invalid Refresh Token: Already Used',
      }),
    );

    const result = await supabase.refreshSession();
    expect(result.success).toBe(false);
    expect(result.invalidRefreshToken).toBe(true);
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });

  // 6. 401 on an authed request → interceptor refreshes and retries.
  test('401 on an authed request triggers refresh-and-retry', async () => {
    seedSession(makeJwt(3600), 'r-401'); // access token still valid
    const newAccess = makeJwt(3600);
    let userCalls = 0;
    setFetch(async (url, init) => {
      if (url.includes('grant_type=refresh_token')) {
        return jsonResponse(200, {
          access_token: newAccess,
          refresh_token: 'r-401-2',
        });
      }
      if (url.includes('/auth/v1/user')) {
        userCalls += 1;
        if (userCalls === 1) return jsonResponse(401, { msg: 'jwt expired' });
        // retry must carry the freshly-refreshed token
        expect(getAuthHeader(init)).toBe(`Bearer ${newAccess}`);
        return jsonResponse(200, {
          id: 'user-1',
          email: 'u@example.com',
          user_metadata: {},
        });
      }
      throw new Error('unexpected url ' + url);
    });

    const result = await supabase.getUserProfile();
    expect(result.success).toBe(true);
    expect(userCalls).toBe(2);
    expect(__getStore()[AUTH_TOKEN_KEY]).toBe(newAccess);
  });

  // 7. Concurrent refresh-triggering calls share ONE network refresh.
  test('concurrent access while expired triggers a single refresh', async () => {
    seedSession(makeJwt(-10), 'r-conc');
    const newAccess = makeJwt(3600);
    const mock = setFetch(async (url) => {
      if (url.includes('grant_type=refresh_token')) {
        return jsonResponse(200, {
          access_token: newAccess,
          refresh_token: 'r-conc-2',
        });
      }
      throw new Error('unexpected url ' + url);
    });

    const [a, b] = await Promise.all([
      supabase.getAccessToken(),
      supabase.getAccessToken(),
    ]);
    expect(a).toBe(newAccess);
    expect(b).toBe(newAccess);
    const refreshCalls = mock.mock.calls.filter((c) =>
      String(c[0]).includes('grant_type=refresh_token'),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  // 8. Normal rotation persists the NEW refresh token.
  test('refresh-token rotation persists the rotated token', async () => {
    seedSession(makeJwt(-10), 'r-rot-1');
    setFetch(async () =>
      jsonResponse(200, {
        access_token: makeJwt(3600),
        refresh_token: 'r-rot-2',
      }),
    );

    await supabase.refreshSession();
    expect(__getStore()[REFRESH_TOKEN_KEY]).toBe('r-rot-2');
  });

  // 9. App killed mid-save → refresh reports a transient failure (never throws,
  //    never logs out) and the old refresh token is NOT wiped (recoverable).
  test('interrupted token save is a transient failure, session intact', async () => {
    seedSession(makeJwt(-10), 'r-survive');
    const onInvalid = jest.fn();
    supabase.setSessionInvalidHandler(onInvalid);
    __failNextMultiSet();
    setFetch(async () =>
      jsonResponse(200, {
        access_token: makeJwt(3600),
        refresh_token: 'r-would-be-new',
      }),
    );

    const result = await supabase.refreshSession();
    expect(result.success).toBe(false);
    expect(result.invalidRefreshToken).toBeUndefined();
    expect(onInvalid).not.toHaveBeenCalled();
    // The previously-stored refresh token survives, so the session can recover.
    expect(__getStore()[REFRESH_TOKEN_KEY]).toBe('r-survive');
  });

  // 10. Long inactivity (token expired long ago) → still refreshes, stays in.
  test('long inactivity with a stale token still refreshes successfully', async () => {
    seedSession(makeJwt(-86400), 'r-stale'); // expired a day ago
    const newAccess = makeJwt(3600);
    setFetch(async (url) => {
      if (url.includes('grant_type=refresh_token')) {
        return jsonResponse(200, {
          access_token: newAccess,
          refresh_token: 'r-stale-2',
        });
      }
      throw new Error('unexpected url ' + url);
    });

    const token = await supabase.getAccessToken();
    expect(token).toBe(newAccess);
  });
});

describe('login paths require a refresh token (no half-logins)', () => {
  // 11a. OTP verify that returns an access token but NO refresh token → refused.
  test('email OTP half-login (access token, no refresh) is refused', async () => {
    setFetch(async (url) => {
      if (url.includes('verify-email-otp')) {
        return jsonResponse(200, { access_token: makeJwt(3600) }); // no refresh
      }
      throw new Error('unexpected url ' + url);
    });

    const result = await supabase.verifyEmailOtp('u@example.com', '123456', 'login');
    expect(result.success).toBe(false);
    expect(__getStore()[AUTH_TOKEN_KEY]).toBeUndefined();
  });

  // 11b. Signup-verify-first (no tokens at all) is still a legitimate success.
  test('email OTP with no tokens (signup-verify-first) still succeeds', async () => {
    setFetch(async (url) => {
      if (url.includes('verify-email-otp')) return jsonResponse(200, {});
      throw new Error('unexpected url ' + url);
    });

    const result = await supabase.verifyEmailOtp('u@example.com', '123456', 'signup', {
      full_name: 'New User',
    });
    expect(result.success).toBe(true);
    expect(__getStore()[AUTH_TOKEN_KEY]).toBeUndefined();
  });

  // login() must reject a response lacking a refresh token...
  test('password login without a refresh token is rejected', async () => {
    setFetch(async (url) => {
      if (url.includes('grant_type=password')) {
        return jsonResponse(200, {
          access_token: makeJwt(3600),
          user: { id: 'user-1', email: 'u@example.com', user_metadata: {} },
        });
      }
      throw new Error('unexpected url ' + url);
    });

    const result = await supabase.login('u@example.com', 'pw');
    expect(result.success).toBe(false);
    expect(__getStore()[AUTH_TOKEN_KEY]).toBeUndefined();
  });

  // Google sign-in must also refuse an access-token-without-refresh half-login.
  test('Google sign-in without a refresh token is rejected', async () => {
    setFetch(async (url) => {
      if (url.includes('grant_type=id_token')) {
        return jsonResponse(200, {
          access_token: makeJwt(3600),
          user: { id: 'user-1', email: 'u@example.com', user_metadata: {} },
        });
      }
      throw new Error('unexpected url ' + url);
    });

    const result = await supabase.signInWithGoogle('google-id-token');
    expect(result.success).toBe(false);
    expect(__getStore()[AUTH_TOKEN_KEY]).toBeUndefined();
  });

  // Phone OTP must also refuse an access-token-without-refresh half-login.
  test('phone OTP half-login (access token, no refresh) is refused', async () => {
    setFetch(async (url) => {
      if (url.includes('verify-phone-otp')) {
        return jsonResponse(200, { access_token: makeJwt(3600) }); // no refresh
      }
      throw new Error('unexpected url ' + url);
    });

    const result = await supabase.verifyPhoneOtp('+15555550100', '123456', 'login');
    expect(result.success).toBe(false);
    expect(__getStore()[AUTH_TOKEN_KEY]).toBeUndefined();
  });

  // Signup's token-return branch must also refuse a half-login.
  test('signup that returns an access token but no refresh is rejected', async () => {
    setFetch(async (url) => {
      if (url.includes('/auth/v1/signup')) {
        return jsonResponse(200, {
          access_token: makeJwt(3600),
          user: { id: 'user-1', email: 'u@example.com', user_metadata: {} },
        });
      }
      throw new Error('unexpected url ' + url);
    });

    const result = await supabase.signup('u@example.com', 'pw', 'New User', '+15555550100');
    expect(result.success).toBe(false);
    expect(__getStore()[AUTH_TOKEN_KEY]).toBeUndefined();
  });

  // ...and accept a complete response.
  test('password login with a refresh token succeeds and persists tokens', async () => {
    const access = makeJwt(3600);
    setFetch(async (url) => {
      if (url.includes('grant_type=password')) {
        return jsonResponse(200, {
          access_token: access,
          refresh_token: 'r-login',
          user: { id: 'user-1', email: 'u@example.com', user_metadata: {} },
        });
      }
      throw new Error('unexpected url ' + url);
    });

    const result = await supabase.login('u@example.com', 'pw');
    expect(result.success).toBe(true);
    expect(__getStore()[AUTH_TOKEN_KEY]).toBe(access);
    expect(__getStore()[REFRESH_TOKEN_KEY]).toBe('r-login');
  });
});
