import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';
import { TINT } from '../reminders/palette';

export interface DurationFieldProps {
  value: number;
  onChange: (minutes: number) => void;
  /** Smallest allowed value. Default 5. */
  min?: number;
  /** Largest allowed value. Default 240. */
  max?: number;
  /** Quick-pick chips. Default 15, 30, 45, 60, 90. */
  chips?: number[];
  disabled?: boolean;
  testID?: string;
}

const STEP = 5;
const DEFAULT_CHIPS = [15, 30, 45, 60, 90];

/** Minus / plus step by 5, the centre number is typable (any whole minute), and chips jump to common lengths. */
export function DurationField({
  value,
  onChange,
  min = 5,
  max = 240,
  chips = DEFAULT_CHIPS,
  disabled = false,
  testID,
}: DurationFieldProps) {
  const [text, setText] = useState(String(value));

  // Keep the typed text in step when the value changes from outside (chips, plus/minus).
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const atMin = value <= min;
  const atMax = value >= max;

  const handleTextChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 3);
    setText(digits);
    if (digits.length > 0) onChange(Number(digits));
  };

  const handleBlur = () => {
    if (text.length === 0) setText(String(value));
  };

  return (
    <View testID={testID}>
      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={[styles.stepButton, (disabled || atMin) && styles.stepDisabled]}
          onPress={() => onChange(clamp(value - STEP))}
          disabled={disabled || atMin}
          accessibilityRole="button"
          accessibilityLabel={`Decrease duration by ${STEP} minutes`}
          accessibilityState={{ disabled: disabled || atMin }}
        >
          <Text style={styles.stepText}>-</Text>
        </TouchableOpacity>

        <View style={styles.valueBox}>
          <TextInput
            style={styles.valueInput}
            value={text}
            onChangeText={handleTextChange}
            onBlur={handleBlur}
            keyboardType="number-pad"
            maxLength={3}
            selectTextOnFocus
            editable={!disabled}
            accessibilityLabel="Duration in minutes"
          />
          <Text style={styles.unit}>min</Text>
        </View>

        <TouchableOpacity
          style={[styles.stepButton, (disabled || atMax) && styles.stepDisabled]}
          onPress={() => onChange(clamp(value + STEP))}
          disabled={disabled || atMax}
          accessibilityRole="button"
          accessibilityLabel={`Increase duration by ${STEP} minutes`}
          accessibilityState={{ disabled: disabled || atMax }}
        >
          <Text style={styles.stepText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.chipRow}>
        {chips.map(c => {
          const selected = c === value;
          return (
            <TouchableOpacity
              key={c}
              style={[styles.chip, selected && styles.chipSelected, disabled && styles.stepDisabled]}
              onPress={() => onChange(clamp(c))}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${c} minutes`}
              accessibilityState={{ selected, disabled }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{c}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDisabled: {
    opacity: 0.4,
  },
  stepText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xl,
    color: colors.text,
  },
  valueBox: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
  },
  valueInput: {
    minWidth: 48,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  unit: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  chip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: TINT.greenSoft,
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    fontFamily: fontFamily.semiBold,
    color: colors.primaryDark,
  },
});

export default DurationField;
