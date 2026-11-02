/**
 * WP6 unit tests for src/utils/timeOfDay.ts (plan D.1, I.1 "timeOfDay").
 * Written against the contract; the module is created by WP3.
 */
process.env.TZ = 'Asia/Kolkata';

import {
  parseHHMM,
  formatTime,
  to12,
  from12,
  stepMinute,
  parseTyped,
  combineLocal,
  localMinutesOf,
  rangesOverlap,
} from '../timeOfDay';

describe('parseHHMM', () => {
  it('parses zero-padded HH:MM to minutes after midnight', () => {
    expect(parseHHMM('07:07')).toBe(427);
    expect(parseHHMM('23:59')).toBe(1439);
  });

  it('rejects non-strict or out-of-range input', () => {
    expect(parseHHMM('7:07')).toBeNull();
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('12:60')).toBeNull();
  });
});

describe('formatTime', () => {
  it('formats 12-hour and 24-hour clocks', () => {
    expect(formatTime(427, '12h')).toBe('7:07 AM');
    expect(formatTime(0, '12h')).toBe('12:00 AM');
    expect(formatTime(720, '12h')).toBe('12:00 PM');
    expect(formatTime(1439, '24h')).toBe('23:59');
  });
});

describe('to12 / from12', () => {
  it('converts midnight and noon correctly', () => {
    expect(from12(12, 0, 'AM')).toBe(0);
    expect(from12(12, 0, 'PM')).toBe(720);
    expect(from12(12, 42, 'PM')).toBe(762);
  });

  it('round-trips every minute of the day', () => {
    const mismatches: string[] = [];
    for (let m = 0; m < 1440; m++) {
      const { hour12, minute, period } = to12(m);
      const back = from12(hour12, minute, period);
      if (back !== m) mismatches.push(`${m} -> ${hour12}:${minute} ${period} -> ${back}`);
    }
    expect(mismatches).toEqual([]);
  });
});

describe('stepMinute', () => {
  it('wraps across midnight in both directions', () => {
    expect(stepMinute(1439, 1)).toBe(0);
    expect(stepMinute(0, -1)).toBe(1439);
  });
});

describe('parseTyped', () => {
  it('parses a valid 12-hour PM entry', () => {
    expect(parseTyped('7', '42', '12h', 'PM')).toBe(1182);
  });

  it('reports an hour error for 13 in 12-hour mode', () => {
    const result = parseTyped('13', '00', '12h');
    expect(typeof result).toBe('string');
    expect(String(result)).toMatch(/hour/i);
  });

  it('reports a minute error for 61', () => {
    const result = parseTyped('7', '61', '12h', 'AM');
    expect(typeof result).toBe('string');
    expect(String(result)).toMatch(/minute/i);
  });
});

describe('combineLocal / localMinutesOf', () => {
  it('builds a local date whose hours and minutes match the minute value', () => {
    const d = combineLocal('2026-11-04', 427);
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(7);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(4);
  });

  it('reads local minutes back from an ISO string', () => {
    expect(localMinutesOf(new Date(2026, 10, 4, 7, 7).toISOString())).toBe(427);
  });
});

describe('rangesOverlap', () => {
  it('treats touching edges as not overlapping', () => {
    expect(rangesOverlap(420, 480, 480, 540)).toBe(false);
  });

  it('detects a one-minute overlap', () => {
    expect(rangesOverlap(420, 481, 480, 540)).toBe(true);
  });
});
