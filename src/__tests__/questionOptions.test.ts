import { normalizeOptions, resolveCorrectAnswer } from '../utils/questionOptions';

describe('normalizeOptions (notes)', () => {
  it('returns [] for null/undefined/non-object', () => {
    expect(normalizeOptions(null)).toEqual([]);
    expect(normalizeOptions(undefined)).toEqual([]);
    expect(normalizeOptions('foo')).toEqual([]);
    expect(normalizeOptions(42)).toEqual([]);
  });

  it('letters array options A, B, C…', () => {
    expect(normalizeOptions(['Vein', 'Artery'])).toEqual([
      { key: 'A', text: 'Vein' },
      { key: 'B', text: 'Artery' },
    ]);
  });

  it('handles array of { text } objects', () => {
    expect(normalizeOptions([{ text: 'x' }, { text: 'y' }])).toEqual([
      { key: 'A', text: 'x' },
      { key: 'B', text: 'y' },
    ]);
  });

  it('handles keyed object options', () => {
    expect(normalizeOptions({ A: 'Vein', B: 'Artery' })).toEqual([
      { key: 'A', text: 'Vein' },
      { key: 'B', text: 'Artery' },
    ]);
  });

  it('handles keyed object-of-objects options', () => {
    expect(normalizeOptions({ A: { text: 'Vein' }, B: { text: 'Artery' } })).toEqual([
      { key: 'A', text: 'Vein' },
      { key: 'B', text: 'Artery' },
    ]);
  });
});

describe('resolveCorrectAnswer', () => {
  const opts = normalizeOptions({ A: 'Vein', B: 'Artery', C: 'Capillary' });

  it('resolves an option key to "key. text"', () => {
    expect(resolveCorrectAnswer('B', opts)).toBe('B. Artery');
  });

  it('matches keys case-insensitively', () => {
    expect(resolveCorrectAnswer('b', opts)).toBe('B. Artery');
  });

  it('resolves an option text back to its key', () => {
    expect(resolveCorrectAnswer('artery', opts)).toBe('B. Artery');
  });

  it('falls back to the raw answer when no option matches', () => {
    expect(resolveCorrectAnswer('Mitochondria', opts)).toBe('Mitochondria');
  });

  it('returns the raw answer when there are no options (non-MCQ)', () => {
    expect(resolveCorrectAnswer('Photosynthesis', [])).toBe('Photosynthesis');
  });

  it('returns empty string for empty/missing answers', () => {
    expect(resolveCorrectAnswer('', opts)).toBe('');
    expect(resolveCorrectAnswer(null, opts)).toBe('');
    expect(resolveCorrectAnswer(undefined, [])).toBe('');
    expect(resolveCorrectAnswer('   ', opts)).toBe('');
  });

  it('trims whitespace before matching', () => {
    expect(resolveCorrectAnswer(' B ', opts)).toBe('B. Artery');
  });

  it('tolerates decorated key formats like "B." and "(B)"', () => {
    expect(resolveCorrectAnswer('B.', opts)).toBe('B. Artery');
    expect(resolveCorrectAnswer('(B)', opts)).toBe('B. Artery');
    expect(resolveCorrectAnswer('b)', opts)).toBe('B. Artery');
  });
});
