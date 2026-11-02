/**
 * Copy and prop contract for the end-of-lecture Ask AI prompt card.
 * Pure module (no React Native imports) so it can be unit-tested under the
 * node-only jest setup. The card itself lives in V5EndAskPrompt.tsx.
 */

export const END_ASK_PROMPT_MESSAGE = 'Hey, how was the lecture? Can I ask you some questions?';
export const END_ASK_PROMPT_YES_LABEL = 'Yes, ask away';
export const END_ASK_PROMPT_NO_LABEL = 'Not now';
export const END_ASK_PROMPT_CLOSE_LABEL = 'Close';
export const END_ASK_PROMPT_ANNOUNCEMENT =
  'Lecture finished. Hey, how was the lecture? Can I ask you some questions?';

export interface V5EndAskPromptProps {
  /** Whether the card is shown. When false the component renders nothing. */
  visible: boolean;
  /** Lecture title, shown as the grey subline. Omitted when empty. */
  lectureTitle: string;
  /** Student tapped "Yes, ask away". */
  onYes: () => void;
  /** Student tapped "Not now", the X, or the parent dismissed the card. */
  onDismiss: () => void;
}
