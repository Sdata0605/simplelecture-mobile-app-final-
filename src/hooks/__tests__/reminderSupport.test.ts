/**
 * WP6 tests for src/hooks/useTimetableReminderSupport.ts (plan F.1, I.1 "reminderSupport").
 *
 * The hook cannot be rendered here (no @testing-library/react-native installed), so these
 * tests target the pure probe the hook calls: `probeReminderSupport()`. WP5 must export it
 * from the hook file; if it is named differently, update the import below and report it.
 *
 * The support probe is a REST GET on study_timetable_sessions?select=reminder_channel&limit=1.
 * 200 = column exists ('full'); 400 with a column error = 'basic'.
 * Fetch is controlled through the global.__fetchImpl delegator installed in jest.setup.js.
 */
jest.mock('react-native', () => ({ Platform: { OS: 'android', select: (o: any) => o.android ?? o.default } }));
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const global: any;

function jsonResponse(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

async function clearStorage() {
  const keys = await AsyncStorage.getAllKeys();
  if (keys.length) await AsyncStorage.multiRemove(keys);
}

function loadProbe(env: Record<string, string | undefined> = {}) {
  let mod: any;
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  jest.isolateModules(() => {
    mod = require('../useTimetableReminderSupport');
  });
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  return mod;
}

const COLUMN_ERROR = {
  code: '42703',
  message: 'column study_timetable_sessions.reminder_channel does not exist',
};

describe('probeReminderSupport', () => {
  beforeEach(async () => {
    await clearStorage();
  });

  afterEach(() => {
    global.__fetchImpl = async () => {
      throw new Error('fetch not programmed for this test');
    };
  });

  it('returns full when the probe answers 200', async () => {
    global.__fetchImpl = async () => jsonResponse(200, [{ reminder_channel: 'notification' }]);
    const { probeReminderSupport } = loadProbe({ EXPO_PUBLIC_TT_REMINDERS: undefined });
    const result = await probeReminderSupport();
    expect(result.status).toBe('full');
    expect(result.channels).toEqual(expect.arrayContaining(['notification', 'message', 'email', 'none']));
  });

  it('returns basic when the probe answers 400 with a column error', async () => {
    global.__fetchImpl = async () => jsonResponse(400, COLUMN_ERROR);
    const { probeReminderSupport } = loadProbe({ EXPO_PUBLIC_TT_REMINDERS: undefined });
    const result = await probeReminderSupport();
    expect(result.status).toBe('basic');
    expect(result.channels).toEqual(['notification', 'none']);
  });

  it('keeps the cached full value when the network fails after a good probe', async () => {
    const { probeReminderSupport } = loadProbe({ EXPO_PUBLIC_TT_REMINDERS: undefined });
    global.__fetchImpl = async () => jsonResponse(200, []);
    expect((await probeReminderSupport()).status).toBe('full');

    global.__fetchImpl = async () => {
      throw new TypeError('Network request failed');
    };
    expect((await probeReminderSupport()).status).toBe('full');
  });

  it('returns basic when the network fails and nothing is cached', async () => {
    global.__fetchImpl = async () => {
      throw new TypeError('Network request failed');
    };
    const { probeReminderSupport } = loadProbe({ EXPO_PUBLIC_TT_REMINDERS: undefined });
    const result = await probeReminderSupport();
    expect(result.status).toBe('basic');
  });

  it('exposes the call channel only when EXPO_PUBLIC_TT_REMINDERS and the reminders flag are on', async () => {
    global.__fetchImpl = async () => jsonResponse(200, []);

    const off = loadProbe({ EXPO_PUBLIC_REMINDERS_V2: '1', EXPO_PUBLIC_TT_REMINDERS: undefined });
    const offResult = await off.probeReminderSupport();
    expect(offResult.call).toBe(false);
    expect(offResult.channels).not.toContain('call');

    await clearStorage();
    const on = loadProbe({ EXPO_PUBLIC_REMINDERS_V2: '1', EXPO_PUBLIC_TT_REMINDERS: '1' });
    const onResult = await on.probeReminderSupport();
    expect(onResult.call).toBe(true);
    expect(onResult.channels).toContain('call');
  });

  it('never exposes call in basic mode', async () => {
    global.__fetchImpl = async () => jsonResponse(400, COLUMN_ERROR);
    const on = loadProbe({ EXPO_PUBLIC_REMINDERS_V2: '1', EXPO_PUBLIC_TT_REMINDERS: '1' });
    const result = await on.probeReminderSupport();
    expect(result.status).toBe('basic');
    expect(result.channels).not.toContain('call');
  });
});
