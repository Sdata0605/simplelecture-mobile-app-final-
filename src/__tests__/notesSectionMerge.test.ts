/**
 * Tests for mergePagesIntoSectionPages — the reader shows one screen per
 * section, so multi-page sections must merge back into a single NotePage.
 */
import { buildNotePages, mergePagesIntoSectionPages } from '../utils/notePagination';
import { NotePage, NotesQuestion } from '../types/topicNotes';

function makePage(overrides: Partial<NotePage>): NotePage {
  return {
    id: 's1-0',
    sectionIndex: 0,
    sectionId: 's1',
    sectionTitle: 'Section One',
    sectionType: 'content',
    isFirstPageOfSection: true,
    isLastPageOfSection: true,
    pageInSection: 0,
    totalPagesInSection: 1,
    prose: '',
    callouts: [],
    bullets: [],
    images: [],
    questions: { important: [], practice: [] },
    ...overrides,
  };
}

function makeQuestion(id: string, important = false): NotesQuestion {
  return {
    id,
    question_text: `Question ${id}`,
    is_important: important,
    subtopic_id: null,
    difficulty: 'medium',
    explanation: null,
    options: null,
    correct_answer: 'a',
  };
}

describe('mergePagesIntoSectionPages', () => {
  it('returns empty for no pages', () => {
    expect(mergePagesIntoSectionPages([])).toEqual([]);
  });

  it('keeps single-page sections intact', () => {
    const page = makePage({
      prose: 'Hello',
      callouts: [{ type: 'formula', text: 'E=mc^2' }],
    });
    const merged = mergePagesIntoSectionPages([page]);
    expect(merged).toHaveLength(1);
    expect(merged[0].prose).toBe('Hello');
    expect(merged[0].callouts).toHaveLength(1);
    expect(merged[0].isFirstPageOfSection).toBe(true);
    expect(merged[0].isLastPageOfSection).toBe(true);
    expect(merged[0].totalPagesInSection).toBe(1);
  });

  it('merges a multi-page section into one page with joined prose and collected extras', () => {
    const p0 = makePage({
      id: 's1-0',
      prose: 'First chunk.',
      isLastPageOfSection: false,
      totalPagesInSection: 3,
      callouts: [{ type: 'definition', text: 'An acid donates H+' }],
    });
    const p1 = makePage({
      id: 's1-1',
      prose: 'Second chunk.',
      isFirstPageOfSection: false,
      isLastPageOfSection: false,
      pageInSection: 1,
      totalPagesInSection: 3,
    });
    const p2 = makePage({
      id: 's1-2',
      prose: 'Third chunk.',
      isFirstPageOfSection: false,
      pageInSection: 2,
      totalPagesInSection: 3,
      bullets: [{ text: 'Key point' }],
      images: [{ url: 'https://x/img.png' }],
      questions: {
        important: [makeQuestion('q1', true)],
        practice: [makeQuestion('q2')],
      },
    });

    const merged = mergePagesIntoSectionPages([p0, p1, p2]);
    expect(merged).toHaveLength(1);
    const sec = merged[0];
    expect(sec.prose).toBe('First chunk.\n\nSecond chunk.\n\nThird chunk.');
    expect(sec.callouts).toHaveLength(1);
    expect(sec.bullets).toHaveLength(1);
    expect(sec.images).toHaveLength(1);
    expect(sec.questions.important).toHaveLength(1);
    expect(sec.questions.practice).toHaveLength(1);
    expect(sec.isFirstPageOfSection).toBe(true);
    expect(sec.isLastPageOfSection).toBe(true);
    expect(sec.totalPagesInSection).toBe(1);
  });

  it('preserves section order and reindexes sectionIndex', () => {
    const pages = [
      makePage({ id: 'a-0', sectionId: 'a', sectionTitle: 'A', prose: 'a' }),
      makePage({ id: 'b-0', sectionId: 'b', sectionTitle: 'B', prose: 'b', sectionIndex: 1 }),
      makePage({ id: 'c-0', sectionId: 'c', sectionTitle: 'C', prose: 'c', sectionIndex: 2 }),
    ];
    const merged = mergePagesIntoSectionPages(pages);
    expect(merged.map((p) => p.sectionTitle)).toEqual(['A', 'B', 'C']);
    expect(merged.map((p) => p.sectionIndex)).toEqual([0, 1, 2]);
    expect(merged.map((p) => p.id)).toEqual(['a-full', 'b-full', 'c-full']);
  });

  it('does not mutate the input pages', () => {
    const p0 = makePage({
      id: 's1-0',
      prose: 'One.',
      isLastPageOfSection: false,
      totalPagesInSection: 2,
    });
    const p1 = makePage({
      id: 's1-1',
      prose: 'Two.',
      isFirstPageOfSection: false,
      pageInSection: 1,
      totalPagesInSection: 2,
      bullets: [{ text: 'bp' }],
    });
    mergePagesIntoSectionPages([p0, p1]);
    expect(p0.prose).toBe('One.');
    expect(p0.bullets).toHaveLength(0);
    expect(p1.isFirstPageOfSection).toBe(false);
  });

  it('round-trips with buildNotePages for a long section', () => {
    const longText = Array.from({ length: 12 }, (_, i) =>
      `Paragraph ${i} ${'word '.repeat(60)}`.trim(),
    ).join('\n\n');
    const sections = [
      {
        section_id: 'long',
        title: 'Long Section',
        narration: { full_text: longText },
      },
    ];
    const pages = buildNotePages(sections, new Map());
    expect(pages.length).toBeGreaterThan(1); // sanity: it actually paginated

    const merged = mergePagesIntoSectionPages(pages);
    expect(merged).toHaveLength(1);
    // All prose survives the merge
    expect(merged[0].prose).toContain('Paragraph 0');
    expect(merged[0].prose).toContain('Paragraph 11');
  });
});
