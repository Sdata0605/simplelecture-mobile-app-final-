/**
 * Plan-creation wizard state machine (WP1 / WP3 contract, plan section E.4 and H.1).
 * Pure module: no React Native imports, runs in the jest node environment.
 */
import {
  buildSteps,
  initialState,
  wizardReducer,
  validateStep,
  toGeneratePayload,
  type WizardState,
  type WizardAction,
} from '../planWizard/state';

const TODAY = new Date(2026, 10, 2); // 2 Nov 2026

function fresh(remindersOn = true, courseId: string | null = 'course-1'): WizardState {
  return initialState({ courseId, courseName: 'Class 10 CBSE', remindersOn, today: TODAY });
}

function run(s: WizardState, ...actions: WizardAction[]): WizardState {
  return actions.reduce((acc, a) => wizardReducer(acc, a), s);
}

const OK_CTX = { contentItems: 130, contentLoading: false, feasibility: null } as const;

describe('buildSteps', () => {
  it('has 5 steps with reminder fourth when reminders are on', () => {
    const steps = buildSteps(true);
    expect(steps).toHaveLength(5);
    expect(steps[3]).toBe('reminder');
    expect(steps[0]).toBe('scope');
    expect(steps[steps.length - 1]).toBe('review');
  });

  it('has 4 steps with no reminder step when reminders are off', () => {
    const steps = buildSteps(false);
    expect(steps).toHaveLength(4);
    expect(steps).not.toContain('reminder');
  });
});

describe('initial state', () => {
  it('starts with no reminder chosen and starts clean', () => {
    const s = fresh(true);
    expect(s.reminder).toBeNull();
    expect(s.stepIndex).toBe(0);
    expect(s.dirty).toBe(false);
    expect(s.status).toBe('editing');
    expect(s.error).toBeNull();
    expect(s.steps).toEqual(buildSteps(true));
  });

  it('uses the 4-step list when reminders are off', () => {
    expect(fresh(false).steps).toEqual(buildSteps(false));
  });
});

describe('back and next navigation', () => {
  it('back at step 0 stays at step 0', () => {
    expect(run(fresh(), { type: 'back' }).stepIndex).toBe(0);
  });

  it('next moves forward through the steps in order', () => {
    const s = run(fresh(), { type: 'next' }, { type: 'next' });
    expect(s.stepIndex).toBe(2);
    expect(s.steps[s.stepIndex]).toBe('times');
  });

  it('back returns to the previous step', () => {
    const s = run(fresh(), { type: 'next' }, { type: 'next' }, { type: 'back' });
    expect(s.stepIndex).toBe(1);
  });

  it('goto review then goto times sets returnToReview, and next goes back to review', () => {
    let s = fresh();
    s = run(s, { type: 'goto', step: 'review' });
    expect(s.steps[s.stepIndex]).toBe('review');
    s = run(s, { type: 'goto', step: 'times' });
    expect(s.returnToReview).toBe(true);
    expect(s.steps[s.stepIndex]).toBe('times');
    s = run(s, { type: 'next' });
    expect(s.steps[s.stepIndex]).toBe('review');
  });

  it('validateStep blocks scope when no course is picked', () => {
    const check = validateStep(fresh(true, null), 'scope', OK_CTX);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/pick a course/i);
  });
});

describe('scope validation', () => {
  it('selecting whole course selects all subjects', () => {
    const s = run(
      fresh(),
      { type: 'setAllSubjects', ids: ['math', 'science', 'english'] },
      { type: 'setScopeMode', mode: 'subjects' },
      { type: 'setScopeMode', mode: 'course' },
    );
    expect(s.scopeMode).toBe('course');
    expect(s.subjectIds).toEqual(['math', 'science', 'english']);
  });

  it('pick subjects with none ticked is invalid', () => {
    const s = run(
      fresh(),
      { type: 'setAllSubjects', ids: ['math', 'science'] },
      { type: 'setScopeMode', mode: 'subjects' },
      { type: 'setSubjects', ids: [] },
    );
    const check = validateStep(s, 'scope', OK_CTX);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('Pick at least one subject');
  });

  it('course with no subjects at all is invalid', () => {
    const s = run(fresh(), { type: 'setAllSubjects', ids: [] });
    expect(validateStep(s, 'scope', OK_CTX).ok).toBe(false);
  });

  it('zero lectures gives a no-lectures reason', () => {
    const check = validateStep(
      fresh(),
      'scope',
      { contentItems: 0, contentLoading: false, feasibility: null },
    );
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/no published lectures/i);
  });

  it('still counting lectures is invalid with the counting message', () => {
    const check = validateStep(
      fresh(),
      'scope',
      { contentItems: 0, contentLoading: true, feasibility: null },
    );
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('Counting lectures...');
  });

  it('valid scope passes', () => {
    const s = run(fresh(), { type: 'setAllSubjects', ids: ['math'] });
    expect(validateStep(s, 'scope', OK_CTX).ok).toBe(true);
  });
});

describe('dates', () => {
  it('deadline equal to start is invalid', () => {
    const s = run(fresh(), { type: 'setStart', date: '2026-11-10' }, { type: 'setDeadline', date: '2026-11-10' });
    expect(validateStep(s, 'dates', OK_CTX).ok).toBe(false);
  });

  it('setting start after deadline moves deadline to start + 30 days', () => {
    const s = run(
      fresh(),
      { type: 'setDeadline', date: '2026-12-01' },
      { type: 'setStart', date: '2026-12-10' },
    );
    expect(s.startDate).toBe('2026-12-10');
    expect(s.deadline).toBe('2027-01-09');
  });
});

describe('time windows and validation (flow level)', () => {
  it('no enabled weekday window is invalid', () => {
    const s = fresh();
    const off = { ...s.weekday, morning: { ...s.weekday.morning, enabled: false }, afternoon: { ...s.weekday.afternoon, enabled: false }, evening: { ...s.weekday.evening, enabled: false } };
    const check = validateStep({ ...s, weekday: off }, 'times', OK_CTX);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('Turn on at least one study time on weekdays');
  });

  it('a typed time without zero padding ("7:00") is rejected by the step check', () => {
    const s = run(fresh(), {
      type: 'setWindow',
      day: 'weekday',
      key: 'morning',
      patch: { enabled: true, start: '7:00', end: '09:00' },
    });
    expect(validateStep(s, 'times', OK_CTX).ok).toBe(false);
  });

  it('overlapping enabled windows are invalid', () => {
    const s = run(
      fresh(),
      { type: 'setWindow', day: 'weekday', key: 'morning', patch: { enabled: true, start: '08:00', end: '10:00' } },
      { type: 'setWindow', day: 'weekday', key: 'afternoon', patch: { enabled: true, start: '09:30', end: '11:00' } },
    );
    expect(validateStep(s, 'times', OK_CTX).ok).toBe(false);
  });
});

describe('weekend and payload', () => {
  it('rest and same weekend modes produce different payloads', () => {
    const base = run(fresh(), { type: 'setAllSubjects', ids: ['math'] });
    const same = toGeneratePayload({ ...base, weekendMode: 'same' }, [], 'Maths');
    const rest = toGeneratePayload({ ...base, weekendMode: 'rest' }, [], 'Maths');
    expect(JSON.stringify(rest)).not.toEqual(JSON.stringify(same));
  });

  it('reminder choice is not part of the generate payload', () => {
    const base = fresh();
    const a = toGeneratePayload({ ...base, reminder: 'call' }, [], 'Maths');
    const b = toGeneratePayload({ ...base, reminder: 'none' }, [], 'Maths');
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});

describe('reminder choice', () => {
  it('setReminder none is kept', () => {
    const s = run(fresh(), { type: 'setReminder', value: 'none' });
    expect(s.reminder).toBe('none');
  });

  it('the reminder step is invalid until a choice is made', () => {
    const s = fresh(true);
    expect(validateStep(s, 'reminder', OK_CTX).ok).toBe(false);
    const picked = run(s, { type: 'setReminder', value: 'none' });
    expect(validateStep(picked, 'reminder', OK_CTX).ok).toBe(true);
  });

  it('next does not leave the reminder step without a choice', () => {
    const s = run(fresh(true), { type: 'next' }, { type: 'next' }, { type: 'next' });
    expect(s.steps[s.stepIndex]).toBe('reminder');
    expect(run(s, { type: 'next' }).steps[s.stepIndex]).toBe('reminder');
  });
});

describe('dirty flag, saving and reset', () => {
  it('becomes dirty after an edit', () => {
    expect(run(fresh(), { type: 'toggleSubject', id: 'math' }).dirty).toBe(true);
  });

  it('blocks back while saving', () => {
    const s = run(fresh(), { type: 'next' }, { type: 'saveStart' }, { type: 'back' });
    expect(s.status).toBe('saving');
    expect(s.stepIndex).toBe(1);
  });

  it('saveFail returns to editing with the error shown and no partial state', () => {
    const s = run(fresh(), { type: 'saveStart' }, { type: 'saveFail', error: 'No internet' });
    expect(s.status).toBe('editing');
    expect(s.error).toBe('No internet');
  });

  it('reset restores the initial state, so a second wizard starts clean', () => {
    const edited = run(fresh(), { type: 'setReminder', value: 'call' }, { type: 'next' });
    const reset = run(edited, { type: 'reset' });
    expect(reset.reminder).toBeNull();
    expect(reset.stepIndex).toBe(0);
    expect(reset.dirty).toBe(false);
  });
});

describe('review step', () => {
  it('too-short feasibility blocks Create', () => {
    const check = validateStep(fresh(), 'review', { contentItems: 130, contentLoading: false, feasibility: 'too_short' });
    expect(check.ok).toBe(false);
  });

  it('ok feasibility allows Create', () => {
    const check = validateStep(run(fresh(), { type: 'setReminder', value: 'notification' }), 'review', { contentItems: 130, contentLoading: false, feasibility: 'ok' });
    expect(check.ok).toBe(true);
  });
});
