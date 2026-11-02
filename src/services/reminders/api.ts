// REST access for Reminders v2. Spec: _scratch/reminders-v2-plan.md F.2 and D-11.
// The store is the only caller. Every request has a 15 s deadline via fetchWithTimeout.

import { SUPABASE_URL, SUPABASE_ANON_KEY, getValidAccessToken } from '../supabase';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import type { Reminder } from '../../types/reminder';

const REST_URL = `${SUPABASE_URL}/rest/v1/reminders`;
export const REST_TIMEOUT_MS = 15000;
export const ONE_OFF_LOOKUP_TIMEOUT_MS = 5000;

/**
 * network: no response (offline, timeout, aborted). The outbox stops and retries later.
 * server: the server answered with an error status (status is set). Also used when signed out (401).
 */
export class ReminderApiError extends Error {
  kind: 'network' | 'server';
  status: number;
  constructor(kind: 'network' | 'server', status: number, message: string) {
    super(message);
    this.name = 'ReminderApiError';
    this.kind = kind;
    this.status = status;
  }
}

export async function authHeaders(json = true): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  if (!token) throw new ReminderApiError('server', 401, 'Not signed in');
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

/** The signed-in user's id, read from the JWT `sub` claim. Throws when signed out. */
export async function currentUserId(): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) throw new ReminderApiError('server', 401, 'Not signed in');
  const payload = token.split('.')[1] ?? '';
  const claims = JSON.parse(base64UrlDecode(payload));
  if (typeof claims.sub !== 'string') throw new ReminderApiError('server', 401, 'No user id in session');
  return claims.sub;
}

/** Runs one request and maps failures to ReminderApiError. */
async function request(url: string, init: RequestInit, label: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, init, REST_TIMEOUT_MS);
  } catch (e) {
    if (e instanceof ReminderApiError) throw e;
    throw new ReminderApiError('network', 0, `${label}: no response`);
  }
  if (!res.ok) throw new ReminderApiError('server', res.status, `${label} failed (${res.status})`);
  return res;
}

/** Every reminder row the user can see, including cancelled rows awaiting purge. */
export async function fetchAll(): Promise<Reminder[]> {
  const headers = await authHeaders(false);
  const res = await request(
    `${REST_URL}?select=*&order=scheduled_at.asc`,
    { method: 'GET', headers },
    'Load reminders',
  );
  return (await res.json()) as Reminder[];
}

/** One row by id, or null when it does not exist (or is not visible to this user). */
export async function fetchOne(id: string, timeoutMs = ONE_OFF_LOOKUP_TIMEOUT_MS): Promise<Reminder | null> {
  const headers = await authHeaders(false);
  let res: Response;
  try {
    res = await fetchWithTimeout(`${REST_URL}?select=*&id=eq.${encodeURIComponent(id)}`, { method: 'GET', headers }, timeoutMs);
  } catch {
    throw new ReminderApiError('network', 0, 'Load reminder: no response');
  }
  if (!res.ok) throw new ReminderApiError('server', res.status, `Load reminder failed (${res.status})`);
  const rows = (await res.json()) as Reminder[];
  return rows[0] ?? null;
}

/**
 * Idempotent insert-or-update keyed by the client-generated id (D-11).
 * `row` must include user_id (RLS checks it) and every column the client owns.
 */
export async function upsert(row: Record<string, unknown>): Promise<Reminder> {
  const headers = {
    ...(await authHeaders()),
    Prefer: 'resolution=merge-duplicates,return=representation',
  };
  const res = await request(
    `${REST_URL}?on_conflict=id`,
    { method: 'POST', headers, body: JSON.stringify(row) },
    'Save reminder',
  );
  const rows = (await res.json()) as Reminder[];
  return rows[0];
}

/** Partial update of one row. */
export async function patch(id: string, fields: Record<string, unknown>): Promise<Reminder | null> {
  const headers = { ...(await authHeaders()), Prefer: 'return=representation' };
  const res = await request(
    `${REST_URL}?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', headers, body: JSON.stringify(fields) },
    'Update reminder',
  );
  const rows = (await res.json()) as Reminder[];
  return rows[0] ?? null;
}

/** Hard delete of one row. Deleting a missing row is a success. */
export async function remove(id: string): Promise<void> {
  const headers = await authHeaders(false);
  await request(
    `${REST_URL}?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE', headers },
    'Delete reminder',
  );
}
