// One-off reminder card for the Calendar agenda, plus the shared state chip and clock helpers.
// Spec: _scratch/reminders-v2-plan.md E.2 (ReminderCard) and E.10.
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../constants/theme';
import type { Reminder, ReminderKind } from '../../types/reminder';
import { deviceTimeZone, formatTime12 } from '../../services/reminders/schedule';
import { KIND_STYLE, TINT } from './palette';

export type PlannedState = 'scheduled' | 'queued' | 'no-permission' | 'past' | 'paused' | 'done';
export type AudioState = 'none' | 'preparing' | 'ready' | 'device';

/** Clock time of a Date in the device zone, e.g. "9:30 AM". */
export function formatClock(d: Date): string {
  return formatTime12(d.getHours(), d.getMinutes());
}

/** Clock time of an ISO instant in another IANA zone, e.g. "9:30 AM IST". Null if the zone is unknown to this engine. */
export function formatClockInZone(iso: string, tz: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).formatToParts(new Date(iso));
    const time = parts.filter((p) => p.type !== 'timeZoneName').map((p) => p.value).join('').trim();
    const zone = parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
    return `${time.replace(/\s+/g, ' ')} ${zone}`;
  } catch {
    return null;
  }
}

export function kindLabel(kind: ReminderKind): string {
  return KIND_STYLE[kind].label;
}

export interface ChipSpec {
  label: string;
  bg: string;
  fg: string;
  icon?: 'cloud-offline-outline';
  spinner?: boolean;
}

/** The single state chip for a reminder, by priority. Null when there is nothing to say. */
export function chipFor(
  reminder: Reminder,
  state: PlannedState,
  audio: AudioState,
  offlinePending: boolean,
): ChipSpec | null {
  if (state === 'no-permission') return { label: "Won't ring", bg: TINT.redBg, fg: TINT.redText };
  if (reminder.status === 'missed') return { label: 'Missed', bg: TINT.amberBg, fg: TINT.amberText };
  if (state === 'queued') return { label: 'Queued', bg: colors.gray100, fg: colors.textSecondary };
  if (offlinePending) {
    return { label: 'Offline, will sync', bg: colors.gray100, fg: colors.textSecondary, icon: 'cloud-offline-outline' };
  }
  if (reminder.kind === 'call') {
    if (audio === 'preparing') return { label: 'Preparing voice', bg: colors.gray100, fg: colors.textSecondary, spinner: true };
    if (audio === 'device') return { label: 'Device voice', bg: TINT.amberBg, fg: TINT.amberText };
    if (audio === 'ready') return { label: 'Voice ready', bg: TINT.successBg, fg: colors.success };
  }
  if (reminder.status === 'answered' || reminder.status === 'delivered') {
    return { label: 'Done', bg: TINT.successBg, fg: colors.success };
  }
  if (reminder.status === 'declined') return { label: 'Declined', bg: colors.gray100, fg: colors.textMuted };
  return null;
}

export function StateChip({ spec }: { spec: ChipSpec }) {
  return (
    <View style={[chipStyles.chip, { backgroundColor: spec.bg }]}>
      {spec.spinner ? <ActivityIndicator size={10} color={spec.fg} /> : null}
      {spec.icon ? <Ionicons name={spec.icon} size={10} color={spec.fg} /> : null}
      <Text style={[chipStyles.text, { color: spec.fg }]} maxFontSizeMultiplier={1.3}>{spec.label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    height: 20,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
  },
});

export interface ReminderCardProps {
  reminder: Reminder;
  fireAt: Date | null;
  state: PlannedState;
  audio: AudioState;
  offlinePending: boolean;
  highlight?: boolean;
  onPress(): void;
  onMore(): void;
}

export default function ReminderCard({
  reminder,
  fireAt,
  state,
  audio,
  offlinePending,
  highlight,
  onPress,
  onMore,
}: ReminderCardProps) {
  const style = KIND_STYLE[reminder.kind];
  const when = fireAt ?? new Date(reminder.scheduled_at);
  const clock = formatClock(when);
  const dayLabel = when.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const device = deviceTimeZone();
  const zoneLine =
    reminder.tz && reminder.tz !== device ? formatClockInZone(reminder.scheduled_at, reminder.tz) : null;
  const hereLine = zoneLine ? `${clock} here` : null;
  const chip = chipFor(reminder, state, audio, offlinePending);
  const faded = state === 'done' || state === 'past';
  const text = reminder.message_text.trim();

  const a11y = [
    `${kindLabel(reminder.kind)} reminder`,
    clock,
    dayLabel,
    text,
    chip ? chip.label.toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onMore}
      activeOpacity={0.7}
      style={[
        styles.card,
        highlight && { backgroundColor: TINT.greenSoft, borderColor: colors.primaryLight },
        faded && { opacity: 0.6 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${a11y}. Double tap to edit.`}
      accessibilityActions={[{ name: 'more', label: 'More options' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'more') onMore();
      }}
    >
      <View style={[styles.kindCircle, { backgroundColor: style.bg }]}>
        <Ionicons name={style.icon} size={20} color={style.fg} />
      </View>

      <View style={styles.middle}>
        <Text style={styles.time} maxFontSizeMultiplier={1.6}>{clock}</Text>
        {hereLine && zoneLine ? (
          <Text style={styles.zone} maxFontSizeMultiplier={1.3}>
            {`${zoneLine} · ${hereLine}`}
          </Text>
        ) : null}
        <Text style={styles.text} numberOfLines={2} maxFontSizeMultiplier={1.6}>{text}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta} maxFontSizeMultiplier={1.3}>{kindLabel(reminder.kind)}</Text>
          {chip ? <StateChip spec={chip} /> : null}
        </View>
      </View>

      <TouchableOpacity
        onPress={onMore}
        style={styles.more}
        accessibilityRole="button"
        accessibilityLabel={`More options for ${text.split('\n')[0].slice(0, 40)}`}
        accessibilityActions={[{ name: 'activate', label: 'More options' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'activate') onMore();
        }}
        hitSlop={8}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  kindCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {
    flex: 1,
    gap: 2,
  },
  time: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  zone: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  text: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 4,
  },
  meta: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  more: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.sm,
    marginTop: -spacing.xs,
  },
});
