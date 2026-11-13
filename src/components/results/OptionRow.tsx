import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';
import ReviewText from './ReviewText';

export type OptionState = 'neutral' | 'correct' | 'correctPick' | 'wrongPick';

interface OptionRowProps {
  letter: string;
  text: string;
  state: OptionState;
}

const CAPTIONS: Partial<Record<OptionState, string>> = {
  correct: 'Correct answer',
  correctPick: 'Your answer',
  wrongPick: 'Your answer',
};

export default function OptionRow({ letter, text, state }: OptionRowProps) {
  const isSuccess = state === 'correct' || state === 'correctPick';
  const isError = state === 'wrongPick';
  const borderColor = isSuccess ? colors.success : isError ? colors.error : colors.border;
  const bgColor = isSuccess ? colors.successBg : isError ? colors.errorBg : colors.surface;
  const caption = CAPTIONS[state];

  return (
    <View
      style={[styles.row, { backgroundColor: bgColor, borderColor }]}
      accessibilityLabel={`Option ${letter}${caption ? `, ${caption}` : ''}`}
    >
      <View
        style={[
          styles.bubble,
          { backgroundColor: isSuccess ? colors.success : isError ? colors.error : colors.white },
          !isSuccess && !isError && { borderColor: colors.border, borderWidth: 1 },
        ]}
      >
        <Text
          style={[
            styles.letter,
            { color: isSuccess || isError ? colors.white : colors.textSecondary },
          ]}
        >
          {letter}
        </Text>
      </View>

      <View style={styles.body}>
        <ReviewText fontSize={fontSize.md} color={colors.text}>
          {text}
        </ReviewText>
        {caption ? (
          <Text style={[styles.caption, { color: isSuccess ? colors.success : colors.error }]}>
            {caption}
          </Text>
        ) : null}
      </View>

      {isSuccess ? (
        <Ionicons name="checkmark-circle" size={20} color={colors.success} />
      ) : isError ? (
        <Ionicons name="close-circle" size={20} color={colors.error} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  bubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
  },
  body: {
    flex: 1,
  },
  caption: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs + 1,
    marginTop: 2,
  },
});
