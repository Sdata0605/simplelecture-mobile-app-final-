import { colorForSubject } from '../useDashboardStudyPlan';
import { colors } from '../../constants/theme';

describe('colorForSubject', () => {
  it('returns a neutral fallback for a missing id', () => {
    expect(colorForSubject(null)).toEqual({ bg: colors.gray100, fg: colors.textSecondary });
  });

  it('is deterministic: the same id always yields the same color', () => {
    expect(colorForSubject('physics-101')).toEqual(colorForSubject('physics-101'));
    expect(colorForSubject('chemistry-202')).toEqual(colorForSubject('chemistry-202'));
  });

  it('returns a hex bg/fg pair from the palette', () => {
    const c = colorForSubject('biology-303');
    expect(c.bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(c.fg).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
