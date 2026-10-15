// What the V5 lecture was showing and saying when the student tapped Ask AI, so the teacher can answer in
// context. Mirrors the web app's buildAskContext (src/components/learning/v5/utils.ts).
import type { V5Section, V5TimelineSection } from '../v5PlayerService';
import type { LectureAskContext } from './lectureLesson';

/** The section's spoken text, in order. */
export function getSectionNarration(section: V5Section): string {
  return (section.narration?.segments || [])
    .map((segment) => (segment.text || '').trim())
    .filter(Boolean)
    .join(' ');
}

/** Snapshot of where the lecture is. `active` is `getTimelinePosition(...).active`. */
export function buildAskContext(
  timeline: V5TimelineSection[],
  active: V5TimelineSection | null,
  currentTime: number,
  duration: number,
): LectureAskContext {
  return {
    currentTime: Number.isFinite(currentTime) ? currentTime : 0,
    duration: Number.isFinite(duration) ? duration : 0,
    sectionIndex: active ? active.sectionIndex + 1 : 0,
    sectionCount: timeline.length,
    sectionTitle: active?.section.title?.trim() || undefined,
    keyPoints: active?.keyPoints ?? [],
    narration: active ? getSectionNarration(active.section) : '',
  };
}
