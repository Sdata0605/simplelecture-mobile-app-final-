// Month grid date picker. Moved from StudyTimetableScreen.tsx (1150-1204), API unchanged.
// Weekday letters use fontSize.sm (the old fontSize.xs was too small to read).

import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontFamily, borderRadius, spacing } from '../../constants/theme';
import { buildCalendarGrid, datePrefixForDay } from '../../utils/calendar';
import { formatYmd } from './planWizard/state';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export default function DeadlinePicker({ value, min, onChange }: {
  value: Date;
  min: Date;
  onChange: (d: Date) => void;
}) {
  const [vYear, setVYear] = useState(value.getFullYear());
  const [vMonth, setVMonth] = useState(value.getMonth());
  const grid = buildCalendarGrid(vYear, vMonth);
  const minKey = formatYmd(startOfDay(min));
  const valueKey = formatYmd(value);

  function prev() { if (vMonth === 0) { setVYear(y => y - 1); setVMonth(11); } else setVMonth(m => m - 1); }
  function next() { if (vMonth === 11) { setVYear(y => y + 1); setVMonth(0); } else setVMonth(m => m + 1); }

  return (
    <View style={styles.dpCard}>
      <View style={styles.dpHeader}>
        <TouchableOpacity onPress={prev} style={styles.dpNavBtn} accessibilityRole="button" accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.dpMonthTitle}>{MONTH_NAMES[vMonth]} {vYear}</Text>
        <TouchableOpacity onPress={next} style={styles.dpNavBtn} accessibilityRole="button" accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.dpWeekRow}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={styles.dpWeekLabel}>{d}</Text>
        ))}
      </View>
      <View style={styles.dpGrid}>
        {grid.map((day, idx) => {
          if (day === null) return <View key={idx} style={styles.dpCell} />;
          const key = datePrefixForDay(vYear, vMonth, day);
          const disabled = key < minKey;
          const selected = key === valueKey;
          return (
            <TouchableOpacity
              key={idx}
              style={[styles.dpCell, selected && styles.dpCellSelected, disabled && styles.dpCellDisabled]}
              disabled={disabled}
              onPress={() => onChange(new Date(vYear, vMonth, day))}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${day} ${MONTH_NAMES[vMonth]} ${vYear}`}
            >
              <Text style={[
                styles.dpCellText,
                selected && styles.dpCellTextSelected,
                disabled && styles.dpCellTextDisabled,
              ]}>{day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dpCard: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg,
    padding: spacing.sm, backgroundColor: colors.white,
  },
  dpHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  dpNavBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray100 },
  dpMonthTitle: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.text },
  dpWeekRow: { flexDirection: 'row', marginBottom: 4 },
  dpWeekLabel: { width: `${100 / 7}%`, textAlign: 'center', fontSize: fontSize.sm, color: colors.textMuted, fontFamily: fontFamily.medium },
  dpGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dpCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.sm },
  dpCellSelected: { backgroundColor: colors.primary },
  dpCellDisabled: { opacity: 0.3 },
  dpCellText: { fontSize: fontSize.sm, color: colors.text, fontFamily: fontFamily.regular },
  dpCellTextSelected: { color: colors.white, fontFamily: fontFamily.semiBold },
  dpCellTextDisabled: { color: colors.textMuted },
});
