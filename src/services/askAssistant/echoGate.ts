// Turn-taking for a live voice call on speakers. While the teacher talks, its own voice reaches the
// microphone; Gemini hears that as the student speaking and cuts the teacher off. So the mic is not
// streamed while the teacher is audible (plus a short tail for the room and the speaker's latency), and
// the student can still break in by tapping, which also drops what is left of the cut-off turn.
// Pure and clock-injected so the rules can be tested without audio hardware.

/** Quiet time after the teacher's last sound before the mic reopens (room reverb + speaker latency). */
export const ECHO_TAIL_MS = 400;
/** After a tap the teacher's sound stops at once, so only a moment is needed. */
export const INTERRUPT_TAIL_MS = 150;
/** Audio from a cut-off turn arrives in one burst; a pause this long means a new turn has started. */
export const FENCE_QUIET_MS = 1500;

export interface EchoGate {
  /** A chunk of teacher audio arrived. False = it belongs to a turn the student cut off, so drop it. */
  acceptChunk(now: number): boolean;
  /** Teacher audio started playing. */
  playbackStarted(): void;
  /** The last queued teacher audio finished playing naturally. */
  playbackEnded(now: number, tailMs?: number): void;
  /** Playback was cut for some other reason (the server saw the student speak, typing, closing). */
  playbackStopped(now: number): void;
  /** The student tapped to interrupt. */
  interrupt(now: number): void;
  /** The server finished (or abandoned) the teacher's turn. */
  turnEnded(): void;
  /** True while the mic must not be streamed. */
  micClosed(now: number): boolean;
}

export function createEchoGate(): EchoGate {
  let playing = false;
  let reopenAt = 0;
  let turnOpen = false; // the server may still be sending audio for the current turn
  let fence = false;
  let fenceAt = 0;

  return {
    acceptChunk(now) {
      if (fence) {
        if (now - fenceAt <= FENCE_QUIET_MS) {
          fenceAt = now;
          return false;
        }
        fence = false; // quiet for a while: this chunk starts a new turn
      }
      turnOpen = true;
      return true;
    },
    playbackStarted() {
      playing = true;
    },
    playbackEnded(now, tailMs = ECHO_TAIL_MS) {
      playing = false;
      reopenAt = now + tailMs;
    },
    playbackStopped(now) {
      playing = false;
      reopenAt = now + INTERRUPT_TAIL_MS;
    },
    interrupt(now) {
      playing = false;
      reopenAt = now + INTERRUPT_TAIL_MS;
      // Only fence if the server could still be sending the rest of that turn.
      fence = turnOpen;
      fenceAt = now;
    },
    turnEnded() {
      turnOpen = false;
      fence = false;
    },
    micClosed(now) {
      return playing || now < reopenAt;
    },
  };
}
