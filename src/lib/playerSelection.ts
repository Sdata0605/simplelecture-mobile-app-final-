// Player selection logic for AI lectures.
// V4 is the active learner-facing player for all courses.
// The decision is data-driven: use V4 whenever a valid external_job_id exists.

/** @deprecated Course-ID gate removed. Kept for any remaining call sites during cleanup. */
export const DPHARMACY_COURSE_ID = 'e74e8e53-5949-4113-a565-1e84c2b4ee0e';

/**
 * Returns true when the lecture has an `external_job_id` — the stable V4
 * identifier. Course ID is intentionally ignored: V4 is open to all courses.
 */
export function shouldUseV4Player(externalJobId?: string | null): boolean {
  return !!externalJobId;
}
