import { focusReducer, panelTargets, type FocusEvent, type FocusState } from '../askAssistant/presentationFocus';

const ALL_STATES: FocusState[] = ['lesson-full', 'presenting', 'presenting-with-panel'];
const ALL_EVENTS: FocusEvent[] = [
  { type: 'PRESENTATION_START' },
  { type: 'PRESENTATION_END' },
  { type: 'OPEN_PANEL' },
  { type: 'MINIMISE' },
  { type: 'RESET' },
];

describe('focusReducer transitions', () => {
  it('starts a presentation from lesson-full', () => {
    expect(focusReducer('lesson-full', { type: 'PRESENTATION_START' })).toBe('presenting');
  });

  it('opens the panel over a presentation', () => {
    expect(focusReducer('presenting', { type: 'OPEN_PANEL' })).toBe('presenting-with-panel');
  });

  it('minimises the panel back to presenting', () => {
    expect(focusReducer('presenting-with-panel', { type: 'MINIMISE' })).toBe('presenting');
  });

  it('ends a presentation from presenting and from presenting-with-panel', () => {
    expect(focusReducer('presenting', { type: 'PRESENTATION_END' })).toBe('lesson-full');
    expect(focusReducer('presenting-with-panel', { type: 'PRESENTATION_END' })).toBe('lesson-full');
  });

  it('resets to lesson-full from every state', () => {
    for (const state of ALL_STATES) {
      expect(focusReducer(state, { type: 'RESET' })).toBe('lesson-full');
    }
  });

  it('returns the same state for every other combination', () => {
    const handled: Record<string, string> = {
      'lesson-full|PRESENTATION_START': 'presenting',
      'presenting|OPEN_PANEL': 'presenting-with-panel',
      'presenting-with-panel|MINIMISE': 'presenting',
      'presenting|PRESENTATION_END': 'lesson-full',
      'presenting-with-panel|PRESENTATION_END': 'lesson-full',
    };
    for (const state of ALL_STATES) {
      for (const event of ALL_EVENTS) {
        if (event.type === 'RESET') continue;
        const key = `${state}|${event.type}`;
        const expected = handled[key] ?? state;
        expect({ key, next: focusReducer(state, event) }).toEqual({ key, next: expected });
      }
    }
  });

  it('keeps the same value on no-op events', () => {
    expect(focusReducer('lesson-full', { type: 'OPEN_PANEL' })).toBe('lesson-full');
    expect(focusReducer('lesson-full', { type: 'MINIMISE' })).toBe('lesson-full');
    expect(focusReducer('lesson-full', { type: 'PRESENTATION_END' })).toBe('lesson-full');
    expect(focusReducer('presenting', { type: 'PRESENTATION_START' })).toBe('presenting');
    expect(focusReducer('presenting', { type: 'MINIMISE' })).toBe('presenting');
    expect(focusReducer('presenting-with-panel', { type: 'OPEN_PANEL' })).toBe('presenting-with-panel');
    expect(focusReducer('presenting-with-panel', { type: 'PRESENTATION_START' })).toBe('presenting-with-panel');
  });
});

describe('panelTargets', () => {
  it('shows the full layout with the panel in lesson-full', () => {
    expect(panelTargets('lesson-full')).toEqual({ dock: 1, panel: 1, overlay: 0, badge: false });
  });

  it('hides the panel and docks nothing while presenting', () => {
    expect(panelTargets('presenting')).toEqual({ dock: 0, panel: 0, overlay: 0, badge: true });
  });

  it('shows the panel over the presentation with a scrim', () => {
    expect(panelTargets('presenting-with-panel')).toEqual({ dock: 0, panel: 1, overlay: 1, badge: true });
  });
});
