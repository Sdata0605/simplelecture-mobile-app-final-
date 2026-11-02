import {
  PRESETS, WEEKDAY_DEFAULT, WEEKEND_DEFAULT, WINDOW_KEYS,
  dayMinutes, format12, formatHours, formatRange12, hasWeekdayStudyTime, keepRangeValid,
  normalizeTime, presetIdFor, roundToQuarter, timeKeyFromParts, toDayPlan, toMinutes,
  validateDay, validateWindow, weeklyMinutes,
  type DayWindows, type TimeWindow,
} from '../planWizard/timePresets';

function win(start: string, end: string, enabled = true): TimeWindow {
  return { enabled, start, end, presetId: null };
}

function day(m: TimeWindow, a: TimeWindow, e: TimeWindow): DayWindows {
  return { morning: m, afternoon: a, evening: e };
}

const OFF = win('14:00', '16:00', false);

describe('time value normalisation (typed or picked values become HH:MM)', () => {
  it('turns a typed 7:00 into 07:00', () => {
    expect(normalizeTime('7:00')).toBe('07:00');
  });

  it('keeps an already padded value and trims spaces', () => {
    expect(normalizeTime('07:00')).toBe('07:00');
    expect(normalizeTime('  9:30 ')).toBe('09:30');
  });

  it('turns a picked hour and minute into zero-padded HH:MM', () => {
    expect(timeKeyFromParts(7, 0)).toBe('07:00');
    expect(timeKeyFromParts(19, 5)).toBe('19:05');
  });

  it('rejects values that are not clock times', () => {
    for (const bad of ['24:00', '12:60', '', 'ab:cd', '7 am', '19.00', '7:0']) {
      expect(normalizeTime(bad)).toBeNull();
    }
    expect(normalizeTime(null)).toBeNull();
  });

  it('strict parser accepts only canonical HH:MM', () => {
    expect(toMinutes('07:00')).toBe(420);
    expect(toMinutes('23:45')).toBe(1425);
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('7:00')).toBeNull();
    expect(toMinutes('24:00')).toBeNull();
  });

  it('a normalised typed value passes validation in the planner comparison', () => {
    const start = normalizeTime('7:00') as string;
    const end = normalizeTime('9:00') as string;
    expect(validateWindow(start, end)).toBeNull();
    expect(dayMinutes(day(win(start, end), OFF, OFF))).toBe(120);
  });

  it('rounds picked times to 15 minutes and keeps them inside the day', () => {
    expect(roundToQuarter(7 * 60 + 7)).toBe(420);
    expect(roundToQuarter(7 * 60 + 8)).toBe(435);
    expect(roundToQuarter(23 * 60 + 59)).toBe(1425);
  });
});

describe('window validation', () => {
  it('end before or equal to start is invalid', () => {
    expect(validateWindow('09:00', '07:00')).toBe('End time must be after start time');
    expect(validateWindow('09:00', '09:00')).toBe('End time must be after start time');
  });

  it('a window shorter than 30 minutes is invalid', () => {
    expect(validateWindow('07:00', '07:15')).toBe('Make it at least 30 minutes');
  });

  it('exactly 30 minutes is valid', () => {
    expect(validateWindow('07:00', '07:30')).toBeNull();
  });

  it('overlapping enabled windows are flagged on both', () => {
    const errors = validateDay(day(win('08:00', '10:00'), win('09:30', '11:00'), OFF));
    expect(errors.morning).toBe('Overlaps with your Afternoon time');
    expect(errors.afternoon).toBe('Overlaps with your Morning time');
    expect(errors.evening).toBeNull();
  });

  it('touching edges (10:00 and 10:00) are allowed', () => {
    const errors = validateDay(day(win('08:00', '10:00'), win('10:00', '12:00'), OFF));
    expect(errors.morning).toBeNull();
    expect(errors.afternoon).toBeNull();
  });

  it('disabled windows are never checked', () => {
    const errors = validateDay(day(win('08:00', '10:00'), win('09:00', '07:00', false), OFF));
    expect(errors.afternoon).toBeNull();
    expect(errors.morning).toBeNull();
  });

  it('hasWeekdayStudyTime needs one enabled, valid window', () => {
    expect(hasWeekdayStudyTime(day(OFF, OFF, OFF))).toBe(false);
    expect(hasWeekdayStudyTime(day(win('09:00', '07:00'), OFF, OFF))).toBe(false);
    expect(hasWeekdayStudyTime(day(win('07:00', '09:00'), OFF, OFF))).toBe(true);
  });
});

describe('minutes and summary totals', () => {
  it('dayMinutes sums only enabled, valid windows', () => {
    const d = day(win('07:00', '09:00'), win('14:00', '15:30'), win('19:00', '18:00'));
    expect(dayMinutes(d)).toBe(120 + 90);
  });

  it('weeklyMinutes: same copies the weekday, rest is zero, different adds Sat and Sun', () => {
    const weekday = day(win('07:00', '09:00'), OFF, OFF); // 120 a day
    const sat = day(win('10:00', '12:00'), OFF, OFF); // 120
    const sun = day(OFF, OFF, win('18:00', '19:00')); // 60
    expect(weeklyMinutes({ weekday, weekendMode: 'same', saturday: sat, sunday: sun })).toBe(120 * 7);
    expect(weeklyMinutes({ weekday, weekendMode: 'rest', saturday: sat, sunday: sun })).toBe(120 * 5);
    expect(weeklyMinutes({ weekday, weekendMode: 'different', saturday: sat, sunday: sun })).toBe(120 * 5 + 180);
  });

  it('formatHours shows whole and half hours', () => {
    expect(formatHours(240)).toBe('4 h');
    expect(formatHours(90)).toBe('1.5 h');
  });
});

describe('presets and defaults', () => {
  it('preset ids are unique', () => {
    const ids = WINDOW_KEYS.flatMap(k => PRESETS[k].map(p => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset is itself a valid window', () => {
    for (const k of WINDOW_KEYS) {
      for (const p of PRESETS[k]) {
        expect(validateWindow(p.start, p.end)).toBeNull();
        expect(presetIdFor(k, p.start, p.end)).toBe(p.id);
      }
    }
  });

  it('weekday default has morning and evening on, afternoon off', () => {
    expect(WEEKDAY_DEFAULT.morning.enabled).toBe(true);
    expect(WEEKDAY_DEFAULT.afternoon.enabled).toBe(false);
    expect(WEEKDAY_DEFAULT.evening.enabled).toBe(true);
    expect(dayMinutes(WEEKDAY_DEFAULT)).toBe(240);
  });

  it('weekend default has valid windows', () => {
    const errors = validateDay(WEEKEND_DEFAULT);
    expect(Object.values(errors).every(e => e === null)).toBe(true);
  });
});

describe('edge-function day plan', () => {
  it('emits enabled windows only, with evening sent as night', () => {
    const plan = toDayPlan(day(win('07:00', '09:00'), OFF, win('19:00', '21:00')));
    expect(plan).toEqual({
      intervals: [
        { label: 'morning', start: '07:00', end: '09:00' },
        { label: 'night', start: '19:00', end: '21:00' },
      ],
    });
  });

  it('skips an enabled window that is invalid', () => {
    const plan = toDayPlan(day(win('09:00', '07:00'), OFF, OFF));
    expect(plan.intervals).toEqual([]);
  });
});

describe('12-hour labels', () => {
  it('format12 converts 24-hour values', () => {
    expect(format12('07:00')).toBe('7:00 AM');
    expect(format12('19:30')).toBe('7:30 PM');
    expect(format12('12:00')).toBe('12:00 PM');
    expect(format12('00:15')).toBe('12:15 AM');
    expect(format12('7:00')).toBeNull();
  });

  it('formatRange12 gives compact chip labels', () => {
    expect(formatRange12('07:00', '09:00')).toBe('7–9 AM');
    expect(formatRange12('12:00', '14:00')).toBe('12–2 PM');
    expect(formatRange12('11:30', '13:00')).toBe('11:30 AM–1 PM');
    expect(formatRange12('18:30', '20:00')).toBe('6:30–8 PM');
  });
});

describe('custom range auto-correction', () => {
  it('moves To to From + 1 hour when From is picked after To', () => {
    expect(keepRangeValid('18:00', '17:00')).toEqual({ start: '18:00', end: '19:00' });
  });

  it('leaves a valid range alone', () => {
    expect(keepRangeValid('07:00', '09:00')).toEqual({ start: '07:00', end: '09:00' });
  });

  it('caps To at 23:45 and keeps the range valid', () => {
    expect(keepRangeValid('23:30', '23:00')).toEqual({ start: '23:30', end: '23:45' });
    expect(keepRangeValid('23:45', '23:00')).toEqual({ start: '23:30', end: '23:45' });
  });
});
