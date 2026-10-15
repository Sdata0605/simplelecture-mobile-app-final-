import { IDLE_BEFORE_CARD_MS, MAX_REFUSALS, MAX_WAIT_MS, MIN_SPOKEN_MS, REFUSAL, createStepPacer, waitUntilIdle } from "../askAssistant/stepPacing";

describe("step pacing: explain each step aloud before the next one", () => {
  it("lets the first step of an explanation through", () => {
    expect(createStepPacer().request("Step 1 · The problem")).toEqual({ allow: true });
    expect(createStepPacer().request("A slide with no step number")).toEqual({ allow: true });
  });

  it("refuses the next step when the teacher has not spoken since the previous one", () => {
    const p = createStepPacer();
    p.request("Step 1 · The problem");
    p.shown();
    const verdict = p.request("Step 2 · Subtract 3");
    expect(verdict).toEqual({ allow: false, instruction: REFUSAL });
    expect(REFUSAL).toContain("explained the previous step aloud");
  });

  it("allows the next step once enough has been spoken", () => {
    const p = createStepPacer();
    p.shown();
    p.spoke(MIN_SPOKEN_MS - 1);
    expect(p.request("Step 2 · Subtract 3").allow).toBe(false); // just short of two sentences
    p.spoke(1);
    expect(p.request("Step 2 · Subtract 3").allow).toBe(true);
  });

  it("counts speech in pieces, and starts again after every step", () => {
    const p = createStepPacer();
    p.shown();
    for (let i = 0; i < 7; i++) p.spoke(500);
    expect(p.request("Step 2 · Subtract 3").allow).toBe(true);
    p.shown();
    expect(p.request("Step 3 · Divide by 2").allow).toBe(false); // step 2 has not been explained yet
  });

  it("never deadlocks: after two refusals the step goes through", () => {
    const p = createStepPacer();
    p.shown();
    for (let i = 0; i < MAX_REFUSALS; i++) expect(p.request("Step 2 · Subtract 3").allow).toBe(false);
    expect(p.request("Step 2 · Subtract 3").allow).toBe(true);
    // and the count starts over for the next step
    p.shown();
    expect(p.request("Step 3 · Divide by 2").allow).toBe(false);
  });

  it("treats Step 1 as a fresh start for a new question", () => {
    const p = createStepPacer();
    p.shown();
    p.shown();
    expect(p.request("Step 1 · The basics").allow).toBe(true);
  });
});

describe("waitUntilIdle: a card appears only after the voice has finished", () => {
  /** A fake clock: sleeping advances time. */
  const clock = () => {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => { t += ms; } };
  };

  it("returns once the voice has been quiet long enough", async () => {
    const c = clock();
    const speakingUntil = 3000;
    await waitUntilIdle({ ...c, isIdle: () => c.now() >= speakingUntil });
    expect(c.now()).toBeGreaterThanOrEqual(speakingUntil + IDLE_BEFORE_CARD_MS);
    expect(c.now()).toBeLessThan(speakingUntil + IDLE_BEFORE_CARD_MS + 200);
  });

  it("starts the quiet period again if the voice resumes", async () => {
    const c = clock();
    // quiet 1000-1200, speaking again 1200-2500, quiet from 2500
    const idle = () => c.now() < 1200 && c.now() >= 1000 ? true : c.now() >= 2500;
    await waitUntilIdle({ ...c, isIdle: idle });
    expect(c.now()).toBeGreaterThanOrEqual(2500 + IDLE_BEFORE_CARD_MS);
  });

  it("does not wait at all more than a quiet moment when nothing is playing", async () => {
    const c = clock();
    await waitUntilIdle({ ...c, isIdle: () => true });
    expect(c.now()).toBeLessThan(IDLE_BEFORE_CARD_MS + 200);
  });

  it("gives up after the maximum wait, and stops when the call is gone", async () => {
    const stuck = clock();
    await waitUntilIdle({ ...stuck, isIdle: () => false });
    expect(stuck.now()).toBeGreaterThanOrEqual(MAX_WAIT_MS);

    const gone = clock();
    await waitUntilIdle({ ...gone, isIdle: () => false, isAborted: () => gone.now() >= 500 });
    expect(gone.now()).toBeLessThan(800);
  });
});
