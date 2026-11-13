import React from 'react';
import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';

export type FilterKey = 'all' | 'correct' | 'wrong' | 'unanswered';

export interface FilterCounts {
  all: number;
  correct: number;
  wrong: number;
  unanswered: number;
}

interface FilterChipsProps {
  value: FilterKey;
  counts: FilterCounts;
  onChange: (next: FilterKey) => void;
}

const CHIPS: { key: FilterKey; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: colors.primary },
  { key: 'correct', label: 'Correct', color: colors.success },
  { key: 'wrong', label: 'Wrong', color: colors.error },
  { key: 'unanswered', label: 'Unanswered', color: colors.gray500 },
];

export default function FilterChips({ value, counts, onChange }: FilterChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {CHIPS.map((chip) => {
        const active = chip.key === value;
        return (
          <Pressable
            key={chip.key}
            onPress={() => onChange(chip.key)}
            accessibilityRole="button"
            accessibilityLabel={`${chip.label}, ${counts[chip.key]}`}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.chip,
              active
                ? { backgroundColor: chip.color, borderColor: chip.color }
                : { backgroundColor: colors.white, borderColor: colors.border },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.label, { color: active ? colors.white : colors.text }]}>
              {chip.label} ({counts[chip.key]})
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    justifyContent: 'center',
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
  },
});
