import * as FileSystem from 'expo-file-system';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

// V4 streams the SAME presentation.json + media as web V4, served through the
// Supabase `v4-player-proxy` edge function. SUPABASE_URL is the worker proxy.
const PROXY_BASE = `${SUPABASE_URL}/functions/v1/v4-player-proxy`;
const CACHE_DIR = `${FileSystem.cacheDirectory}v4_cache/`;
const MIN_FILE_SIZE = 1024;

// Auth headers required on BOTH fetch() AND FileSystem downloads — the edge
// function rejects unauthenticated requests.
const AUTH_HEADERS: Record<string, string> = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

export interface V4NarrationSegment {
  segment_id?: string;
  text: string;
  duration_seconds?: number;
  duration?: number;
  start_seconds?: number;
  end_seconds?: number;
  beat_videos?: string[];
  video_path?: string;
  purpose?: string;
}

export interface V4VisualBeat {
  beat_id?: string;
  visual_type?: 'image' | 'video' | 'manim' | 'text' | 'infographic' | 'image_to_video';
  display_text?: string | string[];
  beat_start_seconds?: number;
  beat_end_seconds?: number;
  start_seconds?: number;
  end_seconds?: number;
  image_url?: string;
  image_source?: string;
  video_url?: string;
  video_path?: string;
}

export interface V4Flashcard {
  front?: string;
  back?: string;
  id?: string;
  q?: string;
  a?: string;
  question?: string;
  answer?: string;
}

export interface V4QuizOption {
  text: string;
  is_correct: boolean;
}

export interface V4ExplanationVisual {
  type?: 'video' | 'image';
  url?: string;
  video_path?: string;
  wan_video_path?: string;
  image_path?: string;
  image_source?: string;
}

export interface V4QuizItem {
  question_id?: string;
  question?: string;
  question_text?: string;
  options: V4QuizOption[];
  correct?: string;
  correct_option?: string;
  explanation?: string;
  explanation_visual?: V4ExplanationVisual;
  avatar_clips?: {
    question?: string;
    correct?: string;
    wrong?: string;
    explanation?: string;
  };
  option_reveal_seconds?: number[];
  narration?: {
    option_reveal_seconds?: number[];
    question_script?: string;
    correct_script?: string;
    wrong_script?: string;
    explanation_script?: string;
  };
}

export interface V4AvatarLanguage {
  language: string;
  video_path: string;
  status: string;
}

export interface V4Section {
  section_id: number;
  section_type: string;
  title: string;
  avatar_video?: string;
  // Pre-merged teaching video: avatar already composited over visual beats with
  // narration audio baked in. V4 plays this single file per section instead of
  // stacking a chroma-key avatar over double-buffered beat videos in real time.
  final_video_path?: string;
  b2_url?: string;
  avatar_languages?: V4AvatarLanguage[];
  vimeo_url?: string;
  narration?: {
    full_text?: string;
    segments: V4NarrationSegment[];
    total_duration_seconds?: number;
  };
  visual_beats?: V4VisualBeat[];
  flashcards?: V4Flashcard[];
  questions?: V4QuizItem[];
  understanding_quiz?: V4QuizItem | V4QuizItem[] | Record<string, unknown>;
  beat_video_paths?: string[];
  manim_video_paths?: string[];
  render_spec?: {
    infographic_beats?: V4VisualBeat[];
  };
  content?: string;
}

export type PlayerLanguage = 'english' | 'kannada';

export interface V4Presentation {
  presentation_title: string;
  job_id?: string;
  sections: V4Section[];
  base_url?: string;
  /** Top-level full-lecture merged MP4 (English) */
  vimeo_mp4_url?: string;
  /** Top-level full-lecture merged MP4 (Kannada) */
  kannada_vimeo_mp4_url?: string;
  final_video_path?: string;
  kannada_final_video?: string;
}

/** Resolve the top-level full-lecture MP4 URL for the chosen language. */
export function resolvePlaybackUrl(
  presentation: V4Presentation,
  language: PlayerLanguage,
): string | null {
  if (language === 'kannada') {
    return presentation.kannada_vimeo_mp4_url || null;
  }
  return presentation.vimeo_mp4_url || null;
}

// ---------------------------------------------------------------------------
// URL helpers — all media resolved through the v4-player-proxy edge function
// ---------------------------------------------------------------------------

export function resolveV4MediaUrl(jobId: string, path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${PROXY_BASE}/player/jobs/${jobId}/${cleanPath}`;
}

export function getPresentationUrl(jobId: string): string {
  return `${PROXY_BASE}/player/jobs/${jobId}/presentation.json?t=${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Quiz normalisation
// The API can return understanding_quiz as a plain object (single quiz item)
// OR as an array. Options can be {A:"...", B:"..."} or [{text,is_correct}].
// ---------------------------------------------------------------------------

function normalizeOptions(raw: unknown, correctKey?: string): V4QuizOption[] {
  if (Array.isArray(raw)) {
    return raw.map((o: Record<string, unknown>) => ({
      text: String(o.text ?? o.label ?? o.value ?? o ?? ''),
      is_correct: Boolean(o.is_correct),
    }));
  }
  if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw as Record<string, unknown>);
    const correct = (correctKey ?? '').toUpperCase().trim();
    return keys.map(k => ({
      text: String((raw as Record<string, unknown>)[k] ?? ''),
      is_correct: k.toUpperCase().trim() === correct,
    }));
  }
  return [];
}

export function normalizeQuizItems(raw: unknown): V4QuizItem[] {
  if (!raw) return [];
  const items: unknown[] = Array.isArray(raw) ? raw : [raw];
  return items.map((item) => {
    const q = item as Record<string, unknown>;
    const correctOption = String(q.correct_option ?? q.correct ?? '');
    return {
      question_id: q.question_id as string | undefined,
      question: q.question as string | undefined,
      question_text: q.question_text as string | undefined,
      options: normalizeOptions(q.options, correctOption),
      correct: q.correct as string | undefined,
      correct_option: correctOption || undefined,
      explanation: q.explanation as string | undefined,
      explanation_visual: q.explanation_visual as V4ExplanationVisual | undefined,
      avatar_clips: q.avatar_clips as V4QuizItem['avatar_clips'],
      option_reveal_seconds: q.option_reveal_seconds as number[] | undefined,
      narration: q.narration as V4QuizItem['narration'],
    };
  });
}

// ---------------------------------------------------------------------------
// Fetch + normalise the full presentation
// ---------------------------------------------------------------------------

export async function fetchV4Presentation(jobId: string): Promise<V4Presentation> {
  const url = getPresentationUrl(jobId);
  console.log('[V4Source] ▶ fetchV4Presentation START url:', url);
  const resp = await fetch(url, { headers: AUTH_HEADERS });
  console.log('[V4Source] ▶ fetchV4Presentation HTTP status:', resp.status);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching presentation for job ${jobId}`);
  const data = await resp.json() as V4Presentation;
  console.log('[V4Source] ▶ fetchV4Presentation sections count:', data.sections?.length ?? 0);

  // Normalise every section's quiz data in-place
  data.sections = (data.sections || []).map((sec, i) => {
    const normQ = normalizeQuizItems(sec.questions);
    const normUQ = normalizeQuizItems(sec.understanding_quiz);
    const allQ = [...normQ, ...normUQ];
    console.log(`[V4Source]   Section ${i} (${sec.section_type}) quizItems:${allQ.length} b2_url:${sec.b2_url ? 'YES' : 'NO'}`);
    return {
      ...sec,
      questions: allQ.length ? allQ : undefined,
      understanding_quiz: undefined,
    };
  });

  return data;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return Math.abs(h).toString(36);
}

function getCachedPath(url: string): string {
  const lower = url.toLowerCase().split('?')[0];
  let ext = '.mp4';
  if (lower.endsWith('.webm')) ext = '.webm';
  else if (lower.endsWith('.mov')) ext = '.mov';
  else if (lower.endsWith('.png')) ext = '.png';
  else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) ext = '.jpg';
  else if (lower.endsWith('.webp')) ext = '.webp';
  else if (lower.endsWith('.gif')) ext = '.gif';
  return `${CACHE_DIR}${hashStr(url)}${ext}`;
}

const downloadCache = new Map<string, string>();
const activeDownloads = new Map<string, Promise<string>>();

const MAX_DOWNLOAD_RETRIES = 3;

// Valid MP4 first-box types (bytes 4-7 of an ISO base media / MP4 file).
const VALID_MP4_BOX_TYPES = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'pnot', 'junk', 'uuid']);

/**
 * Validates that a downloaded file contains real media data rather than an HTML/JSON error page.
 *
 * Reads 8 bytes via the base64 partial-read API (position + length — supported in Expo SDK 48+
 * when encoding is Base64).  Those 8 bytes cover:
 *   byte 0   : first byte of payload → must not be '<' (HTML) or '{' (JSON)
 *   bytes 4-7: first MP4 box-type field → must be a known ISO-BMFF box for .mp4/.mov files
 */
async function isFileContentValid(uri: string): Promise<boolean> {
  try {
    // position + length only work with Base64 encoding; read exactly 8 bytes.
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 8,
    });
    // atob() decodes base64 → raw byte string (each charCode == byte value).
    // Pad to a valid base64 length just in case the returned string is short.
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = atob(padded);

    // Reject HTML error pages (first byte '<' = 0x3C)
    if (bytes.charCodeAt(0) === 0x3C) return false;
    // Reject JSON error responses (first byte '{' = 0x7B)
    if (bytes.charCodeAt(0) === 0x7B) return false;

    // For MP4/MOV files verify the ISO-BMFF box type at bytes 4-7.
    if (bytes.length >= 8) {
      const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
      if (ext === 'mp4' || ext === 'mov') {
        const boxType = bytes.slice(4, 8);
        if (!VALID_MP4_BOX_TYPES.has(boxType)) {
          console.warn(`[V4Preload] Unknown MP4 box type "${boxType}" — treating file as corrupt: ${uri.slice(-50)}`);
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

async function downloadOne(url: string): Promise<string> {
  if (!url || !url.startsWith('http')) return url;
  if (downloadCache.has(url)) return downloadCache.get(url)!;
  if (activeDownloads.has(url)) return activeDownloads.get(url)!;

  const dest = getCachedPath(url);

  // Check existing on-disk cache — validate content before trusting it
  try {
    const existing = await FileSystem.getInfoAsync(dest);
    if (existing.exists && 'size' in existing && (existing.size || 0) >= MIN_FILE_SIZE) {
      if (await isFileContentValid(dest)) {
        downloadCache.set(url, dest);
        return dest;
      }
      // Corrupt file from a previous session — delete and re-download
      console.warn(`[V4Preload] Corrupt cached file detected, deleting: ${url.slice(-50)}`);
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
    }
  } catch {}

  const promise = (async () => {
    try {
      for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
        try {
          // Auth headers are mandatory — the proxy returns 401 without them.
          const dl = FileSystem.createDownloadResumable(url, dest, { headers: AUTH_HEADERS });
          const result = await dl.downloadAsync();
          const uri = result?.uri || dest;
          const info = await FileSystem.getInfoAsync(uri);

          if (!info.exists || !('size' in info) || (info.size || 0) < MIN_FILE_SIZE) {
            await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
            console.warn(`[V4Preload] attempt ${attempt}/${MAX_DOWNLOAD_RETRIES} too small: ${url.slice(-50)}`);
          } else if (!(await isFileContentValid(uri))) {
            await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
            console.warn(`[V4Preload] attempt ${attempt}/${MAX_DOWNLOAD_RETRIES} corrupt content: ${url.slice(-50)}`);
          } else {
            downloadCache.set(url, uri);
            return uri;
          }
        } catch (e) {
          console.warn(`[V4Preload] attempt ${attempt}/${MAX_DOWNLOAD_RETRIES} error: ${url.slice(-50)}`);
        }

        if (attempt < MAX_DOWNLOAD_RETRIES) {
          await new Promise(r => setTimeout(r, 400 * attempt));
        }
      }
      // All retries exhausted — return remote URL as fallback (not cached)
      console.warn(`[V4Preload] All ${MAX_DOWNLOAD_RETRIES} attempts failed, using remote URL: ${url.slice(-50)}`);
      return url;
    } finally {
      activeDownloads.delete(url);
    }
  })();

  activeDownloads.set(url, promise);
  return promise;
}

export function getCachedUrl(url: string): string {
  return downloadCache.get(url) || url;
}

export async function resolveAndCacheUrl(url: string): Promise<string> {
  if (!url || !url.startsWith('http')) return url;
  return downloadOne(url);
}

export interface PreloadProgress {
  completed: number;
  total: number;
  percent: number;
}

// ---------------------------------------------------------------------------
// Avatar path resolution — prefers b2_url, then avatar_languages, then avatar_video
// ---------------------------------------------------------------------------

// Merged teaching video path. Falls back to the conventional naming the
// render pipeline uses (videos/section_<id>_final.mp4) when not explicit.
export function resolveFinalVideoPath(section: V4Section): string {
  if (section.final_video_path) return section.final_video_path;
  return `videos/section_${section.section_id}_final.mp4`;
}

export function resolveAvatarPath(section: V4Section, language: PlayerLanguage = 'english'): string | null {
  // Priority 1: b2_url (direct Backblaze B2 URL — always absolute, language-agnostic)
  if (section.b2_url) return section.b2_url;
  // Priority 2: language-specific avatar from avatar_languages
  if (section.avatar_languages?.length) {
    if (language !== 'english') {
      const langMatch = section.avatar_languages.find(
        al => al.language.toLowerCase() === language && al.status === 'completed' && al.video_path,
      );
      if (langMatch) return langMatch.video_path;
    }
    // Fall back to first completed (usually English)
    const completed = section.avatar_languages.find(al => al.status === 'completed' && al.video_path);
    if (completed) return completed.video_path;
  }
  // Priority 3: default avatar_video relative path
  if (section.avatar_video) return section.avatar_video;
  return `avatars/section_${section.section_id}_avatar.mp4`;
}

// ---------------------------------------------------------------------------
// Infographic image resolution — used by image-driven sections (e.g. the
// memory_infographic section, which shows the infographic image instead of
// flip cards). Mirrors the image collection + URL resolution that
// V4ContentLayers uses for content sections.
// ---------------------------------------------------------------------------

export interface V4ImageBeat {
  start: number;
  end: number;
  url: string;
}

function normalizeImagePath(path: string): string {
  if (!path) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const hasFolder =
    path.includes('images/') ||
    path.includes('assets/') ||
    path.includes('avatars/') ||
    path.includes('videos/') ||
    path.includes('infographics/') ||
    path.includes('/');
  return hasFolder ? path : `images/${path}`;
}

// Collect a section's infographic image beats (visual_beats of type
// image/infographic + render_spec.infographic_beats), resolved to cached/remote
// URLs identical to V4ContentLayers. Returns [] when the section has none.
export function resolveInfographicImages(section: V4Section, jobId: string): V4ImageBeat[] {
  const images: V4ImageBeat[] = [];
  const push = (start: number, end: number, src?: string) => {
    if (!src) return;
    const remote = src.startsWith('http') ? src : resolveV4MediaUrl(jobId, normalizeImagePath(src));
    if (!remote) return;
    images.push({ start, end, url: getCachedUrl(remote) });
  };

  for (const vb of section.visual_beats || []) {
    if (vb.visual_type === 'image' || vb.visual_type === 'infographic') {
      push(vb.beat_start_seconds ?? 0, vb.beat_end_seconds ?? 9999, vb.image_source || vb.image_url || vb.video_path);
    }
  }
  for (const vb of section.render_spec?.infographic_beats || []) {
    push(
      vb.beat_start_seconds ?? vb.start_seconds ?? 0,
      vb.beat_end_seconds ?? vb.end_seconds ?? 9999,
      vb.image_url || vb.image_source || vb.video_path,
    );
  }
  return images;
}

// Cheap presence check — does the section carry at least one infographic image?
// Does not require the job id (only checks that a source string exists).
export function sectionHasInfographicImage(section: V4Section): boolean {
  const fromVisual = (section.visual_beats || []).some(
    vb => (vb.visual_type === 'image' || vb.visual_type === 'infographic') &&
      !!(vb.image_source || vb.image_url || vb.video_path),
  );
  if (fromVisual) return true;
  return (section.render_spec?.infographic_beats || []).some(
    vb => !!(vb.image_url || vb.image_source || vb.video_path),
  );
}

function normalizePath(path: string, type: 'avatar' | 'video'): string {
  if (!path) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const hasFolder =
    path.includes('avatars/') ||
    path.includes('videos/') ||
    path.includes('audio/') ||
    path.includes('manim/');
  let fullPath = path;
  if (!hasFolder) {
    fullPath = type === 'avatar' ? `avatars/${path}` : `videos/${path}`;
  }
  if (!fullPath.match(/\.(mp4|webm|mov)$/i)) fullPath += '.mp4';
  return fullPath;
}

// ---------------------------------------------------------------------------
// Preload
// ---------------------------------------------------------------------------

export async function preloadSections(
  sections: V4Section[],
  jobId: string,
  indices: number[],
  onProgress?: (p: PreloadProgress) => void
): Promise<void> {
  await ensureDir();
  console.log('[V4Preload] ▶ preloadSections indices:', indices);

  const urls: string[] = [];
  function addUrl(raw: string, type: 'avatar' | 'video') {
    if (!raw || raw.includes('vimeo.com')) return;
    const normalized = normalizePath(raw, type);
    const finalUrl = normalized.startsWith('http') ? normalized : resolveV4MediaUrl(jobId, normalized);
    urls.push(finalUrl);
  }
  function addImageUrl(raw: string) {
    if (!raw || raw.includes('vimeo.com')) return;
    let normalized = raw;
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      const hasFolder = normalized.includes('images/') || normalized.includes('assets/') ||
        normalized.includes('avatars/') || normalized.includes('videos/') ||
        normalized.includes('infographics/') || normalized.includes('/');
      if (!hasFolder) normalized = `images/${normalized}`;
    }
    const path = normalized.startsWith('http') ? normalized : resolveV4MediaUrl(jobId, normalized);
    urls.push(path);
  }

  for (const idx of indices) {
    if (idx < 0 || idx >= sections.length) continue;
    const sec = sections[idx];

    // Sections 1 & 2 (index 0 intro, index 1 summary) AND memory sections play
    // the avatar clip directly, so cache the avatar video for those. Other
    // sections from index 2 onward play the single pre-merged video per section
    // (avatar composited over beats, audio baked in) — so we cache that one file
    // instead of every beat/visual asset. Keep this rule in lockstep with
    // shouldUseFinalVideo() in V4PlayerScreen, or the section won't be cached.
    const secType = (sec.section_type || '').toLowerCase();
    const useAvatarClip =
      idx <= 1 || secType === 'memory' || secType === 'memory_infographic';
    if (useAvatarClip) {
      const avatarPath = resolveAvatarPath(sec);
      if (avatarPath) {
        console.log(`[V4Preload]   Section ${idx} avatar:`, avatarPath.slice(0, 60));
        addUrl(avatarPath, 'avatar');
      }
    } else {
      const finalPath = resolveFinalVideoPath(sec);
      if (finalPath) {
        console.log(`[V4Preload]   Section ${idx} final:`, finalPath.slice(0, 60));
        addUrl(finalPath, 'video');
      }
    }

    // questions is already normalised (understanding_quiz merged in). The quiz
    // still plays its own per-question avatar clips + explanation visuals.
    const qItems = Array.isArray(sec.questions) ? sec.questions : [];
    for (const q of qItems) {
      if (q.avatar_clips) {
        const clipVals = Object.values(q.avatar_clips);
        for (const clip of clipVals) {
          if (clip) addUrl(clip, 'avatar');
        }
      }
      const ev = q.explanation_visual;
      if (ev) {
        if (ev.video_path) addUrl(ev.video_path, 'video');
        if (ev.wan_video_path) addUrl(ev.wan_video_path, 'video');
        if (ev.url) addUrl(ev.url, 'video');
        if (ev.image_path) addImageUrl(ev.image_path);
        if (ev.image_source) addImageUrl(ev.image_source);
      }
    }
  }

  const unique = Array.from(new Set(urls.filter(Boolean)));
  console.log('[V4Preload] ▶ preloadSections total unique URLs to cache:', unique.length);
  let done = 0;
  const total = unique.length;
  if (total === 0) { onProgress?.({ completed: 0, total: 0, percent: 100 }); return; }
  onProgress?.({ completed: 0, total, percent: 0 });

  const CONCURRENCY = 3;
  let qi = 0;
  async function worker() {
    while (qi < unique.length) {
      const url = unique[qi++];
      await downloadOne(url).catch(() => {});
      done++;
      onProgress?.({ completed: done, total, percent: Math.round((done / total) * 100) });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
  console.log('[V4Preload] ▶ preloadSections DONE for indices:', indices);
}

export class V4PreloadManager {
  private sections: V4Section[];
  private jobId: string;
  private prefetched = new Set<number>();

  constructor(sections: V4Section[], jobId: string) {
    this.sections = sections;
    this.jobId = jobId;
  }

  async prefetchInitial(onProgress?: (p: PreloadProgress) => void): Promise<void> {
    const initial = [0, 1, 2].filter(i => i < this.sections.length);
    console.log('[V4Preload BOOT] prefetchInitial indices:', initial);
    await preloadSections(this.sections, this.jobId, initial, onProgress);
    initial.forEach(i => this.prefetched.add(i));
  }

  prefetchAhead(currentIndex: number): void {
    const targets = [currentIndex + 1, currentIndex + 2, currentIndex + 3].filter(
      i => i < this.sections.length && !this.prefetched.has(i)
    );
    if (targets.length === 0) return;
    console.log('[V4Preload BG] prefetchAhead indices:', targets);
    targets.forEach(i => this.prefetched.add(i));
    preloadSections(this.sections, this.jobId, targets).catch(() => {});
  }

  isReady(index: number): boolean {
    return this.prefetched.has(index);
  }

  reset(): void {
    this.prefetched.clear();
  }
}
