// Facade for Reminders v2: the only module the screens and hooks import for data.
// Spec: _scratch/reminders-v2-plan.md F.4, D.3, D-10, D-11, D-14, D-19, D-20, D-21 and WP2.

import * as Notifications from 'expo-notifications';
import { randomUUID } from 'expo-crypto';
import * as api from './api';
import * as audio from './audio';
import * as store from './store';
import {
  buildTrigger,
  deviceTimeZone,
  inputToRow,
  nextFire,
  planSchedule,
  validateInput,
  type PlannedRequest,
} from './schedule';
import {
  ensureReminderChannels,
  applySchedulePlan,
  cancelAllReminderNotifications,
  cancelReminderNotification,
  scheduleReminderRequest,
} from './notifications';
import { LIMITS, type Reminder, type ReminderInput, type VoiceLanguage, type VoiceName } from '../../types/reminder';
import type { AudioUi, PlannedState, PlanEntry, RemindersSnapshot } from './store';
import type { VoiceSource } from './audio';

export type { AudioUi, PlannedState, PlanEntry, RemindersSnapshot, VoiceSource };

export type SyncReason = 'app-start' | 'foreground' | 'mutation' | 'response' | 'permission' | 'login' | 'manual';

export interface SaveResult {
  reminder: Reminder;
  fireAt: Date | null;
  state: PlannedState;
  savedOffline: boolean;
}

export interface UndoToken {
  id: string;
  previous: Reminder;
  expiresAt: number;
}

/** What the OS needs to ring a reminder: the planned trigger plus the text for the notification body. */
export type ScheduledRequest = PlannedRequest & { text: string };

/** A user-facing validation problem. `field` tells the sheet where to show it. */
export class ReminderValidationError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'ReminderValidationError';
    this.field = field;
  }
}

const UNDO_WINDOW_MS = 5000;

// ---------- small helpers ----------

export { subscribe, getSnapshot } from './store';

type PermissionState = 'granted' | 'denied' | 'undetermined';

async function permissionState(): Promise<PermissionState> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.status === 'granted') return 'granted';
    return p.status === 'undetermined' ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

function localDateKey(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${da}`;
}

/** Database body for an upsert: every column the client writes, without server timestamps. */
function wireBody(row: Reminder): Record<string, unknown> {
  const { created_at: _createdAt, ...rest } = row;
  return { ...rest };
}

function scheduledFor(row: Reminder, now: Date): ScheduledRequest | null {
  const planned = planSchedule([row], now).scheduled[0];
  return planned ? { ...planned, text: row.message_text } : null;
}

function audioUiFor(r: Reminder): AudioUi {
  if (r.kind !== 'call') return 'none';
  if (r.audio_status === 'ready') return 'ready';
  if (r.audio_status === 'failed') return 'device';
  return 'preparing';
}

function setAudioUi(ids: Record<string, AudioUi>): void {
  store.commit({ audio: { ...store.getState().audio, ...ids } });
}

/** Writes a partial change to one row locally and queues the same change for the server. */
function patchLocal(id: string, fields: Partial<Reminder>): Reminder | null {
  const current = store.getItem(id);
  if (!current) return null;
  const updated: Reminder = { ...current, ...fields, updated_at: new Date().toISOString() };
  store.putItem(updated);
  store.enqueue({
    op: 'patch',
    id,
    body: { ...fields, updated_at: updated.updated_at },
    ts: Date.now(),
  });
  return updated;
}

async function notifyScheduled(item: ScheduledRequest): Promise<void> {
  await scheduleReminderRequest(item);
}

// ---------- plan and sync ----------

function buildPlanMap(
  live: ReadonlyArray<Reminder>,
  scheduled: ReadonlyArray<PlannedRequest>,
  queued: ReadonlyArray<string>,
  permission: PermissionState,
  now: Date,
): Record<string, PlanEntry> {
  const scheduledIds = new Set(scheduled.map(p => p.id));
  const queuedIds = new Set(queued);
  const plan: Record<string, PlanEntry> = {};
  for (const r of live) {
    const fire = nextFire(r, now);
    let state: PlannedState;
    if (!r.enabled) state = 'paused';
    else if (r.status !== 'scheduled') state = 'done';
    else if (queuedIds.has(r.id)) state = 'queued';
    else if (!fire) state = 'past';
    else if (permission !== 'granted') state = 'no-permission';
    else state = scheduledIds.has(r.id) ? 'scheduled' : 'past';
    plan[r.id] = { fireAt: fire ? fire.toISOString() : null, state };
  }
  return plan;
}

/**
 * A 4xx answer means the server will never accept this op as written (bad row, not allowed).
 * 408 and 429 are retry-later answers, so they are not poison.
 */
function isPoisonError(e: unknown): boolean {
  const err = e as { kind?: string; status?: number } | null;
  const status = typeof err?.status === 'number' ? err.status : 0;
  // 401 = login expired: keep the op so it syncs after the user signs in again.
  return err?.kind === 'server' && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}

/**
 * Sends the outbox in order. A poison op (4xx, see isPoisonError) is logged and dropped, and the
 * flush keeps going. A 5xx or network error stops the flush and keeps the op for the next run.
 * Returns the failure kind that stopped the flush, if any.
 */
async function flushOutboxOnce(userId: string): Promise<'network' | 'server' | null> {
  for (const op of [...store.getState().outbox]) {
    if (store.getState().userId !== userId) return null;
    if (!store.isValidOp(op)) {
      store.dequeue(op);
      continue;
    }
    try {
      if (op.op === 'upsert') await api.upsert(op.body);
      else if (op.op === 'patch') await api.patch(op.id, op.body);
      else await api.remove(op.id);
      store.dequeue(op);
    } catch (e) {
      if (isPoisonError(e)) {
        const status = (e as { status?: number }).status;
        console.warn(`[Reminders] dropped outbox ${op.op} for ${op.id} after HTTP ${status}`);
        store.dequeue(op);
        continue;
      }
      const kind = (e as { kind?: string } | null)?.kind;
      return kind === 'server' ? 'server' : 'network';
    }
  }
  return null;
}

// Flushes run one at a time, so a save's own write and a background sync never send the same op twice.
let flushChain: Promise<unknown> = Promise.resolve();
function flushOutbox(userId: string): Promise<'network' | 'server' | null> {
  const next = flushChain.then(() => flushOutboxOnce(userId), () => flushOutboxOnce(userId));
  flushChain = next.catch(() => undefined);
  return next;
}

async function runSyncOnce(): Promise<void> {
  const userId = store.getState().userId;
  if (!userId) {
    await cancelAllReminderNotifications();
    store.commit({ status: 'idle', syncing: false });
    return;
  }
  store.commit({ syncing: true, status: store.getState().status === 'idle' ? 'loading' : store.getState().status });
  let syncError: RemindersSnapshot['syncError'] = null;

  try {
    // 1. Send queued writes first, so the server copy is current before it is read back.
    const flushError = await flushOutbox(userId);
    if (flushError) syncError = flushError;
    if (store.getState().userId !== userId) return;

    // 2. Read the server copy and merge it with the cache. Pending local writes win.
    try {
      const serverRows = await api.fetchAll();
      if (store.getState().userId !== userId) return;
      const deletedIds = new Set(store.getState().outbox.filter(o => o.op === 'delete').map(o => o.id));
      const visible = serverRows.filter(r => !deletedIds.has(r.id));
      store.commit({
        items: store.mergeServerRows(store.getState().items, visible, store.pendingIds()),
      });
    } catch (e) {
      syncError = (e as { kind?: string } | null)?.kind === 'server' ? 'server' : 'network';
    }

    // 3. Housekeeping: mark missed or delivered one-offs, purge old rows.
    const now = Date.now();
    const rec = store.reconcileRows(store.getState().items, now);
    store.commit({ items: rec.items });
    for (const p of rec.patches) store.enqueue({ op: 'patch', id: p.id, body: p.body, ts: now });
    for (const id of rec.deletes) store.enqueue({ op: 'delete', id, ts: now });

    // 4. Work out what should ring, and tell the OS (skipped without permission, D-14).
    const date = new Date(now);
    const live = store.getState().items.filter(r => r.status !== 'cancelled');
    const plan = planSchedule(live, date);
    const permission = await permissionState();
    if (store.getState().userId !== userId) return;

    if (permission === 'granted') {
      try {
        await ensureReminderChannels();
        const byId = new Map(live.map(r => [r.id, r] as const));
        const items = plan.scheduled.map(p => ({ ...p, text: byId.get(p.id)?.message_text ?? '' }));
        await applySchedulePlan(items);
      } catch (e) {
        console.warn('[Reminders] applySchedulePlan failed', e);
      }
    }
    if (store.getState().userId !== userId) return;
    store.commit({ plan: buildPlanMap(live, plan.scheduled, plan.queued, permission, date) });

    // 5. Voices for scheduled call reminders, one at a time. Skipped when offline.
    if (syncError !== 'network') {
      const calls = live.filter(r => r.kind === 'call' && r.enabled && r.status === 'scheduled');
      setAudioUi(Object.fromEntries(calls.map(r => [r.id, audioUiFor(r)])));
      const results = await audio.prefetchVoices(calls);
      if (store.getState().userId !== userId) return;
      for (const res of results) {
        const current = store.getItem(res.id);
        if (!current) continue;
        const fields: Partial<Reminder> =
          res.audio === 'ready'
            ? { audio_status: 'ready', audio_hash: res.hash, audio_path: res.audioPath }
            : { audio_status: 'failed' };
        patchLocal(res.id, fields);
        setAudioUi({ [res.id]: res.audio === 'ready' ? 'ready' : 'device' });
      }
      await audio.gcAudio(
        store.getState().items.map(r => r.audio_hash).filter((h): h is string => !!h),
      );
    }

    store.commit({ lastSyncAt: Date.now(), status: 'ready', syncError });
  } catch (e) {
    console.warn('[Reminders] sync failed', e);
    store.commit({ status: 'error', syncError: syncError ?? 'network' });
  } finally {
    if (store.getState().userId === userId) store.commit({ syncing: false });
    await store.persist();
  }
}

let inFlight: Promise<void> | null = null;
let rerunRequested = false;

/**
 * Brings the phone's alarms, the outbox and the cache in line with the server.
 * Single-flight: a call during a run joins it and triggers one more pass afterwards.
 */
export function syncReminders(_reason: SyncReason): Promise<void> {
  if (inFlight) {
    rerunRequested = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      do {
        rerunRequested = false;
        await runSyncOnce();
      } while (rerunRequested);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Loads the cache for this user, then syncs. Call once the user is known. */
export async function initReminders(userId: string): Promise<void> {
  if (store.getState().userId !== userId) {
    store.resetForUser(userId);
    await store.loadCache(userId);
  }
  await syncReminders('app-start');
}

// ---------- writes ----------

/**
 * Validates and saves a reminder. Returns quickly: the row is written to the local cache and
 * the outbox, and the OS alarm is set, before any network call. Voice generation runs in the background.
 */
export async function saveReminder(input: ReminderInput, existing?: Reminder): Promise<SaveResult> {
  const startUser = store.getState().userId;
  if (!startUser) throw new Error('Not signed in');

  const now = new Date();
  const editingId = input.id ?? existing?.id;
  const dailyCount = store
    .getState()
    .items.filter(r => r.status !== 'cancelled' && r.repeat_rule === 'daily' && r.enabled && r.id !== editingId).length;
  const problem = validateInput(input, now, dailyCount);
  if (problem) throw new ReminderValidationError(problem.field, problem.message);

  const id = editingId ?? randomUUID();
  const prev = existing ?? store.getItem(id);
  const draft = inputToRow(input, id, now, deviceTimeZone());

  // Ask for permission on the first save only (D-14). Never on screen open.
  let permission = await permissionState();
  if (permission === 'undetermined') {
    const asked = await Notifications.requestPermissionsAsync();
    permission = asked.status === 'granted' ? 'granted' : 'denied';
  }
  if (store.getState().userId !== startUser) throw new Error('Signed out while saving');

  // Keep the voice file when the words, voice and language are unchanged.
  const voiceUnchanged =
    !!prev &&
    prev.message_text === draft.message_text &&
    prev.voice === draft.voice &&
    prev.language === draft.language;

  const row: Reminder = {
    ...draft,
    user_id: startUser,
    enabled: prev ? prev.enabled : true,
    created_at: prev?.created_at ?? now.toISOString(),
    updated_at: now.toISOString(),
    audio_path: voiceUnchanged ? prev?.audio_path ?? null : null,
    audio_hash: voiceUnchanged ? prev?.audio_hash ?? null : null,
    audio_status: voiceUnchanged ? prev?.audio_status ?? 'none' : 'none',
  };

  store.putItem(row);
  store.enqueue({ op: 'upsert', id, body: wireBody(row), ts: Date.now() });

  // Try the write now, so savedOffline reflects this save's own network result.
  const writeError = await flushOutbox(startUser);
  const savedOffline = writeError === 'network';

  const fire = nextFire(row, now);
  if (store.getState().userId !== startUser) {
    // Signed out during the write: no alarm is set for the old user, and nothing is thrown.
    return { reminder: row, fireAt: fire, state: 'paused', savedOffline };
  }
  let state: PlannedState;
  if (!fire) {
    state = 'past';
  } else if (permission !== 'granted') {
    state = 'no-permission';
  } else {
    const item = scheduledFor(row, now);
    if (item) {
      await notifyScheduled(item);
      if (store.getState().userId !== startUser) {
        // Signed out while the alarm was being set: remove it again.
        await cancelReminderNotification(id);
        throw new Error('Signed out while saving');
      }
    }
    state = 'scheduled';
  }
  store.commit({ plan: { ...store.getState().plan, [id]: { fireAt: fire ? fire.toISOString() : null, state } } });

  if (row.kind === 'call' && !voiceUnchanged) {
    setAudioUi({ [id]: 'preparing' });
    void (async () => {
      const results = await audio.prefetchVoices([row]);
      const res = results[0];
      if (!res || store.getState().userId !== startUser) return;
      patchLocal(id, res.audio === 'ready'
        ? { audio_status: 'ready', audio_hash: res.hash, audio_path: res.audioPath }
        : { audio_status: 'failed' });
      setAudioUi({ [id]: res.audio === 'ready' ? 'ready' : 'device' });
    })();
  }

  void syncReminders('mutation');

  return {
    reminder: store.getItem(id) ?? row,
    fireAt: fire,
    state,
    savedOffline,
  };
}

/** Turns a daily reminder on or off. Turning on is refused when the daily limit is reached. */
export async function setReminderEnabled(id: string, enabled: boolean): Promise<void> {
  const current = store.getItem(id);
  if (!current || current.status === 'cancelled') return;
  const now = new Date();

  if (enabled && current.repeat_rule === 'daily' && !current.enabled) {
    const others = store
      .getState()
      .items.filter(r => r.status !== 'cancelled' && r.repeat_rule === 'daily' && r.enabled && r.id !== id).length;
    if (others >= LIMITS.dailyMax) {
      throw new ReminderValidationError(
        'daily',
        `You can have up to ${LIMITS.dailyMax} daily reminders. Turn one off or delete one first.`,
      );
    }
  }

  const updated = patchLocal(id, { enabled });
  if (!updated) return;

  if (enabled && (await permissionState()) === 'granted') {
    const item = scheduledFor(updated, now);
    if (item) await notifyScheduled(item);
  } else {
    await cancelReminderNotification(id);
  }
  void syncReminders('mutation');
}

/** Removes the alarm now and hides the row. Nothing reaches the server until commitDelete. */
export async function softDeleteReminder(id: string): Promise<UndoToken> {
  const current = store.getItem(id);
  if (!current) throw new Error('Reminder not found');
  await cancelReminderNotification(id);
  patchLocal(id, { status: 'cancelled' });
  return { id, previous: current, expiresAt: Date.now() + UNDO_WINDOW_MS };
}

/** Brings a soft-deleted reminder back, with its alarm. */
export async function undoDelete(token: UndoToken): Promise<void> {
  const current = store.getItem(token.id);
  if (current && current.status !== 'cancelled') return;
  const now = new Date();
  const restored: Reminder = { ...token.previous, updated_at: now.toISOString() };
  store.putItem(restored);
  store.enqueue({ op: 'upsert', id: restored.id, body: wireBody(restored), ts: Date.now() });

  if ((await permissionState()) === 'granted') {
    const item = scheduledFor(restored, now);
    if (item) await notifyScheduled(item);
  }
  void syncReminders('mutation');
}

/** Ends the undo window: the row is removed locally and a DELETE is queued. */
export async function commitDelete(token: UndoToken): Promise<void> {
  const current = store.getItem(token.id);
  if (!current || current.status !== 'cancelled') return;
  store.removeItem(token.id);
  store.enqueue({ op: 'delete', id: token.id, ts: Date.now() });
  void syncReminders('mutation');
}

/** Records what happened when a reminder rang. Daily reminders keep ringing. */
export async function markOutcome(id: string, outcome: 'answered' | 'declined' | 'missed' | 'delivered'): Promise<void> {
  const current = store.getItem(id);
  if (!current || current.status === 'cancelled') return;
  const nowIso = new Date().toISOString();

  if (current.repeat_rule === 'daily') {
    patchLocal(id, { last_fired_at: nowIso });
    return;
  }
  await cancelReminderNotification(id);
  if (current.status === 'delivered' && outcome === 'delivered') return;
  patchLocal(id, { status: outcome, last_fired_at: nowIso });
  void syncReminders('response');
}

// ---------- reads ----------

/** A reminder from the cache, or from the server (5 s deadline). Null when it does not exist. */
export async function getReminderLocal(id: string): Promise<Reminder | null> {
  const local = store.getItem(id);
  if (local) return local;
  try {
    const row = await api.fetchOne(id, 5000);
    return row ? store.normalizeRow(row) : null;
  } catch {
    return null;
  }
}

/** Plays a stored voice when there is one, saving the link back to the row. See D-9 for the ladder. */
export async function resolveVoiceSource(r: Reminder, opts?: { timeoutMs?: number }): Promise<VoiceSource> {
  const source = await audio.resolveVoiceSource(r, opts);
  if (source.type === 'file') {
    const current = store.getItem(r.id);
    if (current && current.audio_hash !== source.hash) {
      patchLocal(r.id, { audio_status: 'ready', audio_hash: source.hash, audio_path: source.audioPath });
      setAudioUi({ [r.id]: 'ready' });
    }
  }
  return source;
}

/** Makes a preview voice for the editor. Returns a local uri. */
export async function previewVoice(text: string, voice: VoiceName, language: VoiceLanguage): Promise<string> {
  return audio.previewVoice(text, voice, language);
}

/** Logout: cancels every reminder alarm and deletes the cache, outbox and voice files. */
export async function clearRemindersOnLogout(): Promise<void> {
  const userId = store.getState().userId;
  await cancelAllReminderNotifications();
  if (userId) await store.removeCacheKeys(userId);
  await audio.clearAllAudio();
  store.resetForUser(null);
}
