import {
  planScopeLabel,
  dayOfWeekMon,
  getDaysInMonth,
  buildCalendarGrid,
  datePrefixForDay,
  localDateKey,
} from '../calendar';

describe('planScopeLabel', () => {
  it('maps known scope types', () => {
    expect(planScopeLabel('subject')).toBe('Subject scope');
    expect(planScopeLabel('chapter')).toBe('Chapter scope');
    expect(planScopeLabel('topic')).toBe('Topic scope');
    expect(planScopeLabel('course')).toBe('Full course');
  });

  it('returns null for nullish scope', () => {
    expect(planScopeLabel(null)).toBeNull();
    expect(planScopeLabel(undefined)).toBeNull();
    expect(planScopeLabel('')).toBeNull();
  });

  it('title-cases an unknown scope type', () => {
    expect(planScopeLabel('weekly')).toBe('Weekly scope');
  });
});

describe('dayOfWeekMon', () => {
  it('treats Monday as 0 and Sunday as 6', () => {
    expect(dayOfWeekMon(new Date(2024, 0, 1))).toBe(0); // Mon 1 Jan 2024
    expect(dayOfWeekMon(new Date(2024, 0, 7))).toBe(6); // Sun 7 Jan 2024
  });
});

describe('getDaysInMonth', () => {
  it('returns correct day counts including leap February', () => {
    expect(getDaysInMonth(2024, 1)).toBe(29); // leap
    expect(getDaysInMonth(2023, 1)).toBe(28);
    expect(getDaysInMonth(2024, 0)).toBe(31); // Jan
    expect(getDaysInMonth(2024, 3)).toBe(30); // Apr
  });
});

describe('buildCalendarGrid', () => {
  it('always returns exactly 42 cells', () => {
    for (let m = 0; m < 12; m++) {
      expect(buildCalendarGrid(2024, m)).toHaveLength(42);
    }
  });

  it('places day 1 with no offset when the month starts on Monday', () => {
    const grid = buildCalendarGrid(2024, 0); // Jan 2024 starts Monday
    expect(grid[0]).toBe(1);
    expect(grid[30]).toBe(31);
    expect(grid[31]).toBeNull();
  });

  it('pads leading nulls for a month that starts mid-week', () => {
    const grid = buildCalendarGrid(2024, 1); // Feb 2024 starts Thursday (offset 3)
    expect(grid[0]).toBeNull();
    expect(grid[1]).toBeNull();
    expect(grid[2]).toBeNull();
    expect(grid[3]).toBe(1);
    expect(grid.filter((c) => c !== null)).toHaveLength(29);
  });
});

describe('datePrefixForDay', () => {
  it('zero-pads month and day', () => {
    expect(datePrefixForDay(2024, 0, 5)).toBe('2024-01-05');
    expect(datePrefixForDay(2024, 11, 25)).toBe('2024-12-25');
  });
});

describe('localDateKey', () => {
  it('buckets an ISO timestamp by its local calendar day', () => {
    // Build via local components, round-trip through ISO; key must come back the same.
    const iso = new Date(2024, 5, 15, 10, 30, 0).toISOString();
    expect(localDateKey(iso)).toBe('2024-06-15');
    const iso2 = new Date(2024, 0, 5, 23, 0, 0).toISOString();
    expect(localDateKey(iso2)).toBe('2024-01-05');
  });
});
