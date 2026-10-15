import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

/**
 * V5 player data layer — a direct port of the web app's
 * `src/components/learning/v5/utils.ts` + `types.ts`.
 *
 * V5 is NOT a different backend: it reads the SAME presentation.json from the
 * SAME `v4-player-proxy` edge function the marketing/V4 players use, and plays
 * the SAME pre-merged MP4. What V5 adds is `subtitles.json` — per-section word
 * timings — which is turned into a logical section timeline so key points can
 * be revealed in sync with the video.
 *
 * The one meaningful difference from web: every request needs the Supabase
 * apikey/Bearer headers. The web app is served from an authorised origin and
 * fetches these files bare; the edge function returns 401 without them here.
 */

const V5_PROXY_BASE = `${SUPABASE_URL}/functions/v1/v4-player-proxy`;
const V5_CDN_BASE = 'https://server1.simplelecture.com/video';

const AUTH_HEADERS: Record<string, string> = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

// ---------------------------------------------------------------------------
// Types (ported from web v5/types.ts)
// ---------------------------------------------------------------------------

export type V5Language = 'english' | 'kannada';

export interface V5WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface V5SubtitleSection {
  words?: V5WordTiming[];
}

export interface V5SubtitleData {
  version?: number;
  sections?: Record<string, V5SubtitleSection>;
}

export interface V5NarrationSegment {
  text?: string;
  duration_seconds?: number;
  duration?: number;
}

export interface V5Section {
  section_id: string | number;
  section_type?: string;
  type?: string;
  title?: string;
  renderer?: string;
  key_points?: unknown;
  narration?: {
    total_duration_seconds?: number;
    segments?: V5NarrationSegment[];
  };
}

export interface V5Presentation {
  presentation_title?: string;
  title?: string;
  final_video_path?: string;
  final_video_url?: string;
  vimeo_mp4_url?: string;
  kannada_final_video?: string;
  kannada_vimeo_mp4_url?: string;
  sections: V5Section[];
}

export interface V5TimelineSection {
  section: V5Section;
  sectionIndex: number;
  start: number;
  end: number;
  duration: number;
  keyPoints: string[];
}

export interface V5TimelinePosition {
  active: V5TimelineSection | null;
  logicalTime: number;
  sectionProgress: number;
  visibleCount: number;
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export const getPresentationUrl = (jobId: string) =>
  `${V5_PROXY_BASE}/player/jobs/${encodeURIComponent(jobId)}/presentation.json?t=${Date.now()}`;

export const getSubtitlesUrl = (jobId: string) =>
  `${V5_PROXY_BASE}/player/jobs/${encodeURIComponent(jobId)}/subtitles.json?t=${Date.now()}`;

const getCdnMediaUrl = (jobId: string, path: string) => {
  const cleanPath = path.replace(/^\/+/, '');
  return `${V5_CDN_BASE}/${encodeURIComponent(jobId)}/${cleanPath}`;
};

/**
 * Ordered list of merged-video URLs to try for a language. The player walks
 * this list on playback error, so a rotated Vimeo signature falls back to the
 * CDN copy instead of dead-ending. The current marketing player only ever
 * looks at `vimeo_mp4_url`, which is why a stale signature kills playback.
 */
export function getMergedVideoCandidates(
  presentation: V5Presentation,
  jobId: string,
  language: V5Language,
): string[] {
  const direct =
    language === 'kannada'
      ? presentation.kannada_vimeo_mp4_url
      : presentation.vimeo_mp4_url || presentation.final_video_url;
  const path =
    language === 'kannada'
      ? presentation.kannada_final_video
      : presentation.final_video_path;

  return Array.from(
    new Set(
      [
        direct,
        path
          ? path.startsWith('http://') || path.startsWith('https://')
            ? path
            : getCdnMediaUrl(jobId, path)
          : '',
      ].filter((value): value is string => Boolean(value)),
    ),
  );
}

export function hasMergedVideo(
  presentation: V5Presentation,
  language: V5Language,
): boolean {
  return getMergedVideoCandidates(presentation, 'availability-check', language).length > 0;
}

// ---------------------------------------------------------------------------
// Timeline construction
// ---------------------------------------------------------------------------

export function normalizeKeyPoints(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object' && 'text' in item) {
        return String((item as { text?: unknown }).text || '').trim();
      }
      return '';
    })
    .filter(Boolean);
}

function getSubtitleDuration(
  section: V5Section,
  index: number,
  subtitleData: V5SubtitleData | null,
): number {
  const sectionKeys = [String(section.section_id), String(index + 1)];

  for (const key of sectionKeys) {
    const words = subtitleData?.sections?.[key]?.words;
    if (!words?.length) continue;
    const lastEnd = words.reduce((max, word) => Math.max(max, Number(word.end) || 0), 0);
    if (lastEnd > 0) return lastEnd;
  }

  return 0;
}

function getNarrationDuration(section: V5Section): number {
  const declared = Number(section.narration?.total_duration_seconds) || 0;
  if (declared > 0) return declared;

  return (section.narration?.segments || []).reduce(
    (total, segment) => total + (Number(segment.duration_seconds ?? segment.duration) || 0),
    0,
  );
}

/**
 * Lays the sections end to end on a logical timeline. Duration per section
 * prefers real subtitle timings, falls back to declared narration duration,
 * then to 1s so a section never collapses to zero width.
 */
export function buildSectionTimeline(
  sections: V5Section[],
  subtitleData: V5SubtitleData | null,
): V5TimelineSection[] {
  let offset = 0;

  return sections.map((section, sectionIndex) => {
    const duration =
      getSubtitleDuration(section, sectionIndex, subtitleData) ||
      getNarrationDuration(section) ||
      1;
    const entry: V5TimelineSection = {
      section,
      sectionIndex,
      start: offset,
      end: offset + duration,
      duration,
      keyPoints: normalizeKeyPoints(section.key_points),
    };
    offset += duration;
    return entry;
  });
}

/**
 * Maps real video time onto the logical timeline proportionally, so a small
 * drift between the summed section durations and the encoded video length
 * doesn't desync the key points. Returns the active section plus how many of
 * its key points should be visible at this moment.
 */
export function getTimelinePosition(
  timeline: V5TimelineSection[],
  videoTime: number,
  videoDuration: number,
): V5TimelinePosition {
  const logicalDuration = timeline.length ? timeline[timeline.length - 1].end : 0;
  const logicalTime =
    videoDuration > 0 && logicalDuration > 0
      ? (videoTime / videoDuration) * logicalDuration
      : videoTime;
  const active =
    timeline.find((entry) => logicalTime >= entry.start && logicalTime < entry.end) ||
    (timeline.length ? timeline[timeline.length - 1] : null) ||
    null;

  if (!active) {
    return { active: null, logicalTime: 0, sectionProgress: 0, visibleCount: 0 };
  }

  const sectionProgress = Math.max(
    0,
    Math.min(1, (logicalTime - active.start) / Math.max(active.duration, 0.001)),
  );
  const visibleCount = active.keyPoints.length
    ? Math.min(active.keyPoints.length, Math.floor(sectionProgress * active.keyPoints.length) + 1)
    : 0;

  return { active, logicalTime, sectionProgress, visibleCount };
}

export function formatV5Time(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

export async function fetchV5Presentation(jobId: string): Promise<V5Presentation> {
  const url = getPresentationUrl(jobId);
  const response = await fetch(url, { headers: AUTH_HEADERS });
  if (!response.ok) {
    throw new Error(`Presentation request failed (${response.status})`);
  }
  const data = (await response.json()) as V5Presentation;
  if (!Array.isArray(data.sections) || data.sections.length === 0) {
    throw new Error('This lecture has no presentation sections.');
  }
  console.log('[V5] presentation loaded — sections:', data.sections.length);
  return data;
}

/** Subtitles are optional: without them the timeline falls back to narration. */
export async function fetchV5Subtitles(jobId: string): Promise<V5SubtitleData | null> {
  try {
    const response = await fetch(getSubtitlesUrl(jobId), { headers: AUTH_HEADERS });
    if (!response.ok) return null;
    return (await response.json()) as V5SubtitleData;
  } catch {
    return null;
  }
}
