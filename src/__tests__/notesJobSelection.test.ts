/**
 * Tests for the notes job selection logic (mobile/src/utils/notesJobSelection.ts).
 *
 * Real-world scenario covered: the newest published+completed lecture job can
 * be an error stub ({"error": "Server unreachable…"}) with no sections, while
 * an older published job holds the actual lecture. Notes must come from the
 * newest USABLE job, never render from an error stub, and only be empty when
 * no usable job exists.
 */
import {
  isValidNotesJob,
  selectValidNotesJob,
  NotesJobCandidate,
} from '../utils/notesJobSelection';

const validJob = (id: string, sectionCount = 3): NotesJobCandidate => ({
  id,
  document_name: `doc-${id}.docx`,
  created_at: '2026-07-01T00:00:00Z',
  presentation_json: {
    sections: Array.from({ length: sectionCount }, (_, i) => ({
      section_id: `${i + 1}`,
      title: `Section ${i + 1}`,
    })),
  },
});

const errorStubJob = (id: string): NotesJobCandidate => ({
  id,
  document_name: `doc-${id}.docx`,
  created_at: '2026-07-12T00:00:00Z',
  presentation_json: {
    error: 'Server unreachable at 204.12.237.78:5005. The video generation server may be down or restarting.',
  },
});

describe('isValidNotesJob', () => {
  it('accepts a job with a non-empty sections array', () => {
    expect(isValidNotesJob(validJob('a'))).toBe(true);
  });

  it('rejects an error stub with no sections', () => {
    expect(isValidNotesJob(errorStubJob('b'))).toBe(false);
  });

  it('accepts a job that has usable sections alongside a warning/error field', () => {
    const job = validJob('c');
    (job.presentation_json as any).error = 'partial warning';
    expect(isValidNotesJob(job)).toBe(true);
  });

  it('rejects null presentation_json', () => {
    expect(isValidNotesJob({ ...validJob('d'), presentation_json: null })).toBe(false);
  });

  it('rejects empty sections array', () => {
    expect(
      isValidNotesJob({ ...validJob('e'), presentation_json: { sections: [] } }),
    ).toBe(false);
  });

  it('rejects sections that is not an array', () => {
    expect(
      isValidNotesJob({ ...validJob('f'), presentation_json: { sections: 'oops' } }),
    ).toBe(false);
  });

  it('rejects null/undefined job', () => {
    expect(isValidNotesJob(null)).toBe(false);
    expect(isValidNotesJob(undefined)).toBe(false);
  });
});

describe('selectValidNotesJob', () => {
  it('picks the newest job when it is valid', () => {
    const newest = validJob('newest');
    const older = validJob('older');
    expect(selectValidNotesJob([newest, older])?.id).toBe('newest');
  });

  it('skips a newest error stub and falls back to the older valid job', () => {
    const stub = errorStubJob('stub');
    const older = validJob('older', 7);
    expect(selectValidNotesJob([stub, older])?.id).toBe('older');
  });

  it('skips multiple invalid jobs to find the first usable one', () => {
    const jobs = [
      errorStubJob('stub1'),
      { ...validJob('empty'), presentation_json: { sections: [] } },
      { ...validJob('nullpj'), presentation_json: null },
      validJob('good'),
    ];
    expect(selectValidNotesJob(jobs)?.id).toBe('good');
  });

  it('returns null when all jobs are invalid', () => {
    expect(
      selectValidNotesJob([errorStubJob('a'), { ...validJob('b'), presentation_json: null }]),
    ).toBeNull();
  });

  it('returns null for empty or missing lists', () => {
    expect(selectValidNotesJob([])).toBeNull();
    expect(selectValidNotesJob(null)).toBeNull();
    expect(selectValidNotesJob(undefined)).toBeNull();
  });
});
