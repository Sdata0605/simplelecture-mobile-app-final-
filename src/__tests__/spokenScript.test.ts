// Tests for services/reminders/spokenScript.ts. Spec: _scratch/reminders-v2-plan.md D.5 and D-17.

import { detectScriptLanguage, spokenScript, stripEmoji } from '../services/reminders/spokenScript';

describe('English template', () => {
  it('turns an imperative into "Hey, you need to ..." (worked example)', () => {
    expect(spokenScript('Go to college for your submission', 'en-IN')).toBe(
      'Hey, you need to go to college for your submission.',
    );
  });

  it('keeps existing trailing punctuation and does not add a second full stop', () => {
    expect(spokenScript('Take medicine!', 'en-IN')).toBe('Hey, you need to take medicine!');
    expect(spokenScript('Call mom?', 'en-IN')).toBe('Hey, you need to call mom?');
  });

  it('does not add "you need to" when the text already starts with a spoken opener', () => {
    expect(spokenScript('hello there', 'en-IN')).toBe('Hey, hello there.');
    expect(spokenScript('please buy milk', 'en-IN')).toBe('Hey, please buy milk.');
    expect(spokenScript("It's time to revise", 'en-IN')).toBe("Hey, It's time to revise.");
    expect(spokenScript('your bus leaves at 8', 'en-IN')).toBe('Hey, you need to your bus leaves at 8.');
  });

  it('collapses whitespace and newlines', () => {
    expect(spokenScript('  Buy   a notebook\n tomorrow  ', 'en-IN')).toBe(
      'Hey, you need to buy a notebook tomorrow.',
    );
  });

  it('returns an empty string for emoji-only text', () => {
    expect(spokenScript('\u{1F389}\u{1F389}', 'en-IN')).toBe('');
    expect(spokenScript('\u{1F468}‍\u{1F469}', 'en-IN')).toBe('');
  });

  it('strips emoji from the middle of the text before speaking', () => {
    expect(spokenScript('Gym \u{1F3CB}️ time', 'en-IN')).toBe('Hey, you need to gym time.');
  });

  it('keeps a 480-character input within the 500-character limit', () => {
    const script = spokenScript('a'.repeat(480), 'en-IN');
    expect(script.length).toBeLessThanOrEqual(500);
    expect(script.startsWith('Hey, you need to aaa')).toBe(true);
  });
});

describe('Indic templates', () => {
  it('Hindi uses the Hindi reminder prefix', () => {
    expect(spokenScript('दवा लो', 'hi-IN')).toBe('नमस्ते, आपका रिमाइंडर: दवा लो');
  });

  it('Marathi uses the Marathi reminder prefix', () => {
    expect(spokenScript('औषध घ्या', 'mr-IN')).toBe('नमस्कार, तुमचा रिमाइंडर: औषध घ्या');
  });

  it('Kannada uses the Kannada reminder prefix', () => {
    expect(spokenScript('ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳಿ', 'kn-IN')).toBe('ನಮಸ್ಕಾರ, ನಿಮ್ಮ ಜ್ಞಾಪನೆ: ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳಿ');
  });

  it('a 480-character Devanagari input is capped at 500 code points', () => {
    const script = spokenScript('क'.repeat(480), 'hi-IN');
    expect(Array.from(script).length).toBeLessThanOrEqual(500);
  });
});

describe('detectScriptLanguage', () => {
  it('suggests kn-IN for Kannada script', () => {
    expect(detectScriptLanguage('ಔಷಧಿ')).toEqual({ language: 'kn-IN', ambiguous: false });
  });

  it('suggests hi-IN but marks Devanagari as ambiguous (Hindi or Marathi)', () => {
    expect(detectScriptLanguage('दवा लो')).toEqual({ language: 'hi-IN', ambiguous: true });
  });

  it('returns no suggestion for Latin text', () => {
    expect(detectScriptLanguage('Go to gym')).toEqual({ language: null, ambiguous: false });
  });
});

describe('stripEmoji', () => {
  it('removes pictographs and leftover joiners, keeps plain text', () => {
    expect(stripEmoji('Hi \u{1F44B}\u{1F3FD} there')).toBe('Hi  there');
    expect(stripEmoji('plain text')).toBe('plain text');
  });
});
