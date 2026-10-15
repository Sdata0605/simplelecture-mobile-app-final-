import { stripEmbeddedOptions, extractImageTokens } from '../questionText';

describe('extractImageTokens', () => {
  it('handles null/undefined/empty', () => {
    expect(extractImageTokens(null)).toEqual({ text: '', images: [] });
    expect(extractImageTokens(undefined)).toEqual({ text: '', images: [] });
    expect(extractImageTokens('')).toEqual({ text: '', images: [] });
  });

  it('is a no-op when there are no image tokens', () => {
    expect(extractImageTokens('Which gas is evolved?')).toEqual({
      text: 'Which gas is evolved?',
      images: [],
    });
  });

  it('removes broken bare-filename tokens entirely (the reported bug)', () => {
    const text = [
      'Which of the following is an example of a double displacement reaction?',
      '',
      '![](aa80c10a3e1e30168349845f79264f3c_img.jpg)',
      '',
      '![](5e5b3224a1affcc9eb96999500bd4a52_img.jpg)',
      '',
      '![](baf3bd2968ee415961b89429d3d49642_img.jpg)',
      '',
      '![](cb2430ba5a89f401b305eba9c994d86c_img.jpg)',
    ].join('\n');
    expect(extractImageTokens(text)).toEqual({
      text: 'Which of the following is an example of a double displacement reaction?',
      images: [],
    });
  });

  it('extracts valid http(s) URLs as renderable images', () => {
    const res = extractImageTokens(
      'See the diagram:\n\n![diagram](https://cdn.example.com/x.png)\n\nWhat is shown?',
    );
    expect(res.text).toBe('See the diagram:\n\nWhat is shown?');
    expect(res.images).toEqual(['https://cdn.example.com/x.png']);
  });

  it('handles mixed valid and broken tokens', () => {
    const res = extractImageTokens(
      'Q ![](broken_img.jpg) mid ![a](http://a.com/b.jpg) end',
    );
    expect(res.text).toBe('Q  mid  end');
    expect(res.images).toEqual(['http://a.com/b.jpg']);
  });

  it('drops relative paths and empty targets', () => {
    expect(extractImageTokens('![]() and ![x](/uploads/y.png)')).toEqual({
      text: 'and',
      images: [],
    });
  });

  it('handles a token mid-sentence without leaving double spaces on lines', () => {
    const res = extractImageTokens('Start ![](f_img.jpg)\nnext line');
    expect(res.text).toBe('Start\nnext line');
  });

  it('handles tokens with titles', () => {
    const res = extractImageTokens('![alt](https://x.com/i.png "title") after');
    expect(res.text).toBe('after');
    expect(res.images).toEqual(['https://x.com/i.png']);
  });

  it('returns empty text when the content is only broken tokens', () => {
    expect(extractImageTokens('![](a_img.jpg)\n![](b_img.jpg)')).toEqual({
      text: '',
      images: [],
    });
  });

  it('handles URLs containing parentheses (nested-paren tracking)', () => {
    const res = extractImageTokens(
      'Look: ![x](https://en.wikipedia.org/wiki/File:Zn_(metal).png) done',
    );
    expect(res.text).toBe('Look:  done');
    expect(res.images).toEqual(['https://en.wikipedia.org/wiki/File:Zn_(metal).png']);
  });

  it('handles a token whose target spans multiple lines', () => {
    const res = extractImageTokens('A ![alt](\nhttps://x.com/i.png\n) B');
    expect(res.text).toBe('A  B');
    expect(res.images).toEqual(['https://x.com/i.png']);
  });

  it('removes malformed never-closed tokens to end of line (no raw leak)', () => {
    const res = extractImageTokens('Q text\n![](broken_never_closed.jpg\nNext line stays');
    expect(res.text).toBe('Q text\nNext line stays');
    expect(res.images).toEqual([]);
    expect(res.text).not.toContain('![');
  });

  it('keeps non-image bracket text like ![alt] without parens', () => {
    const res = extractImageTokens('keep ![this] literal');
    expect(res.text).toBe('keep ![this] literal');
    expect(res.images).toEqual([]);
  });

  it('handles angle-bracket targets', () => {
    const res = extractImageTokens('![a](<https://x.com/a b.png>) end');
    expect(res.text).toBe('end');
    expect(res.images).toEqual(['https://x.com/a b.png']);
  });
});

describe('stripEmbeddedOptions', () => {
  it('returns empty string for nullish text', () => {
    expect(stripEmbeddedOptions(null)).toBe('');
    expect(stripEmbeddedOptions(undefined)).toBe('');
    expect(stripEmbeddedOptions('')).toBe('');
  });

  it('returns the text unchanged when there are no options', () => {
    const t = 'What is the pH of a neutral solution?';
    expect(stripEmbeddedOptions(t, [])).toBe(t);
    expect(stripEmbeddedOptions(t, undefined)).toBe(t);
  });

  it('removes inline (a)/(b) choices that match the options', () => {
    const text = 'What is the pH scale?\n(a) acidic\n(b) basic';
    const out = stripEmbeddedOptions(text, [{ text: 'acidic' }, { text: 'basic' }]);
    expect(out).toBe('What is the pH scale?');
  });

  it('works with options given as a plain string array', () => {
    const text = 'Pick one:\n(a) acidic\n(b) basic';
    const out = stripEmbeddedOptions(text, ['acidic', 'basic']);
    expect(out).toBe('Pick one:');
  });

  it('works with options given as an object map', () => {
    const text = 'Pick one:\na) acidic\nb) basic';
    const out = stripEmbeddedOptions(text, { A: 'acidic', B: 'basic' });
    expect(out).toBe('Pick one:');
  });

  it('does NOT strip when fewer than two lines match (not a real MCQ)', () => {
    const text = 'Define acid.\n(a) acidic\nExtra context line';
    // only one option line matches -> removedCount < 2 -> no-op
    expect(stripEmbeddedOptions(text, ['acidic', 'basic'])).toBe(text);
  });

  it('leaves legitimate content that merely looks like a label', () => {
    const text = 'Step (a) happens before step (b).';
    expect(stripEmbeddedOptions(text, ['acidic', 'basic'])).toBe(text);
  });

  it('also drops a trailing "Options:" header above a removed block', () => {
    const text = 'Choose the strong acid.\nOptions:\n(a) acidic\n(b) basic';
    const out = stripEmbeddedOptions(text, ['acidic', 'basic']);
    expect(out).toBe('Choose the strong acid.');
  });

  it('matches different label punctuation (A. / 1) / bullet)', () => {
    const text = 'Q\n- (a) acidic\nB. basic';
    expect(stripEmbeddedOptions(text, ['acidic', 'basic'])).toBe('Q');
  });

  it('ignores case and surrounding punctuation/LaTeX when matching', () => {
    const text = 'Q\n(a) $ACIDIC$\n(b) Basic!';
    expect(stripEmbeddedOptions(text, ['acidic', 'basic'])).toBe('Q');
  });
});
