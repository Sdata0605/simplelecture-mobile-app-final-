// A tappable time field (48 px tall). Shows the value in the phone's clock style and opens TimePickerSheet.
// Value and onChange use 'HH:MM' 24-hour strings, so callers never handle 12-hour text.

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, fontSize, fontFamily } from '../../constants/theme';
import { useClockFormat } from '../../hooks/useClockFormat';
import { formatTime, parseHHMM } from '../../utils/timeOfDay';
import TimePickerSheet from './TimePickerSheet';

export interface TimeFieldProps {
  label: string;
  /** 'HH:MM' 24-hour. */
  value: string;
  onChange(v: string): void;
  disabled?: boolean;
  error?: string | null;
  sheetTitle?: string;
  testID?: string;
}

export default function TimeField({ label, value, onChange, disabled, error, sheetTitle, testID }: TimeFieldProps) {
  const clock = useClockFormat();
  const [open, setOpen] = useState(false);
  const min = parseHHMM(value);
  const shown = min === null ? value : formatTime(min, clock);

  return (
    <View>
      <Pressable
        style={[styles.field, disabled && styles.disabled, error ? styles.fieldError : null]}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${shown}`}
        accessibilityHint="Opens a time picker"
        testID={testID}
      >
        <Text style={styles.label}>{label}</Text>
        <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.value} numberOfLines={1}>{shown}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TimePickerSheet
        visible={open}
        title={sheetTitle ?? `${label} time`}
        value={value}
        clock={clock}
        onConfirm={v => {
          setOpen(false);
          onChange(v);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 48, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm,
  },
  fieldError: { borderColor: colors.error },
  disabled: { opacity: 0.5 },
  label: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary },
  value: { flex: 1, fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },
  error: { marginTop: spacing.xs, fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.error },
});
