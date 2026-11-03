// Background push of reminder voice files. The server sends a data message
// {type: 'reminder_audio', items: JSON} listing the files for upcoming reminders.
// This runs from the headless handler too, so it imports nothing beyond audio.ts (no UI).

import { SUPABASE_URL } from '../supabase';
import { downloadReminderAudio, type AudioFormat } from './audio';

export interface ReminderAudioPushItem {
  hash: string;
  fmt: AudioFormat;
  url: string;
  /** ISO instant the reminder fires. */
  fireAt: string;
}

export interface ReminderAudioPushResult {
  downloaded: number;
  skipped: number;
}

// Same rule as HASH_PATTERN in audio.ts: only a plain hex digest may become a file name.
const HASH_PATTERN = /^[a-f0-9]{16,128}$/i;
const FORMATS: ReadonlyArray<string> = ['wav', 'mp3'];
const AUTHORITY = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i;

export function isValidAudioHash(hash: unknown): hash is string {
  return typeof hash === 'string' && HASH_PATTERN.test(hash);
}

/** Only https URLs on the Supabase storage host of SUPABASE_URL are accepted. */
export function isAllowedAudioUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return false;
  const expected = AUTHORITY.exec(SUPABASE_URL ?? '');
  const actual = AUTHORITY.exec(url);
  if (!expected || !actual) return false;
  return expected[1].toLowerCase() === actual[1].toLowerCase();
}

/** Builds the data object the server sends in the push. Used by tests. */
export function buildReminderAudioPayload(
  items: ReadonlyArray<ReminderAudioPushItem>,
): { type: 'reminder_audio'; items: string } {
  return { type: 'reminder_audio', items: JSON.stringify(items) };
}

function isValidItem(x: unknown): x is ReminderAudioPushItem {
  if (!x || typeof x !== 'object') return false;
  const item = x as Record<string, unknown>;
  if (!isValidAudioHash(item.hash)) return false;
  if (typeof item.fmt !== 'string' || !FORMATS.includes(item.fmt)) return false;
  if (!isAllowedAudioUrl(item.url)) return false;
  if (typeof item.fireAt !== 'string' || Number.isNaN(Date.parse(item.fireAt))) return false;
  return true;
}

function parseItems(raw: unknown): unknown[] | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Local calendar day as YYYY-MM-DD. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Handles a reminder_audio push: downloads each valid item for today or tomorrow (local time).
 * Invalid and out-of-window items are skipped. Never throws. Deleting old files is left to the
 * sync, so this handler never removes files for other reminders.
 */
export async function handleReminderAudioPush(
  data: Record<string, string>,
): Promise<ReminderAudioPushResult> {
  try {
    const items = parseItems(data?.items);
    if (!items) {
      console.warn('[Reminders] reminder_audio push has no readable items');
      return { downloaded: 0, skipped: 0 };
    }

    const now = new Date();
    const today = localDayKey(now);
    const tomorrow = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    let downloaded = 0;
    let skipped = 0;

    for (const raw of items) {
      if (!isValidItem(raw)) {
        skipped += 1;
        continue;
      }
      // Only today and tomorrow are downloaded. Deleting old files is left to the sync, which
      // knows every reminder; this handler must not delete files for other reminders.
      const day = localDayKey(new Date(raw.fireAt));
      if (day !== today && day !== tomorrow) {
        skipped += 1;
        continue;
      }
      try {
        await downloadReminderAudio(raw.hash, raw.fmt, raw.url);
        downloaded += 1;
      } catch (e) {
        console.warn('[Reminders] reminder_audio download failed', e);
        skipped += 1;
      }
    }

    return { downloaded, skipped };
  } catch (e) {
    console.warn('[Reminders] reminder_audio push failed', e);
    return { downloaded: 0, skipped: 0 };
  }
}
