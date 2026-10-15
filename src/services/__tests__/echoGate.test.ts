import { ECHO_TAIL_MS, FENCE_QUIET_MS, INTERRUPT_TAIL_MS, createEchoGate } from "../askAssistant/echoGate";

describe("echo gate: the mic stays closed while the teacher is audible", () => {
  it("is open before the teacher speaks", () => {
    expect(createEchoGate().micClosed(0)).toBe(false);
  });

  it("closes as soon as teacher audio plays and stays closed for the whole speech", () => {
    const g = createEchoGate();
    g.acceptChunk(0);
    g.playbackStarted();
    expect(g.micClosed(1)).toBe(true);
    expect(g.micClosed(60_000)).toBe(true); // however long the teacher talks
  });

  it("reopens by itself a short tail after the teacher finishes (seamless hand-over)", () => {
    const g = createEchoGate();
    g.playbackStarted();
    g.playbackEnded(10_000);
    expect(g.micClosed(10_000 + ECHO_TAIL_MS - 1)).toBe(true); // the room still rings
    expect(g.micClosed(10_000 + ECHO_TAIL_MS)).toBe(false);
  });

  it("waits longer when the speaker has more output latency (e.g. Bluetooth)", () => {
    const g = createEchoGate();
    g.playbackStarted();
    g.playbackEnded(0, ECHO_TAIL_MS + 300);
    expect(g.micClosed(ECHO_TAIL_MS + 299)).toBe(true);
    expect(g.micClosed(ECHO_TAIL_MS + 300)).toBe(false);
  });

  it("stays closed across a short gap between two chunks of the same answer", () => {
    const g = createEchoGate();
    g.playbackStarted();
    g.playbackEnded(0);
    g.playbackStarted(); // next chunk arrived 200 ms later
    expect(g.micClosed(200)).toBe(true);
  });
});

describe("tap to interrupt", () => {
  it("opens the mic almost at once, without waiting for the full tail", () => {
    const g = createEchoGate();
    g.acceptChunk(0);
    g.playbackStarted();
    g.interrupt(5_000);
    expect(g.micClosed(5_000)).toBe(true);
    expect(g.micClosed(5_000 + INTERRUPT_TAIL_MS)).toBe(false);
    expect(INTERRUPT_TAIL_MS).toBeLessThan(ECHO_TAIL_MS);
  });

  it("drops the rest of the cut-off turn that the server is still sending", () => {
    const g = createEchoGate();
    expect(g.acceptChunk(0)).toBe(true); // turn is open
    g.playbackStarted();
    g.interrupt(1_000);
    expect(g.acceptChunk(1_050)).toBe(false);
    expect(g.acceptChunk(1_400)).toBe(false); // still the same burst
  });

  it("plays the next answer once the old turn is over", () => {
    const g = createEchoGate();
    g.acceptChunk(0);
    g.interrupt(1_000);
    g.acceptChunk(1_100); // dropped
    g.turnEnded(); // server says the old turn is done
    expect(g.acceptChunk(3_000)).toBe(true);
  });

  it("does not swallow the next answer if the end-of-turn signal was lost", () => {
    const g = createEchoGate();
    g.acceptChunk(0);
    g.interrupt(1_000);
    g.acceptChunk(1_100); // last chunk of the old burst
    expect(g.acceptChunk(1_100 + FENCE_QUIET_MS + 1)).toBe(true); // a long quiet means a new turn
  });

  it("does not fence when the server had already finished the turn before the tap", () => {
    const g = createEchoGate();
    g.acceptChunk(0);
    g.turnEnded(); // all audio already sent, only local playback was still running
    g.playbackStarted();
    g.interrupt(2_000);
    expect(g.acceptChunk(2_100)).toBe(true); // the student's next question gets its answer
  });
});

describe("other ways playback stops", () => {
  it("reopens quickly when the server interrupts because the student spoke", () => {
    const g = createEchoGate();
    g.playbackStarted();
    g.playbackStopped(0);
    expect(g.micClosed(INTERRUPT_TAIL_MS - 1)).toBe(true);
    expect(g.micClosed(INTERRUPT_TAIL_MS)).toBe(false);
  });
});
