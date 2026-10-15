// Pacing for a lesson explained in steps. The teacher is a live voice: it can put up a step, then the next one,
// without saying a word, and its speech is generated faster than it plays, so a slide can also race ahead of
// the voice. These rules keep the board and the voice together:
//   - a new step is only accepted once the teacher has actually spoken since the previous one;
//   - any card appears only after the teacher has finished speaking what it queued before it.
// Pure and clock-injected so the rules can be tested without audio hardware.
import { KEEP_LANGUAGE } from '../aiTeacherVoice';

/** Audio the teacher must have spoken between two steps (about two sentences). */
export const MIN_SPOKEN_MS = 3500;
/** A step is refused at most this many times in a row, so a lesson can never deadlock. */
export const MAX_REFUSALS = 2;
/** The speech queue must have been silent this long before a card appears. */
export const IDLE_BEFORE_CARD_MS = 350;
/** Never hold a card longer than this waiting for the voice to finish. */
export const MAX_WAIT_MS = 25_000;

const STEP_NUMBER = /^\s*step\s*(\d+)/i;

export const REFUSAL =
  `That step was not shown. You have not explained the previous step aloud yet. First say the previous step out loud, properly: 3 to 5 clear sentences saying what we did, how, and why, in simple words. Only after you have finished speaking, call this tool again with the same content. ${KEEP_LANGUAGE}`;

/** `instruction` is set when the step is refused: what to tell the teacher to do first. */
export interface StepVerdict {
  allow: boolean;
  instruction?: string;
}

export interface StepPacer {
  /** Teacher audio of this many milliseconds was accepted for playback. */
  spoke(ms: number): void;
  /** The teacher wants to show a step titled `title`: may it? */
  request(title: string): StepVerdict;
  /** A step was shown. */
  shown(): void;
}

export function createStepPacer(): StepPacer {
  let hasPreviousStep = false;
  let spokenMs = 0;
  let refusals = 0;

  return {
    spoke(ms) {
      spokenMs += ms;
    },
    request(title) {
      const number = STEP_NUMBER.exec(title);
      // "Step 1" starts a new explanation; with no earlier step there is nothing to have explained yet.
      if ((number && Number(number[1]) === 1) || !hasPreviousStep || spokenMs >= MIN_SPOKEN_MS) {
        refusals = 0;
        return { allow: true };
      }
      if (refusals >= MAX_REFUSALS) {
        refusals = 0;
        return { allow: true };
      }
      refusals += 1;
      return { allow: false, instruction: REFUSAL };
    },
    shown() {
      hasPreviousStep = true;
      spokenMs = 0;
      refusals = 0;
    },
  };
}

/**
 * Resolves once `isIdle()` has been true for `quietMs` in a row (the voice finished what it queued), or after
 * `maxMs`, or as soon as `isAborted()` says the call is gone. The clock and sleeping are injected for tests.
 */
export async function waitUntilIdle(options: {
  isIdle: () => boolean;
  isAborted?: () => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  quietMs?: number;
  maxMs?: number;
  pollMs?: number;
}): Promise<void> {
  const {
    isIdle,
    isAborted = () => false,
    now = () => performance.now(),
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    quietMs = IDLE_BEFORE_CARD_MS,
    maxMs = MAX_WAIT_MS,
    pollMs = 100,
  } = options;
  const start = now();
  let idleSince: number | null = null;
  while (now() - start < maxMs && !isAborted()) {
    if (isIdle()) {
      idleSince ??= now();
      if (now() - idleSince >= quietMs) return;
    } else {
      idleSince = null;
    }
    await sleep(pollMs);
  }
}
