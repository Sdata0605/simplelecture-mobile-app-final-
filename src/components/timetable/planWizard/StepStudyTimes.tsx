import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, fontSize, fontFamily } from '../../../constants/theme';
import TimeWindowCard from './TimeWindowCard';
import {
  WINDOW_KEYS, dayMinutes, formatHours, hasWeekdayStudyTime, validateDay, weeklyMinutes,
  type DayWindows, type TimeWindow, type WeekendMode, type WindowKey,
} from './timePresets';

// Step 3 of 5: "When can you study?" Spec: _scratch/timetable-ux-plan.md D.4. No text inputs.
// Props use the contract shape from E.4, so WP1's WizardState and dispatch fit without changes.

export interface StudyTimesState {
  weekday: DayWindows;
  weekendMode: WeekendMode;
  saturday: DayWindows;
  sunday: DayWindows;
}

export type StudyTimesAction =
  | { type: 'setWindow'; day: 'weekday' | 'saturday' | 'sunday'; key: WindowKey; patch: Partial<TimeWindow> }
  | { type: 'setWeekendMode'; mode: WeekendMode };

interface StepStudyTimesProps {
  state: StudyTimesState;
  dispatch: (action: StudyTimesAction) => void;
}

const WEEKEND_OPTIONS: { value: WeekendMode; label: string }[] = [
  { value: 'same', label: 'Same as weekdays' },
  { value: 'different', label: 'Different' },
  { value: 'rest', label: 'Rest day' },
];

const DAY_OPTIONS: { value: 'saturday' | 'sunday'; label: string }[] = [
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

export default function StepStudyTimes({ state, dispatch }: StepStudyTimesProps) {
  const [weekendDay, setWeekendDay] = useState<'saturday' | 'sunday'>('saturday');

  const weekdayErrors = validateDay(state.weekday);
  const weekdayOk = hasWeekdayStudyTime(state.weekday);
  const perDay = dayMinutes(state.weekday);
  const perWeek = weeklyMinutes(state);

  function setWindow(day: 'weekday' | 'saturday' | 'sunday', key: WindowKey, patch: Partial<TimeWindow>) {
    dispatch({ type: 'setWindow', day, key, patch });
  }

  const weekendDayWindows = weekendDay === 'saturday' ? state.saturday : state.sunday;
  const weekendDayErrors = validateDay(weekendDayWindows);

  return (
    <View style={styles.wrap}>
      <Text style={styles.question} accessibilityRole="header">When can you study?</Text>

      <Text style={styles.section}>Monday to Friday</Text>
      <View style={styles.cards}>
        {WINDOW_KEYS.map(key => (
          <TimeWindowCard
            key={key}
            windowKey={key}
            value={state.weekday[key]}
            error={weekdayErrors[key]}
            onChange={patch => setWindow('weekday', key, patch)}
          />
        ))}
      </View>
      {!weekdayOk ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>Turn on at least one study time on weekdays</Text>
        </View>
      ) : null}

      <Text style={styles.section}>Weekend</Text>
      <Segmented<WeekendMode>
        options={WEEKEND_OPTIONS}
        value={state.weekendMode}
        role="radio"
        groupLabel="Weekend study"
        onChange={mode => dispatch({ type: 'setWeekendMode', mode })}
      />

      {state.weekendMode === 'same' ? (
        <Text style={styles.hint}>Weekend uses your weekday times.</Text>
      ) : null}
      {state.weekendMode === 'rest' ? (
        <Text style={styles.hint}>No study on Saturday or Sunday.</Text>
      ) : null}
      {state.weekendMode === 'different' ? (
        <View style={styles.cards}>
          <Segmented<'saturday' | 'sunday'>
            options={DAY_OPTIONS}
            value={weekendDay}
            role="tab"
            groupLabel="Weekend day"
            onChange={setWeekendDay}
          />
          {WINDOW_KEYS.map(key => (
            <TimeWindowCard
              key={`${weekendDay}-${key}`}
              windowKey={key}
              value={weekendDayWindows[key]}
              error={weekendDayErrors[key]}
              onChange={patch => setWindow(weekendDay, key, patch)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.totalPill} accessibilityLiveRegion="polite">
        <Ionicons name="time-outline" size={16} color={colors.primaryDark} />
        <Text style={styles.totalText}>
          {`${formatHours(perDay)} a day · ${formatHours(perWeek)} a week`}
        </Text>
      </View>
    </View>
  );
}

/** Pill-style segmented control. Same look as SegmentedTabs, written here so that file is not edited. */
function Segmented<T extends string>({ options, value, role, groupLabel, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  role: 'radio' | 'tab';
  groupLabel: string;
  onChange(v: T): void;
}) {
  return (
    <View style={styles.segment} accessibilityLabel={groupLabel}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={[styles.segmentItem, on && styles.segmentItemOn]}
            onPress={() => onChange(o.value)}
            accessibilityRole={role}
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${groupLabel}: ${o.label}`}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  question: { fontSize: fontSize.xxl, fontFamily: fontFamily.heading, color: colors.text, marginBottom: spacing.sm },
  section: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.textSecondary, marginTop: spacing.sm },
  cards: { gap: spacing.sm },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  errorText: { flex: 1, fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.error },
  hint: { fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.textSecondary },
  segment: {
    flexDirection: 'row', backgroundColor: colors.gray100, borderRadius: borderRadius.md, padding: 4, gap: 4,
  },
  segmentItem: {
    flex: 1, minHeight: 44, borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  segmentItemOn: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.primary },
  segmentText: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary, textAlign: 'center' },
  segmentTextOn: { color: colors.primaryDark, fontFamily: fontFamily.semiBold },
  totalPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.xs,
    backgroundColor: '#F0FDF4', borderRadius: borderRadius.full, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, marginTop: spacing.md,
  },
  totalText: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.primaryDark },
});
