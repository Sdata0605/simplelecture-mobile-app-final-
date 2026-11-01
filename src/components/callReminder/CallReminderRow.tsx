import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../constants/theme';
import { CallReminder, SARVAM_LANGUAGES } from '../../types/callReminder';

interface CallReminderRowProps {
  reminder: CallReminder;
  onPress(): void;
  onPlay(): void;
  onLongPress?(): void;
}

const REPEAT_LABEL: Record<CallReminder['repeat_rule'], string | null> = {
  none: null,
  daily: 'Daily',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

interface Pill { label: string; text: string; bg: string }

function statusPill(r: CallReminder): Pill {
  if (r.status === 'missed') return { label: 'Missed', text: colors.warning, bg: '#FEF3C7' };
  if (r.status === 'answered') return { label: 'Answered', text: colors.success, bg: '#D1FAE5' };
  if (r.status === 'declined') return { label: 'Declined', text: colors.textMuted, bg: colors.gray100 };
  if (r.status === 'cancelled') return { label: 'Cancelled', text: colors.textMuted, bg: colors.gray100 };
  if (r.call_enabled && r.audio_status === 'failed') {
    return { label: 'Voice failed', text: colors.error, bg: '#FEE2E2' };
  }
  return { label: 'Scheduled', text: colors.primary, bg: '#E8F8EF' };
}

export default function CallReminderRow({ reminder, onPress, onPlay, onLongPress }: CallReminderRowProps) {
  const pill = statusPill(reminder);
  const repeat = REPEAT_LABEL[reminder.repeat_rule];
  const langLabel = reminder.call_enabled
    ? SARVAM_LANGUAGES.find(l => l.value === reminder.language)?.label
    : undefined;
  const subParts = [formatWhen(reminder.scheduled_at), repeat, langLabel].filter(Boolean);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${reminder.title}, ${subParts.join(', ')}, ${pill.label}`}
    >
      <View style={styles.iconCircle}>
        <Ionicons
          name={reminder.call_enabled ? 'call' : 'notifications-outline'}
          size={20}
          color={colors.primary}
        />
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{reminder.title}</Text>
        <Text style={styles.sub} numberOfLines={1}>{subParts.join(' · ')}</Text>
      </View>

      <View style={[styles.pill, { backgroundColor: pill.bg }]}>
        <Text style={[styles.pillText, { color: pill.text }]}>{pill.label}</Text>
      </View>

      {reminder.call_enabled && (
        <TouchableOpacity
          onPress={onPlay}
          style={styles.playBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Play message"
        >
          <Ionicons name="play" size={16} color={colors.primary} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8F8EF',
    alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1 },
  title: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },
  sub: { fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },
  pill: {
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full,
  },
  pillText: { fontSize: fontSize.xs, fontFamily: fontFamily.semiBold },
  playBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#E8F8EF',
    alignItems: 'center', justifyContent: 'center',
  },
});
