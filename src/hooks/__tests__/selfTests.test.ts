import { deriveStatus, normalizeOptions } from '../useMyTests';

const start = Date.UTC(2024, 0, 1, 10, 0, 0);
const iso = new Date(start).toISOString();
const base = { scheduled_at: iso, duration_minutes: 60, submitted_at: null } as any;

describe('deriveStatus', () => {
  it('returns "submitted" whenever submitted_at is set, regardless of time', () => {
    expect(deriveStatus({ ...base, submitted_at: iso } as any, start - 999999)).toBe('submitted');
    expect(deriveStatus({ ...base, submitted_at: iso } as any, start + 999999)).toBe('submitted');
  });

  it('returns "upcoming" before the scheduled start', () => {
    expect(deriveStatus(base, start - 1)).toBe('upcoming');
  });

  it('returns "live" between start and start+duration (inclusive of end)', () => {
    expect(deriveStatus(base, start + 1)).toBe('live');
    expect(deriveStatus(base, start + 60 * 60 * 1000)).toBe('live'); // exactly at end
  });

  it('returns "missed" after start+duration', () => {
    expect(deriveStatus(base, start + 60 * 60 * 1000 + 1)).toBe('missed');
  });

  it('treats a zero/missing duration as a zero-length live window', () => {
    const t = { scheduled_at: iso, duration_minutes: 0, submitted_at: null } as any;
    expect(deriveStatus(t, start)).toBe('live'); // now === start === end
    expect(deriveStatus(t, start + 1)).toBe('missed');
  });
});

describe('normalizeOptions', () => {
  it('returns [] for nullish/primitive inputs', () => {
    expect(normalizeOptions(null)).toEqual([]);
    expect(normalizeOptions(undefined)).toEqual([]);
    expect(normalizeOptions('foo')).toEqual([]);
    expect(normalizeOptions(42)).toEqual([]);
  });

  it('keys a string array A, B, C…', () => {
    expect(normalizeOptions(['acidic', 'basic'])).toEqual([
      { key: 'A', text: 'acidic' },
      { key: 'B', text: 'basic' },
    ]);
  });

  it('reads .text from an array of objects', () => {
    expect(normalizeOptions([{ text: 'x' }, { text: 'y' }])).toEqual([
      { key: 'A', text: 'x' },
      { key: 'B', text: 'y' },
    ]);
  });

  it('uses object keys when options are a map', () => {
    expect(normalizeOptions({ A: 'foo', B: 'bar' })).toEqual([
      { key: 'A', text: 'foo' },
      { key: 'B', text: 'bar' },
    ]);
  });

  it('reads .text from a map of objects', () => {
    expect(normalizeOptions({ A: { text: 'foo' }, B: { text: 'bar' } })).toEqual([
      { key: 'A', text: 'foo' },
      { key: 'B', text: 'bar' },
    ]);
  });
});
