import { View, Text, StyleSheet, TouchableOpacity, PixelRatio } from 'react-native';
import type { ReminderMode } from '../../types/reminder';
import { colors, spacing, borderRadius, fontFamily } from '../../constants/theme';

// Spec: _scratch/reminders-v2-plan.md E.4 (RepeatPicker). Segmented control; on large font scales
// (over 1.3) it becomes a vertical radio list so the labels never truncate.

interface RepeatPickerProps {
  value: ReminderMode;
  onChange: (mode: ReminderMode) => void;
  /** 'Today only' or 'Tomorrow only', from todayOnlyLabel() in schedule.ts. */
  todayLabel: 'Today only' | 'Tomorrow only';
  disabled?: boolean;
}

export default function RepeatPicker({ value, onChange, todayLabel, disabled }: RepeatPickerProps) {
  const options: ReadonlyArray<{ value: ReminderMode; label: string }> = [
    { value: 'once', label: 'Once on a date' },
    { value: 'today_only', label: todayLabel },
    { value: 'daily', label: 'Every day' },
  ];
  const vertical = PixelRatio.getFontScale() > 1.3;

  return (
    <View
      style={[styles.container, vertical && styles.containerVertical, disabled && styles.disabled]}
      accessibilityRole="radiogroup"
    >
      {options.map(o => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[
              styles.segment,
              vertical && styles.segmentVertical,
              active && styles.segmentActive,
            ]}
            onPress={() => onChange(o.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, disabled: !!disabled }}
            accessibilityLabel={o.label}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={vertical ? 2 : 1}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', minHeight: 52, borderRadius: borderRadius.full,
    backgroundColor: colors.gray100, padding: 4,
  },
  containerVertical: { height: undefined, flexDirection: 'column', gap: spacing.xs },
  disabled: { opacity: 0.5 },
  segment: {
    flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.full,
  },
  segmentVertical: { flex: 0, minHeight: 44, paddingHorizontal: spacing.md, alignItems: 'flex-start' },
  segmentActive: {
    backgroundColor: colors.white,
    shadowColor: '#1F2937', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  label: { fontSize: 12, fontFamily: fontFamily.medium, color: colors.textSecondary },
  labelActive: { color: colors.primary, fontFamily: fontFamily.semiBold },
});
