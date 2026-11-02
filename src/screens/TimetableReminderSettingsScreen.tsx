// Reminder settings for study plans (WP4). Change the default channel for a whole plan, or one session.
// Every change saves at once and can be undone from the snackbar.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../constants/theme';
import { KIND_STYLE, EMAIL_STYLE, TINT } from '../components/reminders/palette';
import EmptyState from '../components/reminders/EmptyState';
import UndoSnackbar from '../components/reminders/UndoSnackbar';
import { PermissionBanner } from '../components/reminders/PermissionBanner';
import { useReminderPermissions } from '../hooks/useReminderPermissions';
import {
  useStudyTimetablePlans,
  patchPlanMetadata,
  type StudyTimetablePlan,
  type StudyTimetableSession,
} from '../hooks/useStudyTimetable';
import { ChannelOptions, channelLabel } from '../components/timetable/SessionChannelSheet';
import SessionChannelSheet from '../components/timetable/SessionChannelSheet';
import {
  applyPlanChannel,
  setSessionChannel,
  restoreSessionChannels,
  planDefaultChannel,
  countOverrides,
  fetchUpcomingSessions,
  isReminderChoice,
  CHANNEL_LABEL,
  type ReminderChoice,
} from '../services/timetableReminders';

type ReminderSettingsRouteParams = {
  TimetableReminderSettings: { courseId: string; planId?: string };
};

const PAGE = 30;
const LOAD_LIMIT = 200; // upcoming sessions loaded for counting overrides and undo

interface Undo {
  id: number;
  message: string;
  run(): Promise<void>;
}

function planTitle(p: StudyTimetablePlan): string {
  const label = p.plan_metadata?.scopeLabel;
  return typeof label === 'string' && label.trim() ? label : 'Study plan';
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function chipColors(v: ReminderChoice | null): { fg: string; bg: string } {
  if (v === 'call') return KIND_STYLE.call;
  if (v === 'message') return KIND_STYLE.message;
  if (v === 'notification') return KIND_STYLE.notification;
  if (v === 'email') return EMAIL_STYLE;
  return { fg: colors.textSecondary, bg: colors.gray100 };
}

export default function TimetableReminderSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<ReminderSettingsRouteParams, 'TimetableReminderSettings'>>();
  const { courseId, planId } = route.params;

  const plansQuery = useStudyTimetablePlans(courseId);
  const plans = plansQuery.data;
  const perms = useReminderPermissions();

  const [pickedPlanId, setPickedPlanId] = useState<string | null>(planId ?? null);
  const selectedPlanId = pickedPlanId ?? plans[0]?.id ?? null;
  const selectedPlan = plans.find(p => p.id === selectedPlanId) ?? null;

  const [sessions, setSessions] = useState<StudyTimetableSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [sheetSession, setSheetSession] = useState<StudyTimetableSession | null>(null);

  useEffect(() => {
    setShown(PAGE);
    if (!selectedPlanId) {
      setSessions([]);
      return;
    }
    let cancelled = false;
    setSessionsLoading(true);
    setSessionsError(false);
    fetchUpcomingSessions(selectedPlanId, LOAD_LIMIT)
      .then(rows => { if (!cancelled) setSessions(rows); })
      .catch(() => { if (!cancelled) { setSessions([]); setSessionsError(true); } })
      .finally(() => { if (!cancelled) setSessionsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedPlanId, reloadKey]);

  const summary = selectedPlan ? planDefaultChannel(selectedPlan, sessions) : null;
  const defaultValue: ReminderChoice | null = isReminderChoice(summary) ? summary : null;
  const needsNotifications =
    perms.notifications === 'denied' &&
    (defaultValue === 'call' || defaultValue === 'message' || defaultValue === 'notification');

  function showUndo(message: string, run: () => Promise<void>) {
    setUndo({ id: Date.now(), message, run });
  }

  function setLocalChannels(updates: Map<string, ReminderChoice | null>) {
    setSessions(prev => prev.map(s => (updates.has(s.id) ? { ...s, reminder_channel: updates.get(s.id) ?? null } : s)));
  }

  async function onUndoAction() {
    const u = undo;
    setUndo(null);
    if (!u) return;
    try {
      await u.run();
    } catch {
      Alert.alert('Could not undo', 'Check your internet and try again.');
    }
  }

  /** Plan default change. onlyMatching: undefined = all upcoming sessions; otherwise only sessions on that value (or none). */
  async function applyDefault(choice: ReminderChoice, onlyMatching?: ReminderChoice | null) {
    const plan = selectedPlan;
    if (!plan || busy) return;
    const affected = sessions.filter(s => onlyMatching === undefined || (s.reminder_channel ?? null) === onlyMatching);
    const prev = new Map<string, ReminderChoice | null>();
    const next = new Map<string, ReminderChoice | null>();
    for (const s of affected) {
      prev.set(s.id, isReminderChoice(s.reminder_channel) ? s.reminder_channel : null);
      next.set(s.id, choice);
    }
    const prevMeta = plan.plan_metadata ?? {};
    setBusy(true);
    setLocalChannels(next);
    try {
      await applyPlanChannel(plan.id, choice, { onlyMatching });
      setBusy(false);
      void plansQuery.refetch();
      showUndo(`Reminders set to ${CHANNEL_LABEL[choice]} for ${affected.length} sessions`, async () => {
        await restoreSessionChannels(affected.map(s => ({ id: s.id, channel: prev.get(s.id) ?? null })));
        await patchPlanMetadata(plan.id, prevMeta);
        setLocalChannels(prev);
        void plansQuery.refetch();
      });
    } catch {
      setBusy(false);
      setLocalChannels(prev);
      Alert.alert('Could not save', 'Check your internet and try again.');
    }
  }

  function onPickDefault(choice: ReminderChoice) {
    if (busy) return;
    const overrides = defaultValue ? countOverrides(sessions, defaultValue) : 0;
    if (defaultValue && overrides > 0) {
      Alert.alert(
        'Some sessions have their own setting',
        `${overrides} ${overrides === 1 ? 'session has' : 'sessions have'} their own setting. Change them too?`,
        [
          { text: 'Only matching sessions', onPress: () => void applyDefault(choice, defaultValue) },
          { text: 'Change all', onPress: () => void applyDefault(choice) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    void applyDefault(choice);
  }

  function onSessionSaved(s: StudyTimetableSession, prev: ReminderChoice | null, next: ReminderChoice | null) {
    setLocalChannels(new Map([[s.id, next]]));
    showUndo('Saved', async () => {
      await setSessionChannel(s.id, prev);
      setLocalChannels(new Map([[s.id, prev]]));
    });
  }

  // Group upcoming sessions by day, for the first `shown` rows.
  const groups: { key: string; label: string; items: StudyTimetableSession[] }[] = [];
  for (const s of sessions.slice(0, shown)) {
    const label = dayLabel(s.scheduled_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(s);
    else groups.push({ key: `${label}-${groups.length}`, label, items: [s] });
  }

  const loading = plansQuery.isLoading && plans.length === 0;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.primary, '#4ADE80']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Reminder settings</Text>
        <View style={styles.backBtn} />
      </LinearGradient>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : plansQuery.error ? (
        <View style={styles.pad}>
          <PermissionBanner variant="sync-error" onAction={() => void plansQuery.refetch()} />
        </View>
      ) : plans.length === 0 ? (
        <View style={styles.pad}>
          <EmptyState
            icon="calendar-outline"
            title="No study plan yet"
            body="Create a plan to set reminders."
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
          keyboardShouldPersistTaps="handled"
        >
          {plans.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.planChips}>
              {plans.map(p => {
                const active = p.id === selectedPlanId;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setPickedPlanId(p.id)}
                    style={[styles.planChip, active && styles.planChipActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={planTitle(p)}
                  >
                    <Text
                      style={[styles.planChipText, active && styles.planChipTextActive]}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.6}
                    >
                      {planTitle(p)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          <Text style={styles.sectionTitle} accessibilityRole="header">Default for this plan</Text>
          <Text style={styles.helper}>
            Changing this updates every upcoming session that still follows the plan.
          </Text>
          <ChannelOptions value={defaultValue} onChange={onPickDefault} disabled={busy} />
          {summary === 'mixed' ? (
            <Text style={styles.helper}>Sessions have different reminders. Pick one to set them all.</Text>
          ) : null}

          {needsNotifications ? (
            <View style={styles.banner}>
              <PermissionBanner variant="notifications-off" onAction={perms.openNotificationSettings} />
            </View>
          ) : null}

          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]} accessibilityRole="header">
            Upcoming sessions
          </Text>

          {sessionsLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : sessionsError ? (
            <PermissionBanner variant="sync-error" onAction={() => setReloadKey(k => k + 1)} />
          ) : sessions.length === 0 ? (
            <EmptyState compact icon="time-outline" title="No upcoming sessions in this plan" />
          ) : (
            groups.map(g => (
              <View key={g.key} style={styles.group}>
                <Text style={styles.dayHeader}>{g.label}</Text>
                {g.items.map(s => {
                  const v = isReminderChoice(s.reminder_channel) ? s.reminder_channel : null;
                  const custom = defaultValue !== null && (s.reminder_channel ?? null) !== defaultValue;
                  const cc = chipColors(v);
                  return (
                    <View key={s.id} style={styles.sessionRow}>
                      <View style={styles.sessionText}>
                        <Text style={styles.sessionTitle} numberOfLines={2} maxFontSizeMultiplier={1.6}>
                          {s.title}
                        </Text>
                        <Text style={styles.sessionMeta} maxFontSizeMultiplier={1.6}>
                          {timeLabel(s.scheduled_at)} · {s.duration_minutes} min
                          {custom ? '  ·  Custom' : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setSheetSession(s)}
                        disabled={busy}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={[styles.chip, { backgroundColor: cc.bg }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Reminder for ${s.title} at ${timeLabel(s.scheduled_at)}: ${channelLabel(v)}. Double tap to change.`}
                      >
                        <Text style={[styles.chipText, { color: cc.fg }]} maxFontSizeMultiplier={1.4}>
                          {channelLabel(v)}
                        </Text>
                        <Ionicons name="chevron-down" size={12} color={cc.fg} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ))
          )}

          {sessions.length > shown ? (
            <TouchableOpacity
              onPress={() => setShown(n => n + PAGE)}
              style={styles.showMore}
              accessibilityRole="button"
              accessibilityLabel="Show more sessions"
            >
              <Text style={styles.showMoreText}>Show more</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}

      <SessionChannelSheet
        visible={sheetSession !== null}
        session={sheetSession}
        planDefault={summary}
        onClose={() => setSheetSession(null)}
        onSaved={(prev, next) => {
          if (sheetSession) onSessionSaved(sheetSession, prev, next);
        }}
      />

      <UndoSnackbar
        key={undo?.id ?? 'none'}
        visible={undo !== null}
        message={undo?.message ?? ''}
        actionLabel="Undo"
        onAction={() => void onUndoAction()}
        onHide={() => setUndo(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.xl, fontFamily: fontFamily.heading, color: colors.white },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  pad: { padding: spacing.md },
  content: { padding: spacing.md, gap: spacing.sm },
  planChips: { gap: spacing.sm, paddingVertical: spacing.xs },
  planChip: {
    minHeight: 44,
    maxWidth: 220,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  planChipActive: { borderColor: colors.primary, backgroundColor: TINT.greenSoft },
  planChipText: { fontSize: fontSize.md, fontFamily: fontFamily.medium, color: colors.text },
  planChipTextActive: { color: colors.primaryDark },
  sectionTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text, marginTop: spacing.sm },
  helper: { fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.textSecondary },
  banner: { marginTop: spacing.sm },
  group: { gap: spacing.sm, marginTop: spacing.sm },
  dayHeader: { fontSize: fontSize.sm, fontFamily: fontFamily.semiBold, color: colors.textSecondary },
  sessionRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  sessionText: { flex: 1 },
  sessionTitle: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.text },
  sessionMeta: { fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },
  chip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  chipText: { fontSize: fontSize.sm, fontFamily: fontFamily.semiBold },
  showMore: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, marginTop: spacing.sm },
  showMoreText: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.primaryDark },
});
