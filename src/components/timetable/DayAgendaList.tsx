// Day list shown under the timetable calendar: the selected day's sessions and tests, in time order.
import { View, Text, StyleSheet, Pressable, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';
import { KIND_STYLE, EMAIL_STYLE, TINT } from '../reminders/palette';
import type { StudyTimetableSession, SelfTest } from '../../hooks/useStudyTimetable';
import type { ReminderChoice } from '../../types/reminder';

export const CHANNEL_CHIP_LABEL: Record<string, string> = {
  call: 'Call', message: 'Text', notification: 'Notification', email: 'Email',
};

/** Colours and label for a reminder chip. null/undefined/'none' render as "Off". */
export function channelChipStyle(channel: ReminderChoice | null | undefined) {
  if (!channel || channel === 'none') return { fg: colors.textSecondary, bg: colors.gray100, icon: 'notifications-off-outline', label: 'Off' };
  const k =
    channel === 'call' ? KIND_STYLE.call :
    channel === 'message' ? KIND_STYLE.message :
    channel === 'notification' ? KIND_STYLE.notification : EMAIL_STYLE;
  return { fg: k.fg, bg: k.bg, icon: k.icon, label: CHANNEL_CHIP_LABEL[channel] };
}

const STATUS_LABEL: Record<StudyTimetableSession['status'], string> = {
  pending: 'To do', done: 'Done', skipped: 'Skipped',
};

const STATUS_DOT: Record<StudyTimetableSession['status'], string> = {
  pending: colors.primary, done: colors.success, skipped: colors.gray300,
};

function formatClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

/** "Tue 4 Nov" from a local 'YYYY-MM-DD' key. */
function dayHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  try {
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return dateKey; }
}

type AgendaItem =
  | { kind: 'session'; at: number; session: StudyTimetableSession }
  | { kind: 'test'; at: number; test: SelfTest };

interface DayAgendaListProps {
  dateKey: string;
  sessions: StudyTimetableSession[];
  tests: SelfTest[];
  loading: boolean;
  canSetChannel(s: StudyTimetableSession): boolean;
  channelOf(s: StudyTimetableSession): ReminderChoice | null | undefined;
  onOpenSession(s: StudyTimetableSession): void;
  onOpenChannel(s: StudyTimetableSession): void;
  onOpenTest(t: SelfTest): void;
}

export default function DayAgendaList({
  dateKey, sessions, tests, loading, canSetChannel, channelOf,
  onOpenSession, onOpenChannel, onOpenTest,
}: DayAgendaListProps) {
  const items: AgendaItem[] = [
    ...sessions.map(s => ({ kind: 'session' as const, at: new Date(s.scheduled_at).getTime(), session: s })),
    ...tests.map(t => ({ kind: 'test' as const, at: new Date(t.scheduled_at).getTime(), test: t })),
  ].sort((a, b) => a.at - b.at);

  const countLabel = [
    sessions.length > 0 ? `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}` : null,
    tests.length > 0 ? `${tests.length} ${tests.length === 1 ? 'test' : 'tests'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.wrap} accessibilityLabel={`${dayHeading(dateKey)}, ${countLabel || 'nothing scheduled'}`}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>{dayHeading(dateKey)}</Text>
        {!!countLabel && <Text style={styles.count}>{countLabel}</Text>}
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.md }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={28} color={colors.textMuted} />
          <Text style={styles.emptyText}>Nothing scheduled on this day</Text>
        </View>
      ) : (
        items.map(item => {
          if (item.kind === 'test') {
            const t = item.test;
            return (
              <Pressable
                key={`t-${t.id}`}
                style={({ pressed }) => [styles.testRow, pressed && styles.pressed]}
                onPress={() => onOpenTest(t)}
                accessibilityRole="button"
                accessibilityLabel={`Test ${t.title}, ${formatClock(t.scheduled_at)}, ${t.duration_minutes} minutes`}
              >
                <View style={styles.timeCol}>
                  <Text style={styles.time}>{formatClock(t.scheduled_at)}</Text>
                  <Text style={styles.duration}>{t.duration_minutes} min</Text>
                </View>
                <View style={styles.body}>
                  <View style={styles.testPill}>
                    <Text style={styles.testPillText}>Test</Text>
                  </View>
                  <Text style={styles.title} numberOfLines={2}>{t.title}</Text>
                </View>
              </Pressable>
            );
          }

          const s = item.session;
          const isSkipped = s.status === 'skipped';
          const showChannel = canSetChannel(s);
          const ch = channelChipStyle(channelOf(s));
          return (
            <View key={`s-${s.id}`} style={styles.row}>
              <View style={styles.timeCol}>
                <Text style={[styles.time, isSkipped && styles.muted]}>{formatClock(s.scheduled_at)}</Text>
                <Text style={styles.duration}>{s.duration_minutes} min</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.body, pressed && styles.pressed]}
                onPress={() => onOpenSession(s)}
                accessibilityRole="button"
                accessibilityLabel={`${s.title}, ${formatClock(s.scheduled_at)}, ${s.duration_minutes} minutes, ${STATUS_LABEL[s.status]}. Open actions`}
              >
                <Text style={[styles.title, isSkipped && styles.skippedTitle]} numberOfLines={2}>{s.title}</Text>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: STATUS_DOT[s.status] }]} />
                  <Text style={styles.statusText}>{STATUS_LABEL[s.status]}</Text>
                </View>
              </Pressable>
              {showChannel && (
                <TouchableOpacity
                  style={[styles.chip, { backgroundColor: ch.bg }]}
                  onPress={() => onOpenChannel(s)}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Reminder: ${ch.label}. Change`}
                >
                  <Ionicons name={ch.icon as keyof typeof Ionicons.glyphMap} size={14} color={ch.fg} />
                  <Text style={[styles.chipText, { color: ch.fg }]}>{ch.label}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.xs },
  heading: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },
  count: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary },
  empty: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  emptyText: { fontSize: fontSize.md, fontFamily: fontFamily.regular, color: colors.textSecondary },
  pressed: { opacity: 0.7 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  testRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: colors.warning,
    minHeight: 44,
  },
  timeCol: { width: 76 },
  time: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.text },
  duration: { fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },
  muted: { color: colors.textMuted },
  body: { flex: 1, gap: 4, minHeight: 44, justifyContent: 'center' },
  title: { fontSize: fontSize.md, fontFamily: fontFamily.medium, color: colors.text },
  skippedTitle: { color: colors.textMuted, textDecorationLine: 'line-through' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.textSecondary },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 32, paddingHorizontal: 10, borderRadius: borderRadius.full,
  },
  chipText: { fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  testPill: {
    alignSelf: 'flex-start', backgroundColor: TINT.amberBg,
    borderRadius: borderRadius.full, paddingHorizontal: 8, paddingVertical: 2,
  },
  testPillText: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: TINT.amberText },
});
