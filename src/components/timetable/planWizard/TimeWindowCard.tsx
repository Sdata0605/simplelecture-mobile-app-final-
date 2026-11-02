import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, fontSize, fontFamily } from '../../../constants/theme';
import {
  PRESETS, WINDOW_LABEL, formatRange12, presetIdFor,
  type TimeWindow, type WindowKey,
} from './timePresets';
import TimeRangeField from './TimeRangeField';

// One Morning / Afternoon / Evening card: an on/off row, preset chips and a Custom chip.
// Spec: _scratch/timetable-ux-plan.md D.4. No text inputs.

const META: Record<WindowKey, { icon: keyof typeof Ionicons.glyphMap; subtitle: string }> = {
  morning: { icon: 'sunny-outline', subtitle: 'e.g. before school' },
  afternoon: { icon: 'partly-sunny-outline', subtitle: 'e.g. after school' },
  evening: { icon: 'moon-outline', subtitle: 'e.g. after dinner' },
};

interface TimeWindowCardProps {
  windowKey: WindowKey;
  value: TimeWindow;
  error?: string | null;
  onChange(patch: Partial<TimeWindow>): void;
}

export default function TimeWindowCard({ windowKey, value, error, onChange }: TimeWindowCardProps) {
  const title = WINDOW_LABEL[windowKey];
  const meta = META[windowKey];
  // Custom stays open after the student taps it, even while the times still match a preset.
  const [customOpen, setCustomOpen] = useState(value.presetId === null);
  const rangeLabel = formatRange12(value.start, value.end) ?? `${value.start} to ${value.end}`;

  function toggle() {
    onChange({ enabled: !value.enabled });
  }

  function pickPreset(id: string, start: string, end: string) {
    setCustomOpen(false);
    onChange({ enabled: true, start, end, presetId: id });
  }

  function pickCustom() {
    setCustomOpen(true);
    onChange({ enabled: true, presetId: null });
  }

  function changeRange(start: string, end: string) {
    onChange({ start, end, presetId: presetIdFor(windowKey, start, end) });
  }

  return (
    <View style={[styles.card, !value.enabled && styles.cardOff]}>
      <Pressable
        style={styles.header}
        onPress={toggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: value.enabled }}
        accessibilityLabel={`${title} study time, ${value.enabled ? 'on' : 'off'}`}
      >
        <View style={[styles.iconCircle, value.enabled && styles.iconCircleOn]}>
          <Ionicons name={meta.icon} size={22} color={value.enabled ? colors.primaryDark : colors.textSecondary} />
        </View>
        <View style={styles.titleCol}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{meta.subtitle}</Text>
        </View>
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <Switch
            value={value.enabled}
            onValueChange={() => undefined}
            trackColor={{ false: colors.gray300, true: colors.primary }}
            thumbColor={colors.white}
          />
        </View>
      </Pressable>

      {value.enabled ? (
        <View style={styles.body}>
          <View style={styles.chips}>
            {PRESETS[windowKey].map(p => {
              const selected = !customOpen && value.presetId === p.id;
              const label = formatRange12(p.start, p.end) ?? `${p.start} to ${p.end}`;
              return (
                <Chip
                  key={p.id}
                  label={label}
                  selected={selected}
                  accessibilityLabel={`${title} study time ${label}`}
                  onPress={() => pickPreset(p.id, p.start, p.end)}
                />
              );
            })}
            <Chip
              label="Custom"
              selected={customOpen}
              accessibilityLabel={`${title} study time, custom`}
              onPress={pickCustom}
            />
          </View>
          {customOpen ? (
            <TimeRangeField start={value.start} end={value.end} onChange={changeRange} />
          ) : (
            <Text style={styles.current}>{rangeLabel}</Text>
          )}
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Chip({ label, selected, accessibilityLabel, onPress }: {
  label: string;
  selected: boolean;
  accessibilityLabel: string;
  onPress(): void;
}) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipOn]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
    >
      {selected ? <Ionicons name="checkmark" size={14} color={colors.primaryDark} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white, padding: spacing.md, gap: spacing.sm,
  },
  cardOff: { backgroundColor: colors.gray50 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: spacing.sm },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.gray100,
  },
  iconCircleOn: { backgroundColor: '#F0FDF4' },
  titleCol: { flex: 1 },
  title: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },
  subtitle: { fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.textSecondary },
  body: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexGrow: 1, flexBasis: '30%', minHeight: 48, borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingHorizontal: spacing.sm,
  },
  chipOn: { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: '#F0FDF4' },
  chipText: { fontSize: fontSize.md, fontFamily: fontFamily.medium, color: colors.text, textAlign: 'center' },
  chipTextOn: { color: colors.primaryDark, fontFamily: fontFamily.semiBold },
  current: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  errorText: { flex: 1, fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.error },
});
