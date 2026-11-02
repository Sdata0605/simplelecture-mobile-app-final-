// Shared card and shadow tokens for the timetable, wizard and reminder screens.
// Values come from theme.ts (no new colours). Shadow values copy the Reminders calendar card.
import type { ViewStyle } from 'react-native';
import { colors, borderRadius } from './theme';

export const shadow: { card: ViewStyle; raised: ViewStyle } = {
  // Cards: soft drop shadow, 0/6 offset.
  card: {
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  // Sticky bars (upward shadow).
  raised: {
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 6,
  },
};

export const radius = {
  card: borderRadius.lg,   // 16
  sheet: borderRadius.xl,  // 24, bottom sheet top corners
  control: borderRadius.md, // 12, inputs and buttons
};

// White card with the card shadow. Cards use a shadow or a 1 px border, never both.
export const cardBase: ViewStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.card,
  ...shadow.card,
};
