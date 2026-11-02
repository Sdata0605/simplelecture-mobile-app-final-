/**
 * Timetable reminder service (WP4, plan section E.4 and H.1).
 * Network is faked through jest.setup.js (global.__fetchImpl).
 */
import {
  applyPlanChannel,
  planDefaultChannel,
  countOverrides,
} from '../timetableReminders';

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };

function reply(status: number, body: unknown): FakeResponse {
  const text = body === undefined ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text,
  };
}

const g = global as unknown as { __fetchImpl: (input: unknown, init?: unknown) => Promise<FakeResponse> };

function session(over: Record<string, unknown>) {
  return { id: 's', timetable_id: 'p1', status: 'pending', session_type: 'study', scheduled_at: '2026-11-10T07:00:00Z', reminder_channel: null, ...over };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('applyPlanChannel', () => {
  it('filters pending future study sessions of the plan and sets the channel', async () => {
    const calls: string[] = [];
    g.__fetchImpl = jest.fn(async (input: unknown) => {
      calls.push(String(input));
      return reply(200, []);
    }) as never;

    await applyPlanChannel('p1', 'call', { onlyMatching: null });

    const patch = calls.find((u) => u.includes('study_timetable_sessions'));
    expect(patch).toBeDefined();
    expect(patch).toContain('timetable_id=eq.p1');
    expect(patch).toContain('session_type=eq.study');
    expect(patch).toContain('status=eq.pending');
    expect(patch).toContain('scheduled_at=gt.');
    expect(patch).toContain('reminder_channel=is.null');
  });

  it('merges plan_metadata with existing keys when storing the default', async () => {
    const bodies: unknown[] = [];
    g.__fetchImpl = jest.fn(async (input: unknown, init?: { method?: string; body?: unknown }) => {
      const url = String(input);
      if (url.includes('study_timetables') && (!init || init.method === undefined || init.method === 'GET')) {
        return reply(200, [{ id: 'p1', plan_metadata: { scopeLabel: 'Maths' } }]);
      }
      if (url.includes('study_timetables') && init?.method === 'PATCH') {
        bodies.push(init.body);
        return reply(200, []);
      }
      return reply(200, []);
    }) as never;

    await applyPlanChannel('p1', 'notification');

    const stored = JSON.parse(String(bodies[bodies.length - 1]));
    const meta = stored.plan_metadata ?? stored;
    expect(meta.scopeLabel).toBe('Maths');
    expect(meta.reminderChannel).toBe('notification');
  });

  it('on a 23514 check violation retries with null and reports noneUnsupported', async () => {
    let first = true;
    g.__fetchImpl = jest.fn(async (input: unknown, init?: { body?: unknown }) => {
      const url = String(input);
      if (url.includes('study_timetable_sessions') && first) {
        first = false;
        return reply(400, { code: '23514', message: 'check constraint violated' });
      }
      return reply(200, []);
    }) as never;

    const result = await applyPlanChannel('p1', 'none');
    expect(result).toMatchObject({ noneUnsupported: true });
  });
});

describe('planDefaultChannel (per-plan default)', () => {
  const plan = (meta?: Record<string, unknown>) => ({ id: 'p1', plan_metadata: meta ?? {} });

  it('prefers the stored plan_metadata.reminderChannel', () => {
    const sessions = [session({ reminder_channel: 'call' }), session({ id: 'b', reminder_channel: 'call' })];
    expect(planDefaultChannel(plan({ reminderChannel: 'message' }) as never, sessions as never)).toBe('message');
  });

  it('falls back to the most common session channel when metadata is missing', () => {
    const sessions = [
      session({ reminder_channel: 'call' }),
      session({ id: 'b', reminder_channel: 'call' }),
      session({ id: 'c', reminder_channel: 'email' }),
    ];
    expect(planDefaultChannel(plan() as never, sessions as never)).toBe('call');
  });

  it("returns 'mixed' on a tie", () => {
    const sessions = [session({ reminder_channel: 'call' }), session({ id: 'b', reminder_channel: 'message' })];
    expect(planDefaultChannel(plan() as never, sessions as never)).toBe('mixed');
  });
});

describe('countOverrides', () => {
  it('counts sessions whose channel differs from the plan default', () => {
    const sessions = [
      session({ reminder_channel: 'call' }),
      session({ id: 'b', reminder_channel: 'notification' }),
      session({ id: 'c', reminder_channel: null }),
    ];
    expect(countOverrides(sessions as never, 'call')).toBe(2);
  });

  it('counts nothing when every session follows the default', () => {
    const sessions = [session({ reminder_channel: 'call' }), session({ id: 'b', reminder_channel: 'call' })];
    expect(countOverrides(sessions as never, 'call')).toBe(0);
  });
});
