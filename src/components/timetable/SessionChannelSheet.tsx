// Per-session reminder sheet (WP4). One decision: pick a channel, it saves and closes.
// Also exports ChannelOptions, the list of channel cards used by Reminder settings for the plan default.
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';
import { KIND_STYLE, EMAIL_STYLE, TINT } from '../reminders/palette';
import type { StudyTimetableSession } from '../../hooks/useStudyTimetable';
import {
  setSessionChannel,
  isReminderChoice,
  formatSessionWhen,
  CHANNEL_LABEL,
  type ReminderChoice,
} from '../../services/timetableReminders';
import { afterCallChannelSaved } from '../../services/sessionEdit';

type IconName = 'call' | 'chatbubble-ellipses' | 'notifications' | 'mail' | 'notifications-off-outline';

interface ChannelRow {
  value: ReminderChoice;
  label: string;
  sub: string;
  icon: IconName;
  fg: string;
  bg: string;
}

const ROWS: ReadonlyArray<ChannelRow> = [
  { value: 'call', label: KIND_STYLE.call.label, sub: 'The phone rings and your AI teacher speaks', icon: 'call', fg: KIND_STYLE.call.fg, bg: KIND_STYLE.call.bg },
  { value: 'message', label: KIND_STYLE.message.label, sub: 'A chat-style message on this phone', icon: 'chatbubble-ellipses', fg: KIND_STYLE.message.fg, bg: KIND_STYLE.message.bg },
  { value: 'notification', label: KIND_STYLE.notification.label, sub: 'A quiet alert at the top of the screen', icon: 'notifications', fg: KIND_STYLE.notification.fg, bg: KIND_STYLE.notification.bg },
  { value: 'email', label: EMAIL_STYLE.label, sub: 'In your inbox, even if the phone is off', icon: 'mail', fg: EMAIL_STYLE.fg, bg: EMAIL_STYLE.bg },
  { value: 'none', label: 'Off', sub: 'No reminder', icon: 'notifications-off-outline', fg: colors.textSecondary, bg: colors.gray100 },
];

interface ChannelOptionsProps {
  value: ReminderChoice | null;
  onChange(v: ReminderChoice): void;
  disabled?: boolean;
  /** Only these choices are shown (runtime support check). Omit to show every row. */
  allowed?: ReminderChoice[];
}

/** Full-width channel cards (radio list). Used for the plan default and for a single session. */
export function ChannelOptions({ value, onChange, disabled, allowed }: ChannelOptionsProps) {
  return (
    <View accessibilityRole="radiogroup" style={styles.list}>
      {ROWS.filter(r => !allowed || allowed.includes(r.value)).map(r => {
        const selected = r.value === value;
        return (
          <TouchableOpacity
            key={r.value}
            onPress={() => onChange(r.value)}
            disabled={disabled}
            style={[
              styles.row,
              selected && { borderColor: r.fg, backgroundColor: r.bg },
              disabled && styles.disabled,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: !!disabled }}
            accessibilityLabel={`${r.label}. ${r.sub}`}
          >
            <View style={[styles.iconCircle, { backgroundColor: r.bg }]}>
              <Ionicons name={r.icon} size={22} color={r.fg} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel} maxFontSizeMultiplier={1.6}>{r.label}</Text>
              <Text style={styles.rowSub} maxFontSizeMultiplier={1.6}>{r.sub}</Text>
            </View>
            <View style={[styles.radio, selected && { borderColor: r.fg }]}>
              {selected ? <View style={[styles.radioDot, { backgroundColor: r.fg }]} /> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function channelLabel(v: ReminderChoice | null | 'mixed'): string {
  if (v === null) return 'Not set';
  return CHANNEL_LABEL[v];
}

interface SessionChannelSheetProps {
  visible: boolean;
  session: StudyTimetableSession | null;
  planDefault: ReminderChoice | 'mixed' | null;
  onClose(): void;
  onSaved(prev: ReminderChoice | null, next: ReminderChoice | null): void;
  allowed?: ReminderChoice[];
}

export default function SessionChannelSheet({ visible, session, planDefault, onClose, onSaved, allowed }: SessionChannelSheetProps) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current: ReminderChoice | null = session && isReminderChoice(session.reminder_channel)
    ? session.reminder_channel
    : null;
  const defaultValue: ReminderChoice | null = isReminderChoice(planDefault) ? planDefault : null;

  async function pick(next: ReminderChoice | null) {
    if (!session || saving) return;
    setSaving(true);
    setError(null);
    try {
      await setSessionChannel(session.id, next);
      // Not awaited: day-one audio can take up to 30 s and must not hold the sheet open. The helper never throws.
      if (next === 'call' && next !== current) void afterCallChannelSaved(session.timetable_id);
      onSaved(current, next);
      onClose();
    } catch {
      setError('Could not save. Check your internet and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={saving ? undefined : onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} accessibilityViewIsModal>
        <View style={styles.grabber} />
        <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.6}>
          Reminder for this session
        </Text>
        {session ? (
          <Text style={styles.when} maxFontSizeMultiplier={1.6}>
            {session.title} · {formatSessionWhen(session.scheduled_at)}
          </Text>
        ) : null}

        <ChannelOptions value={current} onChange={pick} disabled={saving} allowed={allowed} />

        {defaultValue ? (
          <TouchableOpacity
            onPress={() => pick(defaultValue)}
            disabled={saving}
            style={styles.defaultBtn}
            accessibilityRole="button"
            accessibilityLabel={`Use plan default, ${CHANNEL_LABEL[defaultValue]}`}
          >
            <Ionicons name="refresh-outline" size={16} color={colors.primaryDark} />
            <Text style={styles.defaultText} maxFontSizeMultiplier={1.6}>
              Use plan default ({CHANNEL_LABEL[defaultValue]})
            </Text>
          </TouchableOpacity>
        ) : null}

        {saving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={16} color={TINT.redText} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: TINT.overlay },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray300,
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize.xl, fontFamily: fontFamily.heading, color: colors.text, marginBottom: spacing.xs },
  when: { fontSize: fontSize.md, fontFamily: fontFamily.regular, color: colors.textSecondary, marginBottom: spacing.md },
  list: { gap: spacing.sm },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  disabled: { opacity: 0.5 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },
  rowSub: { fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.textSecondary },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  defaultBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  defaultText: { fontSize: fontSize.md, fontFamily: fontFamily.medium, color: colors.primaryDark },
  savingRow: { alignItems: 'center', paddingVertical: spacing.sm },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: TINT.redBg,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  errorText: { flex: 1, fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: TINT.redText },
});
