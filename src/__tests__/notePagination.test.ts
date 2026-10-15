/**
 * Unit tests for notePagination.ts.
 * Covers: text chunking, page building, section indexing, and question bucketing.
 */

import { buildNotePages, buildSectionIndex, splitIntoParagraphChunks, PAGE_CHAR_LIMIT } from '../utils/notePagination';
import { TopicNoteSection, NotePage, NotesQuestion } from '../types/topicNotes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSection(
  override: Partial<TopicNoteSection> & { id?: string | number } = {},
): TopicNoteSection {
  const { id, ...rest } = override;
  return {
    section_id: id ?? '1',
    title: 'Test Section',
    section_type: 'content',
    narration: {
      segments: [{ text: 'A sentence about something important. It is quite short.' }],
    },
    visual_beats: [],
    ...rest,
  };
}

function makeQuestion(override: Partial<NotesQuestion> = {}): NotesQuestion {
  return {
    id: Math.random().toString(),
    question_text: 'What is the definition?',
    is_important: false,
    subtopic_id: null,
    difficulty: 'Easy',
    explanation: null,
    options: null,
    correct_answer: 'A',
    ...override,
  };
}

// ---------------------------------------------------------------------------
// splitIntoParagraphChunks
// ---------------------------------------------------------------------------

describe('splitIntoParagraphChunks', () => {
  it('returns empty array for empty string', () => {
    expect(splitIntoParagraphChunks('')).toEqual([]);
  });

  it('returns a single chunk for short text', () => {
    const result = splitIntoParagraphChunks('Hello world.');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Hello world.');
  });

  it('does not split text shorter than PAGE_CHAR_LIMIT', () => {
    const text = 'Short text.';
    expect(splitIntoParagraphChunks(text, 900)).toHaveLength(1);
  });

  it('splits long text into multiple chunks each within the limit', () => {
    const longText = Array(30).fill('This is a sentence.').join(' ');
    const chunks = splitIntoParagraphChunks(longText, 100);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(120); // with word-boundary tolerance
    });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('respects double-newline paragraph boundaries', () => {
    const text = `Short paragraph one.\n\nShort paragraph two.`;
    const chunks = splitIntoParagraphChunks(text, 200);
    expect(chunks).toHaveLength(1); // both fit in one chunk
    expect(chunks[0]).toContain('Short paragraph one');
    expect(chunks[0]).toContain('Short paragraph two');
  });

  it('does not split words in the middle', () => {
    const text = 'The quick brown fox jumps over the lazy dog and then runs far away.';
    const chunks = splitIntoParagraphChunks(text, 30);
    chunks.forEach((chunk) => {
      // Each word should be intact (no partial words)
      chunk.split(' ').forEach((word) => {
        expect(word).not.toBe('');
      });
    });
  });

  it('produces no empty chunks', () => {
    const text = 'Para one.\n\nPara two.\n\nPara three.';
    const chunks = splitIntoParagraphChunks(text, 50);
    chunks.forEach((chunk) => {
      expect(chunk.trim()).not.toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// buildNotePages
// ---------------------------------------------------------------------------

describe('buildNotePages', () => {
  it('returns an empty array for empty sections', () => {
    const pages = buildNotePages([], new Map());
    expect(pages).toHaveLength(0);
  });

  it('produces at least one page per section', () => {
    const sections = [makeSection({ id: 'a' }), makeSection({ id: 'b' })];
    const pages = buildNotePages(sections, new Map());
    expect(pages.length).toBeGreaterThanOrEqual(2);
  });

  it('produces no blank pages', () => {
    const sections = [makeSection()];
    const pages = buildNotePages(sections, new Map());
    pages.forEach((page) => {
      const hasContent =
        page.prose ||
        page.callouts.length > 0 ||
        page.bullets.length > 0 ||
        page.images.length > 0 ||
        page.questions.important.length > 0 ||
        page.questions.practice.length > 0;
      expect(hasContent).toBeTruthy();
    });
  });

  it('marks first and last page correctly for single-page sections', () => {
    const sections = [makeSection({ id: 's1' })];
    const pages = buildNotePages(sections, new Map());
    expect(pages[0].isFirstPageOfSection).toBe(true);
    expect(pages[pages.length - 1].isLastPageOfSection).toBe(true);
  });

  it('places callouts on the first page of each section', () => {
    const section = makeSection({
      id: 's2',
      visual_beats: [
        { visual_type: 'definition', display_text: 'A definition block.' },
      ],
    });
    const pages = buildNotePages([section], new Map());
    const firstPage = pages.find((p) => p.isFirstPageOfSection)!;
    expect(firstPage.callouts.length).toBeGreaterThan(0);
    // Middle / other pages should have no callouts
    pages.filter((p) => !p.isFirstPageOfSection).forEach((p) => {
      expect(p.callouts.length).toBe(0);
    });
  });

  it('places bullets, images, and questions on the last page of each section', () => {
    const section = makeSection({
      id: 's3',
      visual_beats: [
        { visual_type: 'bullet', display_text: 'Point A' },
        { image_url: 'https://example.com/img.png' },
      ],
    });
    const q = makeQuestion({ is_important: true });
    const qMap = new Map<string, NotesQuestion[]>([['s3', [q]]]);
    const pages = buildNotePages([section], qMap);
    const lastPage = pages[pages.length - 1];
    expect(lastPage.isLastPageOfSection).toBe(true);
    expect(lastPage.bullets.length).toBeGreaterThan(0);
    expect(lastPage.images.length).toBeGreaterThan(0);
    expect(lastPage.questions.important.length).toBeGreaterThan(0);
  });

  it('produces multiple pages for very long narration', () => {
    const longText = Array(60).fill('This is one narration sentence.').join(' ');
    const section = makeSection({
      id: 'long',
      narration: { segments: [{ text: longText }] },
    });
    const pages = buildNotePages([section], new Map());
    expect(pages.length).toBeGreaterThan(1);
  });

  it('caps important questions at 2 per section', () => {
    const questions = Array(5)
      .fill(null)
      .map((_, i) =>
        makeQuestion({ id: `q${i}`, is_important: true, question_text: `Important Q${i}?` }),
      );
    const qMap = new Map<string, NotesQuestion[]>([['s', questions]]);
    const pages = buildNotePages([makeSection({ id: 's' })], qMap);
    const lastPage = pages[pages.length - 1];
    expect(lastPage.questions.important.length).toBeLessThanOrEqual(2);
  });

  it('caps practice questions at 3 per section', () => {
    const questions = Array(6)
      .fill(null)
      .map((_, i) =>
        makeQuestion({ id: `p${i}`, is_important: false, question_text: `Practice Q${i}?` }),
      );
    const qMap = new Map<string, NotesQuestion[]>([['s', questions]]);
    const pages = buildNotePages([makeSection({ id: 's' })], qMap);
    const lastPage = pages[pages.length - 1];
    expect(lastPage.questions.practice.length).toBeLessThanOrEqual(3);
  });

  it('handles missing narration gracefully', () => {
    const section: TopicNoteSection = {
      section_id: 'empty',
      title: 'Empty Section',
      section_type: 'content',
    };
    expect(() => buildNotePages([section], new Map())).not.toThrow();
  });

  it('handles malformed visual_beats gracefully', () => {
    const section = makeSection({
      id: 'bad',
      visual_beats: [
        null as any,
        undefined as any,
        { visual_type: 'bullet', display_text: null },
        { visual_type: 'image', image_url: 'not-a-url' }, // invalid URL
      ],
    });
    expect(() => buildNotePages([section], new Map())).not.toThrow();
  });

  it('gives pages stable unique IDs', () => {
    const sections = [makeSection({ id: 'x' }), makeSection({ id: 'y' })];
    const pages = buildNotePages(sections, new Map());
    const ids = pages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('assigns correct sectionIndex to each page', () => {
    const sections = [makeSection({ id: 'a' }), makeSection({ id: 'b' })];
    const pages = buildNotePages(sections, new Map());
    const aPages = pages.filter((p) => p.sectionId === 'a');
    const bPages = pages.filter((p) => p.sectionId === 'b');
    aPages.forEach((p) => expect(p.sectionIndex).toBe(0));
    bPages.forEach((p) => expect(p.sectionIndex).toBe(1));
  });
});

// ---------------------------------------------------------------------------
// buildSectionIndex
// ---------------------------------------------------------------------------

describe('buildSectionIndex', () => {
  it('returns empty arrays for empty pages', () => {
    const { sectionTitles, sectionFirstPageIndexes } = buildSectionIndex([]);
    expect(sectionTitles).toHaveLength(0);
    expect(sectionFirstPageIndexes).toHaveLength(0);
  });

  it('returns one entry per unique section', () => {
    const sections = [makeSection({ id: 'a', title: 'Alpha' } as any), makeSection({ id: 'b', title: 'Beta' } as any)];
    const pages = buildNotePages(sections, new Map());
    const { sectionTitles, sectionFirstPageIndexes } = buildSectionIndex(pages);
    expect(sectionTitles).toHaveLength(2);
    expect(sectionFirstPageIndexes).toHaveLength(2);
  });

  it('sectionFirstPageIndexes[0] is always 0', () => {
    const pages = buildNotePages([makeSection()], new Map());
    const { sectionFirstPageIndexes } = buildSectionIndex(pages);
    expect(sectionFirstPageIndexes[0]).toBe(0);
  });

  it('indexes are in ascending order', () => {
    const sections = [
      makeSection({ id: 'a' }),
      makeSection({ id: 'b', narration: { segments: [{ text: Array(40).fill('Long sentence.').join(' ') }] } }),
      makeSection({ id: 'c' }),
    ];
    const pages = buildNotePages(sections, new Map());
    const { sectionFirstPageIndexes } = buildSectionIndex(pages);
    for (let i = 1; i < sectionFirstPageIndexes.length; i++) {
      expect(sectionFirstPageIndexes[i]).toBeGreaterThan(sectionFirstPageIndexes[i - 1]);
    }
  });
});
