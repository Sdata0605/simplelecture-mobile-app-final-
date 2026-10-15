import {
  DEMO_HOLD_TICKS,
  DEMO_START,
  PROMO_DEMOS,
  PROMO_FEATURES,
  advanceDemo,
  aiTeacherDestination,
  demoPhase,
  finishedDemo,
  startDemo,
  type DemoState,
} from '../aiTeacherPromo';

describe('aiTeacherDestination', () => {
  it('sends a student with a plan to the AI Teacher', () => {
    expect(aiTeacherDestination(true)).toBe('teacher');
  });

  it('shows the plans to a student without one', () => {
    expect(aiTeacherDestination(false)).toBe('plans');
  });
});

describe('the sample lessons', () => {
  it('number their steps from 1, in order', () => {
    for (const demo of PROMO_DEMOS) {
      expect(demo.ask.length).toBeGreaterThan(0);
      expect(demo.steps.length).toBeGreaterThanOrEqual(2);
      demo.steps.forEach((step, i) => expect(step.startsWith(`Step ${i + 1} · `)).toBe(true));
    }
  });

  it('have distinct ids, and a tile for every promised feature', () => {
    expect(new Set(PROMO_DEMOS.map((d) => d.id)).size).toBe(PROMO_DEMOS.length);
    expect(new Set(PROMO_FEATURES.map((f) => f.icon)).size).toBe(PROMO_FEATURES.length);
  });
});

describe('advanceDemo', () => {
  it('reveals one step per tick, then rests, then moves on to the next lesson', () => {
    const steps = PROMO_DEMOS[0].steps.length;
    let state: DemoState = DEMO_START;
    const seen: number[] = [];
    for (let i = 0; i < steps; i++) {
      state = advanceDemo(state);
      seen.push(state.shown);
    }
    expect(seen).toEqual(Array.from({ length: steps }, (_, i) => i + 1));
    expect(state.demo).toBe(0);

    for (let i = 0; i < DEMO_HOLD_TICKS; i++) {
      state = advanceDemo(state);
      expect(state).toMatchObject({ demo: 0, shown: steps });
    }
    expect(advanceDemo(state)).toEqual({ demo: 1, shown: 0, hold: 0 });
  });

  it('comes back round to the first lesson after the last', () => {
    const last: DemoState = {
      demo: PROMO_DEMOS.length - 1,
      shown: PROMO_DEMOS[PROMO_DEMOS.length - 1].steps.length,
      hold: DEMO_HOLD_TICKS,
    };
    expect(advanceDemo(last)).toEqual(DEMO_START);
  });

  it('recovers from a lesson index that no longer exists', () => {
    expect(advanceDemo({ demo: 99, shown: 2, hold: 1 })).toEqual(DEMO_START);
  });
});

describe('startDemo and finishedDemo', () => {
  it('start a chosen lesson from its question, wrapping out-of-range choices', () => {
    expect(startDemo(1)).toEqual({ demo: 1, shown: 0, hold: 0 });
    expect(startDemo(PROMO_DEMOS.length)).toEqual({ demo: 0, shown: 0, hold: 0 });
    expect(startDemo(-1).demo).toBe(PROMO_DEMOS.length - 1);
  });

  it('show a chosen lesson complete', () => {
    expect(finishedDemo(1)).toEqual({ demo: 1, shown: PROMO_DEMOS[1].steps.length, hold: 0 });
  });
});

describe('demoPhase', () => {
  it('listens to the question, explains, then settles', () => {
    const steps = PROMO_DEMOS[0].steps.length;
    expect(demoPhase({ demo: 0, shown: 0, hold: 0 })).toBe('asking');
    expect(demoPhase({ demo: 0, shown: 1, hold: 0 })).toBe('explaining');
    expect(demoPhase({ demo: 0, shown: steps - 1, hold: 0 })).toBe('explaining');
    expect(demoPhase({ demo: 0, shown: steps, hold: 0 })).toBe('done');
  });
});
