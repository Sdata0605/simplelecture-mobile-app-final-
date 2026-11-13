import React, { useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';
import TypeBadge from './TypeBadge';
import ScoreRing from './ScoreRing';
import {
  formatDuration,
  formatReviewDate,
  getCategoryMeta,
  getGradingStatusLabel,
  getResultTitle,
  getScoreColor,
  parsePercent,
} from '../../utils/resultHelpers';

interface ResultCardProps {
  result: any;
  onReview: () => void;
}

export default function ResultCard({ result, onReview }: ResultCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const category = result?.paper_category as string | undefined;
  const meta = getCategoryMeta(category);
  const total = Number(result?.total_questions) || 0;
  const correct = Number(result?.score) || 0;
  const explicitPercent = parsePercent(result?.percentage);
  const percent =
    explicitPercent !== null ? explicitPercent : total > 0 ? Math.round((correct / total) * 100) : null;
  const scoreColor = getScoreColor(percent);
  const title = getResultTitle(result);
  const subtitle: string | null =
    result?.chapter_name ?? result?.chapter_title ?? result?.topic_name ?? result?.subject_name ?? null;
  const dateLabel = formatReviewDate(result?.submitted_at);
  const pending = String(result?.grading_status || '').toLowerCase() === 'pending';
  const gradingLabel = getGradingStatusLabel(result?.grading_status);
  const percentLabel = percent === null ? 'no score' : `${percent} percent`;

  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 0 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onReview}
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityLabel={`${meta.label}, ${title}, ${percentLabel}, ${dateLabel}`}
        style={styles.card}
      >
        <View style={[styles.accent, { backgroundColor: scoreColor }]} />

        <View style={styles.topRow}>
          <TypeBadge category={category} />
          <Text style={styles.date}>{dateLabel}</Text>
        </View>

        <View style={styles.middleRow}>
          <View style={styles.titleCol}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <ScoreRing percent={percent} size={64} strokeWidth={5} />
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${percent === null ? 0 : Math.min(100, percent)}%`, backgroundColor: scoreColor },
            ]}
          />
        </View>
        <Text style={styles.correctText}>
          {correct}/{total} correct
        </Text>

        <View style={styles.pills}>
          <View style={styles.pill}>
            <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.pillText}>{formatDuration(result?.time_taken_seconds)}</Text>
          </View>
          <View style={styles.pill}>
            <Ionicons name="help-circle-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.pillText}>{total} Q</Text>
          </View>
          <View style={styles.pill}>
            <Ionicons
              name={pending ? 'hourglass-outline' : 'ribbon-outline'}
              size={13}
              color={colors.textSecondary}
            />
            <Text style={styles.pillText}>{gradingLabel}</Text>
          </View>
        </View>

        {pending ? (
          <View style={styles.ghostButton}>
            <Text style={styles.ghostButtonText}>Awaiting grading</Text>
          </View>
        ) : (
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Review Answers</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    paddingLeft: spacing.md + 4,
    gap: spacing.sm + 2,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  date: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fontFamily.headingSemiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gray100,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  correctText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: -4,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  pillText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs + 1,
    color: colors.textSecondary,
  },
  primaryButton: {
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.white,
  },
  ghostButton: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.primary,
  },
});
