// Step 2 of 5 · Dates. Two date cards (Starts, Finish by) and one inline calendar below them, on the same page.
// Tap a card, then tap a day. The days between start and finish are shaded. No modal and no Done button.

import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontFamily, borderRadius, spacing } from '../../../constants/theme';
import DeadlinePicker from '../DeadlinePicker';
import {
  addDaysYmd, addMonthsYmd, daysBetweenYmd, formatDayShort, formatYmd, parseYmd,
} from './state';

type Target = 'start' | 'deadline';

const QUICK: { label: string; add: (start: string) => string }[] = [
  { label: '2 weeks', add: s => addDaysYmd(s, 14) },
  { label: '1 month', add: s => addMonthsYmd(s, 1) },
  { label: '3 months', add: s => addMonthsYmd(s, 3) },
  { label: '6 months', add: s => addMonthsYmd(s, 6) },
];

export default function StepDates({
  startDate, deadline, onStart, onDeadline,
}: {
  startDate: string;
  deadline: string;
  onStart(d: string): void;
  onDeadline(d: string): void;
}) {
  const [active, setActive] = useState<Target>('start');
  const today = formatYmd(new Date());
  const minDeadline = addDaysYmd(startDate, 1);
  const span = daysBetweenYmd(startDate, deadline);
  const showRange = span > 0;

  function pickDay(d: Date) {
    const ymd = formatYmd(d);
    if (active === 'start') {
      onStart(ymd);
      setActive('deadline'); // after a start pick, the finish card is next
    } else {
      onDeadline(ymd);
    }
  }

  const isStart = active === 'start';

  return (
    <View>
      <Text style={styles.question} accessibilityRole="header">When do you start and finish?</Text>

      <View style={styles.cards}>
        <DateCard
          label="Starts"
          value={formatDayShort(startDate)}
          selected={isStart}
          onPress={() => setActive('start')}
        />
        <DateCard
          label="Finish by"
          value={formatDayShort(deadline)}
          selected={!isStart}
          onPress={() => setActive('deadline')}
        />
      </View>
      <Text style={styles.hint}>
        {isStart ? 'Tap a day to set the start date.' : 'Tap a day to set the finish date.'}
      </Text>

      {/* key remounts the calendar on card switch, so it opens on the month of the chosen date. */}
      <DeadlinePicker
        key={active}
        value={parseYmd(isStart ? startDate : deadline)}
        min={parseYmd(isStart ? today : minDeadline)}
        rangeStart={showRange ? parseYmd(startDate) : undefined}
        rangeEnd={showRange ? parseYmd(deadline) : undefined}
        onChange={pickDay}
      />

      <Text style={styles.chipsLabel}>Quick pick (from the start date)</Text>
      <View style={styles.chips}>
        {QUICK.map(q => (
          <TouchableOpacity
            key={q.label}
            style={styles.chip}
            onPress={() => onDeadline(q.add(startDate))}
            accessibilityRole="button"
            accessibilityLabel={`Finish after ${q.label}`}
          >
            <Text style={styles.chipText}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.summary}>
        <Ionicons name="time-outline" size={16} color={colors.primary} />
        <Text style={styles.summaryText}>
          {span > 0 ? `${span} day${span === 1 ? '' : 's'} to study` : 'Pick a finish date after the start'}
        </Text>
      </View>
    </View>
  );
}

function DateCard({ label, value, selected, onPress }: {
  label: string;
  value: string;
  selected: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      style={[styles.card, selected && styles.cardOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}: ${value}. ${selected ? 'Selected' : 'Double tap to choose this date'}`}
    >
      <Text style={[styles.cardLabel, selected && styles.cardLabelOn]}>{label}</Text>
      <Text style={styles.cardValue}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  question: { fontSize: fontSize.xxl, fontFamily: fontFamily.heading, color: colors.text, marginBottom: spacing.md },
  cards: { flexDirection: 'row', gap: spacing.sm },
  card: {
    flex: 1, minHeight: 64, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, justifyContent: 'center',
  },
  // Same green tint as TINT.greenSoft in components/reminders/palette.ts.
  cardOn: { borderColor: colors.primary, borderWidth: 2, backgroundColor: '#F0FDF4' },
  cardLabel: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary },
  cardLabelOn: { color: colors.primaryDark },
  cardValue: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text, marginTop: 2 },
  hint: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.sm },
  chipsLabel: {
    fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary,
    marginTop: spacing.md, marginBottom: spacing.xs,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center',
    borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  chipText: { fontSize: fontSize.md, fontFamily: fontFamily.medium, color: colors.text },
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md,
    padding: spacing.sm, borderRadius: borderRadius.md, backgroundColor: '#F0FDF4',
    borderWidth: 1, borderColor: colors.border,
  },
  summaryText: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontFamily: fontFamily.medium },
});
