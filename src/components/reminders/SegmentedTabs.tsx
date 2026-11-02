// Calendar / Daily segmented pill under the header. Spec: _scratch/reminders-v2-plan.md E.2 (item 2).
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../constants/theme';

export type RemindersTab = 'calendar' | 'daily';

export interface SegmentedTabsProps {
  value: RemindersTab;
  onChange(v: RemindersTab): void;
  dailyCount: number;
}

const SEGMENTS: { value: RemindersTab; label: string; icon: 'calendar-outline' | 'alarm-outline' }[] = [
  { value: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
  { value: 'daily', label: 'Daily', icon: 'alarm-outline' },
];

export default function SegmentedTabs({ value, onChange, dailyCount }: SegmentedTabsProps) {
  return (
    <View style={styles.strip}>
      <View style={styles.pill} accessibilityRole="tablist">
        {SEGMENTS.map((seg) => {
          const active = seg.value === value;
          const showBadge = seg.value === 'daily' && dailyCount > 0;
          const label = showBadge ? `${seg.label}, ${dailyCount}` : seg.label;
          return (
            <TouchableOpacity
              key={seg.value}
              onPress={() => onChange(seg.value)}
              style={[styles.segment, active && styles.segmentActive]}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              activeOpacity={0.85}
            >
              <Ionicons
                name={seg.icon}
                size={16}
                color={active ? colors.text : colors.textSecondary}
              />
              <Text
                style={[styles.label, active ? styles.labelActive : styles.labelInactive]}
                maxFontSizeMultiplier={1.6}
              >
                {seg.label}
              </Text>
              {showBadge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} maxFontSizeMultiplier={1.3}>{dailyCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pill: {
    minHeight: 52,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray100,
    padding: 4,
    flexDirection: 'row',
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  segmentActive: {
    backgroundColor: colors.white,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  label: {
    fontSize: fontSize.md,
  },
  labelActive: {
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },
  labelInactive: {
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    color: colors.white,
  },
});
