// Voice files for Reminders v2. Spec: _scratch/reminders-v2-plan.md D-9, D-10, D.5 and F.2.
// Local voice files live in documentDirectory/reminders-audio/<hash>.<ext>, where ext is
// 'wav' (Gemini, current) or 'mp3' (Sarvam, legacy). The server says which one it sent.

import * as FileSystem from 'expo-file-system/legacy';
import { SUPABASE_URL } from '../supabase';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { FEATURES } from '../../constants/featureFlags';
import type { Reminder, VoiceLanguage, VoiceName } from '../../types/reminder';
import { spokenScript } from './spokenScript';
import { authHeaders } from './api';

const AUDIO_FN_URL = `${SUPABASE_URL}/functions/v1/reminder-call-audio`;
const AUDIO_DIR_NAME = 'reminders-audio/';
export const AUDIO_TIMEOUT_MS = 30000;
export const RESOLVE_TIMEOUT_MS = 6000;

export type AudioFormat = 'wav' | 'mp3';
// Looked up in this order when a reminder's file is read from disk.
const FORMATS: ReadonlyArray<AudioFormat> = ['wav', 'mp3'];

export interface GenerateAudioParams {
  text: string;
  voice?: string;
  language?: string;
  reminderId?: string;
  preview?: boolean;
}

export interface GenerateAudioResult {
  audioPath: string;
  hash: string;
  signedUrl: string;
  cached: boolean;
  voice: string;
  language: string;
  /** 'gemini-3.8-flash-tts' (new) or 'bulbul:v3' (legacy Sarvam). */
  model: string;
  engine?: 'gemini' | 'sarvam';
  /** Missing from older server responses; those files were always mp3. */
  format?: AudioFormat;
}

/** Time (ms) until which the server's daily voice quota is known to be used up. */
let quotaBlockedUntil = 0;

export class ReminderAudioError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'ReminderAudioError';
    this.code = code;
    this.status = status;
  }
}

/** A voice file ready on this device. */
export interface LocalAudio {
  uri: string;
  hash: string;
  audioPath: string | null;
}

/**
 * What the call or message screen should play (D-9 fallback ladder).
 * 'file' plays the local voice file. 'device' speaks the script with the phone's voice.
 * 'text' shows the script in large type.
 */
export type VoiceSource =
  | ({ type: 'file' } & LocalAudio)
  | { type: 'device'; script: string; language: VoiceLanguage }
  | { type: 'text'; script: string };

/** Per-reminder result of a background voice prefetch. */
export interface PrefetchResult {
  id: string;
  audio: 'ready' | 'failed';
  hash: string | null;
  audioPath: string | null;
}

function audioDir(): string | null {
  const base = FileSystem.documentDirectory;
  return base ? `${base}${AUDIO_DIR_NAME}` : null;
}

// The hash comes from the server, so only a plain hex digest may become a file name.
// Anything else (path segments, dots, slashes) is refused instead of written to disk.
const HASH_PATTERN = /^[a-f0-9]{16,128}$/i;

function localPath(hash: string, format: AudioFormat): string | null {
  if (!HASH_PATTERN.test(hash)) return null;
  const dir = audioDir();
  return dir ? `${dir}${hash}.${format}` : null;
}

function formatOf(res: Pick<GenerateAudioResult, 'format'>): AudioFormat {
  return res.format === 'wav' ? 'wav' : 'mp3';
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await FileSystem.getInfoAsync(path)).exists;
  } catch {
    return false;
  }
}

async function downloadToLocal(
  hash: string,
  format: AudioFormat,
  signedUrl: string,
): Promise<string | null> {
  const dir = audioDir();
  const local = localPath(hash, format);
  if (!dir || !local) return null;
  try {
    if (!(await fileExists(dir))) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    const result = await FileSystem.downloadAsync(signedUrl, local);
    if (result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
      return null;
    }
    return local;
  } catch (e) {
    console.warn('[Reminders] audio download failed', e);
    // A throw can leave a partial file behind; remove it too.
    await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
    return null;
  }
}

/**
 * Downloads a reminder voice file to reminders-audio/<hash>.<fmt> (used by the background
 * push). Throws ReminderAudioError when the file cannot be written.
 */
export async function downloadReminderAudio(hash: string, fmt: AudioFormat, url: string): Promise<string> {
  const uri = await downloadToLocal(hash, fmt, url);
  if (!uri) throw new ReminderAudioError('download', 0, 'Could not download reminder audio');
  return uri;
}

/** Calls the reminder-call-audio edge function. Throws ReminderAudioError on failure. */
export async function generateAudio(
  params: GenerateAudioParams,
  timeoutMs: number = AUDIO_TIMEOUT_MS,
): Promise<GenerateAudioResult> {
  if (!FEATURES.reminders) {
    throw new ReminderAudioError('disabled', 503, 'Reminders are disabled');
  }
  const body: Record<string, unknown> = { text: params.text };
  if (params.voice !== undefined) body.voice = params.voice;
  if (params.language !== undefined) body.language = params.language;
  if (params.reminderId !== undefined) body.reminderId = params.reminderId;
  if (params.preview !== undefined) body.preview = params.preview;

  const res = await fetchWithTimeout(
    AUDIO_FN_URL,
    { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) },
    timeoutMs,
  );
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ReminderAudioError('non_json', res.status, 'Voice service returned an unexpected response');
  }
  const data = await res.json();
  if (!res.ok) {
    const code = typeof data?.error === 'string' ? data.error : 'tts_failed';
    throw new ReminderAudioError(code, res.status, `Voice generation failed (${code})`);
  }
  return data as GenerateAudioResult;
}

/**
 * Local voice file already on disk for this reminder (WAV preferred, then MP3).
 * Disk only: never touches the network, so it is safe to call while the phone rings.
 */
export async function findLocalAudio(
  r: Pick<Reminder, 'audio_hash' | 'audio_path'>,
): Promise<LocalAudio | null> {
  if (!FEATURES.reminders || !r.audio_hash) return null;
  for (const format of FORMATS) {
    const local = localPath(r.audio_hash, format);
    if (local && (await fileExists(local))) {
      return { uri: local, hash: r.audio_hash, audioPath: r.audio_path };
    }
  }
  return null;
}

/**
 * Local voice file for a reminder, downloading it when needed. Returns null when the
 * reminder has no voice to make or it cannot be fetched. Never throws.
 */
export async function ensureLocalAudio(
  r: Pick<Reminder, 'message_text' | 'language' | 'voice' | 'audio_hash' | 'audio_path' | 'id'>,
  opts: { timeoutMs?: number } = {},
): Promise<LocalAudio | null> {
  if (!FEATURES.reminders) return null;

  const onDisk = await findLocalAudio(r);
  if (onDisk) return onDisk;

  const script = spokenScript(r.message_text, r.language);
  if (!script) return null;
  try {
    // A server cache hit costs nothing and returns a fresh signed URL.
    const res = await generateAudio(
      { text: script, voice: r.voice, language: r.language, reminderId: r.id },
      opts.timeoutMs ?? AUDIO_TIMEOUT_MS,
    );
    const uri = await downloadToLocal(res.hash, formatOf(res), res.signedUrl);
    if (!uri) return null;
    return { uri, hash: res.hash, audioPath: res.audioPath };
  } catch (e) {
    // Once the daily voice quota is used up, stop asking until the next local day.
    if (e instanceof ReminderAudioError && e.code === 'daily_limit') {
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      quotaBlockedUntil = midnight.getTime();
      console.warn('[Reminders] daily voice quota reached; using phone voice until tomorrow');
      return null;
    }
    console.warn('[Reminders] ensureLocalAudio failed', e);
    return null;
  }
}

/**
 * A legacy mp3 (Sarvam) file is replaced by the Gemini wav when the server now makes one.
 * The mp3 is kept until the wav is on disk; any failure keeps the mp3.
 */
async function upgradeLegacyAudio(
  r: Pick<Reminder, 'message_text' | 'language' | 'voice' | 'id'>,
  current: LocalAudio,
): Promise<LocalAudio> {
  if (!current.uri.endsWith('.mp3')) return current;
  const script = spokenScript(r.message_text, r.language);
  if (!script) return current;
  try {
    const res = await generateAudio(
      { text: script, voice: r.voice, language: r.language, reminderId: r.id },
      AUDIO_TIMEOUT_MS,
    );
    if (formatOf(res) !== 'wav') return current;
    const uri = await downloadToLocal(res.hash, 'wav', res.signedUrl);
    return uri ? { uri, hash: res.hash, audioPath: res.audioPath } : current;
  } catch {
    return current;
  }
}

/**
 * Makes voice files for scheduled call reminders, one at a time (the edge function
 * quota is 20 new generations a day). Skips reminders whose voice already failed, so a
 * quota error is not retried on every sync. Legacy mp3 files are upgraded to wav.
 */
export async function prefetchVoices(
  reminders: ReadonlyArray<Reminder>,
): Promise<PrefetchResult[]> {
  const results: PrefetchResult[] = [];
  for (const r of reminders) {
    if (r.kind !== 'call' || r.status !== 'scheduled') continue;
    if (r.audio_status === 'failed') continue;
    const onDisk = await findLocalAudio(r);
    if (!onDisk && Date.now() < quotaBlockedUntil) {
      results.push({ id: r.id, audio: 'failed', hash: null, audioPath: null });
      continue;
    }
    const local = onDisk
      ? await upgradeLegacyAudio(r, onDisk)
      : await ensureLocalAudio(r, { timeoutMs: AUDIO_TIMEOUT_MS });
    results.push(
      local
        ? { id: r.id, audio: 'ready', hash: local.hash, audioPath: local.audioPath }
        : { id: r.id, audio: 'failed', hash: null, audioPath: null },
    );
  }
  return results;
}

/**
 * Deletes local voice files that no reminder refers to. The file being played is kept.
 * Strips either extension (.wav or .mp3) to get the hash.
 */
export async function gcAudio(keepHashes: Iterable<string>, playingHash?: string | null): Promise<void> {
  const dir = audioDir();
  if (!dir) return;
  const keep = new Set<string>(keepHashes);
  if (playingHash) keep.add(playingHash);
  let names: string[] = [];
  try {
    names = await FileSystem.readDirectoryAsync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const hash = name.replace(/\.(wav|mp3)$/, '');
    if (keep.has(hash)) continue;
    await FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true }).catch(() => {});
  }
}

/** Removes every downloaded voice file. Used on logout. */
export async function clearAllAudio(): Promise<void> {
  const dir = audioDir();
  if (!dir) return;
  await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
}

/**
 * What to play for a reminder. Order: local file, then a fetch with a 6 s deadline,
 * then the phone's own voice with the same script. Never throws.
 */
export async function resolveVoiceSource(
  r: Reminder,
  opts: { timeoutMs?: number } = {},
): Promise<VoiceSource> {
  const script = spokenScript(r.message_text, r.language);
  if (!script) return { type: 'text', script: r.message_text };

  const local = await ensureLocalAudio(r, { timeoutMs: opts.timeoutMs ?? RESOLVE_TIMEOUT_MS });
  if (local) return { type: 'file', ...local };
  return { type: 'device', script, language: r.language };
}

/** Generates (or reuses) a preview voice for the editor and returns a local uri. */
export async function previewVoice(
  text: string,
  voice: VoiceName,
  language: VoiceLanguage,
): Promise<string> {
  const script = spokenScript(text, language);
  if (!script) throw new ReminderAudioError('empty', 400, 'Nothing to preview');
  const res = await generateAudio({ text: script, voice, language, preview: true });
  const uri = await downloadToLocal(res.hash, formatOf(res), res.signedUrl);
  if (!uri) throw new ReminderAudioError('download', 0, 'Could not download the preview');
  return uri;
}
