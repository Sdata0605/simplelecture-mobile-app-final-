/**
 * Pure selection logic for choosing which published lecture job feeds the
 * AI Study Notes reader.
 *
 * Background: video generation occasionally publishes a job whose
 * presentation_json is an error stub (e.g. {"error": "Server unreachable…"})
 * with no sections. The newest published job is therefore not always usable —
 * notes must come from the newest job that actually has sections.
 *
 * No React Native imports — must stay loadable in the node-only Jest harness.
 */

export interface NotesJobCandidate {
  id: string;
  document_name: string | null;
  presentation_json: {
    sections?: unknown;
    error?: unknown;
    [key: string]: unknown;
  } | null;
  created_at: string;
}

/**
 * True when a job's presentation_json contains a usable, non-empty
 * sections array. An `error` field alone does not disqualify a job —
 * if usable sections exist alongside a warning, the notes still render;
 * pure error stubs fail because they have no sections.
 */
export function isValidNotesJob(job: NotesJobCandidate | null | undefined): boolean {
  if (!job || !job.presentation_json) return false;
  const pj = job.presentation_json;
  if (typeof pj !== 'object' || Array.isArray(pj)) return false;
  return Array.isArray(pj.sections) && pj.sections.length > 0;
}

/**
 * Pick the newest usable job from a list assumed to be ordered
 * newest-first (created_at desc). Returns null when none is usable.
 */
export function selectValidNotesJob<T extends NotesJobCandidate>(
  jobs: T[] | null | undefined,
): T | null {
  if (!Array.isArray(jobs)) return null;
  for (const job of jobs) {
    if (isValidNotesJob(job)) return job;
  }
  return null;
}
