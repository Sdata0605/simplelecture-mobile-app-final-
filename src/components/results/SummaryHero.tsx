import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';
import { formatDuration, formatReviewDate } from '../../utils/resultHelpers';
import ScoreRing from './ScoreRing';
import TypeBadge from './TypeBadge';

interface SummaryHeroProps {
  category: string | null | undefined;
  dateIso: string | null | undefined;
  percent: number | null;
  correct: number;
  total: number;
  timeSeconds: number | null | undefined;
  wrong: number;
  unanswered: number;
}

function motivation(percent: number | null): string {
  if (percent === null) return 'Keep practising';
  if (percent >= 70) return 'Great work!';
  if (percent >= 40) return 'Good try, review the misses';
  return 'Keep practising';
}

export default function SummaryHero({
  category,
  dateIso,
  percent,
  correct,
  total,
  timeSeconds,
  wrong,
  unanswered,
}: SummaryHeroProps) {
  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.topRow}>
        <TypeBadge category={category} tone="onDark" />
        <Text style={styles.date}>{formatReviewDate(dateIso)}</Text>
      </View>

      <View style={styles.middleRow}>
        <ScoreRing
          percent={percent}
          size={88}
          color={colors.white}
          trackColor="rgba(255,255,255,0.3)"
          textColor={colors.white}
        />
        <View style={styles.stats}>
          <Text style={styles.correctText}>
            {correct} / {total} correct
          </Text>
          <View style={styles.timeRow}>
            <Ionicons name="time-outline" size={16} color={colors.white} />
            <Text style={styles.timeText}>{formatDuration(timeSeconds)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.pills}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Correct {correct}</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Wrong {wrong}</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Not answered {unanswered}</Text>
        </View>
      </View>

      <Text style={styles.motivation}>{motivation(percent)}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  date: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.white,
    opacity: 0.9,
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  stats: {
    flex: 1,
    gap: spacing.sm,
  },
  correctText: {
    fontFamily: fontFamily.heading,
    fontSize: fontSize.xl,
    color: colors.white,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.white,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  pillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.white,
  },
  motivation: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.white,
  },
});
