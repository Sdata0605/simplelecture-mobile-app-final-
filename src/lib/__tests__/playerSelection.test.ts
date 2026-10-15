import { shouldUseV4Player, DPHARMACY_COURSE_ID } from '../playerSelection';

// shouldUseV4Player is now data-driven: it checks whether an external_job_id
// exists, not which course ID is present. Course-ID gating was removed when V4
// was opened to all courses.

describe('shouldUseV4Player', () => {
  it('returns true when a valid external_job_id is present', () => {
    expect(shouldUseV4Player('Science_20260702135100912_UXPI4A_52b6ecc7')).toBe(true);
    // DPHARMACY_COURSE_ID is still exported; any non-empty string → true
    expect(shouldUseV4Player(DPHARMACY_COURSE_ID)).toBe(true);
  });

  it('returns false when external_job_id is absent, empty, null or undefined', () => {
    expect(shouldUseV4Player('')).toBe(false);
    expect(shouldUseV4Player(null)).toBe(false);
    expect(shouldUseV4Player(undefined)).toBe(false);
  });
});
