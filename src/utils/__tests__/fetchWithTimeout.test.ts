import { fetchWithTimeout } from '../fetchWithTimeout';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit?]>;

/**
 * A fetch that never answers on its own but, like the real one, rejects with AbortError when aborted - including
 * when it is handed a signal that is already aborted.
 */
function hangingFetch(): FetchMock {
  return jest.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const abortError = () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        return err;
      };
      if (init?.signal?.aborted) {
        reject(abortError());
        return;
      }
      init?.signal?.addEventListener('abort', () => reject(abortError()));
    }),
  );
}

describe('fetchWithTimeout', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  it('returns the response when the server answers in time and leaves no timer behind', async () => {
    const response = { ok: true, status: 200 } as Response;
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    await expect(fetchWithTimeout('https://example.test/a', { method: 'GET' }, 5000)).resolves.toBe(response);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('passes the request options through to fetch', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchWithTimeout('https://example.test/a', { method: 'POST', headers: { 'X-Test': '1' } }, 5000);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/a');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'X-Test': '1' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts a request that never answers once the deadline passes', async () => {
    global.fetch = hangingFetch() as unknown as typeof fetch;

    const pending = fetchWithTimeout('https://example.test/hang', {}, 10000);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    jest.advanceTimersByTime(9999);
    await Promise.resolve();
    expect((global.fetch as unknown as FetchMock).mock.calls[0][1]?.signal?.aborted).toBe(false);

    jest.advanceTimersByTime(1);
    await assertion;
    expect((global.fetch as unknown as FetchMock).mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('aborts when the caller cancels, before the deadline', async () => {
    global.fetch = hangingFetch() as unknown as typeof fetch;
    const caller = new AbortController();

    const pending = fetchWithTimeout('https://example.test/hang', { signal: caller.signal }, 10000);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    caller.abort();

    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('aborts immediately when the caller signal is already aborted', async () => {
    global.fetch = hangingFetch() as unknown as typeof fetch;
    const caller = new AbortController();
    caller.abort();

    await expect(
      fetchWithTimeout('https://example.test/hang', { signal: caller.signal }, 10000),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
