import { PLAYER_SCRIPT } from '../teacherVoiceScript';

// The player page runs in a WebView, so here it runs against a fake Web Audio that records what gets scheduled.

class FakeSource {
  buffer: { duration: number } | null = null;
  startedAt: number | null = null;
  stopped = false;
  onended: (() => void) | null = null;
  connect = jest.fn();
  start = (at: number) => {
    this.startedAt = at;
  };
  stop = () => {
    this.stopped = true;
  };
}

class FakeContext {
  static last: FakeContext;
  currentTime = 0;
  state = 'running';
  destination = {};
  sources: FakeSource[] = [];
  resume = jest.fn();
  constructor(public options?: { sampleRate?: number; latencyHint?: string }) {
    FakeContext.last = this;
  }
  createBuffer(_channels: number, length: number, rate: number) {
    const data = new Float32Array(length);
    return { duration: length / rate, getChannelData: () => data, data };
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
}

/** Loads the page script as the WebView would, with the fake audio. */
function loadPage() {
  const posted: any[] = [];
  const page: any = {
    AudioContext: FakeContext,
    ReactNativeWebView: { postMessage: (message: string) => posted.push(JSON.parse(message)) },
  };
  // Like a browser's atob, it refuses what is not base64 (Buffer would quietly skip it).
  const atob = (text: string) => {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('InvalidCharacterError');
    return Buffer.from(text, 'base64').toString('binary');
  };
  new Function('window', 'atob', PLAYER_SCRIPT)(page, atob);
  return { voice: page.__voice as { push(b: string, seq: number): void; flush(): void; stop(): void }, posted, ctx: FakeContext.last };
}

/** Silence of the given length: 24 samples per millisecond, two bytes each. */
const speech = (ms: number) => Buffer.alloc(ms * 24 * 2).toString('base64');
const starts = (ctx: FakeContext) => ctx.sources.map((s) => s.startedAt);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('the teacher voice page', () => {
  it('opens a 24 kHz audio context and says it is ready', () => {
    const { posted, ctx } = loadPage();
    expect(ctx.options).toEqual({ sampleRate: 24000, latencyHint: 'playback' });
    expect(posted).toEqual([{ type: 'ready', state: 'running' }]);
  });

  it('decodes 16-bit little-endian PCM to samples between -1 and 1', () => {
    const { voice, ctx } = loadPage();
    // padded to a chunk long enough to start playing at once
    const bytes = Buffer.alloc(24 * 300 * 2);
    bytes.writeInt16LE(16384, 0);
    bytes.writeInt16LE(-32768, 2);
    bytes.writeInt16LE(32767, 4);
    bytes.writeInt16LE(-1, 6);
    voice.push(bytes.toString('base64'), 1);
    expect(ctx.sources).toHaveLength(1);
    const played = (ctx.sources[0] as any).buffer;
    expect(played.duration).toBeCloseTo(0.3, 5);
    expect(played.data[0]).toBe(0.5);
    expect(played.data[1]).toBe(-1);
    expect(played.data[2]).toBeCloseTo(32767 / 32768, 8);
    expect(played.data[3]).toBeCloseTo(-1 / 32768, 8);
  });

  it('plays chunks back to back: each starts exactly where the previous one ends', () => {
    const { voice, ctx } = loadPage();
    voice.push(speech(120), 1);
    voice.push(speech(120), 2);
    voice.push(speech(120), 3); // 360 ms held: enough head start, so speech begins
    voice.push(speech(80), 4);
    voice.push(speech(200), 5);

    const at = starts(ctx) as number[];
    expect(at).toHaveLength(5);
    expect(at[0]).toBeCloseTo(0.05, 6); // a little ahead of "now"
    expect(at[1]).toBeCloseTo(at[0] + 0.12, 6);
    expect(at[2]).toBeCloseTo(at[1] + 0.12, 6);
    expect(at[3]).toBeCloseTo(at[2] + 0.12, 6);
    expect(at[4]).toBeCloseTo(at[3] + 0.08, 6);
  });

  it('holds the start of speech back so a late chunk is not heard as a gap', () => {
    const { voice, ctx } = loadPage();
    voice.push(speech(100), 1);
    voice.push(speech(100), 2);
    expect(ctx.sources).toHaveLength(0); // 200 ms is not enough yet
    voice.push(speech(100), 3);
    expect(ctx.sources).toHaveLength(3);
  });

  it('never holds a short reply for long', () => {
    const { voice, ctx } = loadPage();
    voice.push(speech(100), 1);
    expect(ctx.sources).toHaveLength(0);
    jest.advanceTimersByTime(260);
    expect(ctx.sources).toHaveLength(1);
  });

  it('flush() starts what is held at once', () => {
    const { voice, ctx } = loadPage();
    voice.push(speech(100), 1);
    voice.flush();
    expect(ctx.sources).toHaveLength(1);
    jest.advanceTimersByTime(1000);
    expect(ctx.sources).toHaveLength(1); // the timer was cancelled, nothing is played twice
  });

  it('reports "drained" with the last chunk number once everything has played, and not before', () => {
    const { voice, ctx, posted } = loadPage();
    voice.push(speech(300), 7);
    voice.push(speech(100), 8);
    posted.length = 0;

    ctx.sources[0].onended?.();
    expect(posted).toEqual([]); // one chunk is still to play
    ctx.sources[1].onended?.();
    expect(posted).toEqual([{ type: 'drained', seq: 8 }]);
  });

  it('after running dry, the next speech gets a head start again instead of being played in short bursts', () => {
    const { voice, ctx } = loadPage();
    voice.push(speech(300), 1); // plays from 0.05 to 0.35
    ctx.currentTime = 1; // a long pause: the queue ran dry
    voice.push(speech(100), 2);
    expect(ctx.sources).toHaveLength(1); // held, not scheduled
    voice.push(speech(250), 3);
    expect(ctx.sources).toHaveLength(3);
    expect((ctx.sources[1].startedAt as number)).toBeCloseTo(1.05, 6);
    expect((ctx.sources[2].startedAt as number)).toBeCloseTo(1.15, 6);
  });

  it('stop() silences everything at once, drops what was held, and reports nothing', () => {
    const { voice, ctx, posted } = loadPage();
    voice.push(speech(300), 1);
    voice.push(speech(100), 2);
    ctx.currentTime = 0.5;
    voice.push(speech(100), 3); // dry again: held
    posted.length = 0;

    voice.stop();
    expect(ctx.sources.every((s) => s.stopped)).toBe(true);
    ctx.sources.forEach((s) => s.onended?.()); // the engine's late callbacks are ignored
    jest.advanceTimersByTime(1000);
    expect(ctx.sources).toHaveLength(2); // the held chunk was dropped, never scheduled
    expect(posted).toEqual([]);

    // and the next speech starts a fresh stretch
    voice.push(speech(300), 4);
    expect(ctx.sources).toHaveLength(3);
    expect(ctx.sources[2].startedAt).toBeCloseTo(0.55, 6);
  });

  it('says so when the phone will not let it play', () => {
    const { voice, posted, ctx } = loadPage();
    ctx.state = 'suspended';
    posted.length = 0;
    voice.push(speech(300), 1);
    jest.advanceTimersByTime(900);
    expect(posted).toEqual([{ type: 'error', message: expect.stringContaining('suspended') }]);
  });

  it('reports a chunk it cannot play instead of failing silently', () => {
    const { voice, posted } = loadPage();
    posted.length = 0;
    voice.push('***not base64***', 1);
    expect(posted[0]?.type).toBe('error');
  });
});
