import {
  QUICK_REQUESTS,
  buildLectureOpening,
  deriveLectureView,
  deriveLesson,
  formatClock,
  nextStepNudge,
  visibleStudentText,
  withFirstQuestion,
  type LectureAskContext,
  type LectureLive,
} from '../askAssistant/lectureLesson';
import { KEEP_LANGUAGE } from '../aiTeacherVoice';
import type { TranscriptItem } from '../aiTeacherLiveService';

let counter = 0;
const nextId = () => `item-${++counter}`;
const say = (role: 'user' | 'teacher', text: string, done = true): TranscriptItem => ({ kind: 'text', id: nextId(), role, text, done });
const slide = (id: string, title: string, bullets: string[] = ['a']): TranscriptItem => ({ kind: 'slide', id, title, bullets });
const visual = (id: string, title: string): TranscriptItem => ({
  kind: 'visual',
  id,
  visual: { kind: 'steps', title, items: [{ emoji: '🌱', title: 'Seed' }, { emoji: '🌿', title: 'Plant' }] },
});
const quiz = (id: string): TranscriptItem => ({
  kind: 'quiz',
  id,
  quiz: { id: 'q', question: '2+2?', options: ['3', '4'], correctIndex: 1, explanation: null },
});

const ctx: LectureAskContext = {
  currentTime: 754,
  duration: 1800,
  sectionIndex: 3,
  sectionCount: 9,
  sectionTitle: 'Causes of the French Revolution',
  keyPoints: ['Heavy taxes on the Third Estate', 'Bread prices rose'],
  narration: 'The peasants carried most of the tax burden while the clergy and nobles paid very little.',
};

describe('buildLectureOpening', () => {
  it('tells the teacher which lecture is paused, where, and what was being said', () => {
    const t = buildLectureOpening({ trigger: 'mid', subjectName: 'Social Science', topicTitle: 'French Revolution', context: ctx });
    expect(t).toContain('[Lecture context]');
    expect(t).toContain('"French Revolution" (Social Science)');
    expect(t).toContain('paused at 12:34, in section 3 of 9');
    expect(t).toContain('Heavy taxes on the Third Estate; Bread prices rose');
    expect(t).toContain('carried most of the tax burden');
  });

  it('never asks which subject, and explains every step aloud before the next', () => {
    const t = buildLectureOpening({ trigger: 'mid', subjectName: 'Maths', context: null });
    expect(t).toContain('never ask which subject');
    expect(t).toContain('Explain every step aloud properly');
    expect(t).toContain('Never show a step without explaining it aloud');
    expect(t).toContain('never wait for me');
    expect(t).toContain('close this screen');
  });

  it('tells the teacher how to solve maths problems step by step', () => {
    const t = buildLectureOpening({ trigger: 'mid', subjectName: 'Maths', context: null });
    for (const part of ['MATHS:', 'present_slide', 'Step 1 · The problem', '$$2x + 3 = 11$$', 'Why:', '\\boxed{x = 4}', 'one move per step']) {
      expect(t).toContain(part);
    }
  });

  it('knows this app cannot show notes documents, and offers a quiz at the end of a lecture', () => {
    expect(buildLectureOpening({ trigger: 'mid', subjectName: 'Science', context: null })).toContain('never use create_document');
    const end = buildLectureOpening({ trigger: 'end', subjectName: 'Science', topicTitle: 'Light', context: ctx });
    expect(end).toContain('I just finished watching');
    expect(end).toContain('3-question quiz');
  });

  it('asks for the lecture language, in its mixed classroom style, only when the student setting is auto', () => {
    const base = { trigger: 'mid' as const, subjectName: 'Science', lectureLanguage: 'kannada', context: null };
    expect(buildLectureOpening({ ...base, replyInLectureLanguage: true })).toContain(
      'Talk to me in Kannada (Kanglish) unless I speak English or ask for another language.',
    );
    expect(buildLectureOpening({ ...base, replyInLectureLanguage: false })).not.toContain('Talk to me in');
    // A language with no mixed style of its own is still asked for, without one.
    expect(
      buildLectureOpening({ ...base, lectureLanguage: 'tamil', replyInLectureLanguage: true }),
    ).toContain('Talk to me in Tamil unless I speak English');
  });

  it('asks for the Indian accent, the slow pace and the mixed language in every opening', () => {
    const opening = buildLectureOpening({ trigger: 'ask', subjectName: 'Science', context: null });
    expect(opening).toContain('Indian English accent');
    expect(opening).toContain('110 words per minute');
    expect(opening).toContain('Marathi means Menglish');
    expect(opening).toContain('in the words shown to me');
    expect(opening).toContain('Never say your thoughts');
  });

  it('tells the teacher to keep its language on the app\'s own English messages', () => {
    for (const request of QUICK_REQUESTS) expect(request.prompt).toContain(KEEP_LANGUAGE);
    const nudge = nextStepNudge({
      inCall: true,
      speaking: false,
      turnDone: true,
      transcript: [slide('s1', 'Step 1 · The basics'), say('teacher', 'Let us begin with the basics of light.')],
    });
    expect(nudge?.text).toContain(KEEP_LANGUAGE);
  });

  it('hides the context message from the student but keeps a question typed before the call was up', () => {
    const opening = buildLectureOpening({ trigger: 'mid', subjectName: 'Science', context: null });
    expect(visibleStudentText(opening)).toBeNull();
    expect(visibleStudentText(withFirstQuestion(opening, '  why is the sky blue? '))).toBe('why is the sky blue?');
    expect(visibleStudentText('explain again')).toBe('explain again');
  });

  it('formats the clock', () => {
    expect(formatClock(65.9)).toBe('1:05');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });
});

describe('deriveLesson', () => {
  it('numbers steps, names them from the title, and remembers the question', () => {
    const lesson = deriveLesson([
      say('teacher', 'Hello'),
      say('user', 'why do plants need sunlight?'),
      visual('1', 'Step 1 · The basics'),
      slide('2', 'Step 2 - Build up'),
      visual('3', 'Step 3: Everyday example'),
      slide('4', 'Step 4 · Answer'),
      quiz('5'),
    ]);
    expect(lesson.question).toBe('why do plants need sunlight?');
    expect(lesson.cards.map((c) => [c.step, c.label, c.role])).toEqual([
      [1, 'The basics', 'explain'],
      [2, 'Build up', 'explain'],
      [3, 'Everyday example', 'explain'],
      [4, 'Answer', 'answer'],
      [null, 'Your turn', 'turn'],
    ]);
    expect(lesson).toMatchObject({ explainCount: 4, hasTurn: true, math: false });
  });

  it('starts a fresh board when the teacher begins again at Step 1', () => {
    const lesson = deriveLesson([
      say('user', 'first question'),
      slide('1', 'Step 1 · The basics'),
      slide('2', 'Step 2 · Build up'),
      say('user', 'second question'),
      slide('3', 'Step 1 · The basics'),
    ]);
    expect(lesson.question).toBe('second question');
    expect(lesson.cards.map((c) => c.id)).toEqual(['3']);
  });

  it('keeps the board when the student answers by voice, and numbers steps even without the prefix', () => {
    const lesson = deriveLesson([say('user', 'why?'), slide('1', 'Light and plants'), quiz('2'), say('user', 'four')]);
    expect(lesson.cards.map((c) => [c.step, c.label])).toEqual([[1, 'Light and plants'], [null, 'Your turn']]);
    expect(lesson.question).toBe('why?');
  });

  it('marks a lesson as maths when the steps carry LaTeX', () => {
    expect(deriveLesson([slide('1', 'Step 1 · The problem', ['Find x', '$$2x + 3 = 11$$'])]).math).toBe(true);
    expect(deriveLesson([slide('1', 'Step 2 · Divide', ['\\frac{8}{2} = 4'])]).math).toBe(true);
    expect(deriveLesson([slide('1', 'Step 1 · The basics')]).math).toBe(false);
  });

  it('counts an understanding check as the student turn, not a step', () => {
    const lesson = deriveLesson([slide('1', 'Step 1 · The basics'), { kind: 'understand', id: '2' }]);
    expect(lesson.cards.map((c) => [c.step, c.role])).toEqual([[1, 'explain'], [null, 'turn']]);
  });
});

describe('nextStepNudge: the lesson keeps going without the student saying go ahead', () => {
  const idle = { inCall: true, speaking: false, turnDone: true };

  it('tells the teacher to explain a step it showed in silence, not to go on', () => {
    const n = nextStepNudge({ ...idle, transcript: [say('user', 'solve it'), slide('1', 'Step 1 · The problem')] });
    expect(n).toMatchObject({ cardId: '1' });
    expect(n?.text).toContain('did not explain it aloud');
  });

  it('goes on once the step has been explained after its card', () => {
    const n = nextStepNudge({ ...idle, transcript: [slide('1', 'Step 1 · The basics'), say('teacher', 'Plants make food.')] });
    expect(n?.text).toContain('Go on to the next step');
  });

  it('asks for the question to solve after the Answer step', () => {
    const n = nextStepNudge({ ...idle, transcript: [slide('1', 'Step 1 · The basics'), say('teacher', 'Idea.'), slide('2', 'Step 2 · Answer'), say('teacher', 'So that is why plants need light.')] });
    expect(n).toMatchObject({ cardId: '2', text: expect.stringContaining('question to solve') });
  });

  it('waits while the teacher talks, before its turn ends, when the call is not live, and at the student turn', () => {
    const t = [slide('1', 'Step 1 · The basics')];
    expect(nextStepNudge({ ...idle, speaking: true, transcript: t })).toBeNull();
    expect(nextStepNudge({ ...idle, turnDone: false, transcript: t })).toBeNull();
    expect(nextStepNudge({ ...idle, inCall: false, transcript: t })).toBeNull();
    expect(nextStepNudge({ ...idle, transcript: [slide('1', 'Step 1 · The basics'), quiz('2')] })).toBeNull();
  });

  it('holds off for a real interruption but ignores noise-like transcripts', () => {
    for (const words of ['wait', 'stop', 'what is x']) {
      expect(nextStepNudge({ ...idle, transcript: [slide('1', 'Step 1 · The basics'), say('user', words)] })).toBeNull();
    }
    for (const noise of ['.', 'you', 'uh', 'yes']) {
      expect(nextStepNudge({ ...idle, transcript: [slide('1', 'Step 1 · The basics'), say('user', noise)] })).toMatchObject({ cardId: '1' });
    }
  });

  it('allows a long solution but not an endless one', () => {
    const steps = (count: number) => {
      const out: TranscriptItem[] = [];
      for (let i = 1; i <= count; i++) out.push(slide(`s${i}`, `Step ${i} · Move`, [`$$x = ${i}$$`]));
      return out;
    };
    expect(nextStepNudge({ ...idle, transcript: steps(8) })).not.toBeNull();
    expect(nextStepNudge({ ...idle, transcript: steps(11) })).toBeNull();
  });
});

describe('deriveLectureView: what the orb screen shows', () => {
  const base: LectureLive = { status: 'live', speaking: false, muted: false, micAvailable: true, micLevel: 0, teacherName: 'Asha', transcript: [] };

  it('thinks while connecting, and cannot be tapped or typed into yet', () => {
    const v = deriveLectureView({ ...base, status: 'connecting' });
    expect(v).toMatchObject({ orbMode: 'thinking', status: 'Connecting to your teacher…', orbAction: 'none', canType: false });
  });

  it('listens when live and quiet, and notices when the student is heard', () => {
    expect(deriveLectureView(base)).toMatchObject({ orbMode: 'listening', orbAction: 'mute', canType: true });
    expect(deriveLectureView({ ...base, micLevel: 0.5 })).toMatchObject({ status: 'Listening…', statusTone: 'hearing' });
  });

  it('lets the student tap the orb to interrupt while the teacher speaks', () => {
    const v = deriveLectureView({ ...base, speaking: true, transcript: [say('teacher', 'Namaste!', false)] });
    expect(v).toMatchObject({ orbMode: 'speaking', orbAction: 'interrupt', orbLabel: 'Interrupt the teacher', teacherCaption: 'Namaste!' });
    expect(v.status).toBe('Asha is speaking · tap the orb to interrupt');
  });

  it('shows the question as Thinking once the student has finished asking, and offers restart after errors', () => {
    expect(deriveLectureView({ ...base, transcript: [say('user', 'why?')] }).status).toBe('Thinking…');
    expect(deriveLectureView({ ...base, status: 'error' })).toMatchObject({ orbMode: 'error', orbAction: 'restart', canType: true });
    expect(deriveLectureView({ ...base, status: 'ended' }).orbAction).toBe('restart');
  });
});

describe('quick requests', () => {
  it('ask for a simpler explanation, an example, or a repeat; maths-aware', () => {
    expect(QUICK_REQUESTS.map((q) => q.label)).toEqual(['Explain simpler', 'Give an example', 'Repeat that']);
    expect(QUICK_REQUESTS[0].prompt).toContain('maths problem');
    expect(QUICK_REQUESTS[1].prompt).toContain('similar one step by step');
  });
});
