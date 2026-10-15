// What the Home screen's AI Teacher promo says and does: the sample lessons it plays, the feature tiles, where the
// floating AI button and the promo card send the student, and the little state machine that plays a sample lesson
// one step at a time. Kept free of React so it is easy to test (and the web app keeps an identical copy).

export interface PromoDemo {
  id: string;
  subject: string;
  /** What the sample student asks. */
  ask: string;
  /** What the teacher says, one step at a time. */
  steps: readonly string[];
}

/** Short, correct, illustrative lessons — the promo labels them as samples. */
export const PROMO_DEMOS: readonly PromoDemo[] = [
  {
    id: 'maths',
    subject: 'Maths',
    ask: 'Solve 2x + 5 = 13 step by step',
    steps: [
      'Step 1 · Move the 5 across: 2x = 13 − 5',
      'Step 2 · Simplify it: 2x = 8',
      'Step 3 · Divide both sides by 2: x = 4',
    ],
  },
  {
    id: 'science',
    subject: 'Science',
    ask: 'Why does ice float on water?',
    steps: [
      'Step 1 · Water expands when it freezes',
      'Step 2 · The same mass now takes more space, so ice is less dense',
      'Step 3 · Less dense than water means it floats',
    ],
  },
  {
    id: 'social',
    subject: 'Social Science',
    ask: 'What are latitudes and longitudes?',
    steps: [
      'Step 1 · Latitudes run east–west, measured from the Equator (0°)',
      'Step 2 · Longitudes run north–south, measured from the Prime Meridian (0°)',
      'Step 3 · Together they give every place its own address on the globe',
    ],
  },
];

export type PromoIcon = 'mic' | 'steps' | 'maths' | 'quiz';

export interface PromoFeature {
  id: string;
  icon: PromoIcon;
  title: string;
  body: string;
}

export const PROMO_FEATURES: readonly PromoFeature[] = [
  { id: 'talk', icon: 'mic', title: 'Talk, don’t type', body: 'Ask out loud and hear the answer in real time.' },
  { id: 'basics', icon: 'steps', title: 'From the basics', body: 'Every answer starts at the beginning and builds up step by step.' },
  { id: 'maths', icon: 'maths', title: 'Maths, worked live', body: 'Watch equations solved line by line, each step explained aloud.' },
  { id: 'quiz', icon: 'quiz', title: 'Your turn', body: 'It quizzes you as it goes, so you know it has sunk in.' },
];

export const PROMO_BADGE = 'NEW · LIVE AI TEACHER';
export const PROMO_TITLE = 'Don’t just watch. Talk to your teacher.';
export const PROMO_SUBTITLE = 'Ask any doubt out loud and hear it explained from the very basics, one step at a time.';
export const PROMO_CTA = 'Unlock your AI Teacher';
export const PROMO_FOOTNOTE = 'Sample lesson shown · SSLC, PUC & more';

export type AITeacherDestination = 'teacher' | 'plans';

/** A student with a plan goes straight to the AI Teacher; everyone else is shown the plans. */
export function aiTeacherDestination(hasActivePlan: boolean): AITeacherDestination {
  return hasActivePlan ? 'teacher' : 'plans';
}

// ---- the sample-lesson player ------------------------------------------------------------------------------

export interface DemoState {
  /** Which sample lesson is on screen. */
  demo: number;
  /** How many of its steps the teacher has said so far. */
  shown: number;
  /** Ticks spent resting on the finished lesson before the next one starts. */
  hold: number;
}

export const DEMO_START: DemoState = { demo: 0, shown: 0, hold: 0 };
export const DEMO_TICK_MS = 1700;
/** The finished lesson stays up for this many ticks before the next one begins. */
export const DEMO_HOLD_TICKS = 2;

/** One tick of the player: the next step, then a rest, then the next sample lesson. */
export function advanceDemo(state: DemoState, demos: readonly PromoDemo[] = PROMO_DEMOS): DemoState {
  const current = demos[state.demo];
  if (!current) return DEMO_START;
  if (state.shown < current.steps.length) return { ...state, shown: state.shown + 1 };
  if (state.hold < DEMO_HOLD_TICKS) return { ...state, hold: state.hold + 1 };
  return { demo: (state.demo + 1) % demos.length, shown: 0, hold: 0 };
}

/** Start a given sample lesson from its question. */
export function startDemo(index: number, demos: readonly PromoDemo[] = PROMO_DEMOS): DemoState {
  const count = demos.length;
  if (count === 0) return DEMO_START;
  return { demo: ((index % count) + count) % count, shown: 0, hold: 0 };
}

/** A sample lesson shown complete — for people who have asked their phone to reduce motion. */
export function finishedDemo(index: number, demos: readonly PromoDemo[] = PROMO_DEMOS): DemoState {
  const start = startDemo(index, demos);
  return { ...start, shown: demos[start.demo]?.steps.length ?? 0 };
}

export type DemoPhase = 'asking' | 'explaining' | 'done';

/** What the teacher is doing, so the orb can listen, speak, then settle. */
export function demoPhase(state: DemoState, demos: readonly PromoDemo[] = PROMO_DEMOS): DemoPhase {
  const steps = demos[state.demo]?.steps.length ?? 0;
  if (state.shown === 0) return 'asking';
  return state.shown < steps ? 'explaining' : 'done';
}
