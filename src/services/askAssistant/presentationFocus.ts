// Focus state for Ask AI while a teacher presentation (lesson cards) is shown. The presentation takes the full
// width and the teacher panel hides; a small robot in the header brings the panel back over the presentation,
// and Minimise hides it again. Pure, so the transitions can be tested without React Native.

export type FocusState = 'lesson-full' | 'presenting' | 'presenting-with-panel';

export type FocusEvent =
  | { type: 'PRESENTATION_START' }
  | { type: 'PRESENTATION_END' }
  | { type: 'OPEN_PANEL' }
  | { type: 'MINIMISE' }
  | { type: 'RESET' };

export function focusReducer(state: FocusState, event: FocusEvent): FocusState {
  if (event.type === 'RESET') return 'lesson-full';

  switch (state) {
    case 'lesson-full':
      return event.type === 'PRESENTATION_START' ? 'presenting' : state;
    case 'presenting':
      if (event.type === 'OPEN_PANEL') return 'presenting-with-panel';
      if (event.type === 'PRESENTATION_END') return 'lesson-full';
      return state;
    case 'presenting-with-panel':
      if (event.type === 'MINIMISE') return 'presenting';
      if (event.type === 'PRESENTATION_END') return 'lesson-full';
      return state;
    default:
      return state;
  }
}

/** Where each animated piece should be: 1 = shown, 0 = hidden. */
export function panelTargets(state: FocusState): { dock: 0 | 1; panel: 0 | 1; overlay: 0 | 1; badge: boolean } {
  switch (state) {
    case 'lesson-full':
      return { dock: 1, panel: 1, overlay: 0, badge: false };
    case 'presenting':
      return { dock: 0, panel: 0, overlay: 0, badge: true };
    case 'presenting-with-panel':
      return { dock: 0, panel: 1, overlay: 1, badge: true };
  }
}
