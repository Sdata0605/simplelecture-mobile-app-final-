// Step 2 of 5 · Dates (plan D.6). Two large field buttons. A calendar opens in a sheet
// only when one is tapped, so there is never more than one calendar on screen.

import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontFamily, borderRadius, spacing } from '../../../constants/theme';
import DeadlinePicker from '../DeadlinePicker';
import {
  addDaysYmd, addMonthsYmd, daysBetweenYmd, formatDayShort, formatYmd, parseYmd,
} from './state';

type Sheet = 'start' | 'deadline' | null;

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
  const [sheet, setSheet] = useState<Sheet>(null);
  const today = formatYmd(new Date());
  const minDeadline = addDaysYmd(startDate, 1);
  const span = daysBetweenYmd(startDate, deadline);

  return (
    <View>
      <Text style={styles.question} accessibilityRole="header">When do you start and finish?</Text>

      <FieldButton
        icon="calendar-outline"
        label="Starts"
        value={formatDayShort(startDate)}
        onPress={() => setSheet('start')}
      />
      <FieldButton
        icon="flag-outline"
        label="Finish by"
        value={formatDayShort(deadline)}
        onPress={() => setSheet('deadline')}
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

      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSheet(null)} accessibilityLabel="Close calendar" />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{sheet === 'start' ? 'Start date' : 'Finish by'}</Text>
          {sheet === 'start' && (
            <DeadlinePicker
              value={parseYmd(startDate)}
              min={parseYmd(today)}
              onChange={d => onStart(formatYmd(d))}
            />
          )}
          {sheet === 'deadline' && (
            <DeadlinePicker
              value={parseYmd(deadline)}
              min={parseYmd(minDeadline)}
              onChange={d => onDeadline(formatYmd(d))}
            />
          )}
          <TouchableOpacity style={styles.doneBtn} onPress={() => setSheet(null)} accessibilityRole="button">
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

function FieldButton({ icon, label, value, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress(): void;
}) {
  return (
    <TouchableOpacity
      style={styles.field}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Double tap to change`}
    >
      <View style={styles.fieldIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  question: { fontSize: fontSize.xxl, fontFamily: fontFamily.heading, color: colors.text, marginBottom: spacing.md },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    minHeight: 64, padding: spacing.sm, marginBottom: spacing.sm,
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  fieldIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E8F8EF',
  },
  fieldLabel: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary },
  fieldValue: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text, marginTop: 2 },
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: colors.white, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl,
    padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md,
  },
  sheetTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },
  doneBtn: {
    minHeight: 52, borderRadius: borderRadius.md, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  doneText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.white },
});
