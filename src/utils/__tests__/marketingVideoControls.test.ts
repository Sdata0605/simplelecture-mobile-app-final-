import {
  formatMarketingVideoTime,
  seekMillisFromPress,
} from '../marketingVideoControls';

describe('formatMarketingVideoTime', () => {
  it('formats milliseconds as player minutes and seconds', () => {
    expect(formatMarketingVideoTime(0)).toBe('0:00');
    expect(formatMarketingVideoTime(4_900)).toBe('0:04');
    expect(formatMarketingVideoTime(96_000)).toBe('1:36');
  });

  it('clamps negative values to zero', () => {
    expect(formatMarketingVideoTime(-10_000)).toBe('0:00');
  });
});

describe('seekMillisFromPress', () => {
  it('maps a press position onto the video duration', () => {
    expect(seekMillisFromPress(50, 100, 120_000)).toBe(60_000);
  });

  it('clamps presses outside the seek track', () => {
    expect(seekMillisFromPress(-20, 100, 120_000)).toBe(0);
    expect(seekMillisFromPress(150, 100, 120_000)).toBe(120_000);
  });

  it('returns zero when the duration is unavailable', () => {
    expect(seekMillisFromPress(50, 100, 0)).toBe(0);
  });
});