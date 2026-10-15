import { useState, useEffect, useRef, useCallback } from 'react';
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
  Animated,
  TextInput,
  Dimensions,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { planScopeLabel, buildCalendarGrid, datePrefixForDay, localDateKey } from '../utils/calendar';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import { supabase, AUTH_TOKEN_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useStudyTimetablePlans,
  useStudyTimetableSessions,
  useSelfTests,
  patchSession,
  deleteSession,
  deletePlan,
  StudyTimetablePlan,
  StudyTimetableSession,
  SelfTest,
} from '../hooks/useStudyTimetable';
import { scheduleStudyReminders } from '../services/scheduledNotifications';
import AutoChapterTestBanner from '../components/AutoChapterTestBanner';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PLAN_CARD_WIDTH = SCREEN_WIDTH * 0.72;
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Calendar grid: 7 columns × 6 rows = always 42 cells
const CAL_CELL_SIZE = Math.floor((SCREEN_WIDTH - spacing.md * 2) / 7);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}
function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}
function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// Calendar / date helpers (planScopeLabel, buildCalendarGrid, datePrefixForDay,
// localDateKey) live in ../utils/calendar so they can be unit-tested without RN.

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

// ─── AmberGlowPill ────────────────────────────────────────────────────────────
// Glowing amber border + background pulse (1.8 s loop). Uses useNativeDriver:false
// to animate borderColor / backgroundColor opacity.

function AmberGlowPill() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: false }),
      ])
    ).start();
  }, []);
  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(251,191,36,0.2)', 'rgba(251,191,36,0.7)'] });
  const border = anim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(217,119,6,0.4)', 'rgba(217,119,6,1)'] });
  return (
    <Animated.View style={[styles.amberGlowPill, { backgroundColor: bg, borderColor: border }]} />
  );
}

// ─── SimpleSelect ─────────────────────────────────────────────────────────────

interface SelectOption { id: string; name: string }

function SimpleSelect({
  label, options, value, onChange, placeholder, loading,
}: {
  label: string;
  options: SelectOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TouchableOpacity style={styles.selectBox} onPress={() => setOpen(true)}>
        {loading
          ? <ActivityIndicator size="small" color={colors.primary} />
          : <Text style={selected ? styles.selectValue : styles.selectPlaceholder} numberOfLines={1}>
              {selected ? selected.name : (placeholder ?? 'Select…')}
            </Text>
        }
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.selectOverlay} onPress={() => setOpen(false)} activeOpacity={1}>
          <TouchableOpacity style={styles.selectDropdown} activeOpacity={1}>
            <ScrollView
              style={styles.selectDropdownScroll}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              contentContainerStyle={styles.selectDropdownContent}
            >
              <TouchableOpacity style={styles.selectOption} onPress={() => { onChange(null); setOpen(false); }}>
                <Text style={styles.selectOptionText}>— None —</Text>
                {value === null && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
              {options.map(o => (
                <TouchableOpacity key={o.id} style={[styles.selectOption, value === o.id && styles.selectOptionActive]}
                  onPress={() => { onChange(o.id); setOpen(false); }}>
                  <Text style={[styles.selectOptionText, value === o.id && styles.selectOptionTextActive]} numberOfLines={1}>{o.name}</Text>
                  {value === o.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── useSubjectsForCourse ─────────────────────────────────────────────────────

function useSubjectsForCourse(courseId: string | null) {
  const [subjects, setSubjects] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!courseId) { setSubjects([]); return; }
    setLoading(true);
    supabase.getCourseSubjects(courseId).then(res => {
      if (res.success && res.subjects) {
        setSubjects(res.subjects.map(s => ({ id: s.subject.id, name: s.subject.name })));
      }
      setLoading(false);
    });
  }, [courseId]);
  return { subjects, loading };
}

function useChaptersForSubject(subjectId: string | null) {
  const [chapters, setChapters] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!subjectId) { setChapters([]); return; }
    let cancelled = false;
    setLoading(true);
    fetch(
      `${SUPABASE_URL}/rest/v1/subject_chapters?select=id,title,chapter_number&subject_id=eq.${subjectId}&order=chapter_number.asc`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    )
      .then(r => r.json())
      .then(data => {
        if (!cancelled && Array.isArray(data)) {
          setChapters(data.map((c: any) => ({ id: c.id, name: c.title })));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [subjectId]);
  return { chapters, loading };
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function StudyTimetableScreen() {
  const navigation = useNavigation<NavProp>();
  const { openSidebar } = useSidebar();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [enrolledCourses, setEnrolledCourses] = useState<{ id: string; name: string }[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const [showDaySheet, setShowDaySheet] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'timetable' | 'test'>('timetable');

  const plansQuery = useStudyTimetablePlans(selectedCourseId);
  const planIds = selectedPlanId ? [selectedPlanId] : plansQuery.data.map(p => p.id);
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

  const calGrid = buildCalendarGrid(calYear, calMonth); // always 42 cells

  const sessionsOnDay = useCallback((day: number) => {
    const key = datePrefixForDay(calYear, calMonth, day);
    return sessionsQuery.data.filter(s => localDateKey(s.scheduled_at) === key);
  }, [sessionsQuery.data, calYear, calMonth]);

  const testsOnDay = useCallback((day: number) => {
    const key = datePrefixForDay(calYear, calMonth, day);
    return testsQuery.data.filter(t => localDateKey(t.scheduled_at) === key);
  }, [testsQuery.data, calYear, calMonth]);

  function handleDayPress(day: number | null) {
    if (!day) return;
    setSelectedDay(day);
    setShowDaySheet(true);
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  const isToday = (day: number) =>
    calYear === today.getFullYear() && calMonth === today.getMonth() && day === today.getDate();

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

  const dayDetailSessions = selectedDay ? sessionsOnDay(selectedDay) : [];
  const dayDetailTests = selectedDay ? testsOnDay(selectedDay) : [];

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

        {/* Plans & Tests strip */}
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="layers-outline" size={16} color={colors.primary} />
          <Text style={styles.sectionTitle}>My Plans & Tests</Text>
          {selectedPlanId && (
            <TouchableOpacity onPress={() => setSelectedPlanId(null)} style={styles.clearFilter}>
              <Text style={styles.clearFilterText}>Clear filter ×</Text>
            </TouchableOpacity>
          )}
        </View>

        {(plansQuery.isLoading || testsQuery.isLoading) ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ margin: spacing.md }} />
        ) : plansQuery.data.length === 0 && testsQuery.data.length === 0 ? (
          <View style={styles.emptyPlanCard}>
            <Ionicons name="calendar-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyPlanText}>No plans yet.{'\n'}Use the options below to start an AI plan or schedule a test.</Text>
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
                const plan = item.data as StudyTimetablePlan;
                const isSelected = selectedPlanId === plan.id;
                const meta = plan.plan_metadata ?? {};
                const isAI = plan.mode === 'auto';
                const planTitle = meta.scopeLabel || (isAI ? 'AI Study Plan' : 'Study Plan');
                const planDeadline = meta.deadline;
                const scopeLabel = planScopeLabel(meta.scopeType);
                return (
                  <TouchableOpacity
                    style={[styles.planCard, styles.planCardPurple, isSelected && styles.planCardSelected]}
                    onPress={() => handlePlanCardPress(plan.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.planCardTop}>
                      <View style={[styles.modeBadge, isAI ? styles.modeBadgeAI : styles.modeBadgeManual]}>
                        <Text style={styles.modeBadgeText}>{isAI ? 'AI Auto' : 'Manual'}</Text>
                      </View>
                      <TouchableOpacity onPress={() => confirmDeletePlan(plan.id, planTitle)}>
                        <Ionicons name="trash-outline" size={16} color="#A78BFA" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.planCardTitle} numberOfLines={2}>{planTitle}</Text>
                    {planDeadline && (
                      <View style={styles.planCardMeta}>
                        <Ionicons name="flag-outline" size={12} color="#C4B5FD" />
                        <Text style={styles.planCardMetaText}>Due {formatDate(planDeadline)}</Text>
                      </View>
                    )}
                    {scopeLabel && (
                      <View style={styles.planCardMeta}>
                        <Ionicons name="book-outline" size={12} color="#C4B5FD" />
                        <Text style={styles.planCardMetaText}>{scopeLabel}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }
              const test = item.data as SelfTest;
              return (
                <View style={[styles.planCard, styles.planCardAmber]}>
                  <View style={styles.planCardTop}>
                    <View style={styles.testBadge}>
                      <Text style={styles.testBadgeText}>Test</Text>
                    </View>
                    <View style={styles.testTypeBadge}>
                      <Text style={styles.testTypeBadgeText}>{test.test_type === 'topic' ? 'Topic' : 'Chapter'}</Text>
                    </View>
                  </View>
                  <Text style={styles.planCardTitleAmber} numberOfLines={2}>{test.title}</Text>
                  <View style={styles.planCardMeta}>
                    <Ionicons name="time-outline" size={12} color="#FCD34D" />
                    <Text style={styles.planCardMetaTextAmber}>{formatDateTime(test.scheduled_at)}</Text>
                  </View>
                  <View style={styles.planCardMeta}>
                    <Ionicons name="hourglass-outline" size={12} color="#FCD34D" />
                    <Text style={styles.planCardMetaTextAmber}>{test.duration_minutes} min · {test.total_questions} Qs</Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Calendar */}
        <View style={styles.calendarCard}>
          <View style={styles.calNavRow}>
            <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.calMonthTitle}>{MONTH_NAMES[calMonth]} {calYear}</Text>
            <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.calDayHeaders}>
            {DAYS_SHORT.map(d => (
              <Text key={d} style={styles.calDayHeader}>{d}</Text>
            ))}
          </View>

          {/* 42-cell grid */}
          <View style={styles.calGrid}>
            {calGrid.map((day, idx) => {
              if (day === null) {
                return <View key={`e-${idx}`} style={[styles.calCell, styles.calCellEmpty]} />;
              }
              const daySessions = sessionsOnDay(day);
              const dayTests = testsOnDay(day);
              const hasTest = dayTests.length > 0;
              const todayCell = isToday(day);
              const doneSessions = daySessions.filter(s => s.status === 'done');
              const pendingSessions = daySessions.filter(s => s.status === 'pending');
              const skippedSessions = daySessions.filter(s => s.status === 'skipped');

              return (
                <TouchableOpacity
                  key={`d-${day}`}
                  style={[styles.calCell, todayCell && styles.calCellToday]}
                  onPress={() => handleDayPress(day)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.calDayNum, todayCell && styles.calDayNumToday]}>{day}</Text>

                  {daySessions.length > 0 && (
                    <View style={styles.sessionBadge}>
                      <Text style={styles.sessionBadgeText}>{daySessions.length}</Text>
                    </View>
                  )}

                  {pendingSessions.slice(0, 2).map(s => (
                    <Text key={s.id} style={styles.calSessionTitle} numberOfLines={1}>{s.title}</Text>
                  ))}

                  {skippedSessions.length > 0 && (
                    <Text style={styles.calSkippedText}>
                      {skippedSessions.map(s => s.title).join(', ').slice(0, 14) + (skippedSessions[0]?.title?.length > 14 ? '…' : '')}
                    </Text>
                  )}

                  {doneSessions.length > 0 && (
                    <Text style={styles.calDoneText}>✓ {doneSessions.length}</Text>
                  )}

                  {hasTest && <AmberGlowPill />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>Today</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.legendText}>Test scheduled</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>Done</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.textMuted }]} />
            <Text style={styles.legendText}>Skipped</Text>
          </View>
        </View>

        {/* Action card: Time Table / Schedule Test tabs */}
        <View style={styles.actionCard}>
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'timetable' && styles.tabBtnActive]}
              onPress={() => setActiveTab('timetable')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="sparkles"
                size={16}
                color={activeTab === 'timetable' ? colors.text : colors.textMuted}
              />
              <Text style={[styles.tabBtnText, activeTab === 'timetable' && styles.tabBtnTextActive]}>
                Time Table
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'test' && styles.tabBtnActive]}
              onPress={() => setActiveTab('test')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="document-text-outline"
                size={16}
                color={activeTab === 'test' ? colors.text : colors.textMuted}
              />
              <Text style={[styles.tabBtnText, activeTab === 'test' && styles.tabBtnTextActive]}>
                Schedule Test
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'timetable' ? (
            <View style={styles.wizardCard}>
              <View style={styles.wizardIconCircle}>
                <Ionicons name="sparkles" size={24} color={colors.primary} />
              </View>
              <Text style={styles.wizardCardTitle}>AI Study Plan Wizard</Text>
              <Text style={styles.wizardCardSubtitle}>
                Answer a few quick questions and we'll generate a personalized schedule.
              </Text>
              <TouchableOpacity
                style={styles.wizardCardBtn}
                onPress={() => setShowAIModal(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="sparkles" size={16} color={colors.white} />
                <Text style={styles.wizardCardBtnText}>Start AI plan</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.wizardCard}>
              <View style={styles.wizardIconCircle}>
                <Ionicons name="document-text-outline" size={24} color={colors.primary} />
              </View>
              <Text style={styles.wizardCardTitle}>Schedule a Test</Text>
              <Text style={styles.wizardCardSubtitle}>
                Set up a topic or chapter test and we'll add it to your calendar.
              </Text>
              <TouchableOpacity
                style={styles.wizardCardBtn}
                onPress={() => setShowTestModal(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={18} color={colors.white} />
                <Text style={styles.wizardCardBtnText}>Schedule test</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ height: insets.bottom + spacing.xl }} />
      </ScrollView>

      <DayDetailModal
        visible={showDaySheet}
        onClose={() => setShowDaySheet(false)}
        day={selectedDay}
        month={calMonth}
        year={calYear}
        sessions={dayDetailSessions}
        tests={dayDetailTests}
        onSessionUpdate={() => sessionsQuery.refetch()}
      />

      <AIAutoTimetableModal
        visible={showAIModal}
        onClose={() => setShowAIModal(false)}
        courseId={selectedCourseId}
        userId={user?.id ?? null}
        onSuccess={() => { plansQuery.refetch(); sessionsQuery.refetch(); }}
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

// ─── Day Detail Modal ─────────────────────────────────────────────────────────

function DayDetailModal({
  visible, onClose, day, month, year, sessions, tests, onSessionUpdate,
}: {
  visible: boolean;
  onClose: () => void;
  day: number | null;
  month: number;
  year: number;
  sessions: StudyTimetableSession[];
  tests: SelfTest[];
  onSessionUpdate: () => void;
}) {
  const navigation = useNavigation<NavProp>();
  const [loading, setLoading] = useState(false);
  const [editingSession, setEditingSession] = useState<StudyTimetableSession | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editNotes, setEditNotes] = useState('');

  function openEdit(s: StudyTimetableSession) {
    setEditingSession(s);
    setEditTitle(s.title);
    setEditDuration(String(s.duration_minutes));
    setEditNotes(s.notes ?? '');
  }

  async function saveEdit() {
    if (!editingSession) return;
    setLoading(true);
    try {
      await patchSession(editingSession.id, {
        title: editTitle.trim() || editingSession.title,
        duration_minutes: parseInt(editDuration) || editingSession.duration_minutes,
        notes: editNotes.trim() || null,
      });
      setEditingSession(null);
      onSessionUpdate();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save edits');
    } finally {
      setLoading(false);
    }
  }

  async function handleSessionAction(sessionId: string, action: 'done' | 'skipped' | 'delete') {
    setLoading(true);
    try {
      if (action === 'delete') {
        await deleteSession(sessionId);
      } else {
        await patchSession(sessionId, { status: action });
      }
      onSessionUpdate();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Action failed');
    } finally {
      setLoading(false);
    }
  }

  const dateLabel = day ? `${day} ${MONTH_NAMES[month].slice(0, 3)} ${year}` : '';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={styles.sheetDismiss} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{dateLabel}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Inline edit form */}
          {editingSession && (
            <View style={styles.editForm}>
              <Text style={styles.editFormTitle}>Edit Session</Text>
              <TextInput style={styles.input} value={editTitle} onChangeText={setEditTitle} placeholder="Title" placeholderTextColor={colors.textMuted} />
              <TextInput style={styles.input} value={editDuration} onChangeText={setEditDuration} placeholder="Duration (min)" keyboardType="numeric" placeholderTextColor={colors.textMuted} />
              <TextInput style={[styles.input, { height: 60 }]} value={editNotes} onChangeText={setEditNotes} placeholder="Notes (optional)" multiline placeholderTextColor={colors.textMuted} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.editSaveBtn, { flex: 1 }]} onPress={saveEdit} disabled={loading}>
                  {loading ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.editSaveBtnText}>Save</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.editCancelBtn, { flex: 1 }]} onPress={() => setEditingSession(null)}>
                  <Text style={styles.editCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false}>
            {sessions.length === 0 && tests.length === 0 && (
              <View style={styles.sheetEmpty}>
                <Ionicons name="calendar-outline" size={36} color={colors.textMuted} />
                <Text style={styles.sheetEmptyText}>Nothing scheduled this day</Text>
              </View>
            )}

            {sessions.length > 0 && (
              <>
                <Text style={styles.sheetSectionLabel}>Study Sessions</Text>
                {sessions.map(s => {
                  const statusColor =
                    s.status === 'done' ? colors.success :
                    s.status === 'skipped' ? colors.textMuted : colors.warning;
                  const isSkipped = s.status === 'skipped';
                  return (
                    <View key={s.id} style={[styles.sessionRow, isSkipped && styles.sessionRowSkipped]}>
                      <View style={[styles.sessionDot, { backgroundColor: statusColor }]} />
                      <View style={styles.sessionInfo}>
                        <Text style={[styles.sessionTitle, isSkipped && styles.skippedText]}>{s.title}</Text>
                        <Text style={[styles.sessionMeta, isSkipped && styles.skippedText]}>
                          {formatTime(s.scheduled_at)} · {s.duration_minutes} min
                        </Text>
                        {s.notes && <Text style={styles.sessionNotes}>{s.notes}</Text>}
                        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
                          <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                            {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.sessionActions}>
                        {s.status === 'pending' && (
                          <>
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#DCFCE7' }]}
                              onPress={() => handleSessionAction(s.id, 'done')} disabled={loading}>
                              <Ionicons name="checkmark" size={14} color={colors.success} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FEF3C7' }]}
                              onPress={() => handleSessionAction(s.id, 'skipped')} disabled={loading}>
                              <Ionicons name="remove" size={14} color={colors.warning} />
                            </TouchableOpacity>
                          </>
                        )}
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#EFF6FF' }]}
                          onPress={() => openEdit(s)} disabled={loading}>
                          <Ionicons name="pencil-outline" size={14} color="#3B82F6" />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]}
                          onPress={() => {
                            Alert.alert('Delete Session', 'Delete this session?', [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => handleSessionAction(s.id, 'delete') },
                            ]);
                          }} disabled={loading}>
                          <Ionicons name="trash-outline" size={14} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {tests.length > 0 && (
              <>
                <Text style={styles.sheetSectionLabel}>Self Tests</Text>
                {tests.map(t => (
                  <View key={t.id} style={styles.testRow}>
                    <View style={styles.testRowLeft}>
                      <Text style={styles.testRowTitle}>{t.title}</Text>
                      <Text style={styles.testRowMeta}>
                        {formatTime(t.scheduled_at)} · {t.duration_minutes} min · {t.total_questions} Qs
                      </Text>
                      <View style={styles.testTypePill}>
                        <Text style={styles.testTypePillText}>{t.test_type === 'topic' ? 'Topic Test' : 'Chapter Test'}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.openTestBtn}
                      onPress={() => {
                        // Navigate to test-taking route if available; for now navigate to
                        // MyCourses as a stub since the test-taking screen is out of scope
                        onClose();
                        (navigation as any).navigate('MainTabs', { screen: 'MyCourses' });
                      }}
                    >
                      <Text style={styles.openTestBtnText}>Open</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── AI Auto Timetable Modal ──────────────────────────────────────────────────

// ─── AI Plan Wizard: types, constants & helpers ──────────────────────────────

type ScopeType = 'course' | 'subject' | 'chapter' | 'topic';

interface PlanItem {
  id: string;
  title: string;
  durationMinutes: number;
  subject_id: string;
  chapter_id: string;
  topic_id: string;
}

interface IntervalState { enabled: boolean; start: string; end: string }
interface DayIntervals { morning: IntervalState; afternoon: IntervalState; night: IntervalState }

const WEEKDAY_DEFAULT: DayIntervals = {
  morning:   { enabled: true,  start: '07:00', end: '09:00' },
  afternoon: { enabled: false, start: '14:00', end: '16:00' },
  night:     { enabled: true,  start: '19:00', end: '21:00' },
};
const WEEKEND_DEFAULT: DayIntervals = {
  morning:   { enabled: true,  start: '09:00', end: '11:00' },
  afternoon: { enabled: true,  start: '15:00', end: '17:00' },
  night:     { enabled: false, start: '20:00', end: '22:00' },
};

const INTERVAL_KEYS: (keyof DayIntervals)[] = ['morning', 'afternoon', 'night'];
const INTERVAL_META: Record<keyof DayIntervals, { title: string; emoji: string }> = {
  morning:   { title: 'Morning',   emoji: '🌅' },
  afternoon: { title: 'Afternoon', emoji: '☀️' },
  night:     { title: 'Night',     emoji: '🌙' },
};

const WIZARD_STEPS = ['Scope', 'Dates', 'Weekdays', 'Weekend', 'Check', 'Review'];

function cloneDay(d: DayIntervals): DayIntervals {
  return { morning: { ...d.morning }, afternoon: { ...d.afternoon }, night: { ...d.night } };
}

/** Convert the named-window editor state to the edge-function day plan shape. */
function toDayPlan(d: DayIntervals): { intervals: { label: string; start: string; end: string }[] } {
  return {
    intervals: INTERVAL_KEYS
      .filter(k => d[k].enabled && d[k].start < d[k].end)
      .map(k => ({ label: k as string, start: d[k].start, end: d[k].end })),
  };
}

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

function dayMinutes(d: DayIntervals): number {
  return INTERVAL_KEYS.reduce(
    (sum, k) => sum + (d[k].enabled && d[k].start < d[k].end ? minutesBetween(d[k].start, d[k].end) : 0),
    0,
  );
}

/** Local-time YYYY-MM-DD (deadline must be local, not UTC). */
function formatLocalYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function fmtHm(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h > 0 && m > 0) return `${h} h ${m}m`;
  if (h > 0) return `${h} h`;
  return `${m}m`;
}

// ─── useTopicsForChapter ──────────────────────────────────────────────────────

function useTopicsForChapter(chapterId: string | null) {
  const [topics, setTopics] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!chapterId) { setTopics([]); return; }
    let cancelled = false;
    setLoading(true);
    supabase.getChapterTopics([chapterId])
      .then(res => {
        if (!cancelled && res.success && res.topics) {
          setTopics(res.topics.map((t: any) => ({ id: t.id, name: t.title })));
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [chapterId]);
  return { topics, loading };
}

// ─── useScopeContent ──────────────────────────────────────────────────────────
// Resolves the topics inside the chosen scope and builds the items[] payload the
// edge function iterates over to create sessions. Only topics that have at least
// one published AI lecture are included — real per-topic durations and lecture
// counts come from the get_published_lecture_stats RPC. A scope with no published
// lectures yields an empty items[] (and a clear empty state), never a blank plan.

function useScopeContent(
  courseId: string | null,
  scopeType: ScopeType,
  subjectId: string | null,
  chapterId: string | null,
  topicId: string | null,
) {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [lectureCount, setLectureCount] = useState(0);
  const [fromLectures, setFromLectures] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function clear() { if (!cancelled) { setItems([]); setLectureCount(0); setFromLectures(false); } }

    async function run() {
      if (!courseId) { clear(); return; }
      if (scopeType === 'subject' && !subjectId) { clear(); return; }
      if (scopeType === 'chapter' && !chapterId) { clear(); return; }
      if (scopeType === 'topic' && !topicId) { clear(); return; }

      setLoading(true);
      try {
        const token = await supabase.getAccessToken();
        const headers = {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
        };

        // 1. Subjects in scope
        let subjectIds: string[] = [];
        if (scopeType === 'course') {
          const res = await supabase.getCourseSubjects(courseId);
          subjectIds = res.success && res.subjects ? res.subjects.map(s => s.subject.id) : [];
        } else if (subjectId) {
          subjectIds = [subjectId];
        }
        if (subjectIds.length === 0) { clear(); return; }

        // 2. Chapters (keep subject_id so items carry it)
        const chapRes = await fetch(
          `${SUPABASE_URL}/rest/v1/subject_chapters?select=id,subject_id&subject_id=in.(${subjectIds.join(',')})`,
          { headers },
        );
        const chapData = await chapRes.json();
        let chapterRows: { id: string; subject_id: string }[] =
          Array.isArray(chapData) ? chapData.map((c: any) => ({ id: c.id, subject_id: c.subject_id })) : [];
        if (scopeType === 'chapter' || scopeType === 'topic') {
          chapterRows = chapterRows.filter(c => c.id === chapterId);
        }
        if (chapterRows.length === 0) { clear(); return; }
        const chapterSubject: Record<string, string> = {};
        chapterRows.forEach(c => { chapterSubject[c.id] = c.subject_id; });

        // 3. Topics in those chapters
        const topicsRes = await supabase.getChapterTopics(chapterRows.map(c => c.id));
        let topics: any[] = topicsRes.success && topicsRes.topics ? topicsRes.topics : [];
        if (scopeType === 'topic') topics = topics.filter(t => t.id === topicId);
        if (topics.length === 0) { clear(); return; }

        // 4. Real published-lecture durations per topic via RPC.
        //    get_published_lecture_stats is keyed by subject only, so fan out
        //    one call per subject and merge. Topics absent from the result have
        //    no student-watchable published lecture and are excluded entirely.
        const rpcResults = await Promise.all(
          subjectIds.map(async (sid) => {
            const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_published_lecture_stats`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ p_subject_id: sid }),
            });
            const d = await r.json();
            return Array.isArray(d) ? d : [];
          }),
        );
        const durationByTopic: Record<string, number> = {};
        const lectureCountByTopic: Record<string, number> = {};
        rpcResults.flat().forEach((row: any) => {
          const tid = row?.topic_id;
          if (!tid) return;
          durationByTopic[tid] = (durationByTopic[tid] ?? 0) + (Number(row.total_duration_minutes) || 0);
          lectureCountByTopic[tid] = (lectureCountByTopic[tid] ?? 0) + (Number(row.lecture_count) || 0);
        });

        // 5. Build items from in-scope topics that have ≥1 published lecture,
        //    using the real per-topic duration from the RPC.
        const built: PlanItem[] = topics
          .filter(t => (durationByTopic[t.id] ?? 0) > 0)
          .map(t => ({
            id: `topic-${t.id}`,
            title: t.title,
            durationMinutes: durationByTopic[t.id],
            subject_id: chapterSubject[t.chapter_id] ?? subjectIds[0],
            chapter_id: t.chapter_id,
            topic_id: t.id,
          }));
        const totalLectures = built.reduce((s, it) => s + (lectureCountByTopic[it.topic_id] ?? 1), 0);

        if (!cancelled) {
          setItems(built);
          setLectureCount(totalLectures);
          setFromLectures(built.length > 0);
        }
      } catch {
        clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [courseId, scopeType, subjectId, chapterId, topicId]);

  const totalMinutes = items.reduce((s, it) => s + it.durationMinutes, 0);
  return { items, totalMinutes, lectureCount, fromLectures, loading };
}

// ─── DeadlinePicker (in-modal calendar, no extra dependency) ──────────────────

function DeadlinePicker({ value, min, onChange }: {
  value: Date;
  min: Date;
  onChange: (d: Date) => void;
}) {
  const [vYear, setVYear] = useState(value.getFullYear());
  const [vMonth, setVMonth] = useState(value.getMonth());
  const grid = buildCalendarGrid(vYear, vMonth);
  const minKey = formatLocalYMD(startOfDay(min));
  const valueKey = formatLocalYMD(value);

  function prev() { if (vMonth === 0) { setVYear(y => y - 1); setVMonth(11); } else setVMonth(m => m - 1); }
  function next() { if (vMonth === 11) { setVYear(y => y + 1); setVMonth(0); } else setVMonth(m => m + 1); }

  return (
    <View style={styles.dpCard}>
      <View style={styles.dpHeader}>
        <TouchableOpacity onPress={prev} style={styles.dpNavBtn}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.dpMonthTitle}>{MONTH_NAMES[vMonth]} {vYear}</Text>
        <TouchableOpacity onPress={next} style={styles.dpNavBtn}>
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.dpWeekRow}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={styles.dpWeekLabel}>{d}</Text>
        ))}
      </View>
      <View style={styles.dpGrid}>
        {grid.map((day, idx) => {
          if (day === null) return <View key={idx} style={styles.dpCell} />;
          const key = datePrefixForDay(vYear, vMonth, day);
          const disabled = key < minKey;
          const selected = key === valueKey;
          return (
            <TouchableOpacity
              key={idx}
              style={[styles.dpCell, selected && styles.dpCellSelected, disabled && styles.dpCellDisabled]}
              disabled={disabled}
              onPress={() => onChange(new Date(vYear, vMonth, day))}
            >
              <Text style={[
                styles.dpCellText,
                selected && styles.dpCellTextSelected,
                disabled && styles.dpCellTextDisabled,
              ]}>{day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── IntervalEditor (named morning/afternoon/night windows) ───────────────────

function IntervalEditor({ value, onChange }: {
  value: DayIntervals;
  onChange: (d: DayIntervals) => void;
}) {
  function update(key: keyof DayIntervals, patch: Partial<IntervalState>) {
    onChange({ ...value, [key]: { ...value[key], ...patch } });
  }
  return (
    <View style={{ gap: 10 }}>
      {INTERVAL_KEYS.map(key => {
        const iv = value[key];
        const meta = INTERVAL_META[key];
        return (
          <View key={key} style={[styles.windowCard, !iv.enabled && styles.windowCardDisabled]}>
            <View style={styles.windowHeader}>
              <Text style={styles.windowTitle}>{meta.emoji}  {meta.title}</Text>
              <TouchableOpacity style={styles.skipToggle} onPress={() => update(key, { enabled: !iv.enabled })}>
                <View style={[styles.skipCheckbox, !iv.enabled && styles.skipCheckboxOn]}>
                  {!iv.enabled && <Ionicons name="checkmark" size={12} color={colors.white} />}
                </View>
                <Text style={styles.skipLabel}>Skip</Text>
              </TouchableOpacity>
            </View>
            {iv.enabled && (
              <View style={styles.windowTimeRow}>
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  value={iv.start}
                  onChangeText={v => update(key, { start: v })}
                  placeholder="HH:MM"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.intervalDash}>–</Text>
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  value={iv.end}
                  onChangeText={v => update(key, { end: v })}
                  placeholder="HH:MM"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── AI Auto Timetable Modal ──────────────────────────────────────────────────

function AIAutoTimetableModal({
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
  const [chapterId, setChapterId] = useState<string | null>(null);
  const { topics, loading: loadingTopics } = useTopicsForChapter(chapterId);
  const [topicId, setTopicId] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [scope, setScope] = useState<ScopeType>('course');
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(new Date()));
  const [deadline, setDeadline] = useState<Date>(() => startOfDay(addDays(new Date(), 30)));
  const [weekday, setWeekday] = useState<DayIntervals>(() => cloneDay(WEEKDAY_DEFAULT));
  const [saturday, setSaturday] = useState<DayIntervals>(() => cloneDay(WEEKEND_DEFAULT));
  const [sunday, setSunday] = useState<DayIntervals>(() => cloneDay(WEEKEND_DEFAULT));
  const [pattern, setPattern] = useState<'sequential' | 'pair' | 'mixed'>('sequential');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feasibility, setFeasibility] = useState<{ verdict?: string; message?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const { items, totalMinutes, lectureCount, fromLectures, loading: loadingContent } =
    useScopeContent(courseId, scope, subjectId, chapterId, topicId);

  const todayStart = startOfDay(new Date());

  function reset() {
    setStep(0); setScope('course');
    setSubjectId(null); setChapterId(null); setTopicId(null);
    setStartDate(startOfDay(new Date()));
    setDeadline(startOfDay(addDays(new Date(), 30)));
    setWeekday(cloneDay(WEEKDAY_DEFAULT));
    setSaturday(cloneDay(WEEKEND_DEFAULT));
    setSunday(cloneDay(WEEKEND_DEFAULT));
    setPattern('sequential'); setFeedbackMessage('');
    setFeasibility(null); setChecking(false); setGenerating(false);
    setDone(false); setError('');
  }

  function closeAndReset() { onClose(); reset(); }

  // Derived labels & payload pieces
  const subjectName = subjects.find(s => s.id === subjectId)?.name ?? '';
  const chapterName = chapters.find(c => c.id === chapterId)?.name ?? '';
  const topicName = topics.find(t => t.id === topicId)?.name ?? '';

  let scopeLabel = 'Entire course';
  if (scope === 'subject') scopeLabel = subjectName || 'Subject';
  else if (scope === 'chapter') scopeLabel = chapterName || 'Chapter';
  else if (scope === 'topic') scopeLabel = topicName ? `${chapterName} • ${topicName}` : 'Topic';

  const scopeId = scope === 'course' ? null
    : scope === 'subject' ? subjectId
    : scope === 'chapter' ? chapterId
    : topicId;

  const weeklyMinutes = dayMinutes(weekday) * 5 + dayMinutes(saturday) + dayMinutes(sunday);
  const dailyHours = Math.round((weeklyMinutes / 7) / 60) || 1;

  function scopeValid() {
    if (scope === 'course') return true;
    if (scope === 'subject') return !!subjectId;
    if (scope === 'chapter') return !!chapterId;
    return !!topicId;
  }
  const weekdayValid = toDayPlan(weekday).intervals.length > 0;
  // Deadline must be at least one day after the start date.
  const deadlineMin = startOfDay(addDays(startDate, 1));
  const deadlineValid = startOfDay(deadline).getTime() >= deadlineMin.getTime();
  const spanDays = Math.max(
    0,
    Math.round((startOfDay(deadline).getTime() - startOfDay(startDate).getTime()) / 86400000),
  );

  // Picking a start date keeps the deadline at least a day ahead.
  function handleStartDate(d: Date) {
    const sd = startOfDay(d);
    setStartDate(sd);
    if (startOfDay(deadline).getTime() <= sd.getTime()) {
      setDeadline(startOfDay(addDays(sd, 30)));
    }
  }

  function canNext(): boolean {
    switch (step) {
      case 0: return scopeValid() && !loadingContent && items.length > 0;
      case 1: return deadlineValid;
      case 2: return weekdayValid;
      case 3: return true;
      case 4: return !checking && !!feasibility && feasibility.verdict !== 'too_short';
      case 5: return !generating;
      default: return true;
    }
  }

  async function runFeasibility() {
    setChecking(true); setError(''); setFeasibility(null);
    try {
      const data = await edgePost('study-timetable-ai', {
        action: 'evaluate_feasibility',
        scopeLabel,
        contentDurationMinutes: totalMinutes,
        startDate: formatLocalYMD(startDate),
        deadline: formatLocalYMD(deadline),
        dailyHours,
      });
      setFeasibility(data);
    } catch (e: any) {
      setError(e.message ?? 'Feasibility check failed');
    } finally {
      setChecking(false);
    }
  }

  async function generate() {
    // Student identity is derived from the JWT by the edge function, so only a
    // course is required here.
    if (!courseId) return;
    setGenerating(true); setError('');
    try {
      await edgePost('study-timetable-ai', {
        action: 'generate_plan',
        courseId,
        scopeLabel,
        scopeType: scope,
        scopeId,
        startDate: formatLocalYMD(startDate),
        deadline: formatLocalYMD(deadline),
        tzOffsetMinutes: new Date().getTimezoneOffset(),
        weekday: toDayPlan(weekday),
        saturday: toDayPlan(saturday),
        sunday: toDayPlan(sunday),
        items,
        feedbackMessage: feedbackMessage.trim() || undefined,
        pattern,
      });
      setDone(true);
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  // Auto-run feasibility when arriving on the Check step
  useEffect(() => {
    if (visible && step === 4) runFeasibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, visible]);

  function handleNext() {
    if (!canNext()) return;
    if (step < 5) setStep(step + 1);
    else generate();
  }
  function handleBack() { if (step > 0) setStep(step - 1); }

  const verdict = feasibility?.verdict;
  const verdictColor = verdict === 'too_short' ? colors.error : verdict === 'generous' ? '#2563EB' : colors.success;
  const verdictBg = verdict === 'too_short' ? '#FEF2F2' : verdict === 'generous' ? '#EFF6FF' : '#ECFDF5';
  const verdictTitle = verdict === 'too_short' ? '✗ Too tight' : verdict === 'generous' ? '✓ Plenty of time' : '✓ Looks good';

  const contentSummary = loadingContent
    ? 'Checking available content…'
    : items.length === 0
      ? 'No published lectures for this scope yet'
      : `${fmtHm(totalMinutes)} across ${lectureCount} published lecture${lectureCount === 1 ? '' : 's'}`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={closeAndReset}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="sparkles" size={18} color={colors.primary} />
              <Text style={styles.modalTitle}>Start AI Plan</Text>
            </View>
            <TouchableOpacity onPress={closeAndReset}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {!done && (
            <View style={styles.wizProgressWrap}>
              <View style={styles.wizProgressTrack}>
                <View style={[styles.wizProgressFill, { width: `${((step + 1) / WIZARD_STEPS.length) * 100}%` }]} />
              </View>
              <Text style={styles.wizStepLabel}>
                Step {step + 1} of {WIZARD_STEPS.length} · {WIZARD_STEPS[step]}
              </Text>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {done ? (
              <View style={styles.doneBox}>
                <Ionicons name="checkmark-circle" size={56} color={colors.success} />
                <Text style={styles.doneTitle}>Plan Generated!</Text>
                <Text style={styles.doneSubtitle}>Your study plan is ready. Check the calendar below.</Text>
                <TouchableOpacity style={[styles.wizardNextBtn, { alignSelf: 'stretch' }]} onPress={closeAndReset}>
                  <Text style={styles.wizardNextBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* STEP 0 — Scope */}
                {step === 0 && (
                  <>
                    <Text style={styles.wizardLabel}>What do you want to plan?</Text>
                    {([
                      ['course', 'Entire Course'],
                      ['subject', 'Specific Subject'],
                      ['chapter', 'Specific Chapter'],
                      ['topic', 'Specific Topic'],
                    ] as [ScopeType, string][]).map(([s, label]) => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.scopeOption, scope === s && styles.scopeOptionActive]}
                        onPress={() => setScope(s)}
                      >
                        <View style={[styles.scopeRadio, scope === s && styles.scopeRadioActive]} />
                        <Text style={styles.scopeOptionText}>{label}</Text>
                      </TouchableOpacity>
                    ))}

                    {(scope === 'subject' || scope === 'chapter' || scope === 'topic') && (
                      <SimpleSelect
                        label="Subject"
                        options={subjects}
                        value={subjectId}
                        onChange={id => { setSubjectId(id); setChapterId(null); setTopicId(null); }}
                        placeholder="Pick a subject…"
                        loading={loadingSubjects}
                      />
                    )}
                    {(scope === 'chapter' || scope === 'topic') && subjectId && (
                      <SimpleSelect
                        label="Chapter"
                        options={chapters}
                        value={chapterId}
                        onChange={id => { setChapterId(id); setTopicId(null); }}
                        placeholder="Pick a chapter…"
                        loading={loadingChapters}
                      />
                    )}
                    {scope === 'topic' && chapterId && (
                      <SimpleSelect
                        label="Topic"
                        options={topics}
                        value={topicId}
                        onChange={setTopicId}
                        placeholder="Pick a topic…"
                        loading={loadingTopics}
                      />
                    )}

                    {scopeValid() && (
                      <View style={styles.contentSummary}>
                        {loadingContent
                          ? <ActivityIndicator size="small" color={colors.primary} />
                          : <Ionicons
                              name={items.length > 0 ? 'film-outline' : 'alert-circle-outline'}
                              size={16}
                              color={items.length > 0 ? colors.primary : colors.error}
                            />}
                        <Text style={styles.contentSummaryText}>{contentSummary}</Text>
                      </View>
                    )}
                  </>
                )}

                {/* STEP 1 — Dates */}
                {step === 1 && (
                  <>
                    <Text style={styles.wizardLabel}>Start on</Text>
                    <DeadlinePicker value={startDate} min={todayStart} onChange={handleStartDate} />
                    <Text style={styles.dpSelectedLabel}>
                      Start: {startDate.getDate()} {MONTH_NAMES[startDate.getMonth()].slice(0, 3)} {startDate.getFullYear()}
                    </Text>

                    <Text style={[styles.wizardLabel, { marginTop: spacing.lg }]}>Finish by</Text>
                    <DeadlinePicker value={deadline} min={deadlineMin} onChange={setDeadline} />
                    <Text style={styles.dpSelectedLabel}>
                      Deadline: {deadline.getDate()} {MONTH_NAMES[deadline.getMonth()].slice(0, 3)} {deadline.getFullYear()} ({spanDays} day{spanDays === 1 ? '' : 's'})
                    </Text>
                  </>
                )}

                {/* STEP 2 — Weekdays */}
                {step === 2 && (
                  <>
                    <Text style={styles.wizardLabel}>Weekday study windows (Mon–Fri)</Text>
                    <IntervalEditor value={weekday} onChange={setWeekday} />
                    <Text style={styles.dpSelectedLabel}>{fmtHm(dayMinutes(weekday))} per weekday</Text>
                    {!weekdayValid && (
                      <Text style={styles.errorText}>Enable at least one window with a valid time range.</Text>
                    )}
                  </>
                )}

                {/* STEP 3 — Weekend */}
                {step === 3 && (
                  <>
                    <Text style={styles.wizardLabel}>Saturday windows</Text>
                    <IntervalEditor value={saturday} onChange={setSaturday} />
                    <Text style={styles.dpSelectedLabel}>{fmtHm(dayMinutes(saturday))} on Saturday</Text>
                    <Text style={[styles.wizardLabel, { marginTop: spacing.lg }]}>Sunday windows</Text>
                    <IntervalEditor value={sunday} onChange={setSunday} />
                    <Text style={styles.dpSelectedLabel}>{fmtHm(dayMinutes(sunday))} on Sunday</Text>
                  </>
                )}

                {/* STEP 4 — Check */}
                {step === 4 && (
                  <>
                    <Text style={styles.wizardLabel}>Feasibility check</Text>
                    <View style={styles.recapCard}>
                      <View style={styles.recapRow}><Text style={styles.recapKey}>Scope</Text><Text style={styles.recapVal}>{scopeLabel}</Text></View>
                      <View style={styles.recapRow}><Text style={styles.recapKey}>Content</Text><Text style={styles.recapVal}>{fmtHm(totalMinutes)}</Text></View>
                      <View style={styles.recapRow}><Text style={styles.recapKey}>Start</Text><Text style={styles.recapVal}>{formatLocalYMD(startDate)}</Text></View>
                      <View style={styles.recapRow}><Text style={styles.recapKey}>Deadline</Text><Text style={styles.recapVal}>{formatLocalYMD(deadline)}</Text></View>
                      <View style={styles.recapRow}><Text style={styles.recapKey}>Daily study</Text><Text style={styles.recapVal}>~{dailyHours} h/day</Text></View>
                    </View>

                    {checking ? (
                      <View style={styles.contentSummary}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={styles.contentSummaryText}>Checking feasibility…</Text>
                      </View>
                    ) : feasibility ? (
                      <View style={[styles.feasibilityBox, { backgroundColor: verdictBg, borderColor: verdictColor }]}>
                        <Text style={[styles.feasibilityVerdict, { color: verdictColor }]}>{verdictTitle}</Text>
                        {feasibility.message ? <Text style={styles.feasibilityMessage}>{feasibility.message}</Text> : null}
                      </View>
                    ) : null}

                    <TouchableOpacity style={styles.wizardBackBtn} onPress={runFeasibility} disabled={checking}>
                      <Text style={styles.wizardBackBtnText}>↻ Re-check</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* STEP 5 — Review */}
                {step === 5 && (
                  <>
                    <Text style={styles.wizardLabel}>Review & generate</Text>
                    <View style={styles.recapCard}>
                      <View style={styles.recapRow}><Text style={styles.recapKey}>Scope</Text><Text style={styles.recapVal}>{scopeLabel}</Text></View>
                      <View style={styles.recapRow}><Text style={styles.recapKey}>Content</Text><Text style={styles.recapVal}>{contentSummary}</Text></View>
                      <View style={styles.recapRow}><Text style={styles.recapKey}>Start</Text><Text style={styles.recapVal}>{formatLocalYMD(startDate)}</Text></View>
                      <View style={styles.recapRow}><Text style={styles.recapKey}>Deadline</Text><Text style={styles.recapVal}>{formatLocalYMD(deadline)}</Text></View>
                      <View style={styles.recapRow}><Text style={styles.recapKey}>Weekday</Text><Text style={styles.recapVal}>{fmtHm(dayMinutes(weekday))}/day</Text></View>
                      <View style={styles.recapRow}><Text style={styles.recapKey}>Weekend</Text><Text style={styles.recapVal}>Sat {fmtHm(dayMinutes(saturday))} · Sun {fmtHm(dayMinutes(sunday))}</Text></View>
                    </View>

                    <Text style={styles.wizardLabel}>Ordering</Text>
                    <View style={styles.typeRow}>
                      {([
                        ['sequential', 'Sequential'],
                        ['pair', 'Pair'],
                        ['mixed', 'Mixed'],
                      ] as ['sequential' | 'pair' | 'mixed', string][]).map(([p, label]) => (
                        <TouchableOpacity
                          key={p}
                          style={[styles.patternOption, pattern === p && styles.patternOptionActive]}
                          onPress={() => setPattern(p)}
                        >
                          <Text style={[styles.patternOptionText, pattern === p && styles.patternOptionTextActive]}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.wizardLabel}>Preferences (optional)</Text>
                    <TextInput
                      style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]}
                      placeholder="e.g. Lighter load on Fridays, focus on weak chapters…"
                      value={feedbackMessage}
                      onChangeText={setFeedbackMessage}
                      placeholderTextColor={colors.textMuted}
                      multiline
                    />
                  </>
                )}

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {/* Footer nav */}
                <View style={styles.wizFooter}>
                  {step > 0 ? (
                    <TouchableOpacity style={styles.wizFooterBack} onPress={handleBack} disabled={generating}>
                      <Text style={styles.wizardBackBtnText}>← Back</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.wizFooterBack} onPress={closeAndReset}>
                      <Text style={styles.wizardBackBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.wizFooterNext, !canNext() && styles.wizardNextBtnDisabled]}
                    onPress={handleNext}
                    disabled={!canNext()}
                  >
                    {generating
                      ? <ActivityIndicator size="small" color={colors.white} />
                      : <Text style={styles.wizardNextBtnText}>{step === 5 ? 'Generate Plan' : 'Next →'}</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
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
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: fontSize.xl, fontFamily: fontFamily.heading, color: colors.white },

  body: { flex: 1 },

  chipStripWrapper: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  chipStrip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: borderRadius.full,
    backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.border, maxWidth: 200,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  emptyChipText: { padding: spacing.md, color: colors.textMuted, fontSize: fontSize.sm },

  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 4,
  },
  sectionTitle: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.text, flex: 1 },
  clearFilter: {
    paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#EDE9FE', borderRadius: borderRadius.full,
  },
  clearFilterText: { fontSize: fontSize.xs, color: '#7C3AED', fontFamily: fontFamily.medium },

  planStrip: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  planCard: { width: PLAN_CARD_WIDTH, borderRadius: borderRadius.lg, padding: spacing.md, gap: 6 },
  planCardPurple: { backgroundColor: '#4C1D95' },
  planCardAmber: { backgroundColor: '#78350F' },
  planCardSelected: { borderWidth: 2.5, borderColor: '#C4B5FD' },
  planCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: borderRadius.full },
  modeBadgeAI: { backgroundColor: '#7C3AED' },
  modeBadgeManual: { backgroundColor: '#5B21B6' },
  modeBadgeText: { fontSize: fontSize.xs, color: colors.white, fontFamily: fontFamily.medium },
  planCardTitle: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: '#EDE9FE' },
  planCardTitleAmber: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: '#FEF3C7' },
  planCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  planCardMetaText: { fontSize: fontSize.xs, color: '#C4B5FD', fontFamily: fontFamily.regular },
  planCardMetaTextAmber: { fontSize: fontSize.xs, color: '#FCD34D', fontFamily: fontFamily.regular },
  testBadge: {
    backgroundColor: '#D97706', borderRadius: borderRadius.full, paddingHorizontal: 8, paddingVertical: 3,
  },
  testBadgeText: { fontSize: fontSize.xs, color: colors.white, fontFamily: fontFamily.medium },
  testTypeBadge: {
    backgroundColor: '#B45309', borderRadius: borderRadius.full, paddingHorizontal: 8, paddingVertical: 3,
  },
  testTypeBadgeText: { fontSize: fontSize.xs, color: '#FEF3C7', fontFamily: fontFamily.regular },

  emptyPlanCard: {
    margin: spacing.md, padding: spacing.lg, backgroundColor: colors.white,
    borderRadius: borderRadius.lg, alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  emptyPlanText: {
    fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', fontFamily: fontFamily.regular,
  },

  // Calendar
  calendarCard: {
    margin: spacing.md, backgroundColor: colors.white,
    borderRadius: borderRadius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
  },
  calNavRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  calNavBtn: { padding: 4 },
  calMonthTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },
  calDayHeaders: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  calDayHeader: {
    width: CAL_CELL_SIZE, textAlign: 'center', fontSize: fontSize.xs,
    fontFamily: fontFamily.medium, color: colors.textMuted, paddingVertical: 6,
  },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: {
    width: CAL_CELL_SIZE,
    minHeight: CAL_CELL_SIZE + 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 3,
    alignItems: 'flex-start',
  },
  calCellEmpty: { backgroundColor: colors.gray50 },
  calCellToday: { borderColor: colors.primary, borderWidth: 2, backgroundColor: '#F0FDF4' },
  calDayNum: { fontSize: fontSize.xs, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: 2 },
  calDayNumToday: { color: colors.primary },
  sessionBadge: {
    backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1, marginBottom: 2,
  },
  sessionBadgeText: { fontSize: 8, color: colors.white, fontFamily: fontFamily.bold },
  calSessionTitle: { fontSize: 8, color: colors.textSecondary, fontFamily: fontFamily.regular, width: '100%' },
  calSkippedText: { fontSize: 8, color: colors.textMuted, fontFamily: fontFamily.regular, opacity: 0.5, width: '100%' },
  calDoneText: { fontSize: 8, color: colors.success, fontFamily: fontFamily.medium },
  // Amber glow pill: pulsing border + background (animated with useNativeDriver:false)
  amberGlowPill: {
    width: '90%', height: 5, borderRadius: 3, borderWidth: 1.5,
    marginTop: 2, alignSelf: 'center',
  },

  // Legend
  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: fontFamily.regular },

  // Action card (Time Table / Schedule Test tabs)
  actionCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  tabBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.md,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  tabBtnActive: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabBtnText: { fontSize: fontSize.sm, color: colors.textMuted, fontFamily: fontFamily.medium },
  tabBtnTextActive: { color: colors.text, fontFamily: fontFamily.semiBold },

  wizardCard: {
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    borderRadius: borderRadius.lg,
    backgroundColor: '#F0FDF4',
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  wizardIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  wizardCardTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text, textAlign: 'center' },
  wizardCardSubtitle: {
    fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.regular,
    textAlign: 'center', lineHeight: 20,
  },
  wizardCardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, marginTop: 4,
  },
  wizardCardBtnText: { fontSize: fontSize.md, color: colors.white, fontFamily: fontFamily.semiBold },

  // Day Detail Sheet
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetDismiss: { flex: 1 },
  sheetContainer: {
    backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.md, maxHeight: '85%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sheetTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.heading, color: colors.text },
  sheetSectionLabel: {
    fontSize: fontSize.sm, fontFamily: fontFamily.semiBold, color: colors.textSecondary,
    marginTop: spacing.sm, marginBottom: 4,
  },
  sheetEmpty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  sheetEmptyText: { fontSize: fontSize.sm, color: colors.textMuted, fontFamily: fontFamily.regular },

  // Edit form
  editForm: {
    backgroundColor: '#F0F9FF', borderRadius: borderRadius.md, padding: spacing.sm,
    marginBottom: spacing.sm, gap: 6, borderWidth: 1, borderColor: '#BAE6FD',
  },
  editFormTitle: { fontSize: fontSize.sm, fontFamily: fontFamily.semiBold, color: '#0369A1', marginBottom: 4 },
  editSaveBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.sm, padding: 10, alignItems: 'center',
  },
  editSaveBtnText: { fontSize: fontSize.sm, color: colors.white, fontFamily: fontFamily.semiBold },
  editCancelBtn: {
    backgroundColor: colors.gray100, borderRadius: borderRadius.sm, padding: 10, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  editCancelBtnText: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.medium },

  // Session row
  sessionRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sessionRowSkipped: { opacity: 0.55 },
  sessionDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  sessionInfo: { flex: 1, gap: 4 },
  sessionTitle: { fontSize: fontSize.md, fontFamily: fontFamily.medium, color: colors.text },
  skippedText: { textDecorationLine: 'line-through', color: colors.textMuted },
  sessionMeta: { fontSize: fontSize.xs, color: colors.textSecondary },
  sessionNotes: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.full },
  statusBadgeText: { fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  sessionActions: { flexDirection: 'row', gap: 4, alignItems: 'center', flexWrap: 'wrap' },
  actionBtn: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },

  // Test row in sheet
  testRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  testRowLeft: { flex: 1, gap: 4 },
  testRowTitle: { fontSize: fontSize.md, fontFamily: fontFamily.medium, color: colors.text },
  testRowMeta: { fontSize: fontSize.xs, color: colors.textSecondary },
  testTypePill: {
    alignSelf: 'flex-start', backgroundColor: '#FEF3C7',
    borderRadius: borderRadius.full, paddingHorizontal: 8, paddingVertical: 2,
  },
  testTypePillText: { fontSize: fontSize.xs, color: '#D97706', fontFamily: fontFamily.medium },
  openTestBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.sm, paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  openTestBtnText: { fontSize: fontSize.sm, color: colors.white, fontFamily: fontFamily.semiBold },

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
  wizardLabel: {
    fontSize: fontSize.sm, fontFamily: fontFamily.semiBold, color: colors.textSecondary,
    marginTop: spacing.md, marginBottom: 6,
  },
  scopeOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 8,
    backgroundColor: colors.white,
  },
  scopeOptionActive: { borderColor: colors.primary, backgroundColor: '#F0FDF4' },
  scopeRadio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.border },
  scopeRadioActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  scopeOptionText: { fontSize: fontSize.md, color: colors.text, fontFamily: fontFamily.regular },
  wizardNextBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.md,
  },
  wizardNextBtnDisabled: { opacity: 0.6 },
  wizardNextBtnText: { fontSize: fontSize.md, color: colors.white, fontFamily: fontFamily.semiBold },
  wizardBackBtn: { padding: spacing.sm, alignItems: 'center', marginTop: 4 },
  wizardBackBtnText: { fontSize: fontSize.sm, color: colors.textSecondary },

  // Intervals
  intervalsBlock: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    padding: spacing.sm, marginBottom: 10,
  },
  intervalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  intervalDayLabel: { flex: 1, fontSize: fontSize.sm, fontFamily: fontFamily.semiBold, color: colors.text },
  intervalHoursLabel: { fontSize: fontSize.xs, color: colors.primary, fontFamily: fontFamily.medium },
  intervalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  intervalDash: { fontSize: fontSize.md, color: colors.textMuted },
  timeInput: { flex: 1, marginBottom: 0, textAlign: 'center' },

  // Feasibility
  feasibilityBox: { borderRadius: borderRadius.md, borderWidth: 1.5, padding: spacing.md, gap: 6 },
  feasibilityVerdict: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold },
  feasibilityMessage: { fontSize: fontSize.sm, color: colors.text, fontFamily: fontFamily.regular },

  // Done
  doneBox: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  doneTitle: { fontSize: fontSize.xxl, fontFamily: fontFamily.heading, color: colors.text },
  doneSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', fontFamily: fontFamily.regular },

  // Form inputs
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
  twoCol: { flexDirection: 'row', alignItems: 'flex-start' },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 8 },

  // Segmented control (Type tabs)
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
  selectBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    padding: spacing.sm, backgroundColor: colors.white, marginBottom: 8,
  },
  selectValue: { flex: 1, fontSize: fontSize.md, color: colors.text, fontFamily: fontFamily.regular },
  selectPlaceholder: { flex: 1, fontSize: fontSize.md, color: colors.textMuted, fontFamily: fontFamily.regular },
  selectOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', paddingHorizontal: 24 },
  selectDropdown: {
    backgroundColor: colors.white, borderRadius: borderRadius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  selectDropdownScroll: { maxHeight: 320 },
  selectDropdownContent: { padding: 6, gap: 4 },
  selectOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: borderRadius.md,
    backgroundColor: colors.white,
  },
  selectOptionActive: { backgroundColor: '#F0FDF4' },
  selectOptionText: { flex: 1, fontSize: fontSize.md, color: colors.text, fontFamily: fontFamily.medium },
  selectOptionTextActive: { color: colors.primary, fontFamily: fontFamily.semiBold },

  // Error
  errorText: { fontSize: fontSize.sm, color: colors.error, marginTop: 4, fontFamily: fontFamily.regular },

  // Wizard progress
  wizProgressWrap: { marginBottom: spacing.sm, gap: 6 },
  wizProgressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.gray100, overflow: 'hidden' },
  wizProgressFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  wizStepLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: fontFamily.medium },

  // Content summary pill
  contentSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md,
    padding: spacing.sm, borderRadius: borderRadius.md, backgroundColor: '#F0FDF4',
    borderWidth: 1, borderColor: colors.border,
  },
  contentSummaryText: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontFamily: fontFamily.medium },

  // Deadline picker
  dpCard: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg,
    padding: spacing.sm, backgroundColor: colors.white,
  },
  dpHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  dpNavBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray100 },
  dpMonthTitle: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.text },
  dpWeekRow: { flexDirection: 'row', marginBottom: 4 },
  dpWeekLabel: { width: `${100 / 7}%`, textAlign: 'center', fontSize: fontSize.xs, color: colors.textMuted, fontFamily: fontFamily.medium },
  dpGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dpCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.sm },
  dpCellSelected: { backgroundColor: colors.primary },
  dpCellDisabled: { opacity: 0.3 },
  dpCellText: { fontSize: fontSize.sm, color: colors.text, fontFamily: fontFamily.regular },
  dpCellTextSelected: { color: colors.white, fontFamily: fontFamily.semiBold },
  dpCellTextDisabled: { color: colors.textMuted },
  dpSelectedLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.medium, marginTop: spacing.sm },

  // Study window cards
  windowCard: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    padding: spacing.sm, backgroundColor: colors.white,
  },
  windowCardDisabled: { backgroundColor: colors.gray50, opacity: 0.75 },
  windowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  windowTitle: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.text },
  skipToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  skipCheckbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  skipCheckboxOn: { backgroundColor: colors.textMuted, borderColor: colors.textMuted },
  skipLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: fontFamily.medium },
  windowTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },

  // Recap card
  recapCard: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    padding: spacing.sm, backgroundColor: colors.gray50, gap: 6,
  },
  recapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  recapKey: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.medium },
  recapVal: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontFamily: fontFamily.semiBold, textAlign: 'right' },

  // Pattern selector
  patternOption: {
    flex: 1, padding: spacing.sm, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.white,
  },
  patternOptionActive: { borderColor: colors.primary, backgroundColor: '#F0FDF4' },
  patternOptionText: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.medium },
  patternOptionTextActive: { color: colors.primary, fontFamily: fontFamily.semiBold },

  // Wizard footer nav
  wizFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  wizFooterBack: {
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  wizFooterNext: {
    flex: 1, backgroundColor: colors.primary, borderRadius: borderRadius.md,
    padding: spacing.md, alignItems: 'center', justifyContent: 'center',
  },
});
