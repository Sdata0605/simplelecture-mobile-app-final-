// Dropdown used for the advanced chapter/topic pickers. Moved from StudyTimetableScreen.tsx (142-193).

import { useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontFamily, borderRadius, spacing } from '../../constants/theme';

export interface SelectOption { id: string; name: string }

export default function SimpleSelect({
  label, options, value, onChange, placeholder, loading,
}: {
  label: string;
  options: SelectOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.selectBox}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected ? selected.name : (placeholder ?? 'Select')}`}
      >
        {loading
          ? <ActivityIndicator size="small" color={colors.primary} />
          : <Text style={selected ? styles.selectValue : styles.selectPlaceholder} numberOfLines={1}>
              {selected ? selected.name : (placeholder ?? 'Select…')}
            </Text>
        }
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.selectOverlay} onPress={() => setOpen(false)} activeOpacity={1}>
          <TouchableOpacity style={styles.selectDropdown} activeOpacity={1}>
            <ScrollView
              style={styles.selectDropdownScroll}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              contentContainerStyle={styles.selectDropdownContent}
            >
              <TouchableOpacity style={styles.selectOption} onPress={() => { onChange(null); setOpen(false); }}>
                <Text style={styles.selectOptionText}>— None —</Text>
                {value === null && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
              {options.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.selectOption, value === o.id && styles.selectOptionActive]}
                  onPress={() => { onChange(o.id); setOpen(false); }}
                >
                  <Text style={[styles.selectOptionText, value === o.id && styles.selectOptionTextActive]} numberOfLines={1}>{o.name}</Text>
                  {value === o.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inputLabel: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary, marginBottom: 4, marginTop: 8 },
  selectBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48,
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    padding: spacing.sm, backgroundColor: colors.white, marginBottom: 8,
  },
  selectValue: { flex: 1, fontSize: fontSize.md, color: colors.text, fontFamily: fontFamily.regular },
  selectPlaceholder: { flex: 1, fontSize: fontSize.md, color: colors.textMuted, fontFamily: fontFamily.regular },
  selectOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', paddingHorizontal: 24 },
  selectDropdown: {
    backgroundColor: colors.white, borderRadius: borderRadius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  selectDropdownScroll: { maxHeight: 320 },
  selectDropdownContent: { padding: 6, gap: 4 },
  selectOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    minHeight: 44, paddingVertical: 12, paddingHorizontal: 12, borderRadius: borderRadius.md,
    backgroundColor: colors.white,
  },
  selectOptionActive: { backgroundColor: '#F0FDF4' },
  selectOptionText: { flex: 1, fontSize: fontSize.md, color: colors.text, fontFamily: fontFamily.medium },
  selectOptionTextActive: { color: colors.primary, fontFamily: fontFamily.semiBold },
});
