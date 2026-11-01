import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../constants/theme';

export interface OptionPickerOption<T> {
  value: T;
  label: string;
  sub?: string;
}

interface OptionPickerProps<T> {
  label: string;
  value: T;
  options: readonly OptionPickerOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}

// Generic copy of the SimpleSelect modal pattern used in StudyTimetableScreen.
// Kept local to this feature on purpose (SimpleSelect is not exported).
export default function OptionPicker<T extends string | number>({
  label, value, options, onChange, disabled,
}: OptionPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.box, disabled && styles.boxDisabled]}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? ''}`}
      >
        <View style={styles.boxText}>
          <Text style={selected ? styles.value : styles.placeholder} numberOfLines={1}>
            {selected ? selected.label : 'Select…'}
          </Text>
          {selected?.sub ? <Text style={styles.sub} numberOfLines={1}>{selected.sub}</Text> : null}
        </View>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} onPress={() => setOpen(false)} activeOpacity={1}>
          <TouchableOpacity style={styles.dropdown} activeOpacity={1}>
            <ScrollView
              style={styles.dropdownScroll}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              contentContainerStyle={styles.dropdownContent}
            >
              {options.map(o => {
                const active = o.value === value;
                return (
                  <TouchableOpacity
                    key={String(o.value)}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => { onChange(o.value); setOpen(false); }}
                  >
                    <View style={styles.optionText}>
                      <Text style={[styles.optionLabel, active && styles.optionLabelActive]} numberOfLines={1}>
                        {o.label}
                      </Text>
                      {o.sub ? <Text style={styles.optionSub} numberOfLines={1}>{o.sub}</Text> : null}
                    </View>
                    {active && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.sm },
  label: {
    fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary,
    marginBottom: 4, marginTop: spacing.sm,
  },
  box: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, minHeight: 48, backgroundColor: colors.white,
  },
  boxDisabled: { opacity: 0.5 },
  boxText: { flex: 1, marginRight: spacing.sm },
  value: { fontSize: fontSize.md, color: colors.text, fontFamily: fontFamily.regular },
  placeholder: { fontSize: fontSize.md, color: colors.textMuted, fontFamily: fontFamily.regular },
  sub: { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: fontFamily.regular },

  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', paddingHorizontal: 24,
  },
  dropdown: {
    backgroundColor: colors.white, borderRadius: borderRadius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  dropdownScroll: { maxHeight: 360 },
  dropdownContent: { padding: 6, gap: 4 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: borderRadius.md,
    backgroundColor: colors.white,
  },
  optionActive: { backgroundColor: '#F0FDF4' },
  optionText: { flex: 1 },
  optionLabel: { fontSize: fontSize.md, color: colors.text, fontFamily: fontFamily.medium },
  optionLabelActive: { color: colors.primary, fontFamily: fontFamily.semiBold },
  optionSub: { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: fontFamily.regular, marginTop: 2 },
});
