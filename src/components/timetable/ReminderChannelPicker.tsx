import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReminderChannel } from '../../types/reminder';
import { colors, spacing, fontSize, fontFamily } from '../../constants/theme';
import { KIND_STYLE, EMAIL_STYLE } from '../reminders/palette';

// How a study session should remind the student. Same look as KindPicker, in a 2 x 2 grid.
// Value null means no reminder.

const CHANNELS: ReadonlyArray<{
  value: ReminderChannel;
  label: string;
  sub: string;
  icon: string;
  fg: string;
  bg: string;
}> = [
  { value: 'call', label: KIND_STYLE.call.label, sub: 'Rings + AI voice', icon: KIND_STYLE.call.icon, fg: KIND_STYLE.call.fg, bg: KIND_STYLE.call.bg },
  { value: 'message', label: 'Text message', sub: 'Message notification', icon: KIND_STYLE.message.icon, fg: KIND_STYLE.message.fg, bg: KIND_STYLE.message.bg },
  { value: 'notification', label: KIND_STYLE.notification.label, sub: 'Quiet alert', icon: KIND_STYLE.notification.icon, fg: KIND_STYLE.notification.fg, bg: KIND_STYLE.notification.bg },
  { value: 'email', label: EMAIL_STYLE.label, sub: 'Sent to your inbox', icon: EMAIL_STYLE.icon, fg: EMAIL_STYLE.fg, bg: EMAIL_STYLE.bg },
];

interface ReminderChannelPickerProps {
  value: ReminderChannel | null;
  onChange: (channel: ReminderChannel | null) => void;
  disabled?: boolean;
}

export default function ReminderChannelPicker({ value, onChange, disabled }: ReminderChannelPickerProps) {
  return (
    <View>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {CHANNELS.map(c => {
          const selected = c.value === value;
          return (
            <TouchableOpacity
              key={c.value}
              style={[
                styles.tile,
                selected && { borderColor: c.fg, backgroundColor: c.bg },
                disabled && styles.disabled,
              ]}
              onPress={() => onChange(c.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !!disabled }}
              accessibilityLabel={`${c.label}. ${c.sub}`}
            >
              {selected ? (
                <View style={[styles.check, { backgroundColor: c.fg }]}>
                  <Ionicons name="checkmark" size={12} color={colors.white} />
                </View>
              ) : null}
              <Ionicons
                name={c.icon as keyof typeof Ionicons.glyphMap}
                size={24}
                color={selected ? c.fg : colors.textSecondary}
              />
              <Text style={styles.label} numberOfLines={1}>{c.label}</Text>
              <Text style={styles.sub} numberOfLines={2}>{c.sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        onPress={() => onChange(null)}
        disabled={disabled}
        style={styles.noneBtn}
        accessibilityRole="radio"
        accessibilityState={{ checked: value === null, disabled: !!disabled }}
        accessibilityLabel="No reminder"
      >
        <Text style={[styles.noneText, value === null && styles.noneTextSelected]}>No reminder</Text>
      </TouchableOpacity>

      <Text style={styles.helper}>
        {value === 'message'
          ? "Text message is a notification on this phone. We don't send SMS."
          : value === 'call'
            ? 'Calls ring on this phone at the set time. On iPhone, open the app once a day so the teacher\'s voice is ready.'
            : value === 'email'
              ? 'The email comes from Simple Lecture, so it arrives even when the phone is off.'
              : 'Choose how you want to be reminded for this session.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: '48%',
    height: 84,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    gap: 2,
  },
  disabled: { opacity: 0.5 },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },
  sub: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  noneBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  noneText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.medium,
    color: colors.textMuted,
  },
  noneTextSelected: {
    color: colors.text,
    textDecorationLine: 'underline',
  },
  helper: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
