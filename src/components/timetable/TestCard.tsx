// Scheduled self-test card in the "My plans and tests" strip. Same white card as a plan, with an amber edge.
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';
import { cardBase } from '../../constants/surfaces';
import { TINT } from '../reminders/palette';
import type { SelfTest } from '../../hooks/useStudyTimetable';

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  } catch { return iso; }
}

interface TestCardProps {
  test: SelfTest;
  onPress?(): void;
}

export default function TestCard({ test }: TestCardProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(280, width * 0.78);
  const kind = test.test_type === 'topic' ? 'Topic test' : 'Chapter test';

  return (
    <View
      style={[styles.card, { width: cardWidth }]}
      accessibilityLabel={`${kind} ${test.title}, ${formatDateTime(test.scheduled_at)}, ${test.duration_minutes} minutes`}
    >
      <View style={styles.pill}>
        <Text style={styles.pillText}>{kind}</Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>{test.title}</Text>
      <View style={styles.metaRow}>
        <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.metaText}>{formatDateTime(test.scheduled_at)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="hourglass-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.metaText}>{test.duration_minutes} min · {test.total_questions} questions</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...cardBase,
    padding: spacing.md,
    gap: spacing.xs + 2,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  pill: {
    alignSelf: 'flex-start', backgroundColor: TINT.amberBg,
    borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  pillText: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: TINT.amberText },
  title: { fontSize: fontSize.xl, lineHeight: 24, fontFamily: fontFamily.headingSemiBold, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fontFamily.medium, color: colors.textSecondary },
});
