import { resolvePlanState, readPlanCache, writePlanCache } from '../aiTeacherPlan';
import { __reset, __getStore, __setStore } from './asyncStorageMock';

describe('resolvePlanState', () => {
  it('server says active -> active', () => {
    expect(resolvePlanState({ serverActive: true })).toBe('active');
  });

  it('server says active wins even with a cached inactive answer', () => {
    expect(resolvePlanState({ serverActive: true, cached: { active: false } })).toBe('active');
  });

  it('server says inactive -> inactive', () => {
    expect(resolvePlanState({ serverActive: false })).toBe('inactive');
  });

  it('server says inactive wins even with a cached active answer', () => {
    expect(resolvePlanState({ serverActive: false, cached: { active: true } })).toBe('inactive');
  });

  it('check failed, cached active -> active', () => {
    expect(resolvePlanState({ error: new Error('offline'), cached: { active: true } })).toBe('active');
  });

  it('check failed, cached inactive -> inactive', () => {
    expect(resolvePlanState({ error: new Error('offline'), cached: { active: false } })).toBe('inactive');
  });

  it('check failed, no cache -> unknown', () => {
    expect(resolvePlanState({ error: new Error('offline') })).toBe('unknown');
    expect(resolvePlanState({ error: new Error('offline'), cached: null })).toBe('unknown');
  });

  it('response has no plan field (serverActive missing), cached active -> active', () => {
    expect(resolvePlanState({ serverActive: undefined, cached: { active: true } })).toBe('active');
  });

  it('response has no plan field, cached inactive -> inactive', () => {
    expect(resolvePlanState({ cached: { active: false } })).toBe('inactive');
  });

  it('response has no plan field and no cache -> unknown, never inactive', () => {
    expect(resolvePlanState({})).toBe('unknown');
    expect(resolvePlanState({ serverActive: undefined, cached: null })).toBe('unknown');
    expect(resolvePlanState({ serverActive: null })).toBe('unknown');
  });
});

describe('plan cache', () => {
  beforeEach(() => {
    __reset();
  });

  it('writes under the per-user key and reads back', async () => {
    await writePlanCache('user-1', true);
    const store = __getStore();
    expect(Object.keys(store)).toEqual(['@aiteacher_plan_v1:user-1']);
    const entry = await readPlanCache('user-1');
    expect(entry?.active).toBe(true);
    expect(typeof entry?.checkedAt).toBe('string');
  });

  it('keeps users apart', async () => {
    await writePlanCache('user-1', true);
    await writePlanCache('user-2', false);
    expect((await readPlanCache('user-1'))?.active).toBe(true);
    expect((await readPlanCache('user-2'))?.active).toBe(false);
  });

  it('returns null when nothing is cached', async () => {
    expect(await readPlanCache('nobody')).toBeNull();
  });

  it('returns null for a corrupt entry', async () => {
    __setStore({ '@aiteacher_plan_v1:user-1': '{not json' });
    expect(await readPlanCache('user-1')).toBeNull();
  });

  it('returns null when the stored value has no boolean active', async () => {
    __setStore({ '@aiteacher_plan_v1:user-1': JSON.stringify({ active: 'yes' }) });
    expect(await readPlanCache('user-1')).toBeNull();
  });
});
