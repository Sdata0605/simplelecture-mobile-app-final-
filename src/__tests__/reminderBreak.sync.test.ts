// Adversarial tests for the Reminders v2 offline store, sync and voice files.
// Goal: try to break store.ts, index.ts, api.ts and audio.ts. Failing tests here are findings.
// Spec: _scratch/reminders-v2-plan.md H (break-it rows 17, 28, 30, 35), D.3 (single-flight, markOutcome).
// The REST, audio, OS notifications and Expo native modules are fakes. AsyncStorage is the real in-memory mock.

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: jest.fn(() => `uuid-${++n}`) };
});

jest.mock('../services/supabase', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-placeholder',
  getValidAccessToken: jest.fn(async () => null),
}));

jest.mock('../services/reminders/api', () => ({
  upsert: jest.fn(async (row: unknown) => row),
  patch: jest.fn(async () => null),
  remove: jest.fn(async () => undefined),
  fetchAll: jest.fn(async () => []),
  fetchOne: jest.fn(async () => null),
  authHeaders: jest.fn(async () => ({})),
  currentUserId: jest.fn(async () => 'user-1'),
}));

jest.mock('../services/reminders/audio', () => ({
  prefetchVoices: jest.fn(async () => []),
  resolveVoiceSource: jest.fn(),
  gcAudio: jest.fn(async () => undefined),
  clearAllAudio: jest.fn(async () => undefined),
  previewVoice: jest.fn(),
}));

jest.mock('../services/reminders/notifications', () => ({
  ensureReminderChannels: jest.fn(async () => undefined),
  applySchedulePlan: jest.fn(async () => ({ added: 0, kept: 0, removed: 0 })),
  cancelAllReminderNotifications: jest.fn(async () => 0),
  cancelReminderNotification: jest.fn(async () => undefined),
  scheduleReminderRequest: jest.fn(async () => undefined),
}));

jest.mock('../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => undefined),
  downloadAsync: jest.fn(async () => ({ status: 200 })),
  deleteAsync: jest.fn(async () => undefined),
  readDirectoryAsync: jest.fn(async () => []),
}));

jest.mock('../constants/featureFlags', () => ({ FEATURES: { reminders: true } }));

// Fixed "now": Mon 2 Nov 2026, 12:00 local.
const NOW = new Date(2026, 10, 2, 12, 0, 0);
const TOMORROW = '2026-11-03';
const USER = 'user-1';

function load(): any {
  jest.resetModules();
  return {
    store: require('../services/reminders/store'),
    api: require('../services/reminders/api'),
    audio: require('../services/reminders/audio'),
    notif: require('../services/reminders/notifications'),
    index: require('../services/reminders'),
    Notifications: require('expo-notifications'),
    storage: require('../services/__tests__/asyncStorageMock'),
  };
}

/** Server stand-in. Writes are kept in `rows`, reads return them. */
function fakeServer(m: any, rows: Map<string, any> = new Map()): Map<string, any> {
  m.api.upsert.mockImplementation(async (row: any) => {
    rows.set(row.id, { ...row });
    return row;
  });
  m.api.patch.mockImplementation(async (id: string, fields: any) => {
    const current = rows.get(id);
    if (!current) return null;
    const next = { ...current, ...fields };
    rows.set(id, next);
    return next;
  });
  m.api.remove.mockImplementation(async (id: string) => {
    rows.delete(id);
  });
  m.api.fetchAll.mockImplementation(async () => [...rows.values()]);
  return rows;
}

function httpError(kind: 'network' | 'server', status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { kind, status });
}

function input(over: Record<string, unknown> = {}): any {
  return {
    text: 'Go to college for your submission',
    kind: 'message',
    mode: 'once',
    date: TOMORROW,
    time: '09:30',
    voice: 'shubh',
    language: 'en-IN',
    ...over,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

async function storageDump(m: any): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of await m.storage.default.getAllKeys()) {
    out[k] = (await m.storage.default.getItem(k)) as string;
  }
  return out;
}

async function storageRestore(m: any, values: Record<string, string>): Promise<void> {
  m.storage.__setStore(values);
}

function baseRow(over: Record<string, unknown> = {}): any {
  return {
    id: 'seed',
    user_id: USER,
    title: 't',
    message_text: 't',
    enabled: true,
    kind: 'message',
    section: 'calendar',
    repeat_rule: 'none',
    time_of_day: null,
    tz: 'Asia/Kolkata',
    call_enabled: false,
    voice: 'shubh',
    language: 'en-IN',
    audio_path: null,
    audio_hash: null,
    audio_status: 'none',
    status: 'scheduled',
    last_fired_at: null,
    scheduled_at: new Date(NOW.getTime() + 3 * 3600_000).toISOString(),
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...over,
  };
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('offline save and flush', () => {
  it('keeps an offline save and an offline delete across a restart, then flushes both', async () => {
    const m = load();
    const server = fakeServer(m);
    await m.index.initReminders(USER);

    m.api.upsert.mockRejectedValue(httpError('network', 0));
    m.api.fetchAll.mockRejectedValue(httpError('network', 0));
    await m.index.saveReminder(input({ id: 'off-1' }));
    expect(m.index.getSnapshot().outboxSize).toBe(1);

    // Simulated app restart while still offline.
    const dump = await storageDump(m);
    const m2 = load();
    await storageRestore(m2, dump);
    m2.api.upsert.mockRejectedValue(httpError('network', 0));
    m2.api.fetchAll.mockRejectedValue(httpError('network', 0));
    await m2.index.initReminders(USER);
    expect(m2.index.getSnapshot().reminders.map((r: any) => r.id)).toEqual(['off-1']);
    expect(m2.index.getSnapshot().outboxSize).toBe(1);

    // Back online: flush the upsert, then an offline-queued delete goes through too.
    const rows = fakeServer(m2, server);
    await m2.index.syncReminders('manual');
    expect(rows.has('off-1')).toBe(true);
    expect(m2.index.getSnapshot().outboxSize).toBe(0);

    const token = await m2.index.softDeleteReminder('off-1');
    await m2.index.commitDelete(token);
    await m2.index.syncReminders('manual');
    expect(rows.has('off-1')).toBe(false);
    expect(m2.index.getSnapshot().outboxSize).toBe(0);
  });
});

describe('double tap save', () => {
  it('the first save made while offline reports savedOffline (result is computed before any sync runs)', async () => {
    const m = load();
    fakeServer(m);
    await m.index.initReminders(USER);

    m.api.upsert.mockRejectedValue(httpError('network', 0));
    m.api.fetchAll.mockRejectedValue(httpError('network', 0));
    const res = await m.index.saveReminder(input({ id: 'off-first' }));
    expect(res.savedOffline).toBe(true);
  });

  it('two saves of the same id in the same tick leave one row and one queued upsert', async () => {
    const m = load();
    const rows = fakeServer(m);
    await m.index.initReminders(USER);

    const [a, b] = await Promise.all([
      m.index.saveReminder(input({ id: 'dup-1' })),
      m.index.saveReminder(input({ id: 'dup-1' })),
    ]);
    expect(a.reminder.id).toBe('dup-1');
    expect(b.reminder.id).toBe('dup-1');
    expect(m.index.getSnapshot().reminders).toHaveLength(1);

    await m.index.syncReminders('manual');
    expect([...rows.keys()]).toEqual(['dup-1']);
    expect(m.index.getSnapshot().outboxSize).toBe(0);
  });
});

describe('delete then upsert race', () => {
  it('a re-save while the undo window is open wins over the pending delete', async () => {
    const m = load();
    const rows = fakeServer(m);
    await m.index.initReminders(USER);

    await m.index.saveReminder(input({ id: 'race-1' }));
    await m.index.syncReminders('manual');
    expect(rows.has('race-1')).toBe(true);

    const token = await m.index.softDeleteReminder('race-1');
    await m.index.saveReminder(input({ id: 'race-1', text: 'Edited during undo' }), token.previous);
    await m.index.commitDelete(token); // must not remove the re-saved row
    await m.index.syncReminders('manual');

    expect(m.index.getSnapshot().reminders.map((r: any) => r.message_text)).toEqual(['Edited during undo']);
    expect(rows.get('race-1')?.message_text).toBe('Edited during undo');
  });
});

describe('logout during save and sync', () => {
  it('logout while the alarm is being set aborts the save and cancels that alarm', async () => {
    const m = load();
    fakeServer(m);
    await m.index.initReminders(USER);

    let release!: () => void;
    const gate = new Promise<void>(r => {
      release = r;
    });
    m.notif.scheduleReminderRequest.mockImplementationOnce(async () => {
      await gate;
    });

    const pending = m.index.saveReminder(input({ id: 'lo-1' }));
    await flush();
    expect(m.notif.scheduleReminderRequest).toHaveBeenCalledTimes(1);

    await m.index.clearRemindersOnLogout();
    release();

    await expect(pending).rejects.toThrow('Signed out while saving');
    expect(m.notif.cancelReminderNotification).toHaveBeenCalledWith('lo-1');
    expect(m.index.getSnapshot().userId).toBeNull();
    expect(m.index.getSnapshot().reminders).toEqual([]);
    const keys: string[] = await m.storage.default.getAllKeys();
    expect(keys.filter(k => k.startsWith(`reminders.v2.${USER}.`))).toEqual([]);
  });

  it('logout during an in-flight flush leaves no writes or cache keys for the old user', async () => {
    const m = load();
    fakeServer(m);
    await m.index.initReminders(USER);

    let release!: () => void;
    const gate = new Promise<void>(r => {
      release = r;
    });
    m.api.upsert.mockImplementationOnce(async (row: any) => {
      await gate;
      return row;
    });

    const fetchCallsBefore = m.api.fetchAll.mock.calls.length;
    void m.index.saveReminder(input({ id: 'inflight-1' }));
    await flush();
    await m.index.clearRemindersOnLogout();
    release();
    await flush();
    await m.index.syncReminders('manual');

    expect(m.api.fetchAll.mock.calls.length).toBe(fetchCallsBefore);
    const keys: string[] = await m.storage.default.getAllKeys();
    expect(keys.filter(k => k.startsWith(`reminders.v2.${USER}.`))).toEqual([]);
  });
});

describe('two syncs at once', () => {
  it('three overlapping sync calls never overlap and cost one extra pass', async () => {
    const m = load();
    const rows = fakeServer(m);
    await m.index.initReminders(USER);

    let active = 0;
    let maxActive = 0;
    let release!: () => void;
    const gate = new Promise<void>(r => {
      release = r;
    });
    const real = m.api.fetchAll.getMockImplementation();
    m.api.fetchAll.mockImplementationOnce(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await gate;
      active--;
      return [...rows.values()];
    });
    m.api.fetchAll.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      active--;
      return real ? real() : [];
    });

    const before = m.api.fetchAll.mock.calls.length;
    const p1 = m.index.syncReminders('foreground');
    const p2 = m.index.syncReminders('response');
    const p3 = m.index.syncReminders('permission');
    release();
    await Promise.all([p1, p2, p3]);

    expect(maxActive).toBe(1);
    expect(m.api.fetchAll.mock.calls.length - before).toBe(2);
    expect(m.index.getSnapshot().syncing).toBe(false);
  });
});

describe('server failures', () => {
  it('a 500 forever never loses the outbox, including across restarts', async () => {
    const m = load();
    fakeServer(m);
    await m.index.initReminders(USER);

    const boom = httpError('server', 500);
    m.api.upsert.mockRejectedValue(boom);
    m.api.fetchAll.mockRejectedValue(boom);
    await m.index.saveReminder(input({ id: 'five-hundred' }));
    for (let i = 0; i < 5; i++) await m.index.syncReminders('manual');

    expect(m.index.getSnapshot().outboxSize).toBe(1);
    expect(m.index.getSnapshot().reminders.map((r: any) => r.id)).toEqual(['five-hundred']);
    expect(m.index.getSnapshot().syncError).toBe('server');

    const dump = await storageDump(m);
    expect(JSON.parse(dump[m.store.outboxKey(USER)])).toHaveLength(1);

    const m2 = load();
    await storageRestore(m2, dump);
    m2.api.upsert.mockRejectedValue(boom);
    m2.api.fetchAll.mockRejectedValue(boom);
    await m2.index.initReminders(USER);
    expect(m2.index.getSnapshot().outboxSize).toBe(1);
    expect(m2.index.getSnapshot().reminders.map((r: any) => r.id)).toEqual(['five-hundred']);

    const rows = fakeServer(m2);
    await m2.index.syncReminders('manual');
    expect(rows.has('five-hundred')).toBe(true);
    expect(m2.index.getSnapshot().outboxSize).toBe(0);
  });

  it('a 401 keeps the op so it syncs after sign-in again', async () => {
    const m = load();
    const rows = fakeServer(m);
    await m.index.initReminders(USER);

    m.api.upsert.mockRejectedValue(httpError('server', 401));
    await m.index.saveReminder(input({ id: 'auth-401' }));
    await m.index.syncReminders('manual');
    expect(m.index.getSnapshot().outboxSize).toBe(1);
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('dropped'), expect.anything(), expect.anything());

    fakeServer(m, rows);
    await m.index.syncReminders('manual');
    expect(rows.has('auth-401')).toBe(true);
  });

  it('a 422 drops only the rejected op and the next op still reaches the server', async () => {
    const m = load();
    const rows = fakeServer(m);
    await m.index.initReminders(USER);

    const real = m.api.upsert.getMockImplementation();
    m.api.upsert.mockImplementation(async (row: any) => {
      if (row.id === 'bad-422') throw httpError('server', 422);
      return real(row);
    });

    await m.index.saveReminder(input({ id: 'bad-422' }));
    await m.index.saveReminder(input({ id: 'good-after' }));
    await m.index.syncReminders('manual');
    await m.index.syncReminders('manual');

    expect(rows.has('good-after')).toBe(true);
    expect(rows.has('bad-422')).toBe(false);
    expect(m.index.getSnapshot().outboxSize).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('dropped outbox upsert for bad-422'));
  });
});

describe('corrupted AsyncStorage', () => {
  it('corrupted cache and outbox JSON do not crash, start empty, and the app saves again', async () => {
    const m = load();
    const rows = fakeServer(m);
    await storageRestore(m, {
      [m.store.cacheKey(USER)]: '{"items":[{"id":',
      [m.store.outboxKey(USER)]: '[{"op":',
    });

    await expect(m.index.initReminders(USER)).resolves.toBeUndefined();
    expect(m.index.getSnapshot().reminders).toEqual([]);
    expect(m.index.getSnapshot().outboxSize).toBe(0);

    await m.index.saveReminder(input({ id: 'after-corrupt' }));
    await m.index.syncReminders('manual');
    expect(rows.has('after-corrupt')).toBe(true);
    const dump = await storageDump(m);
    expect(() => JSON.parse(dump[m.store.cacheKey(USER)])).not.toThrow();
  });

  it('a valid cache with a corrupt outbox keeps the cached rows', async () => {
    const m = load();
    const cachedRow = baseRow({ id: 'cached-1', message_text: 'Cached' });
    fakeServer(m, new Map([[cachedRow.id, cachedRow]]));
    const cached = { items: [cachedRow], lastSyncAt: null };
    await storageRestore(m, {
      [m.store.cacheKey(USER)]: JSON.stringify(cached),
      [m.store.outboxKey(USER)]: 'not json at all',
    });

    await expect(m.index.initReminders(USER)).resolves.toBeUndefined();
    expect(m.index.getSnapshot().reminders.map((r: any) => r.id)).toEqual(['cached-1']);
    expect(m.index.getSnapshot().outboxSize).toBe(0);
  });

  it('a null entry in the stored outbox must not block the valid ops behind it', async () => {
    const m = load();
    const rows = fakeServer(m);
    const validOp = {
      op: 'upsert',
      id: 'ok-after-null',
      body: baseRow({ id: 'ok-after-null', message_text: 'Valid' }),
      ts: NOW.getTime(),
    };
    await storageRestore(m, {
      [m.store.outboxKey(USER)]: JSON.stringify([null, validOp]),
    });

    await m.index.initReminders(USER);
    expect(rows.has('ok-after-null')).toBe(true);
  });
});

describe('large cache', () => {
  it('200 cached rows load, plan within the 38-alarm budget, and the cache persists', async () => {
    const m = load();
    const rows = new Map<string, any>();
    for (let i = 0; i < 200; i++) {
      const row = baseRow({
        id: `r-${i}`,
        message_text: `Reminder ${i}`,
        scheduled_at: new Date(NOW.getTime() + (i + 1) * 3600_000).toISOString(),
      });
      rows.set(row.id, row);
    }
    fakeServer(m, rows);
    await storageRestore(m, {
      [m.store.cacheKey(USER)]: JSON.stringify({ items: [...rows.values()], lastSyncAt: null }),
      [m.store.outboxKey(USER)]: '[]',
    });

    await m.index.initReminders(USER);
    const snap = m.index.getSnapshot();
    expect(snap.reminders).toHaveLength(200);
    expect(Object.keys(snap.plan)).toHaveLength(200);
    const states = Object.values(snap.plan).map((p: any) => p.state);
    expect(states.filter(s => s === 'scheduled')).toHaveLength(38);
    expect(states.filter(s => s === 'queued')).toHaveLength(162);
    expect(m.notif.applySchedulePlan.mock.calls.at(-1)[0]).toHaveLength(38);

    const dump = await storageDump(m);
    expect(JSON.parse(dump[m.store.cacheKey(USER)]).items).toHaveLength(200);
  });
});

describe('markOutcome on a deleted reminder', () => {
  it('is a no-op for a soft-deleted, purged, or unknown reminder', async () => {
    const m = load();
    fakeServer(m);
    await m.index.initReminders(USER);

    await m.index.saveReminder(input({ id: 'gone-1' }));
    const token = await m.index.softDeleteReminder('gone-1');
    await m.index.commitDelete(token);
    await m.index.syncReminders('manual');

    m.notif.cancelReminderNotification.mockClear();
    const before = m.index.getSnapshot().outboxSize;
    await expect(m.index.markOutcome('gone-1', 'answered')).resolves.toBeUndefined();
    await expect(m.index.markOutcome('never-existed', 'missed')).resolves.toBeUndefined();

    expect(m.notif.cancelReminderNotification).not.toHaveBeenCalled();
    expect(m.index.getSnapshot().outboxSize).toBe(before);
    expect(m.index.getSnapshot().reminders.find((r: any) => r.id === 'gone-1')).toBeUndefined();
  });
});

describe('voice files (audio.ts, real module)', () => {
  function loadAudio(): any {
    jest.resetModules();
    return {
      fs: require('expo-file-system/legacy'),
      fwt: require('../utils/fetchWithTimeout'),
      audio: jest.requireActual('../services/reminders/audio'),
    };
  }

  function jsonResponse(body: unknown, contentType = 'application/json'): any {
    return {
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? contentType : null) },
      json: async () => body,
    };
  }

  const callRow = {
    id: 'call-1',
    kind: 'call',
    status: 'scheduled',
    message_text: 'Gym now',
    language: 'en-IN',
    voice: 'shubh',
    audio_hash: null,
    audio_path: null,
    audio_status: 'none',
  };

  const goodBody = {
    audioPath: 'reminders/a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f809.mp3',
    hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f809',
    signedUrl: 'https://signed.example.invalid/a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f809.mp3',
    cached: false,
    voice: 'shubh',
    language: 'en-IN',
    model: 'bulbul:v3',
  };

  it('a failed download deletes the partial file and returns null without throwing', async () => {
    const { fs, fwt, audio } = loadAudio();
    fwt.fetchWithTimeout.mockResolvedValue(jsonResponse(goodBody));
    fs.getInfoAsync.mockResolvedValue({ exists: false });
    fs.downloadAsync.mockResolvedValue({ status: 500 });

    await expect(audio.ensureLocalAudio(callRow)).resolves.toBeNull();
    expect(fs.deleteAsync).toHaveBeenCalledWith('file:///docs/reminders-audio/a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f809.mp3', { idempotent: true });
  });

  it('an HTML reply from the proxy is treated as a failed voice, not a crash', async () => {
    const { fwt, audio } = loadAudio();
    fwt.fetchWithTimeout.mockResolvedValue(jsonResponse('<html>502</html>', 'text/html'));

    await expect(audio.prefetchVoices([callRow])).resolves.toEqual([
      { id: 'call-1', audio: 'failed', hash: null, audioPath: null },
    ]);
  });

  it('an aborted request falls back to the device voice', async () => {
    const { fwt, audio } = loadAudio();
    fwt.fetchWithTimeout.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    const source = await audio.resolveVoiceSource(callRow, { timeoutMs: 10 });
    expect(source).toEqual({ type: 'device', script: expect.any(String), language: 'en-IN' });
  });

  it('a server hash containing path segments must not write outside reminders-audio', async () => {
    const { fs, fwt, audio } = loadAudio();
    fwt.fetchWithTimeout.mockResolvedValue(jsonResponse({ ...goodBody, hash: '../../evil' }));
    fs.getInfoAsync.mockResolvedValue({ exists: true });
    fs.downloadAsync.mockResolvedValue({ status: 200 });

    const result = await audio.ensureLocalAudio(callRow);
    // A hash that is not a hex digest is refused before any file is written.
    expect(fs.downloadAsync).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('prefetch skips a call whose voice already failed, so quota errors are not retried', async () => {
    const { fwt, audio } = loadAudio();
    fwt.fetchWithTimeout.mockResolvedValue(jsonResponse(goodBody));

    await expect(audio.prefetchVoices([{ ...callRow, audio_status: 'failed' }])).resolves.toEqual([]);
    expect(fwt.fetchWithTimeout).not.toHaveBeenCalled();
  });
});
