// Local state for Reminders v2: an in-memory snapshot, AsyncStorage persistence and the outbox.
// Spec: _scratch/reminders-v2-plan.md D-11, D-12, D-19, D-20, D.2 (rule 5), F.2 and WP2.
// Pure helpers (coalesce, mergeServerRows, reconcileRows, normalizeRow) are exported for tests.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Reminder } from '../../types/reminder';

export type PlannedState = 'scheduled' | 'queued' | 'no-permission' | 'past' | 'paused' | 'done';
export type AudioUi = 'none' | 'preparing' | 'ready' | 'device';

export interface PlanEntry {
  fireAt: string | null;
  state: PlannedState;
}

export interface RemindersSnapshot {
  userId: string | null;
  reminders: Reminder[];                       // excludes cancelled
  plan: Record<string, PlanEntry>;
  status: 'idle' | 'loading' | 'ready' | 'error';
  lastSyncAt: number | null;
  syncError: 'network' | 'server' | null;
  outboxSize: number;
  syncing: boolean;
  audio: Record<string, AudioUi>;
}

export type OutboxOp =
  | { op: 'upsert'; id: string; body: Record<string, unknown>; ts: number }
  | { op: 'patch'; id: string; body: Record<string, unknown>; ts: number }
  | { op: 'delete'; id: string; ts: number };

export interface StoreState {
  userId: string | null;
  items: Reminder[];                           // includes cancelled rows until purged
  outbox: OutboxOp[];
  plan: Record<string, PlanEntry>;
  status: RemindersSnapshot['status'];
  lastSyncAt: number | null;
  syncError: RemindersSnapshot['syncError'];
  syncing: boolean;
  audio: Record<string, AudioUi>;
}

/** A cancelled row is kept this long locally and on the server before it is purged (D-19). */
export const CANCELLED_PURGE_MS = 60_000;
/** Missed one-offs are only marked after this grace period (D.2 rule 5). */
export const MISSED_GRACE_MS = 2 * 60_000;
/** Done "Today only" rows are purged after this long (D-8). */
export const TODAY_DONE_PURGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Done calendar one-offs are purged after this long. */
export const CALENDAR_DONE_PURGE_MS = 30 * 24 * 60 * 60 * 1000;

const TERMINAL_STATUSES = new Set(['answered', 'declined', 'missed', 'delivered']);

// ---------- store state and subscribe ----------

function emptyState(): StoreState {
  return {
    userId: null,
    items: [],
    outbox: [],
    plan: {},
    status: 'idle',
    lastSyncAt: null,
    syncError: null,
    syncing: false,
    audio: {},
  };
}

let state: StoreState = emptyState();
let snapshot: RemindersSnapshot = buildSnapshot(state);
const listeners = new Set<() => void>();

function buildSnapshot(s: StoreState): RemindersSnapshot {
  return {
    userId: s.userId,
    reminders: s.items.filter(r => r.status !== 'cancelled'),
    plan: s.plan,
    status: s.status,
    lastSyncAt: s.lastSyncAt,
    syncError: s.syncError,
    outboxSize: s.outbox.length,
    syncing: s.syncing,
    audio: s.audio,
  };
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable reference until the state changes (safe for useSyncExternalStore). */
export function getSnapshot(): RemindersSnapshot {
  return snapshot;
}

/** Internal state, read by the sync and save logic. Do not mutate. */
export function getState(): StoreState {
  return state;
}

export function commit(patch: Partial<StoreState>): void {
  state = { ...state, ...patch };
  snapshot = buildSnapshot(state);
  listeners.forEach(l => l());
}

export function getItem(id: string): Reminder | undefined {
  return state.items.find(r => r.id === id);
}

/** Replaces the row with the same id, or appends it. */
export function putItem(row: Reminder): void {
  const exists = state.items.some(r => r.id === row.id);
  const items = exists ? state.items.map(r => (r.id === row.id ? row : r)) : [...state.items, row];
  commit({ items });
}

export function removeItem(id: string): void {
  commit({ items: state.items.filter(r => r.id !== id) });
}

// ---------- pure helpers ----------

/** 'HH:MM:SS' from PostgREST becomes 'HH:MM'. Fills booleans and legacy fields. */
export function normalizeRow(raw: Partial<Reminder> & { id: string }): Reminder {
  const r = { ...raw } as Reminder;
  if (typeof r.time_of_day === 'string') r.time_of_day = r.time_of_day.slice(0, 5);
  r.enabled = r.enabled !== false;
  if (!r.kind) r.kind = r.call_enabled ? 'call' : 'message';
  r.call_enabled = r.kind === 'call';
  if (!r.section) r.section = r.repeat_rule === 'daily' || r.repeat_rule === 'weekdays' || r.repeat_rule === 'weekly' ? 'daily' : 'calendar';
  if (!r.audio_status) r.audio_status = 'none';
  return r;
}

/**
 * Adds an operation to the outbox, coalescing per id:
 * - upsert replaces everything queued for that id (last write wins);
 * - patch merges into a queued upsert or patch, and is dropped when a delete is queued;
 * - delete supersedes everything queued for that id.
 */
export function coalesce(outbox: ReadonlyArray<OutboxOp>, op: OutboxOp): OutboxOp[] {
  const idx = outbox.findIndex(o => o.id === op.id);
  const existing = idx >= 0 ? outbox[idx] : null;
  const replaceAt = (next: OutboxOp): OutboxOp[] => outbox.map((o, i) => (i === idx ? next : o));

  if (op.op === 'delete') {
    return [...outbox.filter(o => o.id !== op.id), op];
  }
  if (op.op === 'patch') {
    if (existing?.op === 'delete') return [...outbox];
    if (existing) {
      return replaceAt({ ...existing, body: { ...existing.body, ...op.body }, ts: op.ts });
    }
    return [...outbox, op];
  }
  // upsert
  if (existing) return replaceAt(op);
  return [...outbox, op];
}

/**
 * Merges the server's rows with the local cache. A row with a pending outbox op keeps the
 * local copy (the local write has not reached the server yet). Rows missing on the server
 * and not pending were deleted elsewhere and are dropped.
 */
export function mergeServerRows(
  local: ReadonlyArray<Reminder>,
  server: ReadonlyArray<Reminder>,
  pendingIds: ReadonlySet<string>,
): Reminder[] {
  const localById = new Map(local.map(r => [r.id, r] as const));
  const serverIds = new Set(server.map(r => r.id));
  const out: Reminder[] = [];

  for (const s of server) {
    const normalized = normalizeRow(s);
    const keepLocal = pendingIds.has(s.id) && localById.has(s.id);
    out.push(keepLocal ? (localById.get(s.id) as Reminder) : normalized);
  }
  for (const l of local) {
    if (!serverIds.has(l.id) && pendingIds.has(l.id)) out.push(l);
  }
  return out;
}

export interface ReconcileResult {
  items: Reminder[];
  patches: Array<{ id: string; body: Record<string, unknown> }>;
  deletes: string[];
}

/**
 * Housekeeping that runs on every sync:
 * - cancelled rows older than 1 minute are removed (and deleted on the server);
 * - a one-off whose time passed more than 2 minutes ago is marked missed (calls) or delivered;
 * - done "Today only" rows are removed after 7 days, done calendar one-offs after 30 days.
 */
export function reconcileRows(items: ReadonlyArray<Reminder>, now: number): ReconcileResult {
  const patches: ReconcileResult['patches'] = [];
  const deletes: string[] = [];
  const kept: Reminder[] = [];
  const iso = new Date(now).toISOString();

  for (const r of items) {
    const updatedAt = Date.parse(r.updated_at);
    const lastEvent = Date.parse(r.last_fired_at ?? r.updated_at);

    if (r.status === 'cancelled') {
      if (!Number.isNaN(updatedAt) && now - updatedAt > CANCELLED_PURGE_MS) {
        deletes.push(r.id);
      } else {
        kept.push(r);
      }
      continue;
    }

    if (r.repeat_rule !== 'daily' && r.status === 'scheduled') {
      const at = Date.parse(r.scheduled_at);
      if (!Number.isNaN(at) && at < now - MISSED_GRACE_MS) {
        const status: Reminder['status'] = r.kind === 'call' ? 'missed' : 'delivered';
        const body = { status, updated_at: iso };
        patches.push({ id: r.id, body });
        kept.push({ ...r, ...body });
        continue;
      }
    }

    if (r.repeat_rule !== 'daily' && TERMINAL_STATUSES.has(r.status) && !Number.isNaN(lastEvent)) {
      const age = now - lastEvent;
      const limit = r.section === 'daily' ? TODAY_DONE_PURGE_MS : CALENDAR_DONE_PURGE_MS;
      if (age > limit) {
        deletes.push(r.id);
        continue;
      }
    }

    kept.push(r);
  }
  return { items: kept, patches, deletes };
}

/** True for an outbox entry this build understands. Anything else is malformed. */
export function isValidOp(value: unknown): value is OutboxOp {
  if (!value || typeof value !== 'object') return false;
  const o = value as { op?: unknown; id?: unknown; body?: unknown };
  if (typeof o.id !== 'string' || o.id.length === 0) return false;
  if (o.op === 'delete') return true;
  return (o.op === 'upsert' || o.op === 'patch') && !!o.body && typeof o.body === 'object';
}

// ---------- persistence ----------

export function cacheKey(userId: string): string {
  return `reminders.v2.${userId}.cache`;
}

export function outboxKey(userId: string): string {
  return `reminders.v2.${userId}.outbox`;
}

/** Loads the cache and outbox for a user. Ignored when the signed-in user has changed meanwhile. */
export async function loadCache(userId: string): Promise<void> {
  let items: Reminder[] = [];
  let outbox: OutboxOp[] = [];
  let lastSyncAt: number | null = null;
  try {
    const [rawCache, rawOutbox] = await Promise.all([
      AsyncStorage.getItem(cacheKey(userId)),
      AsyncStorage.getItem(outboxKey(userId)),
    ]);
    if (rawCache) {
      const parsed = JSON.parse(rawCache) as { items?: Reminder[]; lastSyncAt?: number | null };
      items = Array.isArray(parsed.items) ? parsed.items.map(r => normalizeRow(r)) : [];
      lastSyncAt = typeof parsed.lastSyncAt === 'number' ? parsed.lastSyncAt : null;
    }
    if (rawOutbox) {
      const parsed = JSON.parse(rawOutbox);
      // Malformed entries (null, wrong shape) are dropped so they cannot block valid ops behind them.
      outbox = Array.isArray(parsed) ? parsed.filter(isValidOp) : [];
    }
  } catch (e) {
    console.warn('[Reminders] cache unreadable, starting empty', e);
  }
  if (state.userId !== userId) return;
  commit({ items, outbox, lastSyncAt });
}

/** Writes the cache and outbox for the current user. Failures are logged, never thrown. */
export async function persist(): Promise<void> {
  const userId = state.userId;
  if (!userId) return;
  try {
    await AsyncStorage.multiSet([
      [cacheKey(userId), JSON.stringify({ items: state.items, lastSyncAt: state.lastSyncAt })],
      [outboxKey(userId), JSON.stringify(state.outbox)],
    ]);
  } catch (e) {
    console.warn('[Reminders] persist failed', e);
  }
}

/** Removes both keys for a user (logout). */
export async function removeCacheKeys(userId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([cacheKey(userId), outboxKey(userId)]);
  } catch (e) {
    console.warn('[Reminders] clearing cache failed', e);
  }
}

/** Switches the store to another user (or null). Memory is cleared; the caller loads the cache. */
export function resetForUser(userId: string | null): void {
  commit({ ...emptyState(), userId, status: userId ? 'loading' : 'idle' });
}

/** Adds an op to the outbox (coalesced) and persists it. */
export function enqueue(op: OutboxOp): void {
  commit({ outbox: coalesce(state.outbox, op) });
  void persist();
}

/** Removes a flushed op. If the op was replaced meanwhile, the replacement stays queued. */
export function dequeue(op: OutboxOp): void {
  commit({ outbox: state.outbox.filter(o => o !== op) });
  void persist();
}

export function pendingIds(): Set<string> {
  return new Set(state.outbox.map(o => o.id));
}
