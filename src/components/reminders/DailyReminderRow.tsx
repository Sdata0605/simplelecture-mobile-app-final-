// One row of the Daily tab: time chip, text, on/off switch. Spec: _scratch/reminders-v2-plan.md E.3 (DailyReminderRow).
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../constants/theme';
import type { Reminder } from '../../types/reminder';
import { formatTime12, parseTime } from '../../services/reminders/schedule';
import { localDateKey } from '../../utils/calendar';
import { KIND_STYLE } from './palette';
import { AudioState, PlannedState, StateChip, chipFor, formatClock, kindLabel } from './ReminderCard';

export interface DailyReminderRowProps {
  reminder: Reminder;
  fireAt: Date | null;
  state: PlannedState;
  audio: AudioState;
  onToggle(enabled: boolean): void;
  onPress(): void;
  onMore(): void;
  busy?: boolean;
}

function dailyMeta(reminder: Reminder, fireAt: Date | null): string {
  if (reminder.status === 'missed') return 'Missed';
  if (reminder.status === 'declined') return 'Declined';
  if (reminder.status === 'answered' || reminder.status === 'delivered') return 'Done';
  if (reminder.repeat_rule === 'daily') return 'Every day';
  if (fireAt && localDateKey(fireAt.toISOString()) !== localDateKey(new Date().toISOString())) {
    return 'Tomorrow only';
  }
  return 'Today only';
}

export default function DailyReminderRow({
  reminder,
  fireAt,
  state,
  audio,
  onToggle,
  onPress,
  onMore,
  busy,
}: DailyReminderRowProps) {
  const style = KIND_STYLE[reminder.kind];
  const hm = parseTime(reminder.time_of_day);
  const clock = hm
    ? formatTime12(hm.hour, hm.minute)
    : formatClock(fireAt ?? new Date(reminder.scheduled_at));
  const paused = !reminder.enabled || state === 'paused';
  const isDone = state === 'done' || reminder.status === 'answered' || reminder.status === 'delivered';
  const isMissedOrDeclined = reminder.status === 'missed' || reminder.status === 'declined';
  const text = reminder.message_text.trim();
  const chip = !isDone && !isMissedOrDeclined && !paused
    ? chipFor(reminder, state, audio, false)
    : null;
  const meta = `${kindLabel(reminder.kind)} · ${dailyMeta(reminder, fireAt)}`;
  const toggleLabel = `${text.split('\n')[0].slice(0, 60)} at ${clock}, ${
    reminder.repeat_rule === 'daily' ? 'every day' : 'once'
  }, ${paused ? 'off' : 'on'}`;

  return (
    <View style={[styles.row, paused && { opacity: 0.85 }]}>
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onMore}
        activeOpacity={0.7}
        style={styles.pressArea}
        accessibilityRole="button"
        accessibilityLabel={`${toggleLabel}. Double tap to edit.`}
        accessibilityActions={[
          { name: 'toggle', label: reminder.enabled ? 'Turn off' : 'Turn on' },
          { name: 'delete', label: 'Delete reminder' },
          { name: 'more', label: 'More options' },
        ]}
        onAccessibilityAction={(e) => {
          switch (e.nativeEvent.actionName) {
            case 'toggle':
              if (!isDone && !busy) onToggle(!reminder.enabled);
              break;
            case 'delete':
            case 'more':
              onMore();
              break;
          }
        }}
      >
        <View
          style={[
            styles.chip,
            { backgroundColor: paused ? colors.gray100 : style.bg, minWidth: 84 },
          ]}
        >
          <Text
            style={[styles.chipText, { color: paused ? colors.textMuted : style.fg }]}
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
          >
            {clock}
          </Text>
        </View>

        <View style={styles.middle}>
          <Text style={styles.text} numberOfLines={1} maxFontSizeMultiplier={1.6}>{text}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta} maxFontSizeMultiplier={1.3} numberOfLines={1}>{meta}</Text>
            {chip ? <StateChip spec={chip} /> : null}
          </View>
        </View>
      </TouchableOpacity>

      {isDone ? (
        <Ionicons name="checkmark-circle" size={20} color={colors.success} accessibilityLabel="Done" />
      ) : (
        <Switch
          value={reminder.enabled}
          onValueChange={onToggle}
          disabled={busy}
          trackColor={{ true: colors.primaryLight, false: colors.gray300 }}
          thumbColor={reminder.enabled ? colors.primary : colors.white}
          accessibilityLabel={toggleLabel}
          accessibilityRole="switch"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    minHeight: 72,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  pressArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  chip: {
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  chipText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
  },
  middle: {
    flex: 1,
    gap: 2,
  },
  text: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 2,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
});
