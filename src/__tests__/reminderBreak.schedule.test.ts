// Break-it tests for services/reminders/schedule.ts and spokenScript.ts.
// Spec: _scratch/reminders-v2-plan.md section H (break-it list) and D.1 to D.5.
// Scope: time, date, daily repeat, Today-only rollover, DST, 64-slot budget, long/emoji/Indian-script text,
// and odd time strings. These tests are written to find defects; some are expected to fail.
process.env.TZ = 'Asia/Kolkata';

import type { Reminder, ReminderInput } from '../types/reminder';
import { LIMITS } from '../types/reminder';
import {
  buildTrigger,
  fingerprint,
  formatTime12,
  inputToRow,
  localDateTime,
  nextFire,
  parseTime,
  planSchedule,
  todayOnlyLabel,
  validateInput,
} from '../services/reminders/schedule';
import { SPOKEN_MAX_CHARS, spokenScript } from '../services/reminders/spokenScript';

// Device zone is Asia/Kolkata (UTC+05:30). ist('2026-11-02T14:00:00') is 14:00 IST.
function ist(local: string): Date {
  return new Date(`${local}+05:30`);
}

function row(overrides: Partial<Reminder> = {}): Reminder {
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

function dailyRow(id: string, time: string, overrides: Partial<Reminder> = {}): Reminder {
  return row({
    id,
    repeat_rule: 'daily',
    section: 'daily',
    time_of_day: time,
    scheduled_at: '2026-11-02T00:00:00.000Z',
    ...overrides,
  });
}

function onceRow(id: string, at: string, overrides: Partial<Reminder> = {}): Reminder {
  return row({ id, scheduled_at: at, ...overrides });
}

function input(overrides: Partial<ReminderInput> = {}): ReminderInput {
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

// Counts code points, which is what the voice and a human reader count.
function codePoints(s: string): number {
  return Array.from(s).length;
}

describe('parseTime and formatTime12 edge values', () => {
  it('accepts 00:00 and 23:59', () => {
    expect(parseTime('00:00')).toEqual({ hour: 0, minute: 0 });
    expect(parseTime('23:59')).toEqual({ hour: 23, minute: 59 });
  });

  it('rejects 24:00 in both HH:MM and HH:MM:SS forms', () => {
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('24:00:00')).toBeNull();
  });

  it('rejects minute 60 and out-of-range seconds', () => {
    expect(parseTime('23:60')).toBeNull();
    expect(parseTime('09:30:99')).toBeNull(); // seconds are not range-checked: expected null
    expect(parseTime('09:30:60')).toBeNull();
  });

  it('rejects empty, whitespace-only, null and undefined input', () => {
    expect(parseTime('')).toBeNull();
    expect(parseTime('   ')).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(parseTime(undefined)).toBeNull();
  });

  it('rejects malformed strings', () => {
    for (const bad of ['6:00', '1230', '06:30pm', '06:0a', '+6:00', '06-00', '06:30:00.000', '٦٦:٠٠']) {
      expect(parseTime(bad)).toBeNull();
    }
  });

  it('trims surrounding whitespace and accepts HH:MM:SS from PostgREST', () => {
    expect(parseTime(' 06:00 ')).toEqual({ hour: 6, minute: 0 });
    expect(parseTime('06:00:00')).toEqual({ hour: 6, minute: 0 });
  });

  it('formats midnight, noon and 23:59 in 12-hour form', () => {
    expect(formatTime12(0, 0)).toBe('12:00 AM');
    expect(formatTime12(12, 0)).toBe('12:00 PM');
    expect(formatTime12(23, 59)).toBe('11:59 PM');
  });
});

describe('localDateTime date rollover', () => {
  it('rejects 29 Feb in a non-leap year and accepts it in a leap year', () => {
    expect(localDateTime('2026-02-29', '09:00')).toBeNull();
    expect(localDateTime('2028-02-29', '09:00')).not.toBeNull();
  });

  it('rejects month 00 and month 13 and malformed date keys', () => {
    expect(localDateTime('2026-13-01', '09:00')).toBeNull();
    expect(localDateTime('2026-00-10', '09:00')).toBeNull();
    expect(localDateTime('2026-1-5', '09:00')).toBeNull();
    expect(localDateTime('2026-11-02 ', '09:00')).toBeNull();
    expect(localDateTime('', '')).toBeNull();
  });

  it('rejects 24:00 and empty time', () => {
    expect(localDateTime('2026-11-02', '24:00')).toBeNull();
    expect(localDateTime('2026-11-02', '')).toBeNull();
  });

  it('keeps the year for years below 100 (JS maps 0-99 to 1900-1999)', () => {
    const d = localDateTime('0050-06-15', '09:00');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(50); // expected 50, JS gives 1950
  });
});

describe('daily repeat boundaries (D.1, H 4 and 5)', () => {
  it('created at 23:58 for 23:59 rings today at 23:59', () => {
    const f = nextFire(dailyRow('d', '23:59'), ist('2026-11-02T23:58:00'));
    expect(f?.getTime()).toBe(ist('2026-11-02T23:59:00').getTime());
  });

  it('after the 23:59 ring, the next fire is 23:59 tomorrow', () => {
    const f = nextFire(dailyRow('d', '23:59'), ist('2026-11-02T23:59:01'));
    expect(f?.getTime()).toBe(ist('2026-11-03T23:59:00').getTime());
  });

  it('daily 00:00 created at 23:59:30 rings at the next local midnight', () => {
    const f = nextFire(dailyRow('d', '00:00'), ist('2026-11-02T23:59:30'));
    expect(f?.getTime()).toBe(ist('2026-11-03T00:00:00').getTime());
  });

  it('daily 00:00 exactly at midnight schedules the next day, not now', () => {
    const f = nextFire(dailyRow('d', '00:00'), ist('2026-11-03T00:00:00'));
    expect(f?.getTime()).toBe(ist('2026-11-04T00:00:00').getTime());
  });

  it('5 s rule: exactly 5 s ahead goes to tomorrow, 6 s ahead stays today', () => {
    const at5 = nextFire(dailyRow('d', '10:00'), ist('2026-11-02T09:59:55'));
    expect(at5?.getTime()).toBe(ist('2026-11-03T10:00:00').getTime());
    const at6 = nextFire(dailyRow('d', '10:00'), ist('2026-11-02T09:59:54'));
    expect(at6?.getTime()).toBe(ist('2026-11-02T10:00:00').getTime());
  });

  it('rolls over the year end (31 Dec 23:59 to 1 Jan 00:00)', () => {
    const f = nextFire(dailyRow('d', '00:00'), ist('2026-12-31T23:59:30'));
    expect(f?.getTime()).toBe(ist('2027-01-01T00:00:00').getTime());
  });

  it('rolls over the leap day (28 Feb 2028 to 29 Feb 2028)', () => {
    const f = nextFire(dailyRow('d', '06:00'), ist('2028-02-28T23:59:59'));
    expect(f?.getTime()).toBe(ist('2028-02-29T06:00:00').getTime());
  });

  it('treats legacy weekdays and weekly rules as daily', () => {
    for (const rule of ['weekdays', 'weekly'] as const) {
      const f = nextFire(dailyRow('d', '07:15', { repeat_rule: rule }), ist('2026-11-02T14:00:00'));
      expect(f?.getTime()).toBe(ist('2026-11-03T07:15:00').getTime());
    }
  });

  it('accepts HH:MM:SS in time_of_day', () => {
    const f = nextFire(dailyRow('d', '06:00:00'), ist('2026-11-02T05:00:00'));
    expect(f?.getTime()).toBe(ist('2026-11-02T06:00:00').getTime());
  });

  it('falls back to the scheduled_at clock when time_of_day is 24:00', () => {
    const f = nextFire(dailyRow('d', '24:00', { scheduled_at: '2026-11-15T06:30:00+05:30' }), ist('2026-11-02T14:00:00'));
    expect(f?.getTime()).toBe(ist('2026-11-03T06:30:00').getTime());
  });

  it('returns null when time_of_day is empty and scheduled_at is garbage', () => {
    expect(nextFire(dailyRow('d', '', { scheduled_at: 'garbage' }), ist('2026-11-02T14:00:00'))).toBeNull();
  });

  it('returns null when disabled or cancelled', () => {
    expect(nextFire(dailyRow('d', '06:00', { enabled: false }), ist('2026-11-02T05:00:00'))).toBeNull();
    expect(nextFire(dailyRow('d', '06:00', { status: 'cancelled' }), ist('2026-11-02T05:00:00'))).toBeNull();
  });

  it('toggled off at 05:59:58 for 06:00 never rings on later days', () => {
    const f = nextFire(dailyRow('d', '06:00'), ist('2026-11-02T05:59:58'));
    expect(f?.getTime()).toBe(ist('2026-11-03T06:00:00').getTime());
  });
});

describe('one-off instants', () => {
  it('scheduled_at equal to now is not scheduled', () => {
    const now = ist('2026-11-15T09:30:00');
    expect(nextFire(onceRow('o', now.toISOString()), now)).toBeNull();
  });

  it('scheduled_at 1 ms in the future is scheduled', () => {
    const now = ist('2026-11-15T09:30:00');
    const at = new Date(now.getTime() + 1);
    expect(nextFire(onceRow('o', at.toISOString()), now)?.getTime()).toBe(at.getTime());
  });

  it('delivered or answered one-offs return null even when in the future', () => {
    const now = ist('2026-11-02T14:00:00');
    const at = ist('2026-11-02T18:00:00').toISOString();
    expect(nextFire(onceRow('o', at, { status: 'delivered' }), now)).toBeNull();
    expect(nextFire(onceRow('o', at, { status: 'answered' }), now)).toBeNull();
  });

  it('invalid scheduled_at returns null and builds no trigger', () => {
    const r = onceRow('o', 'not-a-date');
    expect(nextFire(r, ist('2026-11-02T14:00:00'))).toBeNull();
    expect(buildTrigger(r)).toBeNull();
  });
});

describe('Today-only rollover (H 2 and 37, D.2 example 3)', () => {
  const now1400 = ist('2026-11-02T14:00:00');

  it('today 18:00 set at 14:00 is scheduled today at 18:00 IST', () => {
    const r = inputToRow(input({ mode: 'today_only', time: '18:00' }), 'x', now1400);
    expect(r.scheduled_at).toBe(ist('2026-11-02T18:00:00').toISOString());
    expect(r.section).toBe('daily');
    expect(r.repeat_rule).toBe('none');
  });

  it('exactly 60 s ahead rolls to tomorrow (strict greater-than)', () => {
    const now = ist('2026-11-02T17:59:00');
    expect(todayOnlyLabel('18:00', now)).toBe('Tomorrow only');
    const r = inputToRow(input({ mode: 'today_only', time: '18:00' }), 'x', now);
    expect(r.scheduled_at).toBe(ist('2026-11-03T18:00:00').toISOString());
  });

  it('61 s ahead stays today', () => {
    const now = ist('2026-11-02T17:58:59');
    expect(todayOnlyLabel('18:00', now)).toBe('Today only');
    const r = inputToRow(input({ mode: 'today_only', time: '18:00' }), 'x', now);
    expect(r.scheduled_at).toBe(ist('2026-11-02T18:00:00').toISOString());
  });

  it('set at 18:00:30 for 18:00 rolls to tomorrow', () => {
    const r = inputToRow(input({ mode: 'today_only', time: '18:00' }), 'x', ist('2026-11-02T18:00:30'));
    expect(r.scheduled_at).toBe(ist('2026-11-03T18:00:00').toISOString());
  });

  it('00:00 set at 23:30 rolls to tomorrow midnight', () => {
    const r = inputToRow(input({ mode: 'today_only', time: '00:00' }), 'x', ist('2026-11-02T23:30:00'));
    expect(r.scheduled_at).toBe(ist('2026-11-03T00:00:00').toISOString());
  });

  it('24:00 input does not produce a schedulable row (must not become a DATE trigger at now)', () => {
    const r = inputToRow(input({ mode: 'today_only', time: '24:00' }), 'x', now1400);
    expect(buildTrigger(r)).toBeNull(); // expected null, current code falls back to now
  });

  it('a fired Today-only row (status delivered) does not fire again', () => {
    const r = onceRow('t', ist('2026-11-02T18:00:00').toISOString(), { section: 'daily', status: 'delivered' });
    expect(nextFire(r, ist('2026-11-02T18:05:00'))).toBeNull();
  });
});

describe('inputToRow daily and malformed times', () => {
  it('daily 06:00 created at 14:00 writes time_of_day 06:00 and the next fire tomorrow', () => {
    const r = inputToRow(input({ mode: 'daily', time: '06:00' }), 'x', ist('2026-11-02T14:00:00'));
    expect(r.time_of_day).toBe('06:00');
    expect(r.scheduled_at).toBe(ist('2026-11-03T06:00:00').toISOString());
    expect(r.repeat_rule).toBe('daily');
  });

  it('daily time 00:00 is stored as 00:00 (not null)', () => {
    const r = inputToRow(input({ mode: 'daily', time: '00:00' }), 'x', ist('2026-11-02T14:00:00'));
    expect(r.time_of_day).toBe('00:00');
  });

  it('HH:MM:SS input for a once reminder is normalised the same way', () => {
    const r = inputToRow(input({ mode: 'once', time: '09:30:00' }), 'x', ist('2026-11-02T14:00:00'));
    expect(r.scheduled_at).toBe('2026-11-15T04:00:00.000Z');
  });

  it('malformed daily time (6:00) must not yield a daily trigger at the current clock time', () => {
    const now = ist('2026-11-02T14:37:00');
    const r = inputToRow(input({ mode: 'daily', time: '6:00' }), 'x', now);
    expect(buildTrigger(r)).toBeNull(); // current code builds a DAILY trigger at 14:37 from scheduled_at=now
  });

  it('daily with empty time is rejected by validation and the row has no daily trigger', () => {
    const now = ist('2026-11-02T14:37:00');
    const r = inputToRow(input({ mode: 'daily', time: '' }), 'x', now);
    expect(buildTrigger(r)).toBeNull();
  });
});

describe('inputToRow title and text length', () => {
  it('title is capped at 80 characters while message_text keeps all 480', () => {
    const text = 'a'.repeat(480);
    const r = inputToRow(input({ text }), 'x', ist('2026-11-02T14:00:00'));
    expect(r.title.length).toBe(LIMITS.titleMax);
    expect(r.message_text.length).toBe(480);
  });

  it('title never splits an emoji surrogate pair at the 80-unit cut', () => {
    const text = 'a'.repeat(79) + '😀' + 'b';
    const r = inputToRow(input({ text }), 'x', ist('2026-11-02T14:00:00'));
    // A lone high surrogate at the end of title means the cut split the pair.
    expect(/[\uD800-\uDBFF]$/.test(r.title)).toBe(false);
  });

  it('title is the first line only, after trimming leading blank lines', () => {
    const r = inputToRow(input({ text: '\n\n  Call Mom  \nlater' }), 'x', ist('2026-11-02T14:00:00'));
    expect(r.title).toBe('Call Mom');
    expect(r.message_text).toBe('Call Mom  \nlater');
  });
});

describe('validateInput time and date rules (H 1 to 3, 16)', () => {
  const now1400_30 = ist('2026-11-02T14:00:30');

  it('once for the current minute is an inline time error', () => {
    const err = validateInput(input({ date: '2026-11-02', time: '14:00' }), now1400_30, 0);
    expect(err?.field).toBe('time');
  });

  it('once exactly 60 s ahead is rejected (minimum lead is strictly more than 60 s)', () => {
    const now = ist('2026-11-02T14:00:00');
    const err = validateInput(input({ date: '2026-11-02', time: '14:01' }), now, 0);
    expect(err?.field).toBe('time');
  });

  it('once 90 s ahead is accepted', () => {
    expect(validateInput(input({ date: '2026-11-02', time: '14:02' }), now1400_30, 0)).toBeNull();
  });

  it('once one hour in the past is rejected', () => {
    expect(validateInput(input({ date: '2026-11-02', time: '13:00' }), now1400_30, 0)?.field).toBe('time');
  });

  it('impossible dates are rejected as date errors', () => {
    expect(validateInput(input({ date: '2026-02-31' }), now1400_30, 0)?.field).toBe('date');
    expect(validateInput(input({ date: '2026-13-01' }), now1400_30, 0)?.field).toBe('date');
    expect(validateInput(input({ date: '2027-02-29' }), now1400_30, 0)?.field).toBe('date');
    expect(validateInput(input({ date: '' }), now1400_30, 0)?.field).toBe('date');
  });

  it('empty, 24:00 and 6:00 times are rejected as time errors', () => {
    expect(validateInput(input({ time: '' }), now1400_30, 0)?.field).toBe('time');
    expect(validateInput(input({ time: '24:00' }), now1400_30, 0)?.field).toBe('time');
    expect(validateInput(input({ time: '6:00' }), now1400_30, 0)?.field).toBe('time');
  });

  it('daily with 24:00 is rejected as a time error', () => {
    expect(validateInput(input({ mode: 'daily', time: '24:00' }), now1400_30, 0)?.field).toBe('time');
  });

  it('today only never errors on time, even at the current minute', () => {
    expect(validateInput(input({ mode: 'today_only', time: '14:00' }), now1400_30, 0)).toBeNull();
  });

  it('21st daily reminder is blocked, 20th is allowed (H 16)', () => {
    expect(validateInput(input({ mode: 'daily', time: '06:00' }), now1400_30, 19)).toBeNull();
    expect(validateInput(input({ mode: 'daily', time: '06:00' }), now1400_30, 20)?.field).toBe('daily');
  });

  it('daily count does not block once or today-only reminders', () => {
    expect(validateInput(input({ mode: 'once', date: '2026-11-15' }), now1400_30, 25)).toBeNull();
    expect(validateInput(input({ mode: 'today_only', time: '18:00' }), now1400_30, 25)).toBeNull();
  });
});

describe('validateInput text limits and emoji (H 21 to 23, 32)', () => {
  const now = ist('2026-11-02T14:00:00');

  it('480 code points is accepted and 481 is rejected', () => {
    expect(validateInput(input({ text: 'a'.repeat(480) }), now, 0)).toBeNull();
    expect(validateInput(input({ text: 'a'.repeat(481) }), now, 0)?.field).toBe('text');
  });

  it('480 characters with surrounding spaces is accepted after trim', () => {
    expect(validateInput(input({ text: '  ' + 'a'.repeat(478) + '  ' }), now, 0)).toBeNull();
  });

  it('whitespace-only text is a text error', () => {
    expect(validateInput(input({ text: '   \n\t ' }), now, 0)?.field).toBe('text');
  });

  it('300 emoji (300 characters a user sees, 600 UTF-16 units) is accepted', () => {
    // Emoji-only text is refused for calls (spoken script must not be empty), so use a notification here.
    expect(validateInput(input({ text: '😀'.repeat(300), kind: 'notification' }), now, 0)).toBeNull();
  });

  it('emoji-only text is a text error for a call but allowed for a notification', () => {
    expect(validateInput(input({ text: '🏋️💪', kind: 'call' }), now, 0)?.field).toBe('text');
    expect(validateInput(input({ text: '🏋️💪', kind: 'notification' }), now, 0)).toBeNull();
  });

  it('ZWJ family emoji only is a text error for a call', () => {
    expect(validateInput(input({ text: '👨‍👩‍👧', kind: 'call' }), now, 0)?.field).toBe('text');
  });

  it('keycap digit is speakable and passes for a call', () => {
    expect(validateInput(input({ text: '1️⃣ call', kind: 'call' }), now, 0)).toBeNull();
  });

  it('Devanagari text of 480 code points is accepted', () => {
    expect(validateInput(input({ text: 'क'.repeat(480), language: 'hi-IN' }), now, 0)).toBeNull();
  });
});

describe('budget planner and the 64 OS slot limit (H 15)', () => {
  const now = ist('2026-11-02T14:00:00');

  function manyDailies(n: number): Reminder[] {
    return Array.from({ length: n }, (_, i) => dailyRow(`d${String(i).padStart(2, '0')}`, `${String(i % 24).padStart(2, '0')}:00`));
  }

  function manyOneOffs(n: number, startHour = 15): Reminder[] {
    return Array.from({ length: n }, (_, i) => {
      const base = ist(`2026-11-03T${String(startHour).padStart(2, "0")}:00:00`).getTime();
      return onceRow(`o${String(i).padStart(3, "0")}`, new Date(base + i * 5 * 60_000).toISOString());
    });
  }

  it('default budget: 20 dailies and 40 one-offs gives 38 scheduled, 22 queued, nearest 18 one-offs', () => {
    const plan = planSchedule([...manyDailies(20), ...manyOneOffs(40)], now);
    expect(plan.scheduled).toHaveLength(LIMITS.budget);
    expect(plan.queued).toHaveLength(22);
    const oneOffIds = plan.scheduled.filter(p => p.trigger.type === 'date').map(p => p.id);
    expect(oneOffIds).toEqual(manyOneOffs(18).map(r => r.id));
  });

  it('budget 64: 20 dailies and 60 one-offs schedules exactly 64 with unique identifiers', () => {
    const plan = planSchedule([...manyDailies(20), ...manyOneOffs(60)], now, 64);
    expect(plan.scheduled).toHaveLength(64);
    expect(plan.queued).toHaveLength(16);
    const ids = plan.scheduled.map(p => p.identifier);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('budget 64 never exceeds 64 even with 20 dailies, 60 one-offs and 5 disabled dailies', () => {
    const disabled = Array.from({ length: 5 }, (_, i) => dailyRow(`x${i}`, '08:00', { enabled: false }));
    const plan = planSchedule([...manyDailies(20), ...disabled, ...manyOneOffs(60)], now, 64);
    expect(plan.scheduled.length).toBeLessThanOrEqual(64);
  });

  it('every enabled daily is scheduled even when the budget is smaller (D.3: dailies are never cut)', () => {
    const plan = planSchedule(manyDailies(20), now, 10);
    expect(plan.scheduled.filter(p => p.trigger.type === 'daily')).toHaveLength(20);
  });

  it('budget 0 queues every one-off and still schedules dailies', () => {
    const plan = planSchedule([...manyDailies(3), ...manyOneOffs(5)], now, 0);
    expect(plan.queued).toHaveLength(5);
    expect(plan.scheduled.filter(p => p.trigger.type === 'daily')).toHaveLength(3);
  });

  it('negative budget does not throw or schedule one-offs', () => {
    const plan = planSchedule(manyOneOffs(3), now, -5);
    expect(plan.scheduled).toHaveLength(0);
    expect(plan.queued).toHaveLength(3);
  });

  it('25 enabled dailies (over the save-time limit of 20) still fit under the default budget', () => {
    const plan = planSchedule([...manyDailies(25), ...manyOneOffs(20)], now);
    expect(plan.scheduled.filter(p => p.trigger.type === 'daily')).toHaveLength(25);
    expect(plan.scheduled.length).toBeLessThanOrEqual(LIMITS.budget);
  });

  it('disabled, cancelled and past one-offs do not consume slots', () => {
    const dead = [
      ...Array.from({ length: 60 }, (_, i) => onceRow(`dis${i}`, ist('2026-11-20T10:00:00').toISOString(), { enabled: false })),
      ...Array.from({ length: 20 }, (_, i) => onceRow(`past${i}`, ist('2026-11-01T10:00:00').toISOString())),
    ];
    const plan = planSchedule([...dead, ...manyOneOffs(38)], now);
    expect(plan.scheduled).toHaveLength(38);
    expect(plan.queued).toHaveLength(0);
  });

  it('one-offs at the same instant are ordered by id, deterministically', () => {
    const at = ist('2026-11-03T09:00:00').toISOString();
    const plan = planSchedule([onceRow('b', at), onceRow('a', at)], now, 1);
    expect(plan.scheduled.map(p => p.id)).toEqual(['a']);
    expect(plan.queued).toEqual(['b']);
  });
});

// Jest does not apply process.env.TZ changes made inside a test, so these run only when the worker
// is already in London time. Otherwise they are skipped and the skip is the signal that DST is unverified.
const LONDON_ACTIVE = new Date(2027, 2, 28, 1, 30).getHours() === 2;
const itDst = LONDON_ACTIVE ? it : it.skip;

describe('DST: Europe/London (H 6, 7, 8)', () => {

  // Local wall-clock helper in London. Date components are local, so this is correct in either zone.
  const lon = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi, 0, 0);

  itDst('precondition: the London zone is active (01:30 on 28 Mar 2027 normalises to 02:30)', () => {
    expect(lon(2027, 3, 28, 1, 30).getHours()).toBe(2);
  });

  itDst('spring forward: 01:30 one-off on 28 Mar 2027 is valid and lands at 02:30', () => {
    const d = localDateTime('2027-03-28', '01:30');
    expect(d).not.toBeNull();
    expect(d!.getHours()).toBe(2);
    expect(d!.getMinutes()).toBe(30);
  });

  itDst('spring forward: daily 01:30 fires on 28 Mar (once) and then on 29 Mar at 01:30', () => {
    const r = dailyRow('d', '01:30');
    const first = nextFire(r, lon(2027, 3, 27, 12, 0));
    expect(first).not.toBeNull();
    expect(first!.getDate()).toBe(28);
    const second = nextFire(r, new Date(first!.getTime() + 10_000));
    expect(second).not.toBeNull();
    expect(second!.getMonth()).toBe(2);
    expect(second!.getDate()).toBe(29);
    expect(second!.getHours()).toBe(1);
    expect(second!.getMinutes()).toBe(30);
  });

  itDst('fall back: daily 01:30 on 31 Oct 2027 fires once, and the next fire is 1 Nov', () => {
    const r = dailyRow('d', '01:30');
    const first = nextFire(r, lon(2027, 10, 31, 0, 30));
    expect(first).not.toBeNull();
    expect(first!.getDate()).toBe(31);
    const next = nextFire(r, new Date(first!.getTime() + 10_000));
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(1);
    expect(next!.getMonth()).toBe(10); // November
  });

  itDst('fall back: standing at the second 01:45 (GMT) on 31 Oct does not reschedule 01:30 for the same day', () => {
    const r = dailyRow('d', '01:30');
    // 01:45 GMT is the second pass through the repeated hour. Next fire must be 1 Nov.
    const second = new Date(Date.UTC(2027, 9, 31, 1, 45));
    const next = nextFire(r, second);
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(1);
  });

  itDst('one-off during fall back (01:30 on 31 Oct 2027) resolves to a single instant', () => {
    const d = localDateTime('2027-10-31', '01:30');
    expect(d).not.toBeNull();
    expect(d!.getHours()).toBe(1);
    expect(d!.getMinutes()).toBe(30);
  });

  itDst('one-off 01:30 on 28 Mar 2027 is accepted when saved on 27 Mar', () => {
    expect(validateInput(input({ mode: 'once', date: '2027-03-28', time: '01:30' }), lon(2027, 3, 27, 12, 0), 0)).toBeNull();
  });

  it('daily trigger hour stays the wall clock, not UTC', () => {
    const t = buildTrigger(dailyRow('d', '06:00'));
    expect(t).toEqual({ type: 'daily', hour: 6, minute: 0, channelId: 'reminder-call-v2' });
  });
});

describe('time zone change while travelling (H 8, D.2 example 1)', () => {
  it('one-off instant is absolute; daily stays on the wall clock', () => {
    const at = ist('2026-11-15T09:30:00').toISOString();
    const oneOff = buildTrigger(onceRow('o', at));
    const daily = buildTrigger(dailyRow('d', '06:00'));
    const prev = process.env.TZ;
    process.env.TZ = 'Asia/Dubai';
    try {
      expect(buildTrigger(onceRow('o', at))).toEqual(oneOff);
      expect(buildTrigger(dailyRow('d', '06:00'))).toEqual(daily);
      expect(nextFire(onceRow('o', at), ist('2026-11-02T14:00:00'))?.toISOString()).toBe('2026-11-15T04:00:00.000Z');
    } finally {
      process.env.TZ = prev;
    }
  });
});

describe('fingerprint changes on schedule edits (D.3)', () => {
  it('changing the daily time changes the fingerprint; identical input keeps it', () => {
    const r = dailyRow('d', '06:00');
    const t1 = buildTrigger(r)!;
    const t2 = buildTrigger(dailyRow('d', '07:00'))!;
    expect(fingerprint(r, t1)).toBe(fingerprint(r, t1));
    expect(fingerprint(r, t1)).not.toBe(fingerprint(r, t2));
  });
});

describe('spokenScript length and cutting (D.5, H 22 and 24)', () => {
  it('the output never exceeds 500 code points for a 480-character English reminder', () => {
    expect(codePoints(spokenScript('a'.repeat(480), 'en-IN'))).toBeLessThanOrEqual(SPOKEN_MAX_CHARS);
  });

  it('a 480-character English reminder still ends with its punctuation (ensureEnding is kept after the cap)', () => {
    const s = spokenScript('a'.repeat(480), 'en-IN');
    expect(s.endsWith('.')).toBe(true); // cap removes the period after ensureEnding: expected to fail
  });

  it('a 480-character Hindi reminder stays within 500 code points', () => {
    expect(codePoints(spokenScript('क'.repeat(480), 'hi-IN'))).toBeLessThanOrEqual(SPOKEN_MAX_CHARS);
  });

  it('a 480-character Hindi reminder is not cut through a vowel sign (no trailing combining mark)', () => {
    const s = spokenScript('का'.repeat(240), 'hi-IN');
    expect(/\p{M}$/u.test(s)).toBe(false);
  });

  it('a 480-character Kannada reminder stays within 500 code points', () => {
    expect(codePoints(spokenScript('ಕ'.repeat(480), 'kn-IN'))).toBeLessThanOrEqual(SPOKEN_MAX_CHARS);
  });

  it('a 300-emoji text strips to nothing and is therefore empty', () => {
    expect(spokenScript('😀'.repeat(300), 'en-IN')).toBe('');
  });

  it('a ZWJ conjunct in Devanagari keeps its ZWJ (ZWJ is only stripped in emoji sequences)', () => {
    const s = spokenScript('क्‍ष', 'hi-IN');
    expect(s).toContain('‍'); // current EMOJI_RE strips every ZWJ: expected to fail
  });

  it('Hindi, Marathi and Kannada prefixes are applied', () => {
    expect(spokenScript('कॉलेज जाना है', 'hi-IN').startsWith('नमस्ते, आपका रिमाइंडर: ')).toBe(true);
    expect(spokenScript('कॉलेज जाना है', 'mr-IN').startsWith('नमस्कार, तुमचा रिमाइंडर: ')).toBe(true);
    expect(spokenScript('ಕಾಲೇಜಿಗೆ ಹೋಗು', 'kn-IN').startsWith('ನಮಸ್ಕಾರ, ನಿಮ್ಮ ಜ್ಞಾಪನೆ: ')).toBe(true);
  });

  it('emoji mixed into Indian-script text is stripped and the Hindi text survives', () => {
    expect(spokenScript('कॉलेज 🏋️ जाना', 'hi-IN')).toBe('नमस्ते, आपका रिमाइंडर: कॉलेज जाना');
  });

  it('a 480-character reminder with emoji inside is still length-capped to 500 code points', () => {
    const s = spokenScript('🏋️ gym ' + 'a'.repeat(470) + ' 💪', 'en-IN');
    expect(codePoints(s)).toBeLessThanOrEqual(SPOKEN_MAX_CHARS);
  });

  it('emoji-only text speaks nothing in every language', () => {
    for (const lang of ['en-IN', 'hi-IN', 'mr-IN', 'kn-IN'] as const) {
      expect(spokenScript('🏋️💪', lang)).toBe('');
    }
  });

  it('keycap, skin tone and flag sequences are stripped without damaging the words', () => {
    expect(spokenScript('1️⃣ call', 'en-IN')).toBe('Hey, you need to 1 call.');
    expect(spokenScript('👍🏽 ok', 'en-IN')).toBe('Hey, you need to ok.');
    expect(spokenScript('🇮🇳 India', 'en-IN')).toBe('Hey, you need to india.');
  });

  it('ZWJ family emoji inside English text is removed cleanly', () => {
    expect(spokenScript('Call 👨‍👩‍👧 mom', 'en-IN')).toBe('Hey, you need to call mom.');
  });

  it('gym example from H 23 produces the documented script', () => {
    expect(spokenScript('🏋️ Gym 💪', 'en-IN')).toBe('Hey, you need to gym.');
  });
});
