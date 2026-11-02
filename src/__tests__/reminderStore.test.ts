// Tests for the Reminders v2 store, sync and facade (WP2).
// Spec: _scratch/reminders-v2-plan.md D-11, D-12, D-19, D-20, D-21, D.2 rule 5, F.4.
// The REST layer, audio layer and OS notifications are replaced with fakes. The AsyncStorage
// mock is real (in-memory), so cache persistence across a simulated restart is exercised.

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: jest.fn(() => `uuid-${++n}`) };
});

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

// Fixed "now": Mon 2 Nov 2026, 12:00 local. All dates below are built from local time, so
// the tests do not depend on the machine's time zone.
const NOW = new Date(2026, 10, 2, 12, 0, 0);
const TOMORROW = '2026-11-03';
const USER = 'user-1';

interface Mods {
  store: any;
  api: any;
  audio: any;
  notif: any;
  index: any;
  Notifications: any;
  AsyncStorage: any;
}

function load(): Mods {
  jest.resetModules();
  return {
    store: require('../services/reminders/store'),
    api: require('../services/reminders/api'),
    audio: require('../services/reminders/audio'),
    notif: require('../services/reminders/notifications'),
    index: require('../services/reminders'),
    Notifications: require('expo-notifications'),
    AsyncStorage: require('../services/__tests__/asyncStorageMock').default,
  };
}

/** Makes the api mock behave like the server: writes are kept, reads return them. */
function fakeServer(m: Mods): Map<string, any> {
  const rows = new Map<string, any>();
  m.api.upsert.mockImplementation(async (row: any) => {
    rows.set(row.id, { ...row, created_at: NOW.toISOString() });
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

function offline(): Error {
  return Object.assign(new Error('offline'), { kind: 'network', status: 0 });
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

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('outbox coalescing', () => {
  it('keeps the last upsert per id and merges patches into it', () => {
    const m = load();
    const { coalesce } = m.store;
    let outbox = coalesce([], { op: 'upsert', id: 'a', body: { title: 'one' }, ts: 1 });
    outbox = coalesce(outbox, { op: 'upsert', id: 'a', body: { title: 'two' }, ts: 2 });
    outbox = coalesce(outbox, { op: 'patch', id: 'a', body: { enabled: false }, ts: 3 });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ op: 'upsert', body: { title: 'two', enabled: false } });
  });

  it('lets delete supersede earlier writes, and drops patches queued after it', () => {
    const m = load();
    const { coalesce } = m.store;
    let outbox = coalesce([], { op: 'patch', id: 'a', body: { status: 'cancelled' }, ts: 1 });
    outbox = coalesce(outbox, { op: 'delete', id: 'a', ts: 2 });
    expect(outbox).toEqual([{ op: 'delete', id: 'a', ts: 2 }]);
    outbox = coalesce(outbox, { op: 'patch', id: 'a', body: { enabled: true }, ts: 3 });
    expect(outbox).toEqual([{ op: 'delete', id: 'a', ts: 2 }]);
  });
});

describe('merge with server rows', () => {
  it('keeps the local copy of a pending row, takes the server copy otherwise, and drops rows deleted elsewhere', () => {
    const m = load();
    const base = { user_id: USER, enabled: true, kind: 'message', section: 'calendar', repeat_rule: 'none', time_of_day: null, tz: 'Asia/Kolkata', call_enabled: false, voice: 'shubh', language: 'en-IN', audio_path: null, audio_hash: null, audio_status: 'none', status: 'scheduled', last_fired_at: null, title: 't', scheduled_at: NOW.toISOString(), created_at: NOW.toISOString(), updated_at: NOW.toISOString() };
    const local = [
      { ...base, id: 'pending', message_text: 'local edit' },
      { ...base, id: 'synced', message_text: 'old' },
      { ...base, id: 'gone', message_text: 'deleted on another phone' },
    ];
    const server = [
      { ...base, id: 'pending', message_text: 'server copy' },
      { ...base, id: 'synced', message_text: 'remote edit', time_of_day: '06:00:00', repeat_rule: 'daily', section: 'daily' },
    ];
    const merged = m.store.mergeServerRows(local, server, new Set(['pending']));
    const byId = Object.fromEntries(merged.map((r: any) => [r.id, r]));
    expect(byId.pending.message_text).toBe('local edit');
    expect(byId.synced.message_text).toBe('remote edit');
    expect(byId.synced.time_of_day).toBe('06:00');
    expect(byId.gone).toBeUndefined();
  });
});

describe('reconcile (purge and missed rules)', () => {
  const base = { user_id: USER, title: 't', message_text: 't', enabled: true, kind: 'message', section: 'calendar', repeat_rule: 'none', time_of_day: null, tz: 'Asia/Kolkata', call_enabled: false, voice: 'shubh', language: 'en-IN', audio_path: null, audio_hash: null, audio_status: 'none', last_fired_at: null, created_at: '', updated_at: NOW.toISOString(), scheduled_at: NOW.toISOString() };
  const DAY = 24 * 60 * 60 * 1000;

  it('marks late one-offs missed or delivered, purges old rows, and leaves daily rows alone', () => {
    const m = load();
    const past = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
    const rows = [
      { ...base, id: 'call-late', kind: 'call', status: 'scheduled', scheduled_at: past },
      { ...base, id: 'msg-late', status: 'scheduled', scheduled_at: past },
      { ...base, id: 'cancelled-old', status: 'cancelled', updated_at: new Date(NOW.getTime() - 5 * 60_000).toISOString() },
      { ...base, id: 'today-done-old', section: 'daily', status: 'delivered', updated_at: new Date(NOW.getTime() - 8 * DAY).toISOString() },
      { ...base, id: 'cal-done-recent', status: 'answered', updated_at: new Date(NOW.getTime() - 2 * DAY).toISOString() },
      { ...base, id: 'daily', repeat_rule: 'daily', section: 'daily', time_of_day: '06:00', status: 'scheduled', scheduled_at: past },
    ];
    const out = m.store.reconcileRows(rows, NOW.getTime());
    const kept = Object.fromEntries(out.items.map((r: any) => [r.id, r]));
    expect(kept['call-late'].status).toBe('missed');
    expect(kept['msg-late'].status).toBe('delivered');
    expect(kept.daily.status).toBe('scheduled');
    expect(kept['cal-done-recent']).toBeDefined();
    expect(out.items.find((r: any) => r.id === 'cancelled-old')).toBeUndefined();
    expect(out.items.find((r: any) => r.id === 'today-done-old')).toBeUndefined();
    expect(out.deletes.sort()).toEqual(['cancelled-old', 'today-done-old']);
    expect(out.patches.map((p: any) => [p.id, p.body.status]).sort()).toEqual([
      ['call-late', 'missed'],
      ['msg-late', 'delivered'],
    ]);
  });
});

describe('sync and save', () => {
  it('saves offline without waiting for the network, then flushes the outbox when back online', async () => {
    const m = load();
    const server = fakeServer(m);
    await m.index.initReminders(USER);

    m.api.upsert.mockRejectedValue(offline());
    m.api.fetchAll.mockRejectedValue(offline());
    const res = await m.index.saveReminder(input());
    expect(res.state).toBe('scheduled');
    expect(m.notif.scheduleReminderRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'uuid-1', text: 'Go to college for your submission', identifier: 'reminder-uuid-1' }),
    );

    await m.index.syncReminders('manual');
    expect(m.index.getSnapshot().outboxSize).toBe(1);
    expect(m.index.getSnapshot().syncError).toBe('network');
    expect(m.index.getSnapshot().reminders).toHaveLength(1);

    m.api.upsert.mockImplementation(async (row: any) => {
      server.set(row.id, row);
      return row;
    });
    m.api.fetchAll.mockImplementation(async () => [...server.values()]);
    await m.index.syncReminders('manual');
    expect(m.api.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'uuid-1', user_id: USER, kind: 'message' }));
    expect(m.index.getSnapshot().outboxSize).toBe(0);
    expect(m.index.getSnapshot().syncError).toBeNull();
    expect(server.has('uuid-1')).toBe(true);
  });

  it('saving the same id twice leaves one row on the server holding the last text', async () => {
    const m = load();
    const server = fakeServer(m);
    await m.index.initReminders(USER);

    await m.index.saveReminder(input({ text: 'first' }));
    await m.index.saveReminder(input({ text: 'second', id: 'uuid-1' }));
    await m.index.syncReminders('manual');

    expect(server.size).toBe(1);
    expect(server.get('uuid-1').message_text).toBe('second');
    expect(m.index.getSnapshot().reminders).toHaveLength(1);
    expect(m.index.getSnapshot().outboxSize).toBe(0);
    expect(m.notif.scheduleReminderRequest).toHaveBeenCalledWith(expect.objectContaining({ id: 'uuid-1' }));
  });

  it('keeps a pending local edit over the server copy, but takes remote changes to rows with nothing pending', async () => {
    const m = load();
    const server = fakeServer(m);
    await m.index.initReminders(USER);

    const a = await m.index.saveReminder(input({ text: 'A old' }));
    const b = await m.index.saveReminder(input({ text: 'B old' }));
    await m.index.syncReminders('manual');
    expect(server.size).toBe(2);

    // Offline edit to A; another phone changed B on the server.
    m.api.upsert.mockRejectedValue(offline());
    await m.index.saveReminder(input({ text: 'A local edit', id: a.reminder.id }));
    await m.index.syncReminders('manual');
    server.set(b.reminder.id, { ...server.get(b.reminder.id), message_text: 'B remote edit' });
    m.api.fetchAll.mockImplementation(async () => [...server.values()]);
    await m.index.syncReminders('manual');

    const byId = Object.fromEntries(m.index.getSnapshot().reminders.map((r: any) => [r.id, r]));
    expect(byId[a.reminder.id].message_text).toBe('A local edit');
    expect(byId[b.reminder.id].message_text).toBe('B remote edit');
  });

  it('refuses to save when signed out during the permission check, and leaves nothing behind', async () => {
    const m = load();
    fakeServer(m);
    await m.index.initReminders(USER);

    let resolvePermission: (v: unknown) => void = () => undefined;
    m.Notifications.getPermissionsAsync.mockImplementationOnce(
      () => new Promise(resolve => {
        resolvePermission = resolve;
      }),
    );
    const pending = m.index.saveReminder(input());
    await m.index.clearRemindersOnLogout();
    resolvePermission({ status: 'granted' });

    await expect(pending).rejects.toThrow('Signed out');
    expect(m.notif.scheduleReminderRequest).not.toHaveBeenCalled();
    expect(m.index.getSnapshot().outboxSize).toBe(0);
    expect(m.index.getSnapshot().reminders).toHaveLength(0);
    expect(m.notif.cancelAllReminderNotifications).toHaveBeenCalled();
  });

  it('serves the cache after a restart with no network, and keeps the alarms', async () => {
    const m = load();
    const server = fakeServer(m);
    await m.index.initReminders(USER);
    await m.index.saveReminder(input({ mode: 'daily', time: '06:00', text: 'Wake up' }));
    await m.index.syncReminders('manual');
    expect(server.size).toBe(1);

    // Keep the persisted keys, then simulate a fresh app start.
    const keys: string[] = await m.AsyncStorage.getAllKeys();
    const values: Record<string, string> = {};
    for (const k of keys) values[k] = (await m.AsyncStorage.getItem(k)) as string;

    const m2 = load();
    for (const [k, v] of Object.entries(values)) await m2.AsyncStorage.setItem(k, v);
    m2.api.fetchAll.mockRejectedValue(offline());
    m2.api.fetchOne.mockRejectedValue(offline());
    await m2.index.initReminders(USER);

    expect(m2.index.getSnapshot().reminders.map((r: any) => r.message_text)).toEqual(['Wake up']);
    expect(m2.notif.cancelAllReminderNotifications).not.toHaveBeenCalled();
    expect(m2.notif.applySchedulePlan).toHaveBeenCalledWith(
      [expect.objectContaining({ identifier: 'reminder-uuid-1', text: 'Wake up' })],
    );
  });

  it('runs at most one extra pass when sync is requested while a run is in progress', async () => {
    const m = load();
    fakeServer(m);
    await m.index.initReminders(USER);
    m.api.fetchAll.mockClear();

    await Promise.all([
      m.index.syncReminders('foreground'),
      m.index.syncReminders('response'),
      m.index.syncReminders('permission'),
    ]);
    expect(m.api.fetchAll).toHaveBeenCalledTimes(2);
  });

  it('soft delete then undo restores the row; soft delete then commit removes it on the server', async () => {
    const m = load();
    const server = fakeServer(m);
    await m.index.initReminders(USER);
    await m.index.saveReminder(input());
    await m.index.syncReminders('manual');
    const id = 'uuid-1';

    // Soft delete and undo: the row comes back and its alarm is set again.
    const token = await m.index.softDeleteReminder(id);
    expect(m.index.getSnapshot().reminders).toHaveLength(0);
    expect(m.notif.cancelReminderNotification).toHaveBeenCalledWith(id);
    await m.index.undoDelete(token);
    expect(m.index.getSnapshot().reminders).toHaveLength(1);
    await m.index.syncReminders('manual');
    expect(server.get(id).status).toBe('scheduled');

    // Soft delete and let the window pass: a DELETE is queued and sent.
    const token2 = await m.index.softDeleteReminder(id);
    await m.index.commitDelete(token2);
    await m.index.syncReminders('manual');
    expect(m.api.remove).toHaveBeenCalledWith(id);
    expect(server.has(id)).toBe(false);
    expect(m.index.getSnapshot().reminders).toHaveLength(0);
  });

  it('records outcomes: one-offs change status, daily reminders keep ringing', async () => {
    const m = load();
    fakeServer(m);
    await m.index.initReminders(USER);
    const daily = await m.index.saveReminder(input({ mode: 'daily', time: '06:00', text: 'Gym' }));
    const once = await m.index.saveReminder(input({ text: 'Submit' }));

    await m.index.markOutcome(daily.reminder.id, 'answered');
    await m.index.markOutcome(once.reminder.id, 'answered');
    await m.index.syncReminders('manual');

    const byId = Object.fromEntries(m.index.getSnapshot().reminders.map((r: any) => [r.id, r]));
    expect(byId[daily.reminder.id].status).toBe('scheduled');
    expect(byId[daily.reminder.id].last_fired_at).not.toBeNull();
    expect(byId[once.reminder.id].status).toBe('answered');
    expect(m.notif.cancelReminderNotification).toHaveBeenCalledWith(once.reminder.id);
  });
});

describe('outbox poison rule', () => {
  const httpError = (status: number) => Object.assign(new Error(`failed (${status})`), { kind: 'server', status });

  it('drops a 4xx op with a warning and keeps flushing the ops after it', async () => {
    const m = load();
    const server = fakeServer(m);
    await m.index.initReminders(USER);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    m.api.upsert.mockImplementation(async (row: any) => {
      if (row.id === 'bad-1') throw httpError(400);
      server.set(row.id, row);
      return row;
    });

    await m.index.saveReminder(input({ id: 'bad-1', text: 'rejected by server' }));
    await m.index.saveReminder(input({ id: 'good-1', text: 'accepted' }));
    await m.index.syncReminders('manual');

    expect(m.index.getSnapshot().outboxSize).toBe(0);
    expect(server.has('good-1')).toBe(true);
    expect(server.has('bad-1')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('bad-1'));
    warn.mockRestore();
  });

  it('keeps every op and stops the flush on a 5xx answer', async () => {
    const m = load();
    const server = fakeServer(m);
    await m.index.initReminders(USER);

    m.api.upsert.mockImplementation(async (row: any) => {
      if (row.id === 'down-1') throw httpError(500);
      server.set(row.id, row);
      return row;
    });

    await m.index.saveReminder(input({ id: 'down-1', text: 'server is down' }));
    await m.index.saveReminder(input({ id: 'queued-1', text: 'queued behind it' }));
    m.api.upsert.mockClear();
    await m.index.syncReminders('manual');

    expect(m.index.getSnapshot().outboxSize).toBe(2);
    expect(m.index.getSnapshot().syncError).toBe('server');
    expect(server.has('queued-1')).toBe(false);
    expect(m.api.upsert).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'queued-1' }));
  });
});
