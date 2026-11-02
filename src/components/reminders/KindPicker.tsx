import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReminderKind } from '../../types/reminder';
import { colors, spacing, fontSize, fontFamily } from '../../constants/theme';
import { KIND_STYLE } from './palette';

// Spec: _scratch/reminders-v2-plan.md E.4 (KindPicker). Three equal tiles: Call, Message, Notification.

const KINDS: ReadonlyArray<{ value: ReminderKind; sub: string }> = [
  { value: 'call', sub: 'Rings + AI voice' },
  { value: 'message', sub: 'Text message' },
  { value: 'notification', sub: 'Quiet alert' },
];

interface KindPickerProps {
  value: ReminderKind;
  onChange: (kind: ReminderKind) => void;
  disabled?: boolean;
}

export default function KindPicker({ value, onChange, disabled }: KindPickerProps) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {KINDS.map(k => {
        const style = KIND_STYLE[k.value];
        const selected = k.value === value;
        return (
          <TouchableOpacity
            key={k.value}
            style={[
              styles.tile,
              selected && { borderColor: style.fg, backgroundColor: style.bg },
              disabled && styles.disabled,
            ]}
            onPress={() => onChange(k.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: !!disabled }}
            accessibilityLabel={`${style.label}. ${k.sub}`}
          >
            {selected ? (
              <View style={[styles.check, { backgroundColor: style.fg }]}>
                <Ionicons name="checkmark" size={12} color={colors.white} />
              </View>
            ) : null}
            <Ionicons
              name={style.icon as keyof typeof Ionicons.glyphMap}
              size={24}
              color={selected ? style.fg : colors.textSecondary}
            />
            <Text style={styles.label} numberOfLines={1}>{style.label}</Text>
            <Text style={styles.sub} numberOfLines={2}>{k.sub}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1, height: 96, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xs, gap: 4,
  },
  disabled: { opacity: 0.5 },
  check: {
    position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: fontSize.lg - 2, fontFamily: fontFamily.semiBold, color: colors.text },
  sub: {
    fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.textSecondary,
    textAlign: 'center',
  },
});
