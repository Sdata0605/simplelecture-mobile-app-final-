// Keeps a lesson moving without the student saying "go ahead". Mirrors the web app's useAutoContinue.
import { useEffect, useRef } from 'react';
import { AUTO_CONTINUE_MS, MAX_NUDGES_PER_STEP, type Nudge } from '../services/askAssistant/lectureLesson';

/** While the student is clearly talking at the moment a nudge is due, ask again after this long. */
const RETRY_MS = 700;

/**
 * True once a teacher turn has finished since `cardId` (the latest step) appeared. Counts from the turn total
 * seen just before the card, so a card and the end of its turn arriving together still count.
 */
export function useTurnSinceCard(turnsCompleted: number, cardId: string | null): boolean {
  const previous = useRef(turnsCompleted);
  const baseline = useRef<{ id: string | null; turns: number }>({ id: cardId, turns: turnsCompleted });
  if (baseline.current.id !== cardId) baseline.current = { id: cardId, turns: previous.current };
  useEffect(() => {
    previous.current = turnsCompleted;
  });
  return cardId !== null && turnsCompleted > baseline.current.turns;
}

export interface AutoContinueOptions {
  /** Checked at the moment a nudge is due: true while the student is clearly speaking, so it waits a little. */
  isStudentSpeaking: () => boolean;
  /** Teacher turns finished so far: a second nudge for the same step needs a turn to have ended since the first. */
  turnsCompleted: number;
  delayMs?: number;
  maxPerStep?: number;
}

/**
 * Sends `nudge.text` after `delayMs` of quiet. A pending nudge is cancelled as soon as `nudge` goes away (the
 * teacher started talking again, or the student spoke). Each step is nudged at most `maxPerStep` times, and
 * the second time only after the teacher's reply to the first has finished.
 */
export function useAutoContinue(nudge: Nudge | null, send: (text: string) => void, options: AutoContinueOptions): void {
  const { turnsCompleted, delayMs = AUTO_CONTINUE_MS, maxPerStep = MAX_NUDGES_PER_STEP } = options;
  const sendRef = useRef(send);
  sendRef.current = send;
  const speakingRef = useRef(options.isStudentSpeaking);
  speakingRef.current = options.isStudentSpeaking;
  const turnsRef = useRef(turnsCompleted);
  turnsRef.current = turnsCompleted;
  const sent = useRef<{ cardId: string | null; count: number; turns: number }>({ cardId: null, count: 0, turns: 0 });
  const cardId = nudge?.cardId ?? null;
  const text = nudge?.text ?? null;

  useEffect(() => {
    if (cardId === null || text === null) return;
    const record = sent.current.cardId === cardId ? sent.current : { cardId, count: 0, turns: -1 };
    if (record.count >= maxPerStep) return;
    if (record.count > 0 && turnsCompleted <= record.turns) return; // the reply to the last nudge is still going

    let timer: ReturnType<typeof setTimeout>;
    const fire = () => {
      if (speakingRef.current()) {
        timer = setTimeout(fire, RETRY_MS);
        return;
      }
      sent.current = { cardId, count: record.count + 1, turns: turnsRef.current };
      sendRef.current(text);
    };
    timer = setTimeout(fire, delayMs);
    return () => clearTimeout(timer);
  }, [cardId, text, turnsCompleted, delayMs, maxPerStep]);
}
