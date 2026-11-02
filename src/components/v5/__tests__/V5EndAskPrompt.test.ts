import {
  END_ASK_PROMPT_ANNOUNCEMENT,
  END_ASK_PROMPT_CLOSE_LABEL,
  END_ASK_PROMPT_MESSAGE,
  END_ASK_PROMPT_NO_LABEL,
  END_ASK_PROMPT_YES_LABEL,
} from '../endAskPromptCopy';

// The jest config runs in node without the React Native runtime, so the card is
// not rendered here. These tests pin the copy and accessibility labels it uses.

describe('V5EndAskPrompt copy', () => {
  it('uses the exact prompt message from the plan', () => {
    expect(END_ASK_PROMPT_MESSAGE).toBe('Hey, how was the lecture? Can I ask you some questions?');
  });

  it('uses the exact button labels from the plan', () => {
    expect(END_ASK_PROMPT_YES_LABEL).toBe('Yes, ask away');
    expect(END_ASK_PROMPT_NO_LABEL).toBe('Not now');
  });

  it('has a screen-reader label for the close control', () => {
    expect(END_ASK_PROMPT_CLOSE_LABEL).toBe('Close');
  });

  it('announces the prompt text for screen readers on show', () => {
    expect(END_ASK_PROMPT_ANNOUNCEMENT).toContain('Lecture finished');
    expect(END_ASK_PROMPT_ANNOUNCEMENT).toContain(END_ASK_PROMPT_MESSAGE);
  });
});
