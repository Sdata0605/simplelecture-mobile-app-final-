// Reminder status card under the course chips on the timetable (plan F.2 item 2).
// Always visible in every build. Shows what will happen and one tap to change it.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';
import { cardBase } from '../../constants/surfaces';
import { TINT } from '../reminders/palette';
import type { StudyTimetablePlan, StudyTimetableSession } from '../../hooks/useStudyTimetable';
import type { NotificationPermission } from '../../hooks/useReminderPermissions';
import type { ReminderSupportState } from '../../hooks/useTimetableReminderSupport';
import { isCourseRemindersOff } from '../../services/localReminderPrefs';
import { planDefaultChannel, CHANNEL_LABEL, type PlanChannelSummary } from '../../services/timetableReminders';

interface TimetableReminderCardProps {
  courseId: string | null;
  plans: StudyTimetablePlan[];
  sessions: StudyTimetableSession[];
  support: Pick<ReminderSupportState, 'status'>;
  permission: NotificationPermission;
  onOpenSettings(planId?: string): void;
  onCreatePlan(): void;
  onFixPermission(): void;
}

export function TimetableReminderCard({
  courseId,
  plans,
  sessions,
  support,
  permission,
  onOpenSettings,
  onCreatePlan,
  onFixPermission,
}: TimetableReminderCardProps) {
  const plan = plans[0] ?? null;
  const full = support.status === 'full';

  // Basic mode keeps Off on the phone. Re-read whenever the screen comes back into focus.
  const [localOff, setLocalOff] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (courseId) isCourseRemindersOff(courseId).then(v => { if (!cancelled) setLocalOff(v); });
      return () => { cancelled = true; };
    }, [courseId]),
  );
  if (!plan) {
    return (
      <View style={styles.card} accessibilityRole="summary">
        <View style={styles.row}>
          <View style={styles.iconCircle}>
            <Ionicons name="notifications-outline" size={22} color={colors.primaryDark} />
          </View>
          <Text style={styles.title}>Reminders start when you create a plan.</Text>
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={onCreatePlan} accessibilityRole="button">
          <Text style={styles.primaryBtnText}>Create plan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Full mode: Off means every loaded session is 'none' (same rule as the settings master switch),
  // or the plan default is 'none' when there are no sessions to look at.
  const summary: PlanChannelSummary = full
    ? planDefaultChannel(plan, sessions)
    : (localOff ? 'none' : 'notification');
  const sessionsOff = sessions.length > 0 && sessions.every(s => s.reminder_channel === 'none');
  const off = full ? (sessionsOff || (sessions.length === 0 && summary === 'none')) : localOff;
  const blocked = permission === 'denied' && !off;

  if (blocked) {
    return (
      <View style={[styles.card, styles.blockedCard]} accessibilityRole="alert">
        <View style={styles.row}>
          <View style={[styles.iconCircle, { backgroundColor: TINT.amberBg }]}>
            <Ionicons name="alert-circle-outline" size={22} color={TINT.amberText} />
          </View>
          <Text style={styles.title}>Notifications are blocked on this phone.</Text>
        </View>
        <TouchableOpacity style={styles.fixBtn} onPress={onFixPermission} accessibilityRole="button">
          <Text style={styles.fixBtnText}>Fix</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (off) {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.iconCircle, { backgroundColor: colors.gray100 }]}>
            <Ionicons name="notifications-off-outline" size={22} color={colors.textSecondary} />
          </View>
          <Text style={styles.title}>Reminders are off for this course.</Text>
        </View>
        <TouchableOpacity
          style={styles.textBtn}
          onPress={() => onOpenSettings(plan.id)}
          accessibilityRole="button"
          accessibilityLabel="Turn on reminders"
        >
          <Text style={styles.textBtnText}>Turn on</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const line = summary === 'mixed'
    ? 'Reminders on · different for some sessions'
    : `Reminders on · ${CHANNEL_LABEL[summary ?? 'notification']} at each session time`;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconCircle}>
          <Ionicons name="notifications" size={22} color={colors.primaryDark} />
        </View>
        <Text style={styles.title}>{line}</Text>
      </View>
      <TouchableOpacity
        style={styles.textBtn}
        onPress={() => onOpenSettings(plan.id)}
        accessibilityRole="button"
        accessibilityLabel="Change reminders"
      >
        <Text style={styles.textBtnText}>Change</Text>
      </TouchableOpacity>
    </View>
  );
}

export default TimetableReminderCard;

const styles = StyleSheet.create({
  card: {
    ...cardBase,
    padding: spacing.md,
    gap: spacing.sm,
  },
  blockedCard: {
    backgroundColor: TINT.amberBg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TINT.greenSoft,
  },
  title: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },
  primaryBtn: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  primaryBtnText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.white,
  },
  fixBtn: {
    minHeight: 44,
    alignSelf: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: TINT.amberText,
  },
  fixBtnText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.white,
  },
  textBtn: {
    minHeight: 44,
    alignSelf: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  textBtnText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.primaryDark,
  },
});
