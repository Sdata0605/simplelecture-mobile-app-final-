/**
 * WP6 unit tests for src/utils/calendarMarkers.ts (plan G.2, I.1 "calendarMarkers").
 * Written against the contract; the module is created by WP1.
 */
process.env.TZ = 'Asia/Kolkata';

import { buildSessionMarkers, markerDots, markerA11y } from '../calendarMarkers';

const PRIMARY = '#2BBD6E';
const SUCCESS = '#10B981';
const GRAY300 = '#D1D5DB';
const AMBER = '#F59E0B';

function session(id: string, status: 'pending' | 'done' | 'skipped', iso: string) {
  return {
    id,
    title: `Session ${id}`,
    scheduled_at: iso,
    duration_minutes: 30,
    status,
    session_type: 'study',
  };
}

function test(id: string, iso: string) {
  return {
    id,
    student_id: 'u1',
    course_id: 'c1',
    subject_id: null,
    title: `Test ${id}`,
    test_type: 'chapter' as const,
    chapter_ids: null,
    topic_ids: null,
    scheduled_at: iso,
    duration_minutes: 60,
    total_questions: 20,
    mcq_count: null,
    written_count: null,
    submitted_at: null,
  };
}

const NOON_NOV4 = new Date(2026, 10, 4, 12, 0).toISOString();

describe('markerDots', () => {
  it('shows one dot per status kind, not one per session', () => {
    expect(markerDots({ pending: 5, done: 0, skipped: 0, tests: 0 }, false)).toEqual([PRIMARY]);
  });

  it('never shows more than 3 dots and keeps the test dot when all four kinds are present', () => {
    const dots = markerDots({ pending: 2, done: 1, skipped: 1, tests: 1 }, false);
    expect(dots.length).toBe(3);
    expect(dots[dots.length - 1]).toBe(AMBER);
  });

  it('uses the done and skipped colours', () => {
    expect(markerDots({ pending: 0, done: 1, skipped: 0, tests: 0 }, false)).toEqual([SUCCESS]);
    expect(markerDots({ pending: 0, done: 0, skipped: 1, tests: 0 }, false)).toEqual([GRAY300]);
  });

  it('adds an amber dot for a test', () => {
    expect(markerDots({ pending: 1, done: 0, skipped: 0, tests: 1 }, false)).toEqual([
      PRIMARY,
      AMBER,
    ]);
  });
});

describe('markerA11y', () => {
  it('describes sessions and tests in words', () => {
    const text = markerA11y({ pending: 3, done: 0, skipped: 0, tests: 1 });
    expect(text).toContain('3 sessions');
    expect(text).toContain('1 test');
  });
});

describe('buildSessionMarkers', () => {
  it('buckets sessions by local day, not UTC day', () => {
    // 18:45 UTC on 4 Nov is 00:15 IST on 5 Nov.
    const markers = buildSessionMarkers(
      [session('a', 'pending', '2026-11-04T18:45:00Z')],
      []
    );
    expect(markers['2026-11-05']).toBeDefined();
    expect(markers['2026-11-05'].pending).toBe(1);
    expect(markers['2026-11-04']).toBeUndefined();
  });

  it('counts pending, done, skipped and tests per day', () => {
    const markers = buildSessionMarkers(
      [
        session('a', 'pending', NOON_NOV4),
        session('b', 'done', NOON_NOV4),
        session('c', 'skipped', NOON_NOV4),
      ],
      [test('t1', NOON_NOV4)]
    );
    const day = markers['2026-11-04'];
    expect(day.pending).toBe(1);
    expect(day.done).toBe(1);
    expect(day.skipped).toBe(1);
    expect(day.tests).toBe(1);
  });
});
