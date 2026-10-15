/**
 * Scenario tests for the Doubts thread store: title generation, relative
 * time, sorting, message capping, legacy migration, corrupt-data recovery,
 * per-subject isolation, and the suggestion merge rules.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DoubtThread,
  DoubtStoredMessage,
  PLACEHOLDER_TITLE,
  MAX_THREAD_MESSAGES,
  createThread,
  generateThreadId,
  titleFromMessages,
  deriveTitle,
  formatRelativeTime,
  sortThreads,
  sanitizeThreads,
  capThreadMessages,
  migrateLegacyMessages,
  loadThreads,
  saveThreads,
  mergeSuggestions,
} from '../utils/doubtThreads';

const SUBJECT = 'subj-1';
const OTHER_SUBJECT = 'subj-2';

beforeEach(async () => {
  await (AsyncStorage as any).clear();
});

describe('generateThreadId / createThread', () => {
  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateThreadId()));
    expect(ids.size).toBe(50);
  });

  it('creates a placeholder thread', () => {
    const t = createThread(1000);
    expect(t.title).toBe(PLACEHOLDER_TITLE);
    expect(t.createdAt).toBe(1000);
    expect(t.updatedAt).toBe(1000);
    expect(t.messages).toEqual([]);
  });
});

describe('title generation', () => {
  it('uses the first user message, trimmed and collapsed', () => {
    expect(
      titleFromMessages([
        { role: 'assistant', content: 'hi there' },
        { role: 'user', content: '  explain   transportation \n in humans  ' },
      ])
    ).toBe('explain transportation in humans');
  });

  it('caps long titles at 60 chars with ellipsis', () => {
    const long = 'x'.repeat(100);
    const title = titleFromMessages([{ role: 'user', content: long }])!;
    expect(title.length).toBe(58); // 57 + '…'
    expect(title.endsWith('…')).toBe(true);
  });

  it('keeps exactly-60-char titles untouched', () => {
    const exact = 'y'.repeat(60);
    expect(titleFromMessages([{ role: 'user', content: exact }])).toBe(exact);
  });

  it('returns null with no user message', () => {
    expect(titleFromMessages([{ role: 'assistant', content: 'welcome' }])).toBeNull();
    expect(titleFromMessages([])).toBeNull();
  });

  it('deriveTitle replaces only the placeholder and never a real title', () => {
    const msgs = [{ role: 'user' as const, content: 'first question' }];
    expect(deriveTitle(PLACEHOLDER_TITLE, msgs)).toBe('first question');
    expect(deriveTitle('existing title', msgs)).toBe('existing title');
    expect(deriveTitle(PLACEHOLDER_TITLE, [])).toBe(PLACEHOLDER_TITLE);
  });
});

describe('formatRelativeTime', () => {
  const now = 1_000_000_000_000;
  it('covers all buckets', () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe('just now');
    expect(formatRelativeTime(now - 23 * 60_000, now)).toBe('23m ago');
    expect(formatRelativeTime(now - 5 * 3_600_000, now)).toBe('5h ago');
    expect(formatRelativeTime(now - 3 * 86_400_000, now)).toBe('3d ago');
    expect(formatRelativeTime(now - 8 * 86_400_000, now)).toBe(
      new Date(now - 8 * 86_400_000).toLocaleDateString()
    );
  });

  it('never goes negative for future timestamps', () => {
    expect(formatRelativeTime(now + 60_000, now)).toBe('just now');
  });
});

describe('sortThreads / capThreadMessages', () => {
  it('sorts by updatedAt DESC without mutating input', () => {
    const a: DoubtThread = { id: 'a', title: 'a', createdAt: 1, updatedAt: 1, messages: [] };
    const b: DoubtThread = { id: 'b', title: 'b', createdAt: 2, updatedAt: 5, messages: [] };
    const input = [a, b];
    const sorted = sortThreads(input);
    expect(sorted.map((t) => t.id)).toEqual(['b', 'a']);
    expect(input[0].id).toBe('a');
  });

  it('caps messages to the last 30, keeping the newest', () => {
    const messages = Array.from({ length: 45 }, (_, i) => ({
      role: 'user' as const,
      content: `m${i}`,
    }));
    const [capped] = capThreadMessages([
      { id: 't', title: 't', createdAt: 0, updatedAt: 0, messages },
    ]);
    expect(capped.messages.length).toBe(MAX_THREAD_MESSAGES);
    expect(capped.messages[0].content).toBe('m15');
    expect(capped.messages[29].content).toBe('m44');
  });
});

describe('sanitizeThreads (corrupt data recovery)', () => {
  it('returns [] for non-arrays', () => {
    expect(sanitizeThreads(null)).toEqual([]);
    expect(sanitizeThreads('garbage')).toEqual([]);
    expect(sanitizeThreads({ a: 1 })).toEqual([]);
  });

  it('drops malformed entries and messages, keeps valid ones', () => {
    const out = sanitizeThreads([
      null,
      { id: '', title: 'no id' },
      {
        id: 'ok',
        title: 'valid',
        createdAt: 5,
        updatedAt: 9,
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'bogus', content: 'nope' },
          { role: 'assistant' }, // missing content
          { role: 'assistant', content: 'yo', suggestions: ['a', { text: 'b' }, 42, '  '] },
        ],
      },
    ]);
    expect(out.length).toBe(1);
    expect(out[0].messages.length).toBe(2);
    expect(out[0].messages[1].suggestions).toEqual(['a', 'b']);
  });
});

describe('legacy migration', () => {
  it('wraps legacy messages into a single titled thread', () => {
    const legacy = [
      { role: 'user', content: 'what is osmosis?' },
      { role: 'assistant', content: 'Osmosis is…' },
    ];
    const thread = migrateLegacyMessages(legacy, 123)!;
    expect(thread.title).toBe('what is osmosis?');
    expect(thread.messages.length).toBe(2);
    expect(thread.createdAt).toBe(123);
  });

  it('returns null for empty or invalid legacy payloads', () => {
    expect(migrateLegacyMessages([])).toBeNull();
    expect(migrateLegacyMessages('junk')).toBeNull();
    expect(migrateLegacyMessages([{ nope: true }])).toBeNull();
  });

  it('loadThreads migrates once and deletes the legacy key', async () => {
    await AsyncStorage.setItem(
      `doubts-chat:${SUBJECT}`,
      JSON.stringify([{ role: 'user', content: 'legacy question' }])
    );
    const first = await loadThreads(SUBJECT);
    expect(first.length).toBe(1);
    expect(first[0].title).toBe('legacy question');
    expect(await AsyncStorage.getItem(`doubts-chat:${SUBJECT}`)).toBeNull();

    // Second load reads the migrated primary key — no double-migration.
    const second = await loadThreads(SUBJECT);
    expect(second.length).toBe(1);
    expect(second[0].id).toBe(first[0].id);
  });

  it('does not migrate when primary threads already exist', async () => {
    const existing = createThread(10);
    await saveThreads(SUBJECT, [existing]);
    await AsyncStorage.setItem(
      `doubts-chat:${SUBJECT}`,
      JSON.stringify([{ role: 'user', content: 'stale legacy' }])
    );
    const loaded = await loadThreads(SUBJECT);
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe(existing.id);
    // Legacy key untouched (primary was non-empty, so migration never ran).
  });

  it('drops a corrupt legacy payload and deletes the key', async () => {
    await AsyncStorage.setItem(`doubts-chat:${SUBJECT}`, '{not json');
    const loaded = await loadThreads(SUBJECT);
    expect(loaded).toEqual([]);
    expect(await AsyncStorage.getItem(`doubts-chat:${SUBJECT}`)).toBeNull();
  });
});

describe('loadThreads / saveThreads', () => {
  it('fresh install → empty list', async () => {
    expect(await loadThreads(SUBJECT)).toEqual([]);
  });

  it('round-trips threads sorted by recency', async () => {
    const older = { ...createThread(100), id: 'older', updatedAt: 100 };
    const newer = { ...createThread(200), id: 'newer', updatedAt: 200 };
    await saveThreads(SUBJECT, [older, newer]);
    const loaded = await loadThreads(SUBJECT);
    expect(loaded.map((t) => t.id)).toEqual(['newer', 'older']);
  });

  it('caps messages on save', async () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({
      role: 'user' as const,
      content: `q${i}`,
    }));
    await saveThreads(SUBJECT, [{ id: 't', title: 't', createdAt: 0, updatedAt: 0, messages }]);
    const [loaded] = await loadThreads(SUBJECT);
    expect(loaded.messages.length).toBe(MAX_THREAD_MESSAGES);
    expect(loaded.messages[loaded.messages.length - 1].content).toBe('q39');
  });

  it('recovers from corrupt primary JSON without crashing', async () => {
    await AsyncStorage.setItem(`doubts-threads:${SUBJECT}`, '][ not json');
    expect(await loadThreads(SUBJECT)).toEqual([]);
  });

  it('keeps subjects isolated', async () => {
    await saveThreads(SUBJECT, [{ ...createThread(1), id: 's1-thread' }]);
    await saveThreads(OTHER_SUBJECT, [{ ...createThread(2), id: 's2-thread' }]);
    expect((await loadThreads(SUBJECT)).map((t) => t.id)).toEqual(['s1-thread']);
    expect((await loadThreads(OTHER_SUBJECT)).map((t) => t.id)).toEqual(['s2-thread']);
  });

  it('handles empty subjectId defensively', async () => {
    expect(await loadThreads('')).toEqual([]);
    await expect(saveThreads('', [])).resolves.toBeUndefined();
  });
});

describe('mergeSuggestions', () => {
  it('puts DB matches first, dedupes case-insensitively, caps at 6', () => {
    const merged = mergeSuggestions(
      ['What is DNA?', 'Explain mitosis'],
      ['explain MITOSIS', 'What is RNA?', 'A', 'B', 'C', 'D'],
      6
    );
    expect(merged).toEqual(['What is DNA?', 'Explain mitosis', 'What is RNA?', 'A', 'B', 'C']);
  });

  it('skips blanks and non-strings', () => {
    expect(mergeSuggestions(['', '  ', 'ok'], [null as any, 'ok', 'two'])).toEqual(['ok', 'two']);
  });

  it('returns [] when both sides are empty', () => {
    expect(mergeSuggestions([], [])).toEqual([]);
  });
});

describe('full user-flow simulation (store level)', () => {
  it('new doubt → first message titles the thread once; later messages never retitle', async () => {
    let thread = createThread(1000);
    // First user message
    let msgs = [...thread.messages, { role: 'user' as const, content: 'How do vaccines work?' }];
    thread = { ...thread, messages: msgs, title: deriveTitle(thread.title, msgs), updatedAt: 2000 };
    expect(thread.title).toBe('How do vaccines work?');
    // Assistant + second user message must NOT change the title
    msgs = [
      ...thread.messages,
      { role: 'assistant' as const, content: 'They train immunity…' },
      { role: 'user' as const, content: 'and boosters?' },
    ];
    thread = { ...thread, messages: msgs, title: deriveTitle(thread.title, msgs), updatedAt: 3000 };
    expect(thread.title).toBe('How do vaccines work?');

    await saveThreads(SUBJECT, [thread]);
    const [loaded] = await loadThreads(SUBJECT);
    expect(loaded.title).toBe('How do vaccines work?');
    expect(loaded.messages.length).toBe(3);
  });

  it('repeated "+ New doubt" creates distinct placeholder threads, newest on top', async () => {
    const t1 = createThread(1000);
    const t2 = createThread(2000);
    const t3 = createThread(3000);
    await saveThreads(SUBJECT, [t3, t2, t1]);
    const loaded = await loadThreads(SUBJECT);
    expect(loaded.map((t) => t.id)).toEqual([t3.id, t2.id, t1.id]);
    expect(new Set(loaded.map((t) => t.id)).size).toBe(3);
    loaded.forEach((t) => expect(t.title).toBe(PLACEHOLDER_TITLE));
  });

  it('deleting the active thread leaves the rest intact after reload', async () => {
    const keep = { ...createThread(1), id: 'keep', updatedAt: 1 };
    const remove = { ...createThread(2), id: 'remove', updatedAt: 2 };
    await saveThreads(SUBJECT, [remove, keep]);
    const afterDelete = (await loadThreads(SUBJECT)).filter((t) => t.id !== 'remove');
    await saveThreads(SUBJECT, afterDelete);
    expect((await loadThreads(SUBJECT)).map((t) => t.id)).toEqual(['keep']);
  });

  it('only the newest assistant message keeps chips after a new send (strip rule)', () => {
    const before: DoubtStoredMessage[] = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1', suggestions: ['old chip'] },
    ];
    const afterSend: DoubtStoredMessage[] = [
      ...before.map((m) => ({ ...m, suggestions: undefined })),
      { role: 'user', content: 'q2' },
    ];
    expect(afterSend[1].suggestions).toBeUndefined();
  });
});
