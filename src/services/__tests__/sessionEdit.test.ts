/**
 * WP6 unit tests for src/services/sessionEdit.ts (plan E.2, E.3, I.1 "sessionEdit").
 * Written against the contract: validateSessionEdit({ session, draft, daySessions,
 * dayTests, now }) and buildSessionPatch(session, draft). The module is created by WP4.
 */
process.env.TZ = 'Asia/Kolkata';

import { validateSessionEdit, buildSessionPatch } from '../sessionEdit';

const DAY_Y = 2026;
const DAY_M = 10; // November (0-based)
const DAY_D = 4;

/** Local-time ISO string for a minute-of-day on the test day. */
function at(min: number): string {
  return new Date(DAY_Y, DAY_M, DAY_D, Math.floor(min / 60), min % 60, 0, 0).toISOString();
}

const MORNING_NOW = new Date(DAY_Y, DAY_M, DAY_D, 6, 0, 0, 0); // 06:00, before all test sessions

function makeSession(over: Partial<any> = {}) {
  return {
    id: 's1',
    timetable_id: 't1',
    student_id: 'u1',
    title: 'Motion in a plane',
    scheduled_at: at(7 * 60 + 7), // 07:07
    duration_minutes: 45,
    subject_id: null,
    chapter_id: null,
    topic_id: null,
    status: 'pending',
    notes: null,
    created_at: at(0),
    session_type: 'study',
    ...over,
  };
}

function makeDraft(over: Partial<any> = {}) {
  return {
    title: 'Motion in a plane',
    startMin: 427, // 07:07
    durationMin: 45,
    notes: '',
    channel: 'notification',
    ...over,
  };
}

function makeTest(id: string, startMin: number, durationMin: number) {
  return {
    id,
    student_id: 'u1',
    course_id: 'c1',
    subject_id: null,
    title: `Test ${id}`,
    test_type: 'chapter',
    chapter_ids: null,
    topic_ids: null,
    scheduled_at: at(startMin),
    duration_minutes: durationMin,
    total_questions: 20,
    mcq_count: null,
    written_count: null,
    submitted_at: null,
  };
}

function run(opts: {
  session?: any;
  draft?: any;
  daySessions?: any[];
  dayTests?: any[];
  now?: Date;
}) {
  const session = opts.session ?? makeSession();
  return validateSessionEdit({
    session,
    draft: opts.draft ?? makeDraft(),
    daySessions: opts.daySessions ?? [session],
    dayTests: opts.dayTests ?? [],
    now: opts.now ?? MORNING_NOW,
  } as any);
}

function allErrorText(result: any): string {
  return Object.values(result.errors ?? {})
    .map((v) => String(v))
    .join(' | ');
}

describe('validateSessionEdit: overlap', () => {
  // Edited draft: 08:00 for 45 min, i.e. 480-525.
  const draft = makeDraft({ startMin: 480, durationMin: 45 });

  it('blocks overlap with a pending session', () => {
    const other = makeSession({ id: 'o1', title: 'Electric charges', scheduled_at: at(510), duration_minutes: 30, status: 'pending' });
    const result = run({ draft, daySessions: [makeSession(), other] });
    expect(result.ok).toBe(false);
    expect(allErrorText(result)).toMatch(/Electric charges/);
  });

  it('blocks overlap with a done session', () => {
    const other = makeSession({ id: 'o2', title: 'Done one', scheduled_at: at(510), duration_minutes: 30, status: 'done' });
    const result = run({ draft, daySessions: [makeSession(), other] });
    expect(result.ok).toBe(false);
    expect(allErrorText(result)).toMatch(/Done one/);
  });

  it('ignores a skipped session', () => {
    const other = makeSession({ id: 'o3', title: 'Skipped one', scheduled_at: at(510), duration_minutes: 30, status: 'skipped' });
    const result = run({ draft, daySessions: [makeSession(), other] });
    expect(result.ok).toBe(true);
  });

  it('allows touching edges (ends at 08:00, starts at 08:00)', () => {
    // Other session 07:30-08:00 touches the draft's 08:00 start.
    const other = makeSession({ id: 'o4', title: 'Before', scheduled_at: at(450), duration_minutes: 30, status: 'pending' });
    const result = run({ draft, daySessions: [makeSession(), other] });
    expect(result.ok).toBe(true);
  });

  it('blocks overlap with a self test on the same day', () => {
    const result = run({ draft, dayTests: [makeTest('t9', 515, 60)] });
    expect(result.ok).toBe(false);
    expect(allErrorText(result)).toMatch(/Test t9/);
  });

  it('does not treat the edited session as overlapping itself', () => {
    const session = makeSession();
    const result = run({ session, draft, daySessions: [session] });
    expect(result.ok).toBe(true);
  });
});

describe('validateSessionEdit: past time', () => {
  it('blocks a pending session moved to 2 minutes ago', () => {
    const now = new Date(DAY_Y, DAY_M, DAY_D, 9, 0, 0, 0);
    const result = run({
      draft: makeDraft({ startMin: 8 * 60 + 58, durationMin: 30 }), // 08:58, 2 min ago
      now,
    });
    expect(result.ok).toBe(false);
    expect(allErrorText(result)).toMatch(/later than now/i);
  });

  it('allows a pending session moved to 2 minutes from now', () => {
    const now = new Date(DAY_Y, DAY_M, DAY_D, 9, 0, 0, 0);
    const result = run({
      draft: makeDraft({ startMin: 9 * 60 + 2, durationMin: 30 }),
      now,
    });
    expect(result.ok).toBe(true);
  });

  it('does not apply time checks to a done session (read-only)', () => {
    const now = new Date(DAY_Y, DAY_M, DAY_D, 9, 0, 0, 0);
    const session = makeSession({ status: 'done' });
    const result = run({ session, draft: makeDraft(), daySessions: [session], now });
    expect(result.ok).toBe(true);
    expect(allErrorText(result)).not.toMatch(/later than now/i);
  });
});

describe('validateSessionEdit: duration and midnight', () => {
  it('rejects duration 4 and 241, accepts 5 and 240', () => {
    expect(run({ draft: makeDraft({ durationMin: 4 }) }).ok).toBe(false);
    expect(run({ draft: makeDraft({ durationMin: 241 }) }).ok).toBe(false);
    expect(run({ draft: makeDraft({ durationMin: 5 }) }).ok).toBe(true);
    expect(run({ draft: makeDraft({ durationMin: 240 }) }).ok).toBe(true);
  });

  it('refuses a session that runs past midnight (23:59 + 5 min)', () => {
    const result = run({ draft: makeDraft({ startMin: 1439, durationMin: 5 }) });
    expect(result.ok).toBe(false);
    expect(allErrorText(result)).toMatch(/midnight/i);
  });

  it('accepts 23:00 + 59 min (ends at 23:59)', () => {
    const result = run({
      draft: makeDraft({ startMin: 23 * 60, durationMin: 59 }),
      now: new Date(DAY_Y, DAY_M, DAY_D, 6, 0),
    });
    expect(result.ok).toBe(true);
  });
});

describe('buildSessionPatch', () => {
  it('sends scheduled_at and resets the three sent flags when the start changed', () => {
    const session = makeSession();
    const patch: any = buildSessionPatch(session, makeDraft({ startMin: 7 * 60 + 15 }));
    expect(patch.scheduled_at).toBe(at(7 * 60 + 15));
    expect(patch.reminder_sent_at).toBeNull();
    expect(patch.reminder_24h_sent_at).toBeNull();
    expect(patch.reminder_1h_sent_at).toBeNull();
  });

  it('sends only title when only the title changed', () => {
    const session = makeSession();
    const patch = buildSessionPatch(session, makeDraft({ title: 'Renamed' }));
    expect(patch).toEqual({ title: 'Renamed' });
  });

  it('does not touch scheduled_at or sent flags when only the duration changed', () => {
    const session = makeSession();
    const patch: any = buildSessionPatch(session, makeDraft({ durationMin: 60 }));
    expect(patch.duration_minutes).toBe(60);
    expect(patch).not.toHaveProperty('scheduled_at');
    expect(patch).not.toHaveProperty('reminder_sent_at');
  });
});
