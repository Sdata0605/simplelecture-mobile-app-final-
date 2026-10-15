import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  useDashboardStudyPlan,
  DashboardPlanDay,
  DashboardPlanSession,
} from '../hooks/useDashboardStudyPlan';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const MAX_CHIPS = 3;

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type Bucket = 'morning' | 'afternoon' | 'night';
const BUCKET_META: { key: Bucket; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'morning', title: 'Morning', icon: 'partly-sunny-outline' },
  { key: 'afternoon', title: 'Afternoon', icon: 'sunny-outline' },
  { key: 'night', title: 'Night', icon: 'moon-outline' },
];

function bucketOf(iso: string): Bucket {
  const h = new Date(iso).getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'night';
}

export default function DashboardStudyPlanStrip({
  userId,
  refreshSignal,
}: {
  userId: string | null;
  refreshSignal?: number;
}) {
  const navigation = useNavigation<NavProp>();
  const { days, hasAny, loading, refetch } = useDashboardStudyPlan(userId);

  const [sheetDay, setSheetDay] = useState<DashboardPlanDay | null>(null);

  // Refresh on screen focus and when the app returns to the foreground.
  useFocusEffect(
    useCallback(() => {
      refetch();
      const sub = AppState.addEventListener('change', state => {
        if (state === 'active') refetch();
      });
      return () => sub.remove();
    }, [refetch])
  );

  // Refresh when the Dashboard's pull-to-refresh bumps the signal.
  useEffect(() => {
    if (refreshSignal && refreshSignal > 0) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  function goToTimetable() {
    navigation.navigate('StudyTimetable');
  }

  function playSession(s: DashboardPlanSession) {
    if (!s.playable) {
      goToTimetable();
      return;
    }
    navigation.navigate('TopicDetails', {
      topicId: s.topic_id ?? undefined,
      chapterId: s.chapter_id ?? undefined,
      subjectId: s.subject_id ?? undefined,
      subjectName: s.subjectName ?? undefined,
      courseId: s.course_id ?? undefined,
      openAITab: true,
    });
  }

  function onDayPress(day: DashboardPlanDay) {
    const playable = day.sessions.filter(s => s.playable);
    if (playable.length === 0) {
      goToTimetable();
      return;
    }
    const uniqueTargets = new Set(
      playable.map(s => (s.topic_id ? `topic:${s.topic_id}` : `chapter:${s.chapter_id}`))
    );
    if (uniqueTargets.size === 1) {
      playSession(playable[0]);
      return;
    }
    setSheetDay(day);
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconContainer}>
            <Ionicons name="calendar" size={18} color={colors.primary} />
          </View>
          <Text style={styles.title}>Study Plan</Text>
        </View>
        <TouchableOpacity
          style={styles.planLink}
          onPress={goToTimetable}
          data-testid="button-open-timetable"
        >
          <Text style={styles.planLinkText}>Study Plan</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : !hasAny ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="calendar-outline" size={36} color={colors.primary} />
          </View>
          <Text style={styles.emptyStateText}>
            You don't have any study plans for these days yet
          </Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={goToTimetable}
            data-testid="button-create-study-plan"
          >
            <Ionicons name="add" size={16} color={colors.white} />
            <Text style={styles.emptyCtaText}>Open Study Plan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        days.map(day => (
          <DayCard
            key={day.key}
            day={day}
            onPress={() => onDayPress(day)}
            onChipPress={playSession}
          />
        ))
      )}

      <DaySheet
        day={sheetDay}
        onClose={() => setSheetDay(null)}
        onPlay={s => {
          setSheetDay(null);
          playSession(s);
        }}
      />
    </View>
  );
}

function DayCard({
  day,
  onPress,
  onChipPress,
}: {
  day: DashboardPlanDay;
  onPress: () => void;
  onChipPress: (s: DashboardPlanSession) => void;
}) {
  const count = day.sessions.length;
  const visible = day.sessions.slice(0, MAX_CHIPS);
  const more = count - visible.length;
  return (
    <TouchableOpacity
      style={[styles.dayCard, day.isToday && styles.dayCardToday]}
      activeOpacity={0.85}
      onPress={onPress}
      data-testid={`card-plan-day-${day.label.toLowerCase()}`}
    >
      <View style={styles.dayCardHeader}>
        <Text style={[styles.dayLabel, day.isToday && styles.dayLabelToday]}>{day.label}</Text>
        {count > 0 && (
          <View style={[styles.countBadge, day.isToday && styles.countBadgeToday]}>
            <Text style={[styles.countBadgeText, day.isToday && styles.countBadgeTextToday]}>
              {count}
            </Text>
          </View>
        )}
      </View>

      {count === 0 ? (
        <Text style={styles.dayEmptyText}>No sessions</Text>
      ) : (
        <View style={styles.chipsWrap}>
          {visible.map(s => {
            const done = s.status === 'done';
            return (
              <TouchableOpacity
                key={s.id}
                style={[
                  styles.chip,
                  { backgroundColor: s.subjectColorBg },
                  done && styles.chipDone,
                ]}
                activeOpacity={0.7}
                onPress={() => onChipPress(s)}
                data-testid={`chip-session-${s.id}`}
              >
                <Text style={[styles.chipTime, { color: s.subjectColorFg }, done && styles.chipTextDone]}>
                  {hhmm(s.scheduled_at)}
                </Text>
                <Text
                  style={[styles.chipLabel, { color: s.subjectColorFg }, done && styles.chipTextDone]}
                  numberOfLines={1}
                >
                  {s.displayLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
          {more > 0 && (
            <TouchableOpacity style={styles.moreChip} activeOpacity={0.7} onPress={onPress}>
              <Text style={styles.moreChipText}>+{more} more</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function DaySheet({
  day,
  onClose,
  onPlay,
}: {
  day: DashboardPlanDay | null;
  onClose: () => void;
  onPlay: (s: DashboardPlanSession) => void;
}) {
  const groups = BUCKET_META.map(meta => ({
    ...meta,
    sessions: (day?.sessions ?? [])
      .filter(s => bucketOf(s.scheduled_at) === meta.key)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
  })).filter(g => g.sessions.length > 0);

  return (
    <Modal visible={!!day} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={styles.sheetDismiss} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {day?.label}
              {day ? ` · ${day.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''}
            </Text>
            <TouchableOpacity onPress={onClose} data-testid="button-close-day-sheet">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
            {groups.map(group => (
              <View key={group.key} style={styles.group}>
                <View style={styles.groupHeader}>
                  <Ionicons name={group.icon} size={15} color={colors.textSecondary} />
                  <Text style={styles.groupTitle}>{group.title}</Text>
                </View>
                {group.sessions.map(s => {
                  const done = s.status === 'done';
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.sheetRow, done && styles.sheetRowDone]}
                      activeOpacity={0.7}
                      onPress={() => onPlay(s)}
                      data-testid={`row-session-${s.id}`}
                    >
                      <View style={[styles.sheetRowDot, { backgroundColor: s.subjectColorFg }]} />
                      <View style={styles.sheetRowInfo}>
                        <Text style={[styles.sheetRowLabel, done && styles.chipTextDone]} numberOfLines={1}>
                          {s.displayLabel}
                        </Text>
                        <Text style={styles.sheetRowMeta}>
                          {hhmm(s.scheduled_at)} · {s.duration_minutes} min
                        </Text>
                      </View>
                      {s.playable ? (
                        <Ionicons name="play-circle" size={26} color={colors.primary} />
                      ) : (
                        <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: spacing.md + 2,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    backgroundColor: '#E7F8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },
  planLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  planLinkText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },

  loadingBox: { paddingVertical: spacing.lg, alignItems: 'center' },

  emptyState: { alignItems: 'center', paddingVertical: spacing.lg },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyStateText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  emptyCtaText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '600' },

  dayCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  dayCardToday: {
    borderColor: colors.primary,
    backgroundColor: '#ECFDF5',
  },
  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  dayLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  dayLabelToday: { color: colors.primaryDark },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeToday: { backgroundColor: colors.primary },
  countBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },
  countBadgeTextToday: { color: colors.white },
  dayEmptyText: { fontSize: fontSize.sm, color: colors.textMuted },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    maxWidth: '100%',
  },
  chipDone: { opacity: 0.6 },
  chipTime: { fontSize: fontSize.xs, fontWeight: '700' },
  chipLabel: { fontSize: fontSize.sm, fontWeight: '600', flexShrink: 1 },
  chipTextDone: { textDecorationLine: 'line-through' },
  moreChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray100,
  },
  moreChipText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheetDismiss: { flex: 1 },
  sheetContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray300,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  sheetBody: { paddingBottom: spacing.md },
  group: { marginTop: spacing.md },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  groupTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  sheetRowDone: { opacity: 0.6 },
  sheetRowDot: { width: 10, height: 10, borderRadius: 5 },
  sheetRowInfo: { flex: 1 },
  sheetRowLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  sheetRowMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
