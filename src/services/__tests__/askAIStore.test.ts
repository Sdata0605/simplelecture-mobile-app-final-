import {
  chooseSubject,
  closeAskAI,
  courseNamesBySubject,
  matchSubjectByName,
  openAskAI,
  useAskAIRequest,
} from '../askAIStore';
import { buildLectureOpening, LECTURE_CONTEXT_TAG } from '../askAssistant/lectureLesson';

// The store hook is a plain useSyncExternalStore read; outside React it just returns the current value.
jest.mock('react', () => ({ useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() }));

const science = { id: 'sci', name: 'Science', topics: 40 };
const social = { id: 'soc', name: 'Social Science', topics: 30 };
const maths = { id: 'mat', name: 'Maths', topics: 50 };

describe('chooseSubject: which subject Ask AI teaches', () => {
  it('uses the subject the student is on, by id', () => {
    expect(chooseSubject({ subjectId: 'soc', subjectName: 'Whatever' }, [science, social])).toEqual({ kind: 'subject', subject: social });
  });

  it("falls back to the subject's name, including the usual short names", () => {
    expect(chooseSubject({ subjectName: 'Social Science' }, [science, social])).toEqual({ kind: 'subject', subject: social });
    expect(chooseSubject({ subjectName: 'Mathematics' }, [science, maths])).toEqual({ kind: 'subject', subject: maths });
  });

  it('prefers the longer name, so Social Science is not mistaken for Science', () => {
    expect(matchSubjectByName('Social Science', [science, social])).toBe(social);
    expect(matchSubjectByName('Science', [science, social])).toBe(science);
  });

  it('starts straight away when there is only one subject and the student was not on another', () => {
    expect(chooseSubject({}, [science])).toEqual({ kind: 'subject', subject: science });
  });

  it('lets the student pick when they come from the home screen and there are several subjects', () => {
    expect(chooseSubject({}, [science, social])).toEqual({ kind: 'pick', unknown: null });
  });

  it('says so when the subject the student is on is not one the teacher can teach yet', () => {
    expect(chooseSubject({ subjectId: 'acc', subjectName: 'Accountancy' }, [science])).toEqual({ kind: 'pick', unknown: 'Accountancy' });
  });
});

describe('courseNamesBySubject: which course a subject belongs to', () => {
  it('lists every visible course of a subject, once each, in order', () => {
    const rows = [
      {
        id: 'sci',
        course_subjects: [
          { courses: { name: 'Class 10 (SSLC - Karnataka)' } },
          { courses: { name: 'Class 10 (CBSE) Complete Course 2026' } },
          { courses: { name: 'Class 10 (SSLC - Karnataka)' } },
        ],
      },
    ];
    expect(courseNamesBySubject(rows)).toEqual({ sci: ['Class 10 (SSLC - Karnataka)', 'Class 10 (CBSE) Complete Course 2026'] });
  });

  it('leaves out courses the student cannot see and subjects with no course at all', () => {
    const rows = [
      { id: 'hidden', course_subjects: [{ courses: null }] },
      { id: 'none', course_subjects: [] },
      { id: 'missing', course_subjects: null },
      { id: 'pharm', course_subjects: [{ courses: { name: ' D.Pharmacy ' } }] },
    ];
    expect(courseNamesBySubject(rows)).toEqual({ pharm: ['D.Pharmacy'] });
  });
});

describe('opening and closing Ask AI', () => {
  afterEach(() => closeAskAI());

  it('is closed until something opens it, and remembers what the student was on', () => {
    expect(useAskAIRequest()).toBeNull();
    openAskAI({ subjectId: 'sci', subjectName: 'Science', topicTitle: 'Light' });
    expect(useAskAIRequest()).toEqual({ subjectId: 'sci', subjectName: 'Science', topicTitle: 'Light' });
  });

  it('opens with no details at all (the floating AI button)', () => {
    openAskAI();
    expect(useAskAIRequest()).toEqual({});
  });

  it('closes again', () => {
    openAskAI();
    closeAskAI();
    expect(useAskAIRequest()).toBeNull();
  });
});

describe('the opening message when Ask AI is opened from outside a lecture', () => {
  it("does not pretend a lecture is paused, and still never asks which subject", () => {
    const t = buildLectureOpening({ trigger: 'ask', subjectName: 'Maths', topicTitle: 'Quadratic equations', context: null });
    expect(t.startsWith(LECTURE_CONTEXT_TAG)).toBe(true);
    expect(t).toContain('a doubt in Maths, on the topic "Quadratic equations"');
    expect(t).toContain('not watching a lecture');
    expect(t).not.toContain('paused');
    expect(t).not.toContain('continue the lecture');
    expect(t).toContain('never ask which subject');
    expect(t).toContain('close this screen');
  });
});
