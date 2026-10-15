import * as FileSystem from 'expo-file-system';

const V3_BASE = 'http://69.197.145.4:5006/player/jobs';
const CACHE_DIR = `${FileSystem.cacheDirectory}v3_cache/`;
const MIN_FILE_SIZE = 1024;

export interface V3NarrationSegment {
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

export interface V3VisualBeat {
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

export interface V3Flashcard {
  front?: string;
  back?: string;
  id?: string;
  q?: string;
  a?: string;
  question?: string;
  answer?: string;
}

export interface V3QuizOption {
  text: string;
  is_correct: boolean;
}

export interface V3ExplanationVisual {
  type?: 'video' | 'image';
  url?: string;
  video_path?: string;
  wan_video_path?: string;
  image_path?: string;
  image_source?: string;
}

export interface V3QuizItem {
  question_id?: string;
  question?: string;
  question_text?: string;
  options: V3QuizOption[];
  correct?: string;
  correct_option?: string;
  explanation?: string;
  explanation_visual?: V3ExplanationVisual;
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

export interface V3AvatarLanguage {
  language: string;
  video_path: string;
  status: string;
}

export interface V3Section {
  section_id: number;
  section_type: string;
  title: string;
  avatar_video?: string;
  b2_url?: string;
  avatar_languages?: V3AvatarLanguage[];
  vimeo_url?: string;
  narration?: {
    full_text?: string;
    segments: V3NarrationSegment[];
    total_duration_seconds?: number;
  };
  visual_beats?: V3VisualBeat[];
  flashcards?: V3Flashcard[];
  questions?: V3QuizItem[];
  understanding_quiz?: V3QuizItem | V3QuizItem[] | Record<string, unknown>;
  beat_video_paths?: string[];
  manim_video_paths?: string[];
  render_spec?: {
    infographic_beats?: V3VisualBeat[];
  };
  content?: string;
}

export interface V3Presentation {
  presentation_title: string;
  job_id?: string;
  sections: V3Section[];
  base_url?: string;
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function resolveV3MediaUrl(jobId: string, path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${V3_BASE}/${jobId}/${cleanPath}`;
}

export function getPresentationUrl(jobId: string): string {
  return `${V3_BASE}/${jobId}/presentation.json?t=${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Quiz normalisation
// The API can return understanding_quiz as a plain object (single quiz item)
// OR as an array. Options can be {A:"...", B:"..."} or [{text,is_correct}].
// ---------------------------------------------------------------------------

function normalizeOptions(raw: unknown, correctKey?: string): V3QuizOption[] {
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

export function normalizeQuizItems(raw: unknown): V3QuizItem[] {
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
      explanation_visual: q.explanation_visual as V3ExplanationVisual | undefined,
      avatar_clips: q.avatar_clips as V3QuizItem['avatar_clips'],
      option_reveal_seconds: q.option_reveal_seconds as number[] | undefined,
      narration: q.narration as V3QuizItem['narration'],
    };
  });
}

// ---------------------------------------------------------------------------
// Fetch + normalise the full presentation
// ---------------------------------------------------------------------------

export async function fetchV3Presentation(jobId: string): Promise<V3Presentation> {
  const url = getPresentationUrl(jobId);
  console.log('[V3Service] ▶ fetchV3Presentation START url:', url);
  const resp = await fetch(url);
  console.log('[V3Service] ▶ fetchV3Presentation HTTP status:', resp.status);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching presentation for job ${jobId}`);
  const data = await resp.json() as V3Presentation;
  console.log('[V3Service] ▶ fetchV3Presentation sections count:', data.sections?.length ?? 0);

  // Normalise every section's quiz data in-place
  data.sections = (data.sections || []).map((sec, i) => {
    const normQ = normalizeQuizItems(sec.questions);
    const normUQ = normalizeQuizItems(sec.understanding_quiz);
    const allQ = [...normQ, ...normUQ];
    console.log(`[V3Service]   Section ${i} (${sec.section_type}) quizItems:${allQ.length} b2_url:${sec.b2_url ? 'YES' : 'NO'}`);
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
          console.warn(`[V3Cache] Unknown MP4 box type "${boxType}" — treating file as corrupt: ${uri.slice(-50)}`);
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
      console.warn(`[V3Cache] Corrupt cached file detected, deleting: ${url.slice(-50)}`);
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
    }
  } catch {}

  const promise = (async () => {
    try {
      for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
        try {
          const dl = FileSystem.createDownloadResumable(url, dest, {});
          const result = await dl.downloadAsync();
          const uri = result?.uri || dest;
          const info = await FileSystem.getInfoAsync(uri);

          if (!info.exists || !('size' in info) || (info.size || 0) < MIN_FILE_SIZE) {
            await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
            console.warn(`[V3Cache] attempt ${attempt}/${MAX_DOWNLOAD_RETRIES} too small: ${url.slice(-50)}`);
          } else if (!(await isFileContentValid(uri))) {
            await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
            console.warn(`[V3Cache] attempt ${attempt}/${MAX_DOWNLOAD_RETRIES} corrupt content: ${url.slice(-50)}`);
          } else {
            downloadCache.set(url, uri);
            return uri;
          }
        } catch (e) {
          console.warn(`[V3Cache] attempt ${attempt}/${MAX_DOWNLOAD_RETRIES} error: ${url.slice(-50)}`);
        }

        if (attempt < MAX_DOWNLOAD_RETRIES) {
          await new Promise(r => setTimeout(r, 400 * attempt));
        }
      }
      // All retries exhausted — return remote URL as fallback (not cached)
      console.warn(`[V3Cache] All ${MAX_DOWNLOAD_RETRIES} attempts failed, using remote URL: ${url.slice(-50)}`);
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

export function resolveAvatarPath(section: V3Section): string | null {
  // Priority 1: b2_url (direct Backblaze B2 URL — always absolute)
  if (section.b2_url) return section.b2_url;
  // Priority 2: completed language-specific avatar
  if (section.avatar_languages?.length) {
    const completed = section.avatar_languages.find(al => al.status === 'completed' && al.video_path);
    if (completed) return completed.video_path;
  }
  // Priority 3: default avatar_video relative path
  if (section.avatar_video) return section.avatar_video;
  return `avatars/section_${section.section_id}_avatar.mp4`;
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
  sections: V3Section[],
  jobId: string,
  indices: number[],
  onProgress?: (p: PreloadProgress) => void
): Promise<void> {
  await ensureDir();
  console.log('[V3Service] ▶ preloadSections indices:', indices);

  const urls: string[] = [];
  function addUrl(raw: string, type: 'avatar' | 'video') {
    if (!raw || raw.includes('vimeo.com')) return;
    const normalized = normalizePath(raw, type);
    const finalUrl = normalized.startsWith('http') ? normalized : resolveV3MediaUrl(jobId, normalized);
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
    const path = normalized.startsWith('http') ? normalized : resolveV3MediaUrl(jobId, normalized);
    urls.push(path);
  }

  for (const idx of indices) {
    if (idx < 0 || idx >= sections.length) continue;
    const sec = sections[idx];

    const avatarPath = resolveAvatarPath(sec);
    if (avatarPath) {
      console.log(`[V3Service]   Section ${idx} avatar:`, avatarPath.slice(0, 60));
      addUrl(avatarPath, 'avatar');
    }

    const segs = Array.isArray(sec.narration?.segments) ? sec.narration!.segments : [];
    for (const seg of segs) {
      const bvs = Array.isArray(seg.beat_videos) ? seg.beat_videos : [];
      for (const bv of bvs) addUrl(bv, 'video');
      if (seg.video_path) addUrl(seg.video_path, 'video');
    }

    const bvPaths = Array.isArray(sec.beat_video_paths) ? sec.beat_video_paths : [];
    for (const bv of bvPaths) addUrl(bv, 'video');

    const mvPaths = Array.isArray(sec.manim_video_paths) ? sec.manim_video_paths : [];
    for (const mv of mvPaths) addUrl(mv, 'video');

    const vBeats = Array.isArray(sec.visual_beats) ? sec.visual_beats : [];
    for (const vb of vBeats) {
      if (vb.video_path) addUrl(vb.video_path, 'video');
      if (vb.video_url) addUrl(vb.video_url, 'video');
      if (vb.image_url) addImageUrl(vb.image_url);
      if (vb.image_source) addImageUrl(vb.image_source);
    }

    const infraBeats = Array.isArray(sec.render_spec?.infographic_beats) ? sec.render_spec!.infographic_beats! : [];
    for (const vb of infraBeats) {
      if (vb.video_path) addUrl(vb.video_path, 'video');
      if (vb.image_url) addImageUrl(vb.image_url);
      if (vb.image_source) addImageUrl(vb.image_source);
    }

    // questions is already normalised (understanding_quiz merged in)
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
  console.log('[V3Service] ▶ preloadSections total unique URLs to cache:', unique.length);
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
  console.log('[V3Service] ▶ preloadSections DONE for indices:', indices);
}

export class V3PreloadManager {
  private sections: V3Section[];
  private jobId: string;
  private prefetched = new Set<number>();

  constructor(sections: V3Section[], jobId: string) {
    this.sections = sections;
    this.jobId = jobId;
  }

  async prefetchInitial(onProgress?: (p: PreloadProgress) => void): Promise<void> {
    const initial = [0, 1, 2].filter(i => i < this.sections.length);
    console.log('[V3PreloadManager] prefetchInitial indices:', initial);
    await preloadSections(this.sections, this.jobId, initial, onProgress);
    initial.forEach(i => this.prefetched.add(i));
  }

  prefetchAhead(currentIndex: number): void {
    const targets = [currentIndex + 1, currentIndex + 2, currentIndex + 3].filter(
      i => i < this.sections.length && !this.prefetched.has(i)
    );
    if (targets.length === 0) return;
    console.log('[V3PreloadManager] prefetchAhead indices:', targets);
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
