// How the teacher's voice reaches the speaker. Gemini streams its speech as small chunks of 24 kHz PCM; this sends
// each chunk, as it arrives, to a hidden WebView that plays them back to back (see teacherVoiceScript.ts), and
// tells the live client when everything it was given has finished playing. The client talks to the PcmPlayer
// interface, so tests give it a fake.
//
// The component that owns the WebView (TeacherVoicePlayer) attaches itself here; there is only one teacher
// speaking at a time, so one shared player is enough.

export interface PcmPlayerListener {
  /** Everything handed to push() has been played. */
  onDrained(): void;
  onError(message: string): void;
}

export interface PcmPlayer {
  /** Queues a chunk of 24 kHz, 16-bit mono PCM (base64) behind what is already playing. */
  push(pcmBase64: string): void;
  /** Starts playing what is queued now, without waiting for more to arrive. */
  flush(): void;
  /** Silence at once; everything queued is dropped. */
  stop(): void;
  /** Reports when the queue has played out. Returns a function that stops listening. */
  listen(listener: PcmPlayerListener): () => void;
}

/** Speech that arrives while the page is still loading is kept (about a minute of it), then the oldest is dropped. */
const MAX_BACKLOG = 600;
const BASE64_ONLY = /^[A-Za-z0-9+/=]*$/;

export class TeacherVoice implements PcmPlayer {
  private inject: ((script: string) => void) | null = null;
  private ready = false;
  private backlog: string[] = [];
  /** Numbers each chunk (and each stop), so a "drained" report about older audio is recognised as stale. */
  private seq = 0;
  private listener: PcmPlayerListener | null = null;

  /** The hidden WebView is mounted: scripts go to it once its page is ready. Returns the matching detach. */
  attach(inject: (script: string) => void): () => void {
    this.inject = inject;
    this.ready = false;
    return () => {
      if (this.inject === inject) {
        this.inject = null;
        this.ready = false;
        this.backlog = [];
      }
    };
  }

  /** What the page posts back. */
  handleMessage(raw: string): void {
    let message: { type?: string; seq?: number; message?: string };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.type === 'ready') {
      this.ready = true;
      const queued = this.backlog;
      this.backlog = [];
      queued.forEach((script) => this.inject?.(script));
    } else if (message.type === 'drained') {
      // More speech may have been handed over since the page said this.
      if (message.seq === this.seq) this.listener?.onDrained();
    } else if (message.type === 'error') {
      this.listener?.onError(String(message.message ?? 'The teacher\'s voice could not be played.'));
    }
  }

  push(pcmBase64: string): void {
    // It goes into a script, so only what base64 can contain is let through.
    if (!pcmBase64 || !BASE64_ONLY.test(pcmBase64)) return;
    this.seq += 1;
    this.run(`window.__voice.push("${pcmBase64}",${this.seq});true;`);
  }

  flush(): void {
    this.run('window.__voice.flush();true;');
  }

  stop(): void {
    this.seq += 1;
    // Not yet played, so not worth sending; the page has nothing to silence either.
    this.backlog = [];
    if (this.ready) this.inject?.('window.__voice.stop();true;');
  }

  listen(listener: PcmPlayerListener): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  private run(script: string): void {
    // No player on screen: there is nobody to hear it.
    if (!this.inject) return;
    if (this.ready) {
      this.inject(script);
      return;
    }
    this.backlog.push(script);
    if (this.backlog.length > MAX_BACKLOG) this.backlog.shift();
  }
}

/** The shared player the live teacher uses unless a test gives it another. */
export const teacherVoice = new TeacherVoice();
