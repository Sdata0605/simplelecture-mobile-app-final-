/**
 * Unit tests for the pure helpers in studentNotesService.
 *
 * These cover the deterministic transforms only (no network): job-id building,
 * subject note counting, word counting, aggregate rebuild, staleness check,
 * topic-title mapping, and local-storage key format.
 */
import {
  aggregateJobId,
  localNoteKey,
  isLectureContext,
  parseLocalNoteMeta,
  noteRowMatchesContext,
  decideRealtimeNoteUpdate,
  countBySubject,
  countWords,
  buildAggregateContent,
  buildTopicTitleMap,
  isAggregateStale,
} from '../studentNotesService';

describe('aggregateJobId', () => {
  it('builds the deterministic notebook job id', () => {
    expect(aggregateJobId('subj', 'chap')).toBe('notebook-subj-chap');
  });
});

describe('localNoteKey', () => {
  it('keeps the documented 3-part key for the aggregate notebook', () => {
    expect(localNoteKey({ userId: 'u1', subjectId: 's1', chapterId: 'c1' })).toBe(
      'simplelecture:my-notes:u1:s1:c1',
    );
  });

  it('treats null/undefined job or topic as aggregate (3-part key)', () => {
    expect(
      localNoteKey({
        userId: 'u1',
        subjectId: 's1',
        chapterId: 'c1',
        jobId: null,
        topicId: null,
      }),
    ).toBe('simplelecture:my-notes:u1:s1:c1');
    expect(
      localNoteKey({
        userId: 'u1',
        subjectId: 's1',
        chapterId: 'c1',
        jobId: 'job1',
        topicId: undefined,
      }),
    ).toBe('simplelecture:my-notes:u1:s1:c1');
  });

  it('appends jobId + topicId for a lecture note (distinct key)', () => {
    expect(
      localNoteKey({
        userId: 'u1',
        subjectId: 's1',
        chapterId: 'c1',
        jobId: 'job1',
        topicId: 't1',
      }),
    ).toBe('simplelecture:my-notes:u1:s1:c1:job1:t1');
  });

  it('produces distinct keys for two lectures in the same chapter', () => {
    const base = { userId: 'u1', subjectId: 's1', chapterId: 'c1' };
    const k1 = localNoteKey({ ...base, jobId: 'jobA', topicId: 'tA' });
    const k2 = localNoteKey({ ...base, jobId: 'jobB', topicId: 'tB' });
    const kAgg = localNoteKey(base);
    expect(new Set([k1, k2, kAgg]).size).toBe(3);
  });
});

describe('isLectureContext', () => {
  it('is true only when BOTH jobId and topicId are present', () => {
    expect(
      isLectureContext({
        userId: 'u',
        subjectId: 's',
        chapterId: 'c',
        jobId: 'j',
        topicId: 't',
      }),
    ).toBe(true);
  });

  it('is false when either is missing/null', () => {
    const base = { userId: 'u', subjectId: 's', chapterId: 'c' };
    expect(isLectureContext(base)).toBe(false);
    expect(isLectureContext({ ...base, jobId: 'j' })).toBe(false);
    expect(isLectureContext({ ...base, topicId: 't' })).toBe(false);
    expect(isLectureContext({ ...base, jobId: 'j', topicId: null })).toBe(false);
    expect(isLectureContext({ ...base, jobId: null, topicId: 't' })).toBe(false);
  });
});

describe('parseLocalNoteMeta', () => {
  it('returns null for null input', () => {
    expect(parseLocalNoteMeta(null)).toBeNull();
  });

  it('parses valid metadata JSON', () => {
    const raw = JSON.stringify({
      content: 'hello',
      updatedAt: 123,
      pendingSync: true,
    });
    expect(parseLocalNoteMeta(raw)).toEqual({
      content: 'hello',
      updatedAt: 123,
      pendingSync: true,
    });
  });

  it('defaults missing metadata fields', () => {
    const raw = JSON.stringify({ content: 'x' });
    expect(parseLocalNoteMeta(raw)).toEqual({
      content: 'x',
      updatedAt: 0,
      pendingSync: false,
    });
  });

  it('treats a legacy plain string as old + synced content', () => {
    expect(parseLocalNoteMeta('legacy notes text')).toEqual({
      content: 'legacy notes text',
      updatedAt: 0,
      pendingSync: false,
    });
  });

  it('treats a legacy string that starts with a brace but is not valid JSON as content', () => {
    // Not real JSON -> falls back to legacy wrapping of the raw string.
    const raw = '{ this is not json';
    expect(parseLocalNoteMeta(raw)).toEqual({
      content: raw,
      updatedAt: 0,
      pendingSync: false,
    });
  });

  it('treats JSON without a string content field as legacy content', () => {
    const raw = JSON.stringify({ updatedAt: 5 });
    expect(parseLocalNoteMeta(raw)).toEqual({
      content: raw,
      updatedAt: 0,
      pendingSync: false,
    });
  });
});

describe('noteRowMatchesContext', () => {
  const ctx = {
    userId: 'u1',
    jobId: 'job1',
    subjectId: 's1',
    chapterId: 'c1',
    topicId: 't1',
  };

  it('matches a row with the exact same context', () => {
    expect(
      noteRowMatchesContext(
        {
          student_id: 'u1',
          job_id: 'job1',
          subject_id: 's1',
          chapter_id: 'c1',
          topic_id: 't1',
        },
        ctx,
      ),
    ).toBe(true);
  });

  it('rejects a row from a different topic', () => {
    expect(
      noteRowMatchesContext(
        {
          student_id: 'u1',
          job_id: 'job1',
          subject_id: 's1',
          chapter_id: 'c1',
          topic_id: 'OTHER',
        },
        ctx,
      ),
    ).toBe(false);
  });

  it('rejects a row from a different job/subject/chapter/student', () => {
    const base = {
      student_id: 'u1',
      job_id: 'job1',
      subject_id: 's1',
      chapter_id: 'c1',
      topic_id: 't1',
    };
    expect(noteRowMatchesContext({ ...base, student_id: 'x' }, ctx)).toBe(false);
    expect(noteRowMatchesContext({ ...base, job_id: 'x' }, ctx)).toBe(false);
    expect(noteRowMatchesContext({ ...base, subject_id: 'x' }, ctx)).toBe(false);
    expect(noteRowMatchesContext({ ...base, chapter_id: 'x' }, ctx)).toBe(false);
  });

  it('matches aggregate (null topic) when row topic is null or empty', () => {
    const aggCtx = { ...ctx, topicId: null };
    expect(
      noteRowMatchesContext(
        {
          student_id: 'u1',
          job_id: 'job1',
          subject_id: 's1',
          chapter_id: 'c1',
          topic_id: null,
        },
        aggCtx,
      ),
    ).toBe(true);
    expect(
      noteRowMatchesContext(
        {
          student_id: 'u1',
          job_id: 'job1',
          subject_id: 's1',
          chapter_id: 'c1',
          topic_id: '',
        },
        aggCtx,
      ),
    ).toBe(true);
  });

  it('does NOT match aggregate context against a real topic row', () => {
    const aggCtx = { ...ctx, topicId: null };
    expect(
      noteRowMatchesContext(
        {
          student_id: 'u1',
          job_id: 'job1',
          subject_id: 's1',
          chapter_id: 'c1',
          topic_id: 't1',
        },
        aggCtx,
      ),
    ).toBe(false);
  });

  it('returns false for null/undefined rows', () => {
    expect(noteRowMatchesContext(null, ctx)).toBe(false);
    expect(noteRowMatchesContext(undefined, ctx)).toBe(false);
  });
});

describe('decideRealtimeNoteUpdate', () => {
  it('ignores a self-save echo with identical content', () => {
    expect(
      decideRealtimeNoteUpdate(
        { eventType: 'UPDATE', new: { content: 'same' }, old: null },
        'same',
        false,
      ),
    ).toEqual({ action: 'ignore' });
  });

  it('applies genuinely different remote content silently', () => {
    expect(
      decideRealtimeNoteUpdate(
        { eventType: 'UPDATE', new: { content: 'from phone B' }, old: null },
        'from phone A',
        false,
      ),
    ).toEqual({ action: 'apply', content: 'from phone B' });
  });

  it('protects unsaved local typing from remote updates and deletes', () => {
    expect(
      decideRealtimeNoteUpdate(
        { eventType: 'UPDATE', new: { content: 'remote' }, old: null },
        'typing',
        true,
      ),
    ).toEqual({ action: 'ignore' });
    expect(
      decideRealtimeNoteUpdate(
        { eventType: 'DELETE', new: null, old: { content: 'old' } },
        'typing',
        true,
      ),
    ).toEqual({ action: 'ignore' });
  });

  it('clears on a remote delete and quietly fetches incomplete payloads', () => {
    expect(
      decideRealtimeNoteUpdate(
        { eventType: 'DELETE', new: null, old: { content: 'old' } },
        'old',
        false,
      ),
    ).toEqual({ action: 'clear' });
    expect(
      decideRealtimeNoteUpdate(
        { eventType: 'UPDATE', new: { student_id: 'u1' }, old: null },
        'current',
        false,
      ),
    ).toEqual({ action: 'fetch' });
  });
});

describe('countBySubject', () => {
  it('counts rows per subject_id', () => {
    const rows = [
      { subject_id: 'a' },
      { subject_id: 'a' },
      { subject_id: 'b' },
    ];
    expect(countBySubject(rows)).toEqual({ a: 2, b: 1 });
  });

  it('omits subjects with no rows and ignores null ids', () => {
    const rows = [{ subject_id: 'a' }, { subject_id: null }];
    expect(countBySubject(rows)).toEqual({ a: 1 });
  });

  it('returns empty object for empty input', () => {
    expect(countBySubject([])).toEqual({});
  });
});

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('one two three')).toBe(3);
  });

  it('collapses runs of whitespace and newlines', () => {
    expect(countWords('  one\n\n  two\t three  ')).toBe(3);
  });

  it('returns 0 for empty / whitespace / null / undefined', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n ')).toBe(0);
    expect(countWords(null)).toBe(0);
    expect(countWords(undefined)).toBe(0);
  });
});

describe('buildTopicTitleMap', () => {
  it('maps topic id to title', () => {
    expect(
      buildTopicTitleMap([
        { id: 't1', title: 'Alpha' },
        { id: 't2', title: 'Beta' },
      ]),
    ).toEqual({ t1: 'Alpha', t2: 'Beta' });
  });
});

describe('buildAggregateContent', () => {
  it('renders each topic block with the Topic: header and triple newline', () => {
    const out = buildAggregateContent(
      [{ topic_id: 't1', content: 'My notes' }],
      { t1: 'Chemical Equations' },
    );
    expect(out).toBe('Topic: Chemical Equations\n\n\nMy notes');
  });

  it('joins multiple topics with a blank line and falls back to "Topic"', () => {
    const out = buildAggregateContent(
      [
        { topic_id: 't1', content: 'First' },
        { topic_id: 'unknown', content: 'Second' },
      ],
      { t1: 'A' },
    );
    expect(out).toBe('Topic: A\n\n\nFirst\n\nTopic: Topic\n\n\nSecond');
  });

  it('skips topics with empty content', () => {
    const out = buildAggregateContent(
      [
        { topic_id: 't1', content: '   ' },
        { topic_id: 't2', content: 'Kept' },
      ],
      { t1: 'A', t2: 'B' },
    );
    expect(out).toBe('Topic: B\n\n\nKept');
  });
});

describe('isAggregateStale', () => {
  it('is false when there are no topic notes', () => {
    expect(isAggregateStale({ updated_at: '2026-01-01T00:00:00Z' }, [])).toBe(
      false,
    );
  });

  it('is true when no aggregate exists but topic notes do', () => {
    expect(
      isAggregateStale(null, [{ updated_at: '2026-01-01T00:00:00Z' }]),
    ).toBe(true);
  });

  it('is true when newest topic note is newer than the aggregate', () => {
    expect(
      isAggregateStale({ updated_at: '2026-01-01T00:00:00Z' }, [
        { updated_at: '2026-01-01T00:00:00Z' },
        { updated_at: '2026-02-01T00:00:00Z' },
      ]),
    ).toBe(true);
  });

  it('is false when the aggregate is newer or equal', () => {
    expect(
      isAggregateStale({ updated_at: '2026-03-01T00:00:00Z' }, [
        { updated_at: '2026-02-01T00:00:00Z' },
      ]),
    ).toBe(false);
    expect(
      isAggregateStale({ updated_at: '2026-02-01T00:00:00Z' }, [
        { updated_at: '2026-02-01T00:00:00Z' },
      ]),
    ).toBe(false);
  });

  it('treats an unparseable aggregate timestamp as stale', () => {
    expect(
      isAggregateStale({ updated_at: 'not-a-date' }, [
        { updated_at: '2026-02-01T00:00:00Z' },
      ]),
    ).toBe(true);
  });
});
