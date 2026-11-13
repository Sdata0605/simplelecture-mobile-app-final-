import React, { useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';
import ReviewText from './ReviewText';
import StatusChip, { getStatusColor } from './StatusChip';
import OptionRow, { OptionState } from './OptionRow';
import { ReviewItem, findOptionIndex } from '../../utils/resultHelpers';

interface QuestionReviewCardProps {
  item: ReviewItem;
}

export default function QuestionReviewCard({ item }: QuestionReviewCardProps) {
  const [showExplanation, setShowExplanation] = useState(false);
  const { question, answer, status, options, index } = item;
  const accent = getStatusColor(status);
  const correctValue = question?.correct_answer;
  const hasCorrect = correctValue !== null && correctValue !== undefined && String(correctValue).trim() !== '';
  const explanation: string = typeof question?.explanation === 'string' ? question.explanation.trim() : '';
  const questionImage: string | null = question?.question_image_url || null;
  const studentText = answer?.student ?? '';
  const hasAnswer = status !== 'unanswered';
  const isMcq = item.isMcq && options.length > 0;

  // Option highlighting (MCQ only).
  const studentIdx = isMcq && studentText.trim() !== '' ? findOptionIndex(studentText, options) : -1;
  let correctIdx = isMcq && hasCorrect ? findOptionIndex(String(correctValue), options) : -1;
  if (correctIdx < 0 && status === 'correct') correctIdx = studentIdx;

  const optionState = (idx: number): OptionState => {
    const isCorrectOpt = idx === correctIdx;
    const isPick = idx === studentIdx;
    if (isPick && isCorrectOpt) return 'correctPick';
    if (isPick) return 'wrongPick';
    if (isCorrectOpt) return 'correct';
    return 'neutral';
  };

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <View style={styles.topRow}>
        <View style={styles.qBubble}>
          <Text style={styles.qText}>Q{index}</Text>
        </View>
        <StatusChip status={status} />
      </View>

      {question ? (
        <ReviewText fontSize={fontSize.lg} color={colors.text} style={styles.questionText}>
          {String(question.question_text ?? '')}
        </ReviewText>
      ) : (
        <Text style={styles.unavailable}>Question text unavailable</Text>
      )}

      {questionImage ? (
        <Image source={{ uri: questionImage }} style={styles.questionImage} resizeMode="contain" />
      ) : null}

      {isMcq ? (
        <View style={styles.options}>
          {options.map((opt, idx) => (
            <OptionRow
              key={`${opt.key}-${idx}`}
              letter={opt.key}
              text={opt.text}
              state={optionState(idx)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.subjective}>
          <View style={styles.answerBox}>
            <Text style={styles.boxLabel}>Your answer</Text>
            {answer?.imageUrl ? (
              <Image source={{ uri: answer.imageUrl }} style={styles.answerImage} resizeMode="cover" />
            ) : null}
            {hasAnswer && studentText.trim() !== '' ? (
              <ReviewText fontSize={fontSize.md} color={colors.text}>
                {studentText}
              </ReviewText>
            ) : hasAnswer ? null : (
              <Text style={styles.muted}>Not answered</Text>
            )}
          </View>

          {hasCorrect ? (
            <View style={styles.modelBox}>
              <Text style={[styles.boxLabel, { color: colors.success }]}>Model answer</Text>
              <ReviewText fontSize={fontSize.md} color={colors.text}>
                {String(correctValue)}
              </ReviewText>
            </View>
          ) : null}
        </View>
      )}

      {answer?.feedback ? (
        <View style={styles.feedback}>
          <Text style={styles.boxLabel}>Feedback</Text>
          <Text style={styles.feedbackText}>{String(answer.feedback)}</Text>
        </View>
      ) : null}

      {explanation ? (
        <View style={styles.explanationWrap}>
          <Pressable
            onPress={() => setShowExplanation((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showExplanation }}
            accessibilityLabel={showExplanation ? 'Hide explanation' : 'Show explanation'}
            style={styles.explanationRow}
          >
            <Text style={styles.explanationLabel}>
              {showExplanation ? 'Hide explanation' : 'Show explanation'}
            </Text>
            <Ionicons
              name={showExplanation ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.primary}
            />
          </Pressable>
          {showExplanation ? (
            <View style={styles.explanationBody}>
              <ReviewText fontSize={fontSize.md} color={colors.text}>
                {explanation}
              </ReviewText>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    padding: spacing.md,
    gap: spacing.sm + 2,
    marginBottom: spacing.md,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qBubble: {
    minWidth: 40,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  questionText: {
    fontFamily: fontFamily.medium,
  },
  unavailable: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  questionImage: {
    width: '100%',
    height: 180,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.gray50,
  },
  options: {
    gap: spacing.sm,
  },
  subjective: {
    gap: spacing.sm,
  },
  answerBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelBox: {
    backgroundColor: colors.successBg,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.success,
  },
  answerImage: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.sm,
  },
  boxLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs + 1,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  muted: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  feedback: {
    backgroundColor: colors.warningBg,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    gap: spacing.xs,
  },
  feedbackText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.text,
  },
  explanationWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  explanationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  explanationLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.primary,
  },
  explanationBody: {
    paddingTop: spacing.xs,
  },
});
