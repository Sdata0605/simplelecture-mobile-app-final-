import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase';

describe('supabase.deleteAccount', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns an error without calling the server when not signed in', async () => {
    jest.spyOn(supabase, 'getAccessToken').mockResolvedValue(null);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await supabase.deleteAccount();

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls delete-my-account with the user token and reports success', async () => {
    jest.spyOn(supabase, 'getAccessToken').mockResolvedValue('user-token');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, cleanup_failures: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await supabase.deleteAccount();

    expect(result).toEqual({ success: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${SUPABASE_URL}/functions/v1/delete-my-account`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer user-token');
    expect(init.headers.apikey).toBe(SUPABASE_ANON_KEY);
  });

  it('surfaces the server error message when deletion fails', async () => {
    jest.spyOn(supabase, 'getAccessToken').mockResolvedValue('user-token');
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'We could not delete your account right now. Please try again.' }),
    }) as unknown as typeof fetch;

    const result = await supabase.deleteAccount();

    expect(result.success).toBe(false);
    expect(result.error).toBe('We could not delete your account right now. Please try again.');
  });

  it('returns a network error message when the request throws', async () => {
    jest.spyOn(supabase, 'getAccessToken').mockResolvedValue('user-token');
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    const result = await supabase.deleteAccount();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Network error/);
  });
});
