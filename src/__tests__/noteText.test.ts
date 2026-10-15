/**
 * Unit tests for note text cleaning utilities.
 */

import {
  stripSpeechMarkup,
  toDisplayString,
  cleanNarrationText,
} from '../utils/noteText';

describe('stripSpeechMarkup', () => {
  it('removes SSML tags', () => {
    expect(stripSpeechMarkup('<speak>Hello world</speak>')).toBe('Hello world');
  });

  it('removes HTML-style tags', () => {
    expect(stripSpeechMarkup('<p>Some <strong>text</strong></p>')).toBe('Some text');
  });

  it('handles self-closing SSML tags', () => {
    const input = 'Hello<break time="1s"/>world';
    expect(stripSpeechMarkup(input)).toBe('Hello world');
  });

  it('collapses multiple spaces', () => {
    expect(stripSpeechMarkup('one  two   three')).toBe('one two three');
  });

  it('decodes common HTML entities', () => {
    expect(stripSpeechMarkup('A &amp; B')).toBe('A & B');
    expect(stripSpeechMarkup('&lt;tag&gt;')).toBe('<tag>');
  });

  it('returns empty string for null / undefined', () => {
    expect(stripSpeechMarkup(null as any)).toBe('');
    expect(stripSpeechMarkup(undefined as any)).toBe('');
    expect(stripSpeechMarkup('')).toBe('');
  });

  it('preserves normal readable text unchanged', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    expect(stripSpeechMarkup(text)).toBe(text);
  });
});

describe('toDisplayString', () => {
  it('returns empty string for null / undefined', () => {
    expect(toDisplayString(null)).toBe('');
    expect(toDisplayString(undefined)).toBe('');
  });

  it('returns string value stripped of markup', () => {
    expect(toDisplayString('<b>Bold</b>')).toBe('Bold');
  });

  it('converts numbers and booleans to strings', () => {
    expect(toDisplayString(42)).toBe('42');
    expect(toDisplayString(true)).toBe('true');
  });

  it('joins arrays with newline', () => {
    expect(toDisplayString(['a', 'b', 'c'])).toBe('a\nb\nc');
  });

  it('filters empty items from arrays', () => {
    expect(toDisplayString(['a', '', null as any, 'b'])).toBe('a\nb');
  });

  it('never returns [object Object]', () => {
    const result = toDisplayString({ foo: 'bar', baz: 123 });
    expect(result).not.toContain('[object Object]');
  });

  it('extracts .text from objects', () => {
    expect(toDisplayString({ text: 'hello', other: 99 })).toBe('hello');
  });

  it('extracts .content when .text is absent', () => {
    expect(toDisplayString({ content: 'world' })).toBe('world');
  });

  it('handles nested arrays', () => {
    const result = toDisplayString([{ text: 'A' }, { text: 'B' }]);
    expect(result).toContain('A');
    expect(result).toContain('B');
  });
});

describe('cleanNarrationText', () => {
  it('returns empty string for empty input', () => {
    expect(cleanNarrationText('')).toBe('');
    expect(cleanNarrationText(null as any)).toBe('');
  });

  it('strips SSML tags', () => {
    const result = cleanNarrationText('<speak>Hello world.</speak>');
    expect(result).not.toContain('<speak>');
    expect(result).toContain('Hello world');
  });

  it('preserves paragraph breaks (double newlines)', () => {
    const input = 'First paragraph.\n\nSecond paragraph.';
    const result = cleanNarrationText(input);
    expect(result).toContain('\n\n');
  });

  it('collapses single newlines inside paragraphs', () => {
    const input = 'Line one\nLine two.';
    const result = cleanNarrationText(input);
    expect(result).not.toContain('\n');
    expect(result).toContain('Line one Line two');
  });

  it('splits very long paragraphs at sentence boundaries', () => {
    const longPara = Array(8)
      .fill('This is a sentence that is reasonably long.')
      .join(' ');
    const result = cleanNarrationText(longPara);
    const paragraphs = result.split('\n\n');
    // Each resulting paragraph should be <= 400 chars
    paragraphs.forEach((p) => {
      expect(p.length).toBeLessThanOrEqual(420); // slight buffer for splitting
    });
  });

  it('produces no blank paragraphs', () => {
    const input = 'One.\n\n\n\n\n\nTwo.';
    const result = cleanNarrationText(input);
    const parts = result.split('\n\n').filter((p) => !p.trim());
    expect(parts.length).toBe(0);
  });
});
