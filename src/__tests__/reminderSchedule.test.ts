// Tests for services/reminders/schedule.ts. Spec: _scratch/reminders-v2-plan.md D.1 to D.3 (worked examples in D.2).
// Device zone is Asia/Kolkata (UTC+05:30, no DST) for the main suite. The DST suite switches to Europe/London.
process.env.TZ = 'Asia/Kolkata';

import type { Reminder, ReminderInput } from '../types/reminder';
import {
  buildTrigger,
  fingerprint,
  formatTime12,
  inputToRow,
  localDateTime,
  nextFire,
  parseTime,
  planSchedule,
  rowToMode,
  todayOnlyLabel,
  validateInput,
} from '../services/reminders/schedule';

// 2 Nov 2026 14:00 IST.
const NOW_1400_IST = new Date('2026-11-02T08:30:00.000Z');

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r-1',
    user_id: 'u-1',
    title: 'Go to college',
    message_text: 'Go to college for your submission',
    scheduled_at: '2026-11-15T04:00:00.000Z',
    repeat_rule: 'none',
    kind: 'call',
    section: 'calendar',
    time_of_day: null,
    tz: 'Asia/Kolkata',
    enabled: true,
    call_enabled: true,
    voice: 'shubh',
    language: 'en-IN',
    audio_path: null,
    audio_hash: null,
    audio_status: 'none',
    status: 'scheduled',
    last_fired_at: null,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeInput(overrides: Partial<ReminderInput> = {}): ReminderInput {
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

describe('test zone', () => {
  it('runs in Asia/Kolkata (UTC+05:30), which the main suite depends on', () => {
    // Jest sandboxes process.env, so setting TZ above may not reach the Date engine.
    // Run this suite on a machine set to Asia/Kolkata (or set TZ in the jest config).
    expect(new Date(2026, 10, 2, 14).getTimezoneOffset()).toBe(-330);
  });
});

describe('time helpers', () => {
  it('parseTime accepts HH:MM and HH:MM:SS and rejects bad input', () => {
    expect(parseTime('06:00')).toEqual({ hour: 6, minute: 0 });
    expect(parseTime('21:30:00')).toEqual({ hour: 21, minute: 30 });
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('12:60')).toBeNull();
    expect(parseTime('abc')).toBeNull();
    expect(parseTime(null)).toBeNull();
  });

  it('formatTime12 produces 12-hour labels', () => {
    expect(formatTime12(6, 0)).toBe('6:00 AM');
    expect(formatTime12(0, 5)).toBe('12:05 AM');
    expect(formatTime12(12, 0)).toBe('12:00 PM');
    expect(formatTime12(21, 30)).toBe('9:30 PM');
  });

  it('localDateTime builds a local Date from date key and time', () => {
    const d = localDateTime('2026-11-15', '09:30');
    expect(d?.toISOString()).toBe('2026-11-15T04:00:00.000Z');
    expect(localDateTime('2026-13-01', '09:30')).toBeNull();
  });
});

describe('D.2 worked examples (device Asia/Kolkata)', () => {
  it('example 1: one-off on 15 Nov 09:30 IST maps to the absolute instant', () => {
    const row = inputToRow(makeInput(), 'r-1', NOW_1400_IST, 'Asia/Kolkata');
    expect(row.section).toBe('calendar');
    expect(row.repeat_rule).toBe('none');
    expect(row.scheduled_at).toBe('2026-11-15T04:00:00.000Z');
    expect(row.time_of_day).toBeNull();
    expect(row.tz).toBe('Asia/Kolkata');
    expect(row.call_enabled).toBe(true);
    expect(buildTrigger(row)).toEqual({
      type: 'date',
      date: new Date('2026-11-15T04:00:00.000Z'),
      channelId: 'reminder-call-v2',
    });
  });

  it('example 2: daily 06:00 created at 14:00 first rings tomorrow at 06:00', () => {
    const row = inputToRow(makeInput({ mode: 'daily', date: undefined, time: '06:00', kind: 'message' }), 'd-1', NOW_1400_IST, 'Asia/Kolkata');
    expect(row.section).toBe('daily');
    expect(row.repeat_rule).toBe('daily');
    expect(row.time_of_day).toBe('06:00');
    expect(row.scheduled_at).toBe('2026-11-03T00:30:00.000Z');
    expect(buildTrigger(row)).toEqual({ type: 'daily', hour: 6, minute: 0, channelId: 'reminder-message' });
  });

  it('example 2: daily 06:00 created at 05:00 first rings today at 06:00', () => {
    const now0500 = new Date('2026-11-01T23:30:00.000Z'); // 2 Nov 05:00 IST
    const daily = makeReminder({ repeat_rule: 'daily', section: 'daily', time_of_day: '06:00', kind: 'message', call_enabled: false });
    expect(nextFire(daily, now0500)?.toISOString()).toBe('2026-11-02T00:30:00.000Z');
  });

  it('example 3: today-only 18:00 set at 17:50 is stored for today', () => {
    const now1750 = new Date('2026-11-02T12:20:00.000Z'); // 17:50 IST
    const row = inputToRow(makeInput({ mode: 'today_only', date: undefined, time: '18:00' }), 't-1', now1750, 'Asia/Kolkata');
    expect(row.section).toBe('daily');
    expect(row.repeat_rule).toBe('none');
    expect(row.scheduled_at).toBe('2026-11-02T12:30:00.000Z');
    expect(todayOnlyLabel('18:00', now1750)).toBe('Today only');
  });

  it('example 3 variant: today-only 18:00 set at 18:30 becomes tomorrow', () => {
    const now1830 = new Date('2026-11-02T13:00:00.000Z'); // 18:30 IST
    const row = inputToRow(makeInput({ mode: 'today_only', date: undefined, time: '18:00' }), 't-2', now1830, 'Asia/Kolkata');
    expect(row.scheduled_at).toBe('2026-11-03T12:30:00.000Z');
    expect(todayOnlyLabel('18:00', now1830)).toBe('Tomorrow only');
  });

  it('example 4: daily edited at 14:00 to 21:00 rings today at 21:00', () => {
    const daily = makeReminder({ repeat_rule: 'daily', section: 'daily', time_of_day: '21:00', scheduled_at: '2026-11-02T15:30:00.000Z' });
    expect(nextFire(daily, NOW_1400_IST)?.toISOString()).toBe('2026-11-02T15:30:00.000Z');
  });

  it('example 4: daily edited at 14:00 to 07:00 rings tomorrow at 07:00', () => {
    const daily = makeReminder({ repeat_rule: 'daily', section: 'daily', time_of_day: '07:00' });
    expect(nextFire(daily, NOW_1400_IST)?.toISOString()).toBe('2026-11-03T01:30:00.000Z');
  });

  it('example 4: daily edited at 14:00 to 14:00 rings tomorrow (5 s rule)', () => {
    const daily = makeReminder({ repeat_rule: 'daily', section: 'daily', time_of_day: '14:00' });
    expect(nextFire(daily, NOW_1400_IST)?.toISOString()).toBe('2026-11-03T08:30:00.000Z');
  });

  it('example 4: daily 14:00 seen at 14:00:03 is still treated as this minute and moves to tomorrow', () => {
    const daily = makeReminder({ repeat_rule: 'daily', section: 'daily', time_of_day: '14:00' });
    const at = new Date('2026-11-02T08:30:03.000Z');
    expect(nextFire(daily, at)?.toISOString()).toBe('2026-11-03T08:30:00.000Z');
  });

  it('example 5: a one-off already in the past has no next fire', () => {
    const past = makeReminder({ scheduled_at: '2026-11-02T06:00:00.000Z' });
    expect(nextFire(past, NOW_1400_IST)).toBeNull();
  });

  it('example 5: validation blocks a one-off in the past', () => {
    const err = validateInput(makeInput({ date: '2026-11-02', time: '09:00' }), NOW_1400_IST, 0);
    expect(err).toEqual({ field: 'time', message: 'That time has passed. Pick a later time.' });
  });

  it('example 5: today-only in the past is valid (switches to tomorrow, no error)', () => {
    expect(validateInput(makeInput({ mode: 'today_only', date: undefined, time: '09:00' }), NOW_1400_IST, 0)).toBeNull();
  });

  it('example 5: daily in the past is valid (starts tomorrow)', () => {
    expect(validateInput(makeInput({ mode: 'daily', date: undefined, time: '09:00' }), NOW_1400_IST, 0)).toBeNull();
  });
});

describe('nextFire and the 60 s lead rule', () => {
  it('one-off at exactly now + 60 s fails validation (must be strictly later)', () => {
    const at = new Date(NOW_1400_IST.getTime() + 60_000);
    const now = new Date(NOW_1400_IST);
    const h = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    const err = validateInput(makeInput({ date: '2026-11-02', time: h }), now, 0);
    expect(err?.field).toBe('time');
  });

  it('legacy weekdays and weekly rows behave as daily', () => {
    const weekdays = makeReminder({ repeat_rule: 'weekdays', section: 'daily', time_of_day: '07:15' });
    const weekly = makeReminder({ repeat_rule: 'weekly', section: 'daily', time_of_day: '07:15' });
    expect(rowToMode(weekdays)).toBe('daily');
    expect(rowToMode(weekly)).toBe('daily');
    expect(buildTrigger(weekdays)).toEqual({ type: 'daily', hour: 7, minute: 15, channelId: 'reminder-call-v2' });
    expect(nextFire(weekly, NOW_1400_IST)?.toISOString()).toBe('2026-11-03T01:45:00.000Z');
  });

  it('disabled and cancelled reminders have no next fire', () => {
    expect(nextFire(makeReminder({ enabled: false }), NOW_1400_IST)).toBeNull();
    expect(nextFire(makeReminder({ status: 'cancelled' }), NOW_1400_IST)).toBeNull();
  });

  it('rowToMode maps section and repeat to the three UI modes', () => {
    expect(rowToMode({ section: 'calendar', repeat_rule: 'none' })).toBe('once');
    expect(rowToMode({ section: 'daily', repeat_rule: 'none' })).toBe('today_only');
    expect(rowToMode({ section: 'daily', repeat_rule: 'daily' })).toBe('daily');
  });
});

describe('planSchedule budget', () => {
  it('20 dailies plus 30 one-offs schedules 38: all dailies and the 18 soonest one-offs', () => {
    const dailies: Reminder[] = Array.from({ length: 20 }, (_, i) =>
      makeReminder({
        id: `d-${String(i).padStart(2, '0')}`,
        repeat_rule: 'daily',
        section: 'daily',
        time_of_day: `${String(5 + (i % 10)).padStart(2, '0')}:${i < 10 ? '00' : '30'}`,
        scheduled_at: '2026-11-03T00:00:00.000Z',
      }),
    );
    const oneOffs: Reminder[] = Array.from({ length: 30 }, (_, i) =>
      makeReminder({
        id: `o-${String(i).padStart(2, '0')}`,
        scheduled_at: new Date(NOW_1400_IST.getTime() + (i + 1) * 3_600_000).toISOString(),
      }),
    );

    const plan = planSchedule([...oneOffs.slice().reverse(), ...dailies], NOW_1400_IST, 38);

    expect(plan.scheduled).toHaveLength(38);
    expect(plan.scheduled.filter(p => p.trigger.type === 'daily')).toHaveLength(20);
    const scheduledOneOffIds = plan.scheduled.filter(p => p.trigger.type === 'date').map(p => p.id);
    expect(scheduledOneOffIds).toEqual(oneOffs.slice(0, 18).map(r => r.id));
    expect(plan.queued).toHaveLength(12);
    expect(plan.queued).toEqual(oneOffs.slice(18).map(r => r.id));
    expect(plan.scheduled[0].identifier).toBe(`reminder-${plan.scheduled[0].id}`);
  });

  it('uses the default budget of 38', () => {
    const oneOffs: Reminder[] = Array.from({ length: 40 }, (_, i) =>
      makeReminder({
        id: `x-${i}`,
        scheduled_at: new Date(NOW_1400_IST.getTime() + (i + 1) * 60_000).toISOString(),
      }),
    );
    const plan = planSchedule(oneOffs, NOW_1400_IST);
    expect(plan.scheduled).toHaveLength(38);
    expect(plan.queued).toHaveLength(2);
  });
});

describe('fingerprint', () => {
  it('is stable for the same input and changes when the text changes', () => {
    const r = makeReminder();
    const trigger = buildTrigger(r);
    if (!trigger) throw new Error('trigger expected');
    const a = fingerprint(r, trigger);
    expect(fingerprint(r, trigger)).toBe(a);
    expect(fingerprint({ ...r, message_text: 'Other text' }, trigger)).not.toBe(a);
  });
});

describe('validateInput', () => {
  const now = NOW_1400_IST;

  it('rejects empty text and text over 480 characters', () => {
    expect(validateInput(makeInput({ text: '   ' }), now, 0)?.field).toBe('text');
    expect(validateInput(makeInput({ text: 'a'.repeat(481) }), now, 0)?.field).toBe('text');
    expect(validateInput(makeInput({ text: 'a'.repeat(480) }), now, 0)).toBeNull();
  });

  it('rejects a call whose text is emoji only', () => {
    const err = validateInput(makeInput({ text: '\u{1F389}\u{1F389}' }), now, 0);
    expect(err).toEqual({ field: 'text', message: 'Add some words so the voice can read it.' });
  });

  it('allows an emoji-only message (no voice needed)', () => {
    expect(validateInput(makeInput({ kind: 'message', text: '\u{1F389}' }), now, 0)).toBeNull();
  });

  it('blocks a 21st daily reminder', () => {
    const err = validateInput(makeInput({ mode: 'daily', date: undefined, time: '06:00' }), now, 20);
    expect(err).toEqual({
      field: 'daily',
      message: 'You can have up to 20 daily reminders. Turn one off or delete one first.',
    });
    expect(validateInput(makeInput({ mode: 'daily', date: undefined, time: '06:00' }), now, 19)).toBeNull();
  });

  it('requires a date for a one-off', () => {
    expect(validateInput(makeInput({ date: undefined }), now, 0)?.field).toBe('date');
  });
});

describe('inputToRow mapping details', () => {
  it('title is the first line of the text, cut to 80 characters; call_enabled mirrors kind', () => {
    const long = `${'x'.repeat(100)}\nsecond line`;
    const row = inputToRow(makeInput({ text: long, kind: 'notification' }), 'id-1', NOW_1400_IST, 'Asia/Kolkata');
    expect(row.title).toHaveLength(80);
    expect(row.call_enabled).toBe(false);
    expect(row.kind).toBe('notification');
  });
});

// The DST suite needs the machine zone to be Europe/London (see the 'test zone' note above).
const onLondonMachine = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/London';
(onLondonMachine ? describe : describe.skip)('Europe/London DST', () => {

  it('spring forward 28 Mar 2027: a 01:30 daily does not exist and lands at 02:30 BST', () => {
    const now = new Date(2027, 2, 27, 12, 0, 0, 0); // 27 Mar 2027 12:00 local
    const daily = makeReminder({ repeat_rule: 'daily', section: 'daily', time_of_day: '01:30' });
    const fire = nextFire(daily, now);
    expect(fire).not.toBeNull();
    expect(fire?.getDate()).toBe(28);
    expect(fire?.getMonth()).toBe(2);
    expect(fire?.getHours()).toBe(2);
    expect(fire?.getMinutes()).toBe(30);
  });

  it('fall back 31 Oct 2027: a 01:30 daily fires once, at the first (BST) occurrence', () => {
    const now = new Date(2027, 9, 30, 12, 0, 0, 0); // 30 Oct 2027 12:00 local
    const daily = makeReminder({ repeat_rule: 'daily', section: 'daily', time_of_day: '01:30' });
    const fire = nextFire(daily, now);
    expect(fire?.toISOString()).toBe('2027-10-31T00:30:00.000Z');
  });
});
