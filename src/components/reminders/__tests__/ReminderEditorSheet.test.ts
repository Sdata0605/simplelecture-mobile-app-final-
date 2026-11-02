// Unit tests for the pure helpers behind the Reminders add/edit sheet (WP6).
// The React Native UI is not rendered here; its native and service dependencies are mocked.

jest.mock('react-native', () => ({
  StyleSheet: { create: (s: unknown) => s },
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  PixelRatio: { getFontScale: () => 1 },
  Alert: { alert: () => undefined },
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  Modal: 'Modal',
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('../../keyboard/keyboardStick', () => ({ KeyboardShiftView: 'KeyboardShiftView' }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker' }));
jest.mock('expo-av', () => ({ Audio: { Sound: { createAsync: () => Promise.reject(new Error('mock')) } } }));
jest.mock('../../callReminder/OptionPicker', () => ({ __esModule: true, default: 'OptionPicker' }));
jest.mock('../../../services/reminders', () => ({
  saveReminder: () => Promise.reject(new Error('not used in these tests')),
  getSnapshot: () => ({ reminders: [] }),
  previewVoice: () => Promise.reject(new Error('not used in these tests')),
}), { virtual: true });
jest.mock('../../../hooks/useReminderPermissions', () => ({
  useReminderPermissions: () => ({
    notifications: 'granted',
    requestNotifications: () => Promise.resolve(true),
  }),
}), { virtual: true });

import {
  buildInitialForm,
  buildSummary,
  counterTone,
  countOtherDailies,
  saveErrorMessage,
  saveLabel,
  submitReminder,
  toReminderInput,
  type SubmitDeps,
} from '../ReminderEditorSheet';
import { languageHint } from '../VoiceSettings';
import type { Reminder, ReminderInput } from '../../../types/reminder';
import type { SaveResult } from '../../../services/reminders';

const NOW = new Date(2026, 10, 2, 10, 0, 0, 0); // 2 Nov 2026, 10:00 local
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function baseInput(overrides: Partial<ReminderInput> = {}): ReminderInput {
  return {
    text: 'Go to college for your submission',
    kind: 'call',
    mode: 'once',
    date: '2026-11-15',
    time: '09:30',
    voice: 'shubh',
    language: 'en-IN',
    ...overrides,
  };
}

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Gym',
    message_text: 'Gym',
    scheduled_at: new Date(2026, 10, 3, 6, 0).toISOString(),
    repeat_rule: 'daily',
    kind: 'message',
    section: 'daily',
    time_of_day: '06:00:00',
    tz: 'Asia/Kolkata',
    enabled: true,
    call_enabled: false,
    voice: 'ritu',
    language: 'hi-IN',
    audio_path: null,
    audio_hash: null,
    audio_status: 'none',
    status: 'scheduled',
    last_fired_at: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function deps(overrides: Partial<SubmitDeps> = {}, log: string[] = []): SubmitDeps {
  const result = { reminder: reminder(), fireAt: null, state: 'scheduled', savedOffline: false } as SaveResult;
  return {
    save: jest.fn(async () => {
      log.push('save');
      return result;
    }) as unknown as SubmitDeps['save'],
    notificationPermission: 'granted',
    requestNotifications: jest.fn(async () => {
      log.push('requestNotifications');
      return true;
    }),
    existingDailyCount: 0,
    now: NOW,
    ...overrides,
  };
}

describe('counterTone', () => {
  it('is muted up to 439, warning from 440, error at 480', () => {
    expect(counterTone(0)).toBe('muted');
    expect(counterTone(439)).toBe('muted');
    expect(counterTone(440)).toBe('warning');
    expect(counterTone(479)).toBe('warning');
    expect(counterTone(480)).toBe('error');
  });
});

describe('saveLabel', () => {
  it('is Save for once and daily modes', () => {
    expect(saveLabel('once', '09:30', NOW, false)).toBe('Save');
    expect(saveLabel('daily', '06:00', NOW, false)).toBe('Save');
  });

  it('reads Set for tomorrow when today only has already passed', () => {
    expect(saveLabel('today_only', '09:00', NOW, false)).toBe('Set for tomorrow, 9:00 AM');
  });

  it('reads Save when today only is still ahead', () => {
    expect(saveLabel('today_only', '18:00', NOW, false)).toBe('Save');
  });

  it('shows Saving while a save is running', () => {
    expect(saveLabel('once', '09:30', NOW, true)).toBe('Saving...');
  });
});

describe('buildSummary', () => {
  it('describes a one-off reminder with weekday, date and time', () => {
    const weekday = WEEKDAYS[new Date(2026, 10, 15).getDay()];
    expect(buildSummary('once', '2026-11-15', '09:30', NOW)).toBe(`Rings on ${weekday}, 15 Nov at 9:30 AM`);
  });

  it('says today for a today-only time still ahead', () => {
    expect(buildSummary('today_only', '', '18:00', NOW)).toBe('Rings today at 6:00 PM');
  });

  it('says tomorrow, once for a today-only time already passed', () => {
    expect(buildSummary('today_only', '', '09:00', NOW)).toBe('Rings tomorrow at 9:00 AM, once');
  });

  it('describes a daily reminder and whether its first ring is today', () => {
    expect(buildSummary('daily', '', '06:00', NOW)).toBe('Rings every day at 6:00 AM. First: tomorrow');
    expect(buildSummary('daily', '', '18:00', NOW)).toBe('Rings every day at 6:00 PM. First: today');
  });

  it('returns an empty string for an invalid time', () => {
    expect(buildSummary('daily', '', 'bogus', NOW)).toBe('');
  });
});

describe('buildInitialForm', () => {
  it('starts a new reminder as Call, with the next full hour and the preset mode', () => {
    const form = buildInitialForm(NOW, undefined, { mode: 'daily' });
    expect(form).toMatchObject({ kind: 'call', mode: 'daily', time: '11:00', language: 'en-IN', voice: 'shubh' });
    expect(form.text).toBe('');
  });

  it('defaults a new Calendar reminder to once, on the preset date', () => {
    const form = buildInitialForm(NOW, undefined, { mode: 'once', date: '2026-11-20' });
    expect(form.mode).toBe('once');
    expect(form.date).toBe('2026-11-20');
  });

  it('loads an existing daily reminder through rowToMode and its stored time', () => {
    const form = buildInitialForm(NOW, reminder());
    expect(form).toMatchObject({ kind: 'message', text: 'Gym', mode: 'daily', time: '06:00', voice: 'ritu', language: 'hi-IN' });
  });

  it('loads an existing one-off reminder as once', () => {
    const at = new Date(2026, 10, 15, 9, 30).toISOString();
    const form = buildInitialForm(NOW, reminder({
      repeat_rule: 'none', section: 'calendar', time_of_day: null, scheduled_at: at, kind: 'call',
    }));
    expect(form).toMatchObject({ mode: 'once', date: '2026-11-15', time: '09:30', kind: 'call' });
  });
});

describe('languageHint', () => {
  it('suggests a check when Devanagari text uses English', () => {
    expect(languageHint('नमस्ते गाड़ी', 'en-IN')).toBe('Looks like Hindi or Marathi. Choose the voice language.');
  });

  it('is silent when the language already matches the script', () => {
    expect(languageHint('नमस्ते गाड़ी', 'hi-IN')).toBeNull();
    expect(languageHint('Go to gym', 'en-IN')).toBeNull();
  });
});

describe('countOtherDailies', () => {
  it('counts enabled daily reminders, excluding the one being edited', () => {
    const list = [
      reminder({ id: 'a' }),
      reminder({ id: 'b', enabled: false }),
      reminder({ id: 'c', repeat_rule: 'none', section: 'calendar' }),
      reminder({ id: 'd', status: 'cancelled' }),
      reminder({ id: 'e' }),
    ];
    expect(countOtherDailies(list)).toBe(2);
    expect(countOtherDailies(list, 'a')).toBe(1);
  });
});

describe('toReminderInput', () => {
  it('drops the date for non-once modes', () => {
    const form = { kind: 'call' as const, text: 'x', mode: 'daily' as const, date: '2026-11-15', time: '06:00', voice: 'shubh' as const, language: 'en-IN' as const };
    expect(toReminderInput(form, 'id-1').date).toBeUndefined();
    expect(toReminderInput({ ...form, mode: 'once' }, 'id-1').date).toBe('2026-11-15');
  });
});

describe('saveErrorMessage', () => {
  it('maps the per-user cap to a clear message and hides other errors behind a generic one', () => {
    expect(saveErrorMessage(new Error('reminder_limit'))).toMatch(/limit/);
    expect(saveErrorMessage(new Error('socket hang up'))).toMatch(/Couldn't save/);
  });
});

describe('submitReminder', () => {
  it('returns the validation error and never calls save when text is empty', async () => {
    const d = deps();
    const outcome = await submitReminder(baseInput({ text: '   ' }), undefined, d);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error?.field).toBe('text');
    expect(d.save).not.toHaveBeenCalled();
  });

  it('rejects a one-off time that has passed', async () => {
    const d = deps();
    const outcome = await submitReminder(baseInput({ date: '2026-11-02', time: '09:00' }), undefined, d);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toBe('That time has passed. Pick a later time.');
    expect(d.save).not.toHaveBeenCalled();
  });

  it('blocks the 21st daily reminder with the editor message', async () => {
    const d = deps({ existingDailyCount: 20 });
    const outcome = await submitReminder(baseInput({ mode: 'daily', date: undefined }), undefined, d);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toBe('You can have up to 20 daily reminders. Turn one off or delete one first.');
    expect(d.save).not.toHaveBeenCalled();
  });

  it('saves, then asks for notification permission on the first save', async () => {
    const log: string[] = [];
    const d = deps({ notificationPermission: 'undetermined' }, log);
    const input = baseInput();
    const outcome = await submitReminder(input, undefined, d);
    expect(outcome.ok).toBe(true);
    expect(d.save).toHaveBeenCalledWith(input, undefined);
    expect(log).toEqual(['save', 'requestNotifications']);
  });

  it('does not ask again once permission is decided', async () => {
    const d = deps({ notificationPermission: 'denied' });
    await submitReminder(baseInput(), undefined, d);
    expect(d.requestNotifications).not.toHaveBeenCalled();
  });

  it('treats a failed permission prompt as a successful save', async () => {
    const d = deps({
      notificationPermission: 'undetermined',
      requestNotifications: jest.fn(async () => { throw new Error('prompt failed'); }),
    });
    const outcome = await submitReminder(baseInput(), undefined, d);
    expect(outcome.ok).toBe(true);
  });

  it('reports a save failure with the mapped message', async () => {
    const d = deps({
      save: jest.fn(async () => { throw new Error('reminder_limit'); }) as unknown as SubmitDeps['save'],
    });
    const outcome = await submitReminder(baseInput(), undefined, d);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/limit/);
  });
});
