// Entry row on the Timetable screen, under the plans strip (WP4). Opens Reminder settings.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';
import { KIND_STYLE, EMAIL_STYLE } from '../reminders/palette';
import { CHANNEL_LABEL, type PlanChannelSummary } from '../../services/timetableReminders';

interface PlanReminderRowProps {
  planTitle: string;
  summary: PlanChannelSummary;
  onPress(): void;
}

function iconFor(summary: PlanChannelSummary): { icon: 'call' | 'chatbubble-ellipses' | 'notifications' | 'mail' | 'notifications-off-outline' | 'shuffle-outline' | 'help-circle-outline'; fg: string; bg: string } {
  if (summary === 'call') return { icon: 'call', fg: KIND_STYLE.call.fg, bg: KIND_STYLE.call.bg };
  if (summary === 'message') return { icon: 'chatbubble-ellipses', fg: KIND_STYLE.message.fg, bg: KIND_STYLE.message.bg };
  if (summary === 'notification') return { icon: 'notifications', fg: KIND_STYLE.notification.fg, bg: KIND_STYLE.notification.bg };
  if (summary === 'email') return { icon: 'mail', fg: EMAIL_STYLE.fg, bg: EMAIL_STYLE.bg };
  if (summary === 'none') return { icon: 'notifications-off-outline', fg: colors.textSecondary, bg: colors.gray100 };
  if (summary === 'mixed') return { icon: 'shuffle-outline', fg: colors.textSecondary, bg: colors.gray100 };
  return { icon: 'help-circle-outline', fg: colors.textSecondary, bg: colors.gray100 };
}

export default function PlanReminderRow({ planTitle, summary, onPress }: PlanReminderRowProps) {
  const valueText = summary === null ? 'Not set' : CHANNEL_LABEL[summary];
  const ic = iconFor(summary);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Reminders for ${planTitle}: ${valueText}. Double tap to change.`}
    >
      <View style={[styles.iconCircle, { backgroundColor: ic.bg }]}>
        <Ionicons name={ic.icon} size={20} color={ic.fg} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.label} maxFontSizeMultiplier={1.6}>Reminders</Text>
        <Text style={styles.value} numberOfLines={1} maxFontSizeMultiplier={1.6}>
          {valueText}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: { backgroundColor: colors.gray50 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  textCol: { flex: 1 },
  label: { fontSize: fontSize.md, fontFamily: fontFamily.medium, color: colors.textSecondary },
  value: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.text },
});
