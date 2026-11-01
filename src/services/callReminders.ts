import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import { SUPABASE_URL, SUPABASE_ANON_KEY, getValidAccessToken } from './supabase';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { isCallRemindersEnabled } from '../constants/featureFlags';
import {
  CallReminder,
  CallReminderInput,
  AudioStatus,
  ReminderStatus,
  SARVAM_LANGUAGES,
  SARVAM_VOICES,
  CALL_NOTIF_PREFIX,
  CALL_CHANNEL_ID,
  CALL_CATEGORY_ID,
  CALL_ACTION_ANSWER,
  CALL_ACTION_DECLINE,
} from '../types/callReminder';

const REST_URL = `${SUPABASE_URL}/rest/v1/reminders`;
const AUDIO_FN_URL = `${SUPABASE_URL}/functions/v1/reminder-call-audio`;
const CALL_AUDIO_DIR = 'call-reminders/';
const REST_TIMEOUT_MS = 15000;
const AUDIO_TIMEOUT_MS = 30000;
const MAX_SCHEDULED = 20;
const MISSED_AFTER_MS = 2 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  model: 'bulbul:v3';
}

export class CallReminderAudioError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'CallReminderAudioError';
    this.code = code;
    this.status = status;
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

async function authHeaders(json = true): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Not signed in');
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

function base64UrlDecode(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const str = input.replace(/-/g, '+').replace(/_/g, '/');
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const ch of str) {
    if (ch === '=') break;
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return out;
}

async function currentUserId(): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Not signed in');
  const payload = token.split('.')[1];
  const claims = JSON.parse(base64UrlDecode(payload));
  if (typeof claims.sub !== 'string') throw new Error('No user id in session');
  return claims.sub;
}

async function readJsonOrThrow<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label} failed (${res.status})`);
  return (await res.json()) as T;
}

async function patchReminder(id: string, body: Record<string, unknown>): Promise<CallReminder | null> {
  const res = await fetchWithTimeout(
    `${REST_URL}?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { ...(await authHeaders()), Prefer: 'return=representation' },
      body: JSON.stringify(body),
    },
    REST_TIMEOUT_MS,
  );
  const rows = await readJsonOrThrow<CallReminder[]>(res, 'Update reminder');
  return rows[0] ?? null;
}

function callAudioDir(): string | null {
  const base = FileSystem.documentDirectory;
  return base ? `${base}${CALL_AUDIO_DIR}` : null;
}

function localAudioPath(hash: string): string | null {
  const dir = callAudioDir();
  return dir ? `${dir}${hash}.mp3` : null;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await FileSystem.getInfoAsync(path)).exists;
  } catch {
    return false;
  }
}

async function downloadToLocal(hash: string, signedUrl: string): Promise<string | null> {
  const dir = callAudioDir();
  const local = localAudioPath(hash);
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
    console.warn('[CallReminders] audio download failed', e);
    return null;
  }
}

async function deleteLocalAudio(hash: string | null): Promise<void> {
  const local = hash ? localAudioPath(hash) : null;
  if (!local) return;
  await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
}

/** Removes every downloaded call voice file. Used on logout. */
export async function clearLocalCallAudio(): Promise<void> {
  const dir = callAudioDir();
  if (!dir) return;
  await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
}

function validateInput(input: CallReminderInput): void {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 80) throw new Error('Title must be 1 to 80 characters');
  const message = input.message_text.trim();
  if (message.length < 1 || message.length > 500) throw new Error('Message must be 1 to 500 characters');
  if (isNaN(Date.parse(input.scheduled_at))) throw new Error('Invalid reminder time');
  if (!SARVAM_LANGUAGES.some(l => l.value === input.language)) throw new Error('Unsupported language');
  if (!SARVAM_VOICES.some(v => v.value === input.voice)) throw new Error('Unsupported voice');
}

// ── pure scheduling logic ───────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  const c = new Date(d.getTime());
  c.setDate(c.getDate() + n);
  return c;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Next time this reminder should ring, strictly after `now`, in local time.
 * Returns null when a one-off reminder is already in the past.
 */
export function nextOccurrence(
  reminder: Pick<CallReminder, 'scheduled_at' | 'repeat_rule'>,
  now: Date = new Date(),
): Date | null {
  const base = new Date(reminder.scheduled_at);
  if (isNaN(base.getTime())) return null;

  if (reminder.repeat_rule === 'none') {
    return base.getTime() > now.getTime() ? base : null;
  }

  let c = base;
  if (c.getTime() <= now.getTime()) {
    const stepDays = reminder.repeat_rule === 'weekly' ? 7 : 1;
    const elapsedDays = Math.floor((now.getTime() - base.getTime()) / DAY_MS);
    c = addDays(base, Math.floor(elapsedDays / stepDays) * stepDays);
    while (c.getTime() <= now.getTime()) c = addDays(c, stepDays);
  }
  if (reminder.repeat_rule === 'weekdays') {
    while (isWeekend(c)) c = addDays(c, 1);
  }
  return c;
}

// ── notification plumbing ───────────────────────────────────────────────────

export async function ensureCallChannelAndCategory(): Promise<void> {
  if (!isCallRemindersEnabled()) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
      name: 'Study call reminders',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'study_call_ring.wav',
      vibrationPattern: [0, 1000, 800, 1000, 800, 1000],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
      lightColor: '#2BBD6E',
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.NOTIFICATION_COMMUNICATION_REQUEST,
      },
    });
  }
  await Notifications.setNotificationCategoryAsync(CALL_CATEGORY_ID, [
    { identifier: CALL_ACTION_ANSWER, buttonTitle: 'Answer', options: { opensAppToForeground: true } },
    {
      identifier: CALL_ACTION_DECLINE,
      buttonTitle: 'Decline',
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);
}

async function scheduleOne(reminder: CallReminder, fire: Date): Promise<void> {
  const identifier = `${CALL_NOTIF_PREFIX}${reminder.id}`;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: '📞 Simple Lecture Teacher',
      subtitle: reminder.title,
      body: reminder.call_enabled ? 'Incoming study call. Tap Answer.' : reminder.message_text,
      sound: 'study_call_ring.wav',
      categoryIdentifier: CALL_CATEGORY_ID,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: false,
      autoDismiss: true,
      data: {
        type: 'call_reminder',
        reminderId: reminder.id,
        screen: 'ReminderCall',
        params: { reminderId: reminder.id, autoplay: true },
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fire,
      channelId: CALL_CHANNEL_ID,
    },
  });
}

export async function cancelCallReminder(id: string): Promise<void> {
  if (!isCallRemindersEnabled()) return;
  await Notifications.cancelScheduledNotificationAsync(`${CALL_NOTIF_PREFIX}${id}`).catch(() => {});
}

export async function scheduleCallReminder(reminder: CallReminder): Promise<void> {
  if (!isCallRemindersEnabled()) return;
  await ensureCallChannelAndCategory();
  const fire = reminder.status === 'scheduled' ? nextOccurrence(reminder, new Date()) : null;
  if (!fire) {
    await cancelCallReminder(reminder.id);
    return;
  }
  await scheduleOne(reminder, fire);
}

// ── data access ─────────────────────────────────────────────────────────────

export async function listReminders(): Promise<CallReminder[]> {
  if (!isCallRemindersEnabled()) return [];
  const res = await fetchWithTimeout(
    `${REST_URL}?select=*&order=scheduled_at.asc`,
    { method: 'GET', headers: await authHeaders(false) },
    REST_TIMEOUT_MS,
  );
  return readJsonOrThrow<CallReminder[]>(res, 'Load reminders');
}

export async function getReminder(id: string): Promise<CallReminder | null> {
  if (!isCallRemindersEnabled()) return null;
  const res = await fetchWithTimeout(
    `${REST_URL}?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
    { method: 'GET', headers: await authHeaders(false) },
    REST_TIMEOUT_MS,
  );
  const rows = await readJsonOrThrow<CallReminder[]>(res, 'Load reminder');
  return rows[0] ?? null;
}

/** Calls the reminder-call-audio edge function. Throws CallReminderAudioError on failure. */
export async function generateAudio(params: GenerateAudioParams): Promise<GenerateAudioResult> {
  if (!isCallRemindersEnabled()) {
    throw new CallReminderAudioError('disabled', 503, 'Call reminders are disabled');
  }
  const body: Record<string, unknown> = { text: params.text };
  if (params.voice !== undefined) body.voice = params.voice;
  if (params.language !== undefined) body.language = params.language;
  if (params.reminderId !== undefined) body.reminderId = params.reminderId;
  if (params.preview !== undefined) body.preview = params.preview;

  const res = await fetchWithTimeout(
    AUDIO_FN_URL,
    { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) },
    AUDIO_TIMEOUT_MS,
  );
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new CallReminderAudioError('non_json', res.status, 'Voice service returned an unexpected response');
  }
  const data = await res.json();
  if (!res.ok) {
    const code = typeof data?.error === 'string' ? data.error : 'tts_failed';
    throw new CallReminderAudioError(code, res.status, `Voice generation failed (${code})`);
  }
  return data as GenerateAudioResult;
}

/**
 * Returns a local mp3 path for the reminder's voice, downloading it if needed.
 * Returns null when the reminder has no call audio or it cannot be fetched.
 */
export async function ensureLocalAudio(reminder: CallReminder): Promise<string | null> {
  if (!isCallRemindersEnabled() || !reminder.call_enabled) return null;

  if (reminder.audio_hash) {
    const local = localAudioPath(reminder.audio_hash);
    if (local && (await fileExists(local))) return local;
  }
  try {
    // A cache hit on the server costs nothing and returns a fresh signed URL.
    const res = await generateAudio({
      text: reminder.message_text,
      voice: reminder.voice,
      language: reminder.language,
      reminderId: reminder.id,
    });
    return await downloadToLocal(res.hash, res.signedUrl);
  } catch (e) {
    console.warn('[CallReminders] ensureLocalAudio failed', e);
    return null;
  }
}

export async function saveReminder(
  input: CallReminderInput,
  existing?: CallReminder,
): Promise<{ reminder: CallReminder; audioWarning: boolean }> {
  if (!isCallRemindersEnabled()) throw new Error('Call reminders are disabled');
  validateInput(input);

  const fields = {
    title: input.title.trim(),
    message_text: input.message_text.trim(),
    scheduled_at: new Date(input.scheduled_at).toISOString(),
    repeat_rule: input.repeat_rule,
    call_enabled: input.call_enabled,
    voice: input.voice,
    language: input.language,
  };

  let row: CallReminder;
  let needsAudio: boolean;

  if (existing) {
    const audioChanged =
      existing.message_text !== fields.message_text ||
      existing.voice !== fields.voice ||
      existing.language !== fields.language ||
      !existing.call_enabled;
    needsAudio = fields.call_enabled && (audioChanged || !existing.audio_hash);
    const audioStatus: AudioStatus = fields.call_enabled
      ? needsAudio ? 'pending' : existing.audio_status
      : 'none';
    const updated = await patchReminder(existing.id, {
      ...fields,
      status: 'scheduled' as ReminderStatus,
      audio_status: audioStatus,
      ...(fields.call_enabled ? {} : { audio_path: null, audio_hash: null }),
    });
    if (!updated) throw new Error('Reminder not found');
    row = updated;
  } else {
    needsAudio = fields.call_enabled;
    const userId = await currentUserId();
    const res = await fetchWithTimeout(
      REST_URL,
      {
        method: 'POST',
        headers: { ...(await authHeaders()), Prefer: 'return=representation' },
        body: JSON.stringify({
          ...fields,
          user_id: userId,
          status: 'scheduled',
          audio_status: fields.call_enabled ? 'pending' : 'none',
        }),
      },
      REST_TIMEOUT_MS,
    );
    const rows = await readJsonOrThrow<CallReminder[]>(res, 'Create reminder');
    if (!rows[0]) throw new Error('Create reminder returned no row');
    row = rows[0];
  }

  let reminder = row;
  let audioWarning = false;
  if (fields.call_enabled) {
    if (needsAudio) {
      try {
        const audio = await generateAudio({
          text: row.message_text,
          voice: row.voice,
          language: row.language,
          reminderId: row.id,
        });
        const local = await downloadToLocal(audio.hash, audio.signedUrl);
        reminder = { ...row, audio_hash: audio.hash, audio_path: audio.audioPath, audio_status: 'ready' };
        audioWarning = !local;
      } catch (e) {
        console.warn('[CallReminders] voice generation failed, saving as text reminder', e);
        audioWarning = true;
      }
    } else {
      audioWarning = !(await ensureLocalAudio(row));
    }
  }

  await scheduleCallReminder(reminder);
  return { reminder, audioWarning };
}

export async function deleteReminder(id: string): Promise<void> {
  if (!isCallRemindersEnabled()) return;
  const existing = await getReminder(id).catch(() => null);
  await cancelCallReminder(id);
  const res = await fetchWithTimeout(
    `${REST_URL}?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: await authHeaders(false) },
    REST_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`Delete reminder failed (${res.status})`);
  await deleteLocalAudio(existing?.audio_hash ?? null);
}

/**
 * Records what happened at ring time. One-off reminders get the status.
 * Repeating reminders stay `scheduled`, record last_fired_at, and move to
 * the next occurrence, which is scheduled right away.
 */
export async function markStatus(id: string, status: ReminderStatus): Promise<void> {
  if (!isCallRemindersEnabled()) return;
  const current = await getReminder(id);
  if (!current) return;
  const nowIso = new Date().toISOString();

  if (current.repeat_rule === 'none') {
    const updated = await patchReminder(id, { status, last_fired_at: nowIso });
    if (updated) await cancelCallReminder(id);
    return;
  }

  const from = new Date(Math.max(Date.now(), Date.parse(current.scheduled_at)));
  const next = nextOccurrence(current, from);
  const updated = await patchReminder(id, {
    last_fired_at: nowIso,
    ...(next ? { scheduled_at: next.toISOString() } : {}),
  });
  if (updated) await scheduleCallReminder(updated);
}

/** Marks one-off reminders missed, or moves repeating ones to their next occurrence. */
export async function reconcileMissed(): Promise<void> {
  if (!isCallRemindersEnabled()) return;
  let all: CallReminder[];
  try {
    all = await listReminders();
  } catch (e) {
    console.warn('[CallReminders] reconcileMissed skipped', e);
    return;
  }
  const now = new Date();
  const cutoff = now.getTime() - MISSED_AFTER_MS;
  for (const r of all) {
    if (r.status !== 'scheduled') continue;
    if (!(Date.parse(r.scheduled_at) < cutoff)) continue;
    if (r.repeat_rule === 'none') {
      await patchReminder(r.id, { status: 'missed' });
    } else {
      const next = nextOccurrence(r, now);
      if (next) await patchReminder(r.id, { scheduled_at: next.toISOString() });
    }
  }
}

/** Rebuilds the OS call notifications from the database (nearest 20 only). */
export async function rescheduleAllCallReminders(): Promise<void> {
  if (!isCallRemindersEnabled()) return;
  let all: CallReminder[];
  try {
    all = await listReminders();
  } catch (e) {
    console.warn('[CallReminders] rescheduleAll skipped', e);
    return;
  }
  await ensureCallChannelAndCategory();

  const now = new Date();
  const upcoming = all
    .filter(r => r.status === 'scheduled')
    .map(r => ({ r, fire: nextOccurrence(r, now) }))
    .filter((x): x is { r: CallReminder; fire: Date } => x.fire !== null)
    .sort((a, b) => a.fire.getTime() - b.fire.getTime())
    .slice(0, MAX_SCHEDULED);

  const keepIds = new Set(upcoming.map(x => `${CALL_NOTIF_PREFIX}${x.r.id}`));
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of pending) {
    if (n.identifier.startsWith(CALL_NOTIF_PREFIX) && !keepIds.has(n.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
    }
  }

  for (const { r, fire } of upcoming) {
    await scheduleOne(r, fire);
    if (r.call_enabled && r.audio_status === 'pending') {
      await ensureLocalAudio(r).catch(() => null);
    }
  }
}
