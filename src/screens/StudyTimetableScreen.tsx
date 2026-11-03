import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { localDateKey, datePrefixForDay } from '../utils/calendar';
import { buildSessionMarkers } from '../utils/calendarMarkers';
import MonthGrid from '../components/calendar/MonthGrid';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../services/supabase';
import {
  useStudyTimetablePlans,
  useStudyTimetableSessions,
  useSelfTests,
  patchSession,
  deleteSession,
  deletePlan,
  StudyTimetableSession,
  SelfTest,
} from '../hooks/useStudyTimetable';
import { scheduleStudyReminders } from '../services/scheduledNotifications';
import AutoChapterTestBanner from '../components/AutoChapterTestBanner';
import SessionChannelSheet from '../components/timetable/SessionChannelSheet';
import SimpleSelect from '../components/timetable/SimpleSelect';
import PlanCard from '../components/timetable/PlanCard';
import TestCard from '../components/timetable/TestCard';
import DayAgendaList from '../components/timetable/DayAgendaList';
import SessionActionsSheet from '../components/timetable/SessionActionsSheet';
import SessionEditSheet from '../components/timetable/SessionEditSheet';
import TimetableReminderCard from '../components/timetable/TimetableReminderCard';
import { useTimetableReminderSupport } from '../hooks/useTimetableReminderSupport';
import { useReminderPermissions } from '../hooks/useReminderPermissions';
import { useSubjectsForCourse, useChaptersForSubject, useTopicsForChapter } from '../hooks/useScopeContent';
import { planDefaultChannel } from '../services/timetableReminders';
import { planOpenClass } from '../services/reminders/openClass';
import { syncReminders } from '../services/reminders';
import { FEATURES } from '../constants/featureFlags';
import type { ReminderChoice } from '../types/reminder';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/** Only pending study sessions take a reminder channel. */
function canSetChannel(s: StudyTimetableSession): boolean {
  return s.status === 'pending' && s.session_type !== 'test';
}

interface SelectOption { id: string; name: string }

async function edgePost(fnName: string, body: object): Promise<any> {
  const token = await supabase.getAccessToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  try { return JSON.parse(text); } catch { return text; }
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function StudyTimetableScreen() {
  const navigation = useNavigation<NavProp>();
  const { openSidebar } = useSidebar();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const reminderSupport = useTimetableReminderSupport();
  const reminderPerms = useReminderPermissions();

  const [enrolledCourses, setEnrolledCourses] = useState<{ id: string; name: string }[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const now = new Date();
  const todayKey = datePrefixForDay(now.getFullYear(), now.getMonth(), now.getDate());
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedKey, setSelectedKey] = useState<string>(todayKey);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const [showTestModal, setShowTestModal] = useState(false);
  const [actionSession, setActionSession] = useState<StudyTimetableSession | null>(null);
  const [editSession, setEditSession] = useState<StudyTimetableSession | null>(null);
  const [channelSession, setChannelSession] = useState<StudyTimetableSession | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const plansQuery = useStudyTimetablePlans(selectedCourseId);
  // Always fetch every plan's sessions so per-plan progress is correct; the plan filter is applied below.
  const planIds = plansQuery.data.map(p => p.id);
  const sessionsQuery = useStudyTimetableSessions(selectedCourseId, planIds);
  const testsQuery = useSelfTests(selectedCourseId);

  useEffect(() => {
    if (!user) return;
    setLoadingCourses(true);
    supabase.getEnrolledCourses(user.id).then(res => {
      if (res.success && res.enrollments) {
        const courses = res.enrollments.map(e => ({
          id: e.course_id,
          name: (e.courses as any)?.name ?? 'Course',
        }));
        setEnrolledCourses(courses);
        if (courses.length > 0) setSelectedCourseId(c => c ?? courses[0].id);
      }
      setLoadingCourses(false);
    });
  }, [user]);

  // Refresh local study reminders whenever the user's sessions settle (initial
  // load and after create/edit/complete/delete, which all refetch sessions).
  // scheduleStudyReminders self-fetches all of the user's upcoming pending slots,
  // gates on notification permission, and is idempotent (stable per-slot IDs).
  useEffect(() => {
    if (sessionsQuery.isLoading) return;
    scheduleStudyReminders();
  }, [sessionsQuery.data, sessionsQuery.isLoading]);

  // Pick up plans and sessions created or re-channelled on the full-screen wizard or
  // the reminder settings screen when this screen regains focus.
  useFocusEffect(useCallback(() => {
    plansQuery.refetch();
    sessionsQuery.refetch();
    if (FEATURES.reminders) {
      syncReminders('manual').catch((e: unknown) => console.warn('[StudyTimetable] reminder sync failed', e));
    }
  }, [plansQuery.refetch, sessionsQuery.refetch]));

  const visibleSessions = selectedPlanId
    ? sessionsQuery.data.filter(s => s.timetable_id === selectedPlanId)
    : sessionsQuery.data;

  const markers = buildSessionMarkers(visibleSessions, testsQuery.data);
  const daySessions = visibleSessions.filter(s => localDateKey(s.scheduled_at) === selectedKey);
  const dayTests = testsQuery.data.filter(t => localDateKey(t.scheduled_at) === selectedKey);

  function planSessionsOf(planId: string) {
    return sessionsQuery.data.filter(s => s.timetable_id === planId);
  }

  /** Default channel of the plan a session belongs to (null when mixed or unknown). */
  function planDefaultFor(s: StudyTimetableSession): ReminderChoice | null {
    const plan = plansQuery.data.find(p => p.id === s.timetable_id);
    if (!plan) return null;
    const d = planDefaultChannel(plan, planSessionsOf(plan.id));
    return d === 'mixed' ? null : d;
  }

  function progressOf(planId: string) {
    const mine = planSessionsOf(planId).filter(s => s.session_type !== 'test');
    return { done: mine.filter(s => s.status === 'done').length, total: mine.length };
  }

  function handlePlanCardPress(planId: string) {
    setSelectedPlanId(prev => (prev === planId ? null : planId));
  }

  function confirmDeletePlan(planId: string, title: string) {
    Alert.alert('Delete Plan', `Delete "${title}" and all its sessions?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deletePlan(planId);
            plansQuery.refetch();
            sessionsQuery.refetch();
            if (selectedPlanId === planId) setSelectedPlanId(null);
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not delete plan');
          }
        },
      },
    ]);
  }

  function openReminderSettings(planId?: string) {
    const courseId = selectedCourseId ?? enrolledCourses[0]?.id ?? null;
    if (!courseId) {
      Alert.alert('No course yet', 'Enrol in a course to set timetable reminders.');
      return;
    }
    navigation.navigate('TimetableReminderSettings', { courseId, ...(planId ? { planId } : {}) });
  }

  function openCreatePlan() {
    if (!selectedCourseId) return;
    navigation.navigate('StudyPlanCreate', {
      courseId: selectedCourseId,
      courseName: enrolledCourses.find(c => c.id === selectedCourseId)?.name ?? 'Course',
    });
  }

  async function runSessionAction(sessionId: string, action: 'done' | 'skipped' | 'delete') {
    setActionBusy(true);
    try {
      if (action === 'delete') {
        await deleteSession(sessionId);
      } else {
        await patchSession(sessionId, { status: action });
      }
      setActionSession(null);
      sessionsQuery.refetch();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Action failed');
    } finally {
      setActionBusy(false);
    }
  }

  function confirmDeleteSession(s: StudyTimetableSession) {
    setActionSession(null);
    Alert.alert('Delete Session', `Delete "${s.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => runSessionAction(s.id, 'delete') },
    ]);
  }

  function openEditFromActions() {
    const s = actionSession;
    setActionSession(null);
    if (s) setEditSession(s);
  }

  /** Opens the session's lecture on the topic's Classes tab (falls back to subject or timetable). */
  function openSessionClass(s: StudyTimetableSession) {
    const plan = plansQuery.data.find(p => p.id === s.timetable_id);
    const courseId = plan?.course_id ?? selectedCourseId ?? null;
    const intent = planOpenClass({
      courseId,
      subjectId: s.subject_id,
      chapterId: s.chapter_id,
      topicId: s.topic_id,
      topicTitle: s.title,
    }).intent;
    // NavProp is strict; intent.name is a union of route names, so cast like the other dynamic navigate calls here.
    (navigation as any).navigate(intent.name, intent.params);
  }

  function openLectureFromActions() {
    const s = actionSession;
    setActionSession(null);
    if (s) openSessionClass(s);
  }

  const editDay = editSession ? localDateKey(editSession.scheduled_at) : null;
  const editDaySessions = editDay ? sessionsQuery.data.filter(s => localDateKey(s.scheduled_at) === editDay) : [];
  const editDayTests = editDay ? testsQuery.data.filter(t => localDateKey(t.scheduled_at) === editDay) : [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <LinearGradient
        colors={[colors.primary, '#4ADE80']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={{ width: 36 }} />
        <Text style={styles.headerTitle}>Timetable</Text>
        <TouchableOpacity
          style={styles.remindersPill}
          onPress={() => openReminderSettings()}
          accessibilityRole="button"
          accessibilityLabel={reminderPerms.notifications === 'denied'
            ? 'Reminders. Notifications are blocked on this phone'
            : 'Reminders. Open reminder settings'}
        >
          <Ionicons name="notifications-outline" size={18} color={colors.white} />
          <Text style={styles.remindersPillText}>Reminders</Text>
          {reminderPerms.notifications === 'denied' && <View style={styles.redDot} />}
        </TouchableOpacity>
        <HeaderMenuButton onPress={openSidebar} />
      </LinearGradient>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Course chip strip */}
        <View style={styles.chipStripWrapper}>
          {loadingCourses
            ? <ActivityIndicator size="small" color={colors.primary} style={{ margin: spacing.sm }} />
            : enrolledCourses.length === 0
              ? <Text style={styles.emptyChipText}>No enrolled courses</Text>
              : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipStrip}>
                  {enrolledCourses.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, selectedCourseId === c.id && styles.chipActive]}
                      onPress={() => { setSelectedCourseId(c.id); setSelectedPlanId(null); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selectedCourseId === c.id }}
                    >
                      <Text style={[styles.chipText, selectedCourseId === c.id && styles.chipTextActive]} numberOfLines={1}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )
          }
        </View>

        <AutoChapterTestBanner />

        <View style={styles.reminderWrap}>
          <TimetableReminderCard
            courseId={selectedCourseId}
            plans={plansQuery.data}
            sessions={sessionsQuery.data}
            support={reminderSupport}
            permission={reminderPerms.notifications}
            onOpenSettings={planId => openReminderSettings(planId)}
            onCreatePlan={openCreatePlan}
            onFixPermission={reminderPerms.openNotificationSettings}
          />
        </View>

        {/* Plans & Tests strip */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>My plans and tests</Text>
          {selectedPlanId && (
            <TouchableOpacity
              onPress={() => setSelectedPlanId(null)}
              style={styles.clearFilter}
              accessibilityRole="button"
              accessibilityLabel="Clear plan filter and show all sessions"
            >
              <Text style={styles.clearFilterText}>Clear filter</Text>
            </TouchableOpacity>
          )}
        </View>

        {(plansQuery.isLoading || testsQuery.isLoading) ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ margin: spacing.md }} />
        ) : plansQuery.data.length === 0 && testsQuery.data.length === 0 ? (
          <View style={styles.emptyPlanCard}>
            <Ionicons name="calendar-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyPlanText}>No plans yet.{'\n'}Create a study plan below to get started.</Text>
          </View>
        ) : (
          <FlatList
            horizontal
            data={[
              ...plansQuery.data.map(p => ({ type: 'plan' as const, data: p })),
              ...testsQuery.data.map(t => ({ type: 'test' as const, data: t })),
            ]}
            keyExtractor={item => item.data.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.planStrip}
            renderItem={({ item }) => {
              if (item.type === 'plan') {
                const plan = item.data;
                return (
                  <PlanCard
                    plan={plan}
                    progress={progressOf(plan.id)}
                    reminder={planDefaultChannel(plan, planSessionsOf(plan.id))}
                    selected={selectedPlanId === plan.id}
                    remindersAvailable
                    onPress={() => handlePlanCardPress(plan.id)}
                    onOpenReminders={() => navigation.navigate('TimetableReminderSettings', { courseId: plan.course_id, planId: plan.id })}
                    onDelete={() => confirmDeletePlan(plan.id, plan.plan_metadata?.scopeLabel || (plan.mode === 'auto' ? 'AI Study Plan' : 'Study Plan'))}
                  />
                );
              }
              return <TestCard test={item.data as SelfTest} />;
            }}
          />
        )}

        {/* Calendar: one shared MonthGrid; tapping a day shows its list below */}
        <View style={styles.calendarWrap}>
          <MonthGrid
            mode="agenda"
            year={calYear}
            month={calMonth}
            onChangeMonth={(y, m) => { setCalYear(y); setCalMonth(m); }}
            selectedKey={selectedKey}
            todayKey={todayKey}
            onSelect={setSelectedKey}
            markers={markers}
            showTodayButton
            testID="timetable-calendar"
          />
        </View>

        {/* Legend */}
        <View style={styles.legend} accessible accessibilityLabel="Dot colours: to do, done, skipped, test">
          <LegendItem color={colors.primary} label="To do" />
          <LegendItem color={colors.success} label="Done" />
          <LegendItem color={colors.gray300} label="Skipped" />
          <LegendItem color={colors.warning} label="Test" />
        </View>

        {/* Selected day */}
        <View style={styles.dayWrap}>
          <DayAgendaList
            dateKey={selectedKey}
            sessions={daySessions}
            tests={dayTests}
            loading={sessionsQuery.isLoading}
            canSetChannel={canSetChannel}
            channelOf={s => s.reminder_channel}
            onOpenSession={s => setActionSession(s)}
            onOpenChannel={s => setChannelSession(s)}
            onOpenTest={() => {
              // Test-taking screen is out of scope; keep the existing stub route.
              (navigation as any).navigate('MainTabs', { screen: 'MyCourses' });
            }}
          />
        </View>

        {/* Create plan / schedule test */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary, !selectedCourseId && styles.actionBtnDisabled]}
            onPress={openCreatePlan}
            disabled={!selectedCourseId}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Create study plan"
          >
            <Ionicons name="sparkles" size={18} color={colors.white} />
            <Text style={styles.actionBtnPrimaryText}>Create study plan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnOutline]}
            onPress={() => setShowTestModal(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Schedule a test"
          >
            <Ionicons name="document-text-outline" size={18} color={colors.text} />
            <Text style={styles.actionBtnOutlineText}>Schedule a test</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: insets.bottom + spacing.xl }} />
      </ScrollView>

      <SessionActionsSheet
        session={actionSession}
        onClose={() => setActionSession(null)}
        onDone={() => actionSession && runSessionAction(actionSession.id, 'done')}
        onSkip={() => actionSession && runSessionAction(actionSession.id, 'skipped')}
        onOpen={openLectureFromActions}
        onEdit={openEditFromActions}
        onDelete={() => actionSession && confirmDeleteSession(actionSession)}
        busy={actionBusy}
      />

      <SessionEditSheet
        visible={editSession !== null}
        session={editSession}
        daySessions={editDaySessions}
        dayTests={editDayTests}
        reminderSupport={reminderSupport}
        planDefault={editSession ? planDefaultFor(editSession) : null}
        onClose={() => setEditSession(null)}
        onSaved={() => { setEditSession(null); sessionsQuery.refetch(); }}
      />

      <SessionChannelSheet
        visible={channelSession !== null}
        session={channelSession}
        planDefault={channelSession ? planDefaultFor(channelSession) : null}
        allowed={reminderSupport.channels}
        onClose={() => setChannelSession(null)}
        onSaved={() => { setChannelSession(null); sessionsQuery.refetch(); }}
      />

      <ScheduleTestModal
        visible={showTestModal}
        onClose={() => setShowTestModal(false)}
        courseId={selectedCourseId}
        userId={user?.id ?? null}
        onSuccess={() => testsQuery.refetch()}
      />
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

/** Grace window so a test scheduled for "now" still passes between tapping and saving. */
const SCHEDULE_GRACE_MS = 5 * 60 * 1000;

function defaultScheduleTime(): Date {
  // Default to "right now", rounded UP to the next 5-minute mark for a clean time.
  const step = 5 * 60 * 1000;
  return new Date(Math.ceil(Date.now() / step) * step);
}

/** Friendly readable date+time, e.g. "Wed, 10 Jun 2026 · 2:30 PM". */
function formatReadableDateTime(d: Date): string {
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}
// ─── Schedule Test Modal ──────────────────────────────────────────────────────

function ScheduleTestModal({
  visible, onClose, courseId, userId, onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  courseId: string | null;
  userId: string | null;
  onSuccess: () => void;
}) {
  const { subjects, loading: loadingSubjects } = useSubjectsForCourse(courseId);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const { chapters, loading: loadingChapters } = useChaptersForSubject(subjectId);

  const [title, setTitle] = useState('');
  const [testType, setTestType] = useState<'topic' | 'chapter'>('topic');
  // Topic mode: a single parent chapter, then its topics. Chapter mode: chapters.
  const [topicChapterId, setTopicChapterId] = useState<string | null>(null);
  const { topics, loading: loadingTopics } = useTopicsForChapter(testType === 'topic' ? topicChapterId : null);
  const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [picker, setPicker] = useState<{ mode: 'date' | 'time'; temp: Date } | null>(null);
  const [duration, setDuration] = useState('60');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setTitle(''); setTestType('topic'); setSubjectId(null); setTopicChapterId(null);
    setSelectedScopeIds([]); setScheduledAt(null); setPicker(null); setDuration('60');
    setSaving(false); setError('');
  }

  function changeType(t: 'topic' | 'chapter') {
    setTestType(t); setSelectedScopeIds([]); setTopicChapterId(null); setError('');
  }

  function openPicker() {
    const base = scheduledAt ?? defaultScheduleTime();
    setPicker({ mode: 'date', temp: base });
  }

  function handlePickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (!picker) return;
    // User dismissed/cancelled the dialog
    if (event.type === 'dismissed' || !selected) {
      setPicker(null);
      return;
    }
    if (picker.mode === 'date') {
      const merged = new Date(picker.temp);
      merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      // Chain into the time picker after the date is chosen
      setPicker({ mode: 'time', temp: merged });
    } else {
      const merged = new Date(picker.temp);
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setScheduledAt(merged);
      setError('');
      setPicker(null);
    }
  }

  function toggleScopeId(id: string) {
    setSelectedScopeIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit() {
    if (!subjectId) { setError('Please pick a subject'); return; }
    if (testType === 'topic') {
      if (!topicChapterId) { setError('Please pick a chapter'); return; }
      if (selectedScopeIds.length === 0) { setError('Please pick at least one topic'); return; }
    } else if (selectedScopeIds.length === 0) {
      setError('Please pick at least one chapter');
      return;
    }
    if (!title.trim()) { setError('Please enter a title'); return; }
    if (!scheduledAt) { setError('Please pick a date & time'); return; }
    if (scheduledAt.getTime() < Date.now() - SCHEDULE_GRACE_MS) { setError('Pick today or a future date and time'); return; }
    if (!courseId || !userId) return;
    setSaving(true); setError('');
    try {
      // Topic mode: parent chapter goes in chapterIds (binds the calendar entry),
      // selected topics go in topicIds. Chapter mode: chapters in chapterIds.
      const chapterIds = testType === 'topic'
        ? (topicChapterId ? [topicChapterId] : [])
        : selectedScopeIds;
      const topicIds = testType === 'topic' ? selectedScopeIds : [];
      await edgePost('create-self-test', {
        courseId,
        subjectId,
        testType,
        chapterIds,
        topicIds,
        title: title.trim(),
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: parseInt(duration) || 60,
      });
      onSuccess();
      onClose();
      reset();
    } catch (e: any) {
      // Surface the server's message (e.g. "No questions found for the selected scope").
      let msg = e?.message ?? 'Could not schedule test';
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.error) msg = parsed.error;
      } catch { /* not JSON, keep raw message */ }
      setError(msg);
      setSaving(false);
    }
  }

  const renderScopeOption = (o: SelectOption) => {
    const active = selectedScopeIds.includes(o.id);
    return (
      <TouchableOpacity
        key={o.id}
        activeOpacity={0.7}
        style={[styles.multiSelectOption, active && styles.multiSelectOptionActive]}
        onPress={() => toggleScopeId(o.id)}
      >
        <View style={[styles.multiSelectCheckbox, active && styles.multiSelectCheckboxActive]}>
          {active && <Ionicons name="checkmark" size={13} color={colors.white} />}
        </View>
        <Text style={[styles.multiSelectText, active && styles.multiSelectTextActive]} numberOfLines={1}>
          {o.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderScopeList = (items: SelectOption[]) => (
    <View style={styles.scopeListBox}>
      <ScrollView
        style={styles.scopeListScroll}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        contentContainerStyle={styles.scopeListContent}
      >
        {items.map(renderScopeOption)}
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => { onClose(); reset(); }}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="flask-outline" size={18} color="#D97706" />
              <Text style={styles.modalTitle}>Schedule a Test</Text>
            </View>
            <TouchableOpacity onPress={() => { onClose(); reset(); }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <SimpleSelect
              label="Subject"
              options={subjects}
              value={subjectId}
              onChange={id => { setSubjectId(id); setSelectedScopeIds([]); setTopicChapterId(null); }}
              placeholder="Pick a subject…"
              loading={loadingSubjects}
            />

            <Text style={styles.inputLabel}>Type</Text>
            <View style={styles.segmentTrack}>
              {(['topic', 'chapter'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  activeOpacity={0.8}
                  style={[styles.segmentItem, testType === t && styles.segmentItemActive]}
                  onPress={() => changeType(t)}
                >
                  <Ionicons
                    name={t === 'topic' ? 'pricetag-outline' : 'albums-outline'}
                    size={15}
                    color={testType === t ? colors.white : colors.textSecondary}
                  />
                  <Text style={[styles.segmentText, testType === t && styles.segmentTextActive]}>
                    {t === 'topic' ? 'Topic Test' : 'Chapter Test'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {subjectId && testType === 'chapter' && (
              <>
                <View style={styles.scopeLabelRow}>
                  <Text style={styles.inputLabel}>Select Chapters</Text>
                  {selectedScopeIds.length > 0 && (
                    <Text style={styles.scopeCountBadge}>{selectedScopeIds.length} selected</Text>
                  )}
                </View>
                {loadingChapters
                  ? <ActivityIndicator size="small" color="#D97706" />
                  : chapters.length === 0
                    ? <Text style={styles.scopeEmptyHint}>No chapters in this subject.</Text>
                    : renderScopeList(chapters)
                }
              </>
            )}

            {subjectId && testType === 'topic' && (
              <>
                <SimpleSelect
                  label="Chapter"
                  options={chapters}
                  value={topicChapterId}
                  onChange={id => { setTopicChapterId(id); setSelectedScopeIds([]); }}
                  placeholder="Pick a chapter…"
                  loading={loadingChapters}
                />
                {topicChapterId && (
                  <>
                    <View style={styles.scopeLabelRow}>
                      <Text style={styles.inputLabel}>Select Topics</Text>
                      {selectedScopeIds.length > 0 && (
                        <Text style={styles.scopeCountBadge}>{selectedScopeIds.length} selected</Text>
                      )}
                    </View>
                    {loadingTopics
                      ? <ActivityIndicator size="small" color="#D97706" />
                      : topics.length === 0
                        ? <Text style={styles.scopeEmptyHint}>No topics in this chapter.</Text>
                        : renderScopeList(topics)
                    }
                  </>
                )}
              </>
            )}

            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Chapter 3 Revision Test"
              value={title}
              onChangeText={setTitle}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.inputLabel}>Date & Time</Text>
            <TouchableOpacity
              style={styles.dateTimeField}
              onPress={openPicker}
              activeOpacity={0.7}
              testID="button-pick-datetime"
            >
              <Ionicons name="calendar-outline" size={18} color="#D97706" />
              <Text
                style={[styles.dateTimeText, !scheduledAt && styles.dateTimePlaceholder]}
                testID="text-scheduled-datetime"
              >
                {scheduledAt ? formatReadableDateTime(scheduledAt) : 'Tap to pick date & time'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {picker && (
              <DateTimePicker
                value={picker.temp}
                mode={picker.mode}
                is24Hour={false}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={picker.mode === 'date' ? new Date() : undefined}
                onChange={handlePickerChange}
              />
            )}

            <Text style={styles.inputLabel}>Duration (min)</Text>
            <TextInput style={styles.input} value={duration} onChangeText={setDuration} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
            <Text style={styles.scopeEmptyHint}>The number of questions is chosen automatically based on what's available.</Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.wizardNextBtn, { backgroundColor: '#D97706' }, saving && styles.wizardNextBtnDisabled]}
              onPress={handleSubmit} disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={styles.wizardNextBtnText}>Schedule Test</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4, gap: spacing.sm,
  },
  headerTitle: { flex: 1, fontSize: fontSize.xl, fontFamily: fontFamily.heading, color: colors.white },
  remindersPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 44, paddingHorizontal: spacing.md, borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  remindersPillText: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.white },
  redDot: {
    position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.error, borderWidth: 1.5, borderColor: colors.white,
  },

  body: { flex: 1 },

  chipStripWrapper: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  chipStrip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  chip: {
    minHeight: 36, justifyContent: 'center',
    paddingHorizontal: spacing.md, borderRadius: borderRadius.full,
    backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.border, maxWidth: 200,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  emptyChipText: { padding: spacing.md, color: colors.textMuted, fontSize: fontSize.sm },

  reminderWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md },

  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text, flex: 1 },
  clearFilter: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md,
    backgroundColor: colors.primaryLight + '33', borderRadius: borderRadius.full,
  },
  clearFilterText: { fontSize: fontSize.sm, color: colors.primaryDark, fontFamily: fontFamily.semiBold },

  planStrip: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.md },

  emptyPlanCard: {
    marginHorizontal: spacing.md, padding: spacing.lg, backgroundColor: colors.white,
    borderRadius: borderRadius.lg, alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  emptyPlanText: {
    fontSize: fontSize.md, lineHeight: 22, color: colors.textSecondary, textAlign: 'center', fontFamily: fontFamily.regular,
  },

  // Calendar
  calendarWrap: { marginHorizontal: spacing.md, marginTop: spacing.sm },
  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.medium },

  dayWrap: { marginHorizontal: spacing.md, marginTop: spacing.xs },

  // Create plan / schedule test buttons
  actions: { marginHorizontal: spacing.md, marginTop: spacing.lg, gap: spacing.sm },
  actionBtn: {
    minHeight: 52, borderRadius: borderRadius.md, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  actionBtnPrimary: { backgroundColor: colors.primary },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnPrimaryText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.white },
  actionBtnOutline: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  actionBtnOutlineText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.md, maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md,
  },
  modalTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },

  // Wizard
  wizardNextBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.md,
  },
  wizardNextBtnDisabled: { opacity: 0.6 },
  wizardNextBtnText: { fontSize: fontSize.md, color: colors.white, fontFamily: fontFamily.semiBold },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    padding: spacing.sm, fontSize: fontSize.md, color: colors.text,
    backgroundColor: colors.white, marginBottom: 8,
  },
  inputLabel: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary, marginBottom: 4, marginTop: 8 },
  dateTimeField: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    padding: spacing.sm, backgroundColor: colors.white, marginBottom: 8,
  },
  dateTimeText: { flex: 1, fontSize: fontSize.md, color: colors.text },
  dateTimePlaceholder: { color: colors.textMuted },
  scopeEmptyHint: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: 8, marginTop: 2 },
  segmentTrack: {
    flexDirection: 'row', backgroundColor: '#FEF3C7', borderRadius: borderRadius.full,
    padding: 4, marginBottom: 10, gap: 4,
  },
  segmentItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: borderRadius.full, backgroundColor: 'transparent',
  },
  segmentItemActive: {
    backgroundColor: '#D97706',
    shadowColor: '#D97706', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  segmentText: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.semiBold },
  segmentTextActive: { color: colors.white },

  // Scope (chapter/topic) selector
  scopeLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scopeCountBadge: {
    fontSize: fontSize.xs, color: '#B45309', fontFamily: fontFamily.semiBold,
    backgroundColor: '#FEF3C7', borderRadius: borderRadius.full,
    paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden', marginTop: 8,
  },
  scopeListBox: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    backgroundColor: colors.gray100, marginBottom: 8, overflow: 'hidden',
  },
  scopeListScroll: { maxHeight: 220 },
  scopeListContent: { padding: 6, gap: 6 },

  // Multi-select option
  multiSelectOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 12, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  multiSelectOptionActive: {
    borderColor: '#D97706', backgroundColor: '#FFFBEB',
  },
  multiSelectCheckbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  multiSelectCheckboxActive: { backgroundColor: '#D97706', borderColor: '#D97706' },
  multiSelectText: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontFamily: fontFamily.medium },
  multiSelectTextActive: { color: '#B45309', fontFamily: fontFamily.semiBold },

  // SimpleSelect
  errorText: { fontSize: fontSize.sm, color: colors.error, marginTop: 4, fontFamily: fontFamily.regular },
});
