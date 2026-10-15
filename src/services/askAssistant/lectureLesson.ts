// "Ask AI" inside the V5 lecture player (mobile; ported from the web app's src/lib/aiTeacherLecture.ts, with
// string ids and no notes-document card): the student talks to the same live AI Teacher as the AI Teacher tab, but the
// teacher is told which lecture is paused and where, so it can answer in context without asking which
// subject the student wants.
import type { TranscriptItem } from '../aiTeacherLiveService';
import {
  KEEP_LANGUAGE,
  MIXED_STYLE,
  TEACHER_LANGUAGE_RULE,
  TEACHER_SPEAK_RULE,
  TEACHER_VOICE_STYLE,
} from '../aiTeacherVoice';
import { hasMath } from './lectureMath';

/** Where the student was in the lecture when they tapped Ask AI. */
export interface LectureAskContext {
  currentTime: number;
  duration: number;
  /** 1-based position of the section being played. */
  sectionIndex: number;
  sectionCount: number;
  sectionTitle?: string;
  keyPoints: string[];
  /** What the lecture was saying in this section. */
  narration: string;
}

export interface LectureOpeningInput {
  /** "mid" = paused a lecture, "end" = finished one, "ask" = opened Ask AI on its own, with no lecture. */
  trigger: "mid" | "end" | "ask";
  subjectName: string;
  topicTitle?: string | null;
  /** Language the lecture is playing in, e.g. "kannada". */
  lectureLanguage?: string | null;
  /** True when the student's AI Teacher language setting is "auto" (so the lecture language is a fair default). */
  replyInLectureLanguage?: boolean;
  context?: LectureAskContext | null;
}

/** Every opening message starts with this tag; the conversation view hides it from the student. */
export const LECTURE_CONTEXT_TAG = "[Lecture context]";
const QUESTION_MARKER = "My first question:";

const NARRATION_MAX = 1200;
const KEY_POINT_MAX = 160;
const KEY_POINTS_MAX = 8;

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The first message the live teacher receives: lecture context plus how to run this short session. */
export function buildLectureOpening(input: LectureOpeningInput): string {
  const { trigger, subjectName, topicTitle, lectureLanguage, replyInLectureLanguage, context } = input;
  const lecture = topicTitle ? `"${topicTitle}" (${subjectName})` : `a ${subjectName} lecture`;
  const lang = lectureLanguage && lectureLanguage.toLowerCase() !== "english" ? capitalise(lectureLanguage) : null;

  const lines: string[] = [];
  if (trigger === "ask") {
    const about = topicTitle ? `${subjectName}, on the topic "${topicTitle}"` : subjectName;
    lines.push(`${LECTURE_CONTEXT_TAG} I opened Ask AI to ask you a doubt in ${about}. I am not watching a lecture right now.`);
  } else if (trigger === "end") {
    lines.push(`${LECTURE_CONTEXT_TAG} I just finished watching the video lecture ${lecture}.`);
  } else {
    const where = context
      ? ` It is paused at ${formatClock(context.currentTime)}${context.sectionTitle ? `, in section ${context.sectionIndex} of ${context.sectionCount}: "${clip(context.sectionTitle, 120)}"` : ""}.`
      : "";
    lines.push(`${LECTURE_CONTEXT_TAG} I am watching the video lecture ${lecture} and I paused it to ask you a doubt.${where}`);
  }
  if (lang) lines.push(`The lecture is in ${lang}.`);

  if (context && trigger === "mid") {
    const points = context.keyPoints.slice(0, KEY_POINTS_MAX).map((p) => clip(p, KEY_POINT_MAX)).filter(Boolean);
    if (points.length) lines.push(`Key points on my screen: ${points.join("; ")}.`);
    const narration = clip(context.narration, NARRATION_MAX);
    if (narration) lines.push(`What the lecture was saying: "${narration}"`);
  }

  const rules: string[] = [`My subject is already chosen (${subjectName}), so never ask which subject I want.`];
  if (trigger === "end") {
    rules.push(
      "Say in one short sentence that the lecture is over and ask if I have any doubts. Offer a quick 3-question quiz on this lecture (one show_quiz question at a time).",
    );
  } else {
    rules.push("Greet me in one short sentence and ask what I am unsure about.");
  }
  rules.push(
    "When I ask a question, call search_notes first, then explain it from the very basics up to the answer, linking it to what the lecture was saying when that helps.",
  );
  rules.push(
    "Explain it as steps on my screen. For every step call show_visual (with emojis) or present_slide, and start its title with 'Step 1 · ', 'Step 2 · ' and so on, followed by 2 to 4 words (for example 'Step 2 · Build up'). Use these steps: The basics (what I already know, in plain words), Build up (one new idea at a time), Everyday example (a comparison from daily life), Answer (the answer, stated clearly). Explain every step aloud properly before the next one: 3 to 5 clear sentences in simple words, saying what we are doing, how, and why, like teaching a beginner. Never show a step without explaining it aloud, and do not call the next step's tool until you have finished saying the current step. Then go straight on to the next step yourself: never wait for me, and never ask whether to continue, unless I interrupt. When I say nothing, keep going until the Answer step.",
  );
  rules.push(
    "MATHS: if my question is a maths problem or an equation, or I ask you to solve something, solve it step by step in front of me instead of using visuals. Use present_slide for every step, titled 'Step 1 · The problem', then 'Step 2 · ' and a short description of the move (for example 'Step 3 · Subtract 3 from both sides'). Write each line of working as LaTeX in its own bullet, wrapped in $$ and $$ (for example $$2x + 3 = 11$$). Step 1 states what is given and what to find. Do exactly one move per step, showing the equation after it, and add a bullet starting with 'Why:' that gives the reason in plain words (for example 'Why: subtract 3 from both sides to get x alone'). The last step is titled 'Step N · Answer': show the result boxed, like $$\\boxed{x = 4}$$, then check it by putting it back into the original equation. As you say each step aloud, read the equations the way a teacher does (say 'two x plus three equals eleven'), never the LaTeX symbols, and then explain what you did and why in plain words. After the answer, give me a similar problem to solve (show_quiz or ask_big_question), written in LaTeX too.",
  );
  rules.push(
    "After the answer give me one question to solve (show_quiz or ask_big_question). Start again from Step 1 for each new question. If I say I do not understand, explain it again more simply with a new example and a new visual (or, for a maths problem, solve it again slower, one small move per step). This app cannot show notes documents, so never use create_document.",
  );
  rules.push(
    trigger === "ask"
      ? "If I say I am done, say a short goodbye and tell me I can close this screen."
      : "If I want to continue the lecture, say a short goodbye and tell me to close this screen.",
  );
  rules.push(TEACHER_VOICE_STYLE);
  rules.push(TEACHER_SPEAK_RULE);
  rules.push(TEACHER_LANGUAGE_RULE);
  if (lang && replyInLectureLanguage) {
    const mixed = MIXED_STYLE[lang.toLowerCase()];
    rules.push(`Talk to me in ${lang}${mixed ? ` (${mixed})` : ""} unless I speak English or ask for another language.`);
  }
  lines.push(`Instructions for this short session: ${rules.join(" ")}`);

  return lines.join("\n");
}

/** Opening message plus the first thing the student typed, when they typed before the call was up. */
export function withFirstQuestion(opening: string, question?: string): string {
  const q = question?.trim();
  return q ? `${opening}\n${QUESTION_MARKER} ${q}` : opening;
}

/**
 * What the student should see for one of their own messages: the context tag is plumbing and is hidden
 * (null), but a question typed before the call was up is kept.
 */
export function visibleStudentText(text: string): string | null {
  if (!text.startsWith(LECTURE_CONTEXT_TAG)) return text;
  const at = text.indexOf(QUESTION_MARKER);
  return at === -1 ? null : text.slice(at + QUESTION_MARKER.length).trim() || null;
}

// ---------------------------------------------------------------- orb screen

export type LectureOrbMode = "idle" | "speaking" | "listening" | "thinking" | "error";

/** The slice of useLiveTeacher the orb screen reads. */
export interface LectureLive {
  status: "idle" | "connecting" | "live" | "ended" | "error";
  speaking: boolean;
  muted: boolean;
  micAvailable: boolean;
  micLevel: number;
  teacherName: string;
  transcript: TranscriptItem[];
}

export type LectureCard = Exclude<TranscriptItem, { kind: "text" }>;

export interface LectureView {
  orbMode: LectureOrbMode;
  /** Short line under the orb, or null while the teacher's words are the focus. */
  status: string | null;
  statusTone: "normal" | "hearing";
  /** What the teacher is saying (or last said). */
  teacherCaption: string | null;
  /** What the student is saying right now (`live`) or just asked. */
  studentLine: { text: string; live: boolean } | null;
  /** Tapping the orb: interrupt the teacher while it speaks, otherwise mute/unmute the mic, restart the call, or nothing yet. */
  orbAction: "interrupt" | "mute" | "restart" | "none";
  orbLabel: string;
  /** The text box works only once the call is live, or when a new call can be started with it. */
  canType: boolean;
  /** The call is live: the quick buttons and the teacher's tools can be used. */
  inCall: boolean;
}

/** Mic level above which we say the student is being heard. */
const HEARING_LEVEL = 0.2;

export function deriveLectureView(live: LectureLive): LectureView {
  const { status, speaking, muted, micAvailable, micLevel, teacherName, transcript } = live;
  const lastText = [...transcript].reverse().find((m) => m.kind === "text");
  const teacherCaption = lastText && lastText.role === "teacher" ? lastText.text : null;
  const studentLine = lastText && lastText.role === "user" ? { text: lastText.text, live: !lastText.done } : null;
  const inCall = status === "live";

  let orbMode: LectureOrbMode = "idle";
  if (status === "error") orbMode = "error";
  else if (status === "connecting" || status === "idle") orbMode = "thinking";
  else if (inCall) orbMode = speaking ? "speaking" : micAvailable && !muted ? "listening" : "idle";

  const hearing = inCall && !speaking && micAvailable && !muted && micLevel >= HEARING_LEVEL;
  let line: string | null = null;
  if (status === "connecting" || status === "idle") line = "Connecting to your teacher…";
  else if (status === "error") line = "Tap the orb to try again, or type below";
  else if (status === "ended") line = "Class ended. Tap the orb to start again";
  else if (inCall && speaking) line = `${teacherName} is speaking · tap the orb to interrupt`;
  else if (inCall && studentLine && !studentLine.live) line = "Thinking…";
  else if (inCall && !micAvailable) line = "Type your question below";
  else if (inCall && muted) line = "Microphone muted. Tap the orb to unmute";
  else if (inCall) line = hearing ? "Listening…" : "Go ahead, I'm listening";

  const orbAction: LectureView["orbAction"] = inCall
    ? speaking
      ? "interrupt"
      : micAvailable
        ? "mute"
        : "none"
    : status === "ended" || status === "error"
      ? "restart"
      : "none";
  const orbLabel =
    orbAction === "interrupt"
      ? "Interrupt the teacher"
      : orbAction === "mute"
        ? muted ? "Unmute microphone" : "Mute microphone"
        : orbAction === "restart"
          ? "Start talking again"
          : "Connecting";

  return {
    orbMode,
    status: line,
    statusTone: hearing ? "hearing" : "normal",
    teacherCaption,
    studentLine,
    orbAction,
    orbLabel,
    canType: inCall || status === "ended" || status === "error",
    inCall,
  };
}

// ---------------------------------------------------------------- lesson board

export type LessonRole = "explain" | "answer" | "turn" | "notes";

export interface LessonCard {
  id: string;
  card: LectureCard;
  /** 1-based position among the explanation steps; null for questions and notes. */
  step: number | null;
  /** Short name shown on the board: "The basics", "Your turn"... */
  label: string;
  role: LessonRole;
}

export interface Lesson {
  /** What the student asked that this lesson answers. */
  question: string | null;
  cards: LessonCard[];
  explainCount: number;
  hasTurn: boolean;
  /** A maths problem being solved step by step: the board shows every step open, like a worked solution. */
  math: boolean;
}

const STEP_TITLE = /^\s*step\s*(\d+)\s*[·:.)\-–—]*\s*(.*)$/i;
const ANSWER_LABEL = /^(the\s+)?answer\b/i;

function cardTitle(card: LectureCard): string {
  return card.kind === "slide" ? card.title : card.kind === "visual" ? card.visual.title : "";
}

/** The current lesson: the cards since the teacher last started again at "Step 1", numbered in order. */
export function deriveLesson(transcript: TranscriptItem[]): Lesson {
  let pendingQuestion: string | null = null;
  let question: string | null = null;
  let cards: LessonCard[] = [];
  let explainCount = 0;

  for (const item of transcript) {
    if (item.kind === "text") {
      if (item.role === "user" && item.done) {
        const text = visibleStudentText(item.text);
        if (text) pendingQuestion = text;
      }
      continue;
    }
    const explains = item.kind === "slide" || item.kind === "visual";
    const parsed = explains ? STEP_TITLE.exec(cardTitle(item)) : null;
    // The teacher numbering from "Step 1" again means a new question: start a fresh board.
    if (explains && parsed && Number(parsed[1]) === 1 && explainCount > 0) {
      cards = [];
      explainCount = 0;
    }
    if (cards.length === 0) question = pendingQuestion;

    if (explains) {
      explainCount += 1;
      const label = (parsed ? parsed[2] : cardTitle(item)).trim() || `Step ${explainCount}`;
      cards.push({ id: item.id, card: item, step: explainCount, label, role: ANSWER_LABEL.test(label) ? "answer" : "explain" });
    } else {
      const label = item.kind === "quiz" ? "Your turn" : item.kind === "bigq" ? "Big question" : "Check-in";
      cards.push({ id: item.id, card: item, step: null, label, role: "turn" });
    }
  }
  const math = cards.some((c) => c.card.kind === "slide" && c.card.bullets.some(hasMath));
  return { question, cards, explainCount, hasTurn: cards.some((c) => c.role === "turn"), math };
}

/** One-tap requests under the orb; sent to the teacher without showing up as a question. */
export const QUICK_REQUESTS = [
  {
    id: "simpler",
    label: "Explain simpler",
    prompt: `[Student request] I did not understand. Please explain it again more simply, from the very basics, with a new everyday example and a new visual. If it is a maths problem, solve it again more slowly, one small move per step. ${KEEP_LANGUAGE}`,
  },
  {
    id: "example",
    label: "Give an example",
    prompt: `[Student request] Please give me one more example of this, with a visual. If it is a maths problem, solve a similar one step by step. ${KEEP_LANGUAGE}`,
  },
  {
    id: "repeat",
    label: "Repeat that",
    prompt: `[Student request] Please repeat your last explanation slowly, step by step. ${KEEP_LANGUAGE}`,
  },
] as const;

// ---------------------------------------------------------------- keep the lesson moving

/** Quiet time after the teacher finishes a step before the screen tells it to go on. */
export const AUTO_CONTINUE_MS = 900;
/** Never push a lesson past this many explanation steps on its own (a maths solution can take several moves). */
const MAX_AUTO_STEPS = 10;
/** A step is nudged at most twice: the second time only if the reply to the first showed no new step. */
export const MAX_NUDGES_PER_STEP = 2;
/** A mic level that is clearly the student speaking; room noise and auto-gain stay well below it. */
export const STUDENT_SPEAKING_LEVEL = 0.35;

export interface Nudge {
  /** The step this nudge follows. */
  cardId: string;
  text: string;
}

const CONTINUE_STEP =
  `[Continue] Go on to the next step now. Explain it aloud properly, in 3 to 5 clear sentences, before you show the one after it. Do not wait for me and do not ask. ${KEEP_LANGUAGE}`;
const EXPLAIN_FIRST =
  `[Continue] You showed that step but did not explain it aloud. Explain it now, properly, in 3 to 5 clear sentences (what we do, how, and why), and then go on to the next step. Do not wait for me and do not ask. ${KEEP_LANGUAGE}`;
const CONTINUE_TO_QUESTION = `[Continue] Now give me one question to solve about this. Do not wait for me and do not ask. ${KEEP_LANGUAGE}`;

/**
 * Whether a transcript line is the student really speaking. A silent room often yields stray "." or "you";
 * a real interruption ("wait", "stop", "what is x") has at least four letters.
 */
const meaningful = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, "").length >= 4;

/**
 * Once the teacher's turn has finished after a step and the student has said nothing, the lesson should go on
 * by itself. Returns what to tell the teacher, or null when it should wait: the call is not live, the teacher
 * is still talking, its turn has not finished, the student has spoken since the step, the lesson is already at
 * the student's turn, or nothing has been explained yet.
 *
 * "Turn finished" is the call's own signal (turnDone), not a guess from the words: the teacher often shows a
 * step and ends its turn without saying anything more.
 */
export function nextStepNudge(input: {
  inCall: boolean;
  speaking: boolean;
  /** A teacher turn has finished since the latest step appeared. */
  turnDone: boolean;
  transcript: TranscriptItem[];
}): Nudge | null {
  const { inCall, speaking, turnDone, transcript } = input;
  if (!inCall || speaking || !turnDone) return null;

  const lesson = deriveLesson(transcript);
  const last = lesson.cards[lesson.cards.length - 1];
  if (!last || (last.role !== "explain" && last.role !== "answer") || lesson.explainCount > MAX_AUTO_STEPS) return null;

  const at = transcript.findIndex((item) => item.kind !== "text" && item.id === last.id);
  if (at < 0) return null;
  const studentSpoke = transcript.slice(at + 1).some((item) => item.kind === "text" && item.role === "user" && meaningful(item.text));
  if (studentSpoke) return null; // the student is in charge

  // Did the teacher explain this step? Only words after its card count: speech before a card could just as
  // well belong to the step before it, and a step shown in silence is the thing to catch.
  const explained = transcript.slice(at + 1).some((item) => item.kind === "text" && item.role === "teacher" && meaningful(item.text));
  if (!explained) return { cardId: last.id, text: EXPLAIN_FIRST };

  return { cardId: last.id, text: last.role === "answer" ? CONTINUE_TO_QUESTION : CONTINUE_STEP };
}
