// Agenda under the month grid: one-off reminders for the selected day, plus a collapsible list of daily ones.
// Spec: _scratch/reminders-v2-plan.md E.2 (DayAgenda), E.5 (loading), E.6 (empty).
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../constants/theme';
import { Skeleton } from '../SkeletonLoader';
import { localDateKey } from '../../utils/calendar';
import { formatTime12, parseTime } from '../../services/reminders/schedule';
import type { Reminder } from '../../types/reminder';
import EmptyState from './EmptyState';
import ReminderCard, { AudioState, PlannedState } from './ReminderCard';

export interface DayAgendaProps {
  dateKey: string; // YYYY-MM-DD
  isPast: boolean;
  oneOffs: Reminder[];
  daily: Reminder[];
  stateOf(id: string): PlannedState;
  audioOf(id: string): AudioState;
  loading: boolean;
  onPress(r: Reminder): void;
  onMore(r: Reminder): void;
  onAdd(): void;
  highlightId?: string | null;
}

function dayTitle(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const now = new Date();
  const todayKey = localDateKey(now.toISOString());
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrow.toISOString());
  const dayMonth = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
  if (dateKey === todayKey) return `Today, ${dayMonth}`;
  if (dateKey === tomorrowKey) return `Tomorrow, ${dayMonth}`;
  return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

function timeOfDailyRow(r: Reminder): string {
  const hm = parseTime(r.time_of_day);
  return hm ? formatTime12(hm.hour, hm.minute) : '';
}

export default function DayAgenda({
  dateKey,
  isPast,
  oneOffs,
  daily,
  stateOf,
  audioOf,
  loading,
  onPress,
  onMore,
  onAdd,
  highlightId,
}: DayAgendaProps) {
  const [dailyExpanded, setDailyExpanded] = useState(false);
  const sorted = [...oneOffs].sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
  const empty = sorted.length === 0 && daily.length === 0;

  return (
    <View>
      <Text style={styles.title} maxFontSizeMultiplier={1.6} accessibilityRole="header">
        {dayTitle(dateKey)}
      </Text>

      {loading && empty ? (
        <View>
          {[0, 1].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <Skeleton width={40} height={40} borderRadius={20} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="60%" height={14} />
                <Skeleton width="85%" height={14} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <>
          {sorted.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r}
              fireAt={new Date(r.scheduled_at)}
              state={stateOf(r.id)}
              audio={audioOf(r.id)}
              offlinePending={false}
              highlight={highlightId === r.id}
              onPress={() => onPress(r)}
              onMore={() => onMore(r)}
            />
          ))}

          {daily.length > 0 ? (
            <View>
              <TouchableOpacity
                onPress={() => setDailyExpanded((v) => !v)}
                style={styles.dailyToggle}
                accessibilityRole="button"
                accessibilityState={{ expanded: dailyExpanded }}
                accessibilityLabel={`Every day, ${daily.length} reminder${daily.length === 1 ? '' : 's'}`}
              >
                <Text style={styles.dailyToggleText} maxFontSizeMultiplier={1.6}>
                  {`Every day (${daily.length})`}
                </Text>
                <Ionicons
                  name={dailyExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
              {dailyExpanded
                ? daily.map((r) => (
                    <View key={r.id} style={styles.dailyRow}>
                      <Text style={styles.dailyTime} maxFontSizeMultiplier={1.3}>{timeOfDailyRow(r)}</Text>
                      <Text style={styles.dailyText} numberOfLines={1} maxFontSizeMultiplier={1.6}>
                        {r.message_text.trim()}
                      </Text>
                    </View>
                  ))
                : null}
            </View>
          ) : null}

          {empty ? (
            <EmptyState
              compact
              icon="calendar-outline"
              title="No reminders on this day."
              actionLabel={isPast ? undefined : 'Add one'}
              onAction={isPast ? undefined : onAdd}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fontFamily.headingSemiBold,
    fontSize: fontSize.lg,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  dailyToggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginTop: spacing.xs,
  },
  dailyToggleText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  dailyTime: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    color: colors.text,
    minWidth: 72,
  },
  dailyText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.text,
  },
});
