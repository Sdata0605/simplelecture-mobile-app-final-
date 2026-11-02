// Step 5 of 5 · Review (plan D.6). One recap card with Edit links that jump back to a
// step, the automatic feasibility verdict, and collapsed extra options.

import { Dispatch, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontFamily, borderRadius, spacing } from '../../../constants/theme';
import {
  PatternId, REMINDER_LABEL, StepId, WizardAction, WizardState,
  estimateDailyHours, formatDayMonth,
} from './state';

export interface Feasibility { verdict?: string; message?: string }

const PATTERNS: [PatternId, string][] = [
  ['sequential', 'Sequential'],
  ['pair', 'Pair'],
  ['mixed', 'Mixed'],
];

export default function StepReview({
  state, dispatch, courseName, scopeLabel, contentSummary, feasibility, checking, onRecheck, onEdit,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  courseName: string;
  scopeLabel: string;
  contentSummary: string;
  feasibility: Feasibility | null;
  checking: boolean;
  onRecheck(): void;
  onEdit(step: StepId): void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const verdict = feasibility?.verdict;
  const tooShort = verdict === 'too_short';
  const generous = verdict === 'generous';
  const verdictColor = tooShort ? colors.error : generous ? '#2563EB' : colors.success;
  const verdictBg = tooShort ? '#FEF2F2' : generous ? '#EFF6FF' : '#ECFDF5';
  const verdictIcon: keyof typeof Ionicons.glyphMap = tooShort ? 'close-circle' : generous ? 'time' : 'checkmark-circle';
  const verdictTitle = tooShort ? 'Too tight' : generous ? 'Plenty of time' : 'Looks good';

  const rows: { key: string; value: string; step: StepId }[] = [
    { key: 'Course', value: courseName || 'Course', step: 'scope' },
    { key: 'Subjects', value: scopeLabel, step: 'scope' },
    { key: 'Dates', value: `${formatDayMonth(state.startDate)} – ${formatDayMonth(state.deadline)}`, step: 'dates' },
    { key: 'Daily', value: `~${estimateDailyHours(state)} h a day`, step: 'times' },
  ];
  if (state.steps.includes('reminder')) {
    rows.push({ key: 'Reminders', value: REMINDER_LABEL[state.reminder], step: 'reminder' });
  }

  return (
    <View>
      <Text style={styles.question} accessibilityRole="header">Review your plan</Text>

      <View style={styles.card}>
        {rows.map(r => (
          <View key={r.key} style={styles.row}>
            <Text style={styles.rowKey}>{r.key}</Text>
            <Text style={styles.rowValue} numberOfLines={3}>{r.value}</Text>
            <TouchableOpacity
              onPress={() => onEdit(r.step)}
              style={styles.editBtn}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${r.key.toLowerCase()}`}
            >
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <Text style={styles.contentLine}>{contentSummary}</Text>

      <View style={[styles.verdict, { backgroundColor: verdictBg, borderColor: verdictColor }]}>
        {checking ? (
          <View style={styles.verdictRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.verdictMsg}>Checking your plan…</Text>
          </View>
        ) : feasibility ? (
          <>
            <View style={styles.verdictRow}>
              <Ionicons name={verdictIcon} size={20} color={verdictColor} />
              <Text style={[styles.verdictTitle, { color: verdictColor }]}>{verdictTitle}</Text>
            </View>
            {feasibility.message ? <Text style={styles.verdictMsg}>{feasibility.message}</Text> : null}
            {tooShort && (
              <View style={styles.fixRow}>
                <TouchableOpacity style={styles.fixBtn} onPress={() => onEdit('times')} accessibilityRole="button">
                  <Text style={styles.fixText}>Edit times</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.fixBtn} onPress={() => onEdit('dates')} accessibilityRole="button">
                  <Text style={styles.fixText}>Edit dates</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : null}
        {!checking && (
          <TouchableOpacity style={styles.recheck} onPress={onRecheck} accessibilityRole="button" accessibilityLabel="Check the plan again">
            <Ionicons name="refresh" size={16} color={colors.primary} />
            <Text style={styles.recheckText}>Check again</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.moreToggle}
        onPress={() => setMoreOpen(o => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: moreOpen }}
        accessibilityLabel="More options"
      >
        <Ionicons name={moreOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.primary} />
        <Text style={styles.moreText}>More options</Text>
      </TouchableOpacity>

      {moreOpen && (
        <View>
          <Text style={styles.label}>Ordering</Text>
          <View style={styles.patternRow}>
            {PATTERNS.map(([p, label]) => {
              const on = state.pattern === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.pattern, on && styles.patternOn]}
                  onPress={() => dispatch({ type: 'setPattern', value: p })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.patternText, on && styles.patternTextOn]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Preferences (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Lighter load on Fridays, focus on weak chapters…"
            placeholderTextColor={colors.textMuted}
            value={state.feedbackMessage}
            onChangeText={text => dispatch({ type: 'setFeedback', text })}
            multiline
            accessibilityLabel="Preferences, optional"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  question: { fontSize: fontSize.xxl, fontFamily: fontFamily.heading, color: colors.text, marginBottom: spacing.md },
  card: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg,
    backgroundColor: colors.gray50, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowKey: { width: 84, fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.medium },
  rowValue: { flex: 1, fontSize: fontSize.md, color: colors.text, fontFamily: fontFamily.semiBold },
  editBtn: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  editText: { fontSize: fontSize.sm, color: colors.primary, fontFamily: fontFamily.semiBold },
  contentLine: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.medium, marginTop: spacing.sm },
  verdict: { borderWidth: 1.5, borderRadius: borderRadius.md, padding: spacing.md, gap: 6, marginTop: spacing.md },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  verdictTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold },
  verdictMsg: { fontSize: fontSize.sm, color: colors.text, fontFamily: fontFamily.regular },
  fixRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  fixBtn: {
    minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center',
    borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.white,
  },
  fixText: { fontSize: fontSize.sm, color: colors.error, fontFamily: fontFamily.semiBold },
  recheck: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44 },
  recheckText: { fontSize: fontSize.sm, color: colors.primary, fontFamily: fontFamily.semiBold },
  moreToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, marginTop: spacing.md },
  moreText: { fontSize: fontSize.md, color: colors.primary, fontFamily: fontFamily.semiBold },
  label: { fontSize: fontSize.sm, fontFamily: fontFamily.semiBold, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 6 },
  patternRow: { flexDirection: 'row', gap: spacing.sm },
  pattern: {
    flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  patternOn: { borderColor: colors.primary, backgroundColor: '#F0FDF4' },
  patternText: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.medium },
  patternTextOn: { color: colors.primary, fontFamily: fontFamily.semiBold },
  input: {
    minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    padding: spacing.sm, fontSize: fontSize.md, fontFamily: fontFamily.regular, color: colors.text,
    backgroundColor: colors.white, textAlignVertical: 'top',
  },
});
