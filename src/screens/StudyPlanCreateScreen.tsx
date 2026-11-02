// Full-screen study plan creator (WP1 shell). Replaces the old AIAutoTimetableModal sheet.
// Steps: scope, dates, times, reminder (flag only), review.
// Route params: { courseId, courseName }. Route registration happens in AppNavigator (WP5).

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, AccessibilityInfo } from 'react-native';
import { RouteProp, ParamListBase, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontFamily, borderRadius, spacing } from '../constants/theme';
import { KeyboardShiftView } from '../components/keyboard/keyboardStick';
import WizardHeader from '../components/timetable/planWizard/WizardHeader';
import WizardBottomBar from '../components/timetable/planWizard/WizardBottomBar';
import StepScope from '../components/timetable/planWizard/StepScope';
import StepDates from '../components/timetable/planWizard/StepDates';
import StepStudyTimes from '../components/timetable/planWizard/StepStudyTimes';
import StepReminder from '../components/timetable/planWizard/StepReminder';
import StepReview, { Feasibility } from '../components/timetable/planWizard/StepReview';
import {
  FeasibilityState, REMINDER_LABEL, STEP_TITLE, StepId,
  estimateDailyHours, formatDayMonth, formatMinutesLabel, initialState, scopeLabelFor,
  toGeneratePayload, validateStep, wizardReducer,
} from '../components/timetable/planWizard/state';
import { useSubjectsForCourse, useChaptersForSubject, useTopicsForChapter, useScopeContent } from '../hooks/useScopeContent';
import { evaluateFeasibility, generatePlan, GenerateResult } from '../services/studyPlanApi';
import { applyPlanChannel } from '../services/timetableReminders';
import { setCourseRemindersOff } from '../services/localReminderPrefs';
import { scheduleStudyReminders } from '../services/scheduledNotifications';
import { useAuth } from '../context/AuthContext';
import { useReminderPermissions } from '../hooks/useReminderPermissions';
import { probeReminderSupport, useTimetableReminderSupport } from '../hooks/useTimetableReminderSupport';
import { TINT } from '../components/reminders/palette';

export type StudyPlanCreateParams = { StudyPlanCreate: { courseId: string; courseName: string } };

export default function StudyPlanCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const route = useRoute<RouteProp<StudyPlanCreateParams, 'StudyPlanCreate'>>();
  const courseId = route.params?.courseId ?? null;
  const courseName = route.params?.courseName ?? '';
  // The reminder step is always part of the wizard (plan F.2). Which channels it offers comes from the runtime check.
  const remindersOn = true;
  const { user } = useAuth();
  const perms = useReminderPermissions();
  const support = useTimetableReminderSupport();

  const [state, dispatch] = useReducer(
    wizardReducer,
    null,
    () => initialState({ courseId, courseName, remindersOn, today: new Date() }),
  );
  const currentStepId: StepId = state.steps[state.stepIndex];
  const saving = state.status === 'saving';
  const saved = state.status === 'saved';

  // ─── data ──────────────────────────────────────────────────────────────────
  const subjectsQ = useSubjectsForCourse(courseId);
  const [advSubjectId, setAdvSubjectId] = useState<string | null>(null);
  const chaptersQ = useChaptersForSubject(advSubjectId);
  const topicsQ = useTopicsForChapter(state.chapterId);
  const content = useScopeContent(courseId, state.scopeMode, state.subjectIds, state.chapterId, state.topicId);

  // Keep the reducer's list of all subjects in sync with what was loaded.
  useEffect(() => {
    dispatch({ type: 'setAllSubjects', ids: subjectsQ.subjects.map(s => s.id) });
  }, [subjectsQ.subjects]);

  const subjectNames = useMemo(() => {
    const map: Record<string, string> = {};
    subjectsQ.subjects.forEach(s => { map[s.id] = s.name; });
    return map;
  }, [subjectsQ.subjects]);

  const chapterName = chaptersQ.chapters.find(c => c.id === state.chapterId)?.name ?? null;
  const topicName = topicsQ.topics.find(t => t.id === state.topicId)?.name ?? null;
  const scopeLabel = scopeLabelFor(state, { subjects: subjectNames, chapter: chapterName, topic: topicName });

  const contentSummary = content.loading
    ? 'Counting lectures…'
    : content.items.length === 0
      ? 'No published lectures for this scope yet'
      : `${formatMinutesLabel(content.totalMinutes)} across ${content.lectureCount} published lecture${content.lectureCount === 1 ? '' : 's'}`;

  // ─── feasibility (runs when the review step opens) ──────────────────────────
  const [feas, setFeas] = useState<Feasibility | null>(null);
  const [checking, setChecking] = useState(false);
  const [feasError, setFeasError] = useState<string | null>(null);

  // Uses the values of the render it was created in (review step opened, or Check again tapped).
  async function runFeasibility() {
    setChecking(true);
    setFeasError(null);
    setFeas(null);
    try {
      const data = await evaluateFeasibility({
        scopeLabel,
        contentDurationMinutes: content.totalMinutes,
        startDate: state.startDate,
        deadline: state.deadline,
        dailyHours: estimateDailyHours(state),
      });
      setFeas(data);
    } catch {
      setFeasError('Could not check the plan. Tap Check again.');
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (currentStepId === 'review') runFeasibility();
    // Only when the review step opens (not on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStepId]);

  const feasibilityState: FeasibilityState = feas === null
    ? null
    : feas.verdict === 'too_short' ? 'too_short' : feas.verdict === 'generous' ? 'generous' : 'ok';

  const check = validateStep(state, currentStepId, {
    contentItems: content.items.length,
    contentLoading: content.loading,
    feasibility: feasibilityState,
  });
  let canNext = check.ok;
  let reason = check.reason;
  if (currentStepId === 'review' && feas === null && !checking) {
    canNext = false;
    reason = feasError ?? 'Checking your plan...';
  }
  const nextEnabled = canNext && !saving;

  // ─── exit: header close, Android back, discard prompt ───────────────────────
  const exitingRef = useRef(false);
  const firstStepRender = useRef(true);

  function confirmDiscard(onDiscard: () => void) {
    Alert.alert('Discard this plan?', 'Your choices will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onDiscard },
    ]);
  }

  function exitScreen() {
    exitingRef.current = true;
    navigation.goBack();
  }

  function requestClose() {
    if (saving) return;
    if (state.dirty && !saved) confirmDiscard(exitScreen);
    else exitScreen();
  }

  // Android hardware back (and swipe back): previous step first; leave only from step 1.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (exitingRef.current || saved) return;
      if (saving) { e.preventDefault(); return; }
      if (state.stepIndex > 0) {
        e.preventDefault();
        dispatch({ type: 'back' });
        return;
      }
      if (!state.dirty) return;
      e.preventDefault();
      confirmDiscard(() => {
        exitingRef.current = true;
        navigation.dispatch(e.data.action);
      });
    });
    return unsubscribe;
  }, [navigation, saving, saved, state.stepIndex, state.dirty]);

  // Announce each step change for screen readers.
  useEffect(() => {
    if (firstStepRender.current) { firstStepRender.current = false; return; }
    AccessibilityInfo.announceForAccessibility(
      `Step ${state.stepIndex + 1} of ${state.steps.length}, ${STEP_TITLE[currentStepId]}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stepIndex]);

  // ─── save ──────────────────────────────────────────────────────────────────
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [reminderFailed, setReminderFailed] = useState(false);

  async function savePlan() {
    if (saving || saved) return;
    dispatch({ type: 'saveStart' });
    try {
      const res = await generatePlan(toGeneratePayload(state, content.items, scopeLabel));
      // The plan exists now. A channel failure must not look like a failed save (spec C.1 step 10).
      // 'none' goes through the service's own fallback (null until the DB migration is applied).
      let channelFailed = false;
      if (remindersOn && state.reminder !== null) {
        try {
          // Probe again at save time (cached for 12 h) so the choice matches what the server can store.
          const mode = await probeReminderSupport();
          if (mode.status === 'full') {
            if (!res.timetable_id) throw new Error('missing timetable_id');
            await applyPlanChannel(res.timetable_id, state.reminder);
          } else if (courseId) {
            // Basic mode: the choice lives on this phone. 'none' means No reminders for this course.
            await setCourseRemindersOff(courseId, state.reminder === 'none');
            await scheduleStudyReminders();
          }
        } catch {
          channelFailed = true;
        }
      }
      setReminderFailed(channelFailed);
      setResult(res);
      dispatch({ type: 'saveOk' });
    } catch (e) {
      const offline = e instanceof TypeError;
      dispatch({
        type: 'saveFail',
        error: offline
          ? 'No internet. Your choices are kept. Try again.'
          : 'Could not create the plan. Your choices are kept. Try again.',
      });
    }
  }

  function handleNext() {
    if (!nextEnabled) return;
    if (currentStepId === 'review') { savePlan(); return; }
    dispatch({ type: 'next' });
  }

  // ─── step body ──────────────────────────────────────────────────────────────
  function renderStep() {
    switch (currentStepId) {
      case 'scope':
        return (
          <StepScope
            state={state}
            dispatch={dispatch}
            subjects={subjectsQ.subjects}
            subjectsLoading={subjectsQ.loading}
            subjectsError={subjectsQ.error}
            onRetrySubjects={subjectsQ.reload}
            advanced={{
              subjectId: advSubjectId,
              onSubjectId: setAdvSubjectId,
              chapters: chaptersQ.chapters,
              chaptersLoading: chaptersQ.loading,
              topics: topicsQ.topics,
              topicsLoading: topicsQ.loading,
            }}
            content={{
              totalMinutes: content.totalMinutes,
              lectureCount: content.lectureCount,
              itemCount: content.items.length,
              loading: content.loading,
              error: content.error,
            }}
            onRetry={content.retry}
          />
        );
      case 'dates':
        return (
          <StepDates
            startDate={state.startDate}
            deadline={state.deadline}
            onStart={date => dispatch({ type: 'setStart', date })}
            onDeadline={date => dispatch({ type: 'setDeadline', date })}
          />
        );
      case 'times':
        return <StepStudyTimes state={state} dispatch={dispatch} />;
      case 'reminder':
        return (
          <StepReminder
            value={state.reminder}
            channels={support.channels}
            onChange={value => dispatch({ type: 'setReminder', value })}
            hasEmail={!!user?.email}
            permission={perms.notifications}
            exactAlarmOk={perms.exactAlarms !== 'denied'}
            onOpenSettings={() => (state.reminder === 'call' && perms.exactAlarms === 'denied'
              ? perms.openExactAlarmSettings()
              : perms.openNotificationSettings())}
          />
        );
      case 'review':
        return (
          <StepReview
            state={state}
            dispatch={dispatch}
            courseName={courseName}
            scopeLabel={scopeLabel}
            contentSummary={contentSummary}
            feasibility={feas}
            checking={checking}
            onRecheck={runFeasibility}
            onEdit={step => dispatch({ type: 'goto', step })}
          />
        );
    }
  }

  // ─── success view ───────────────────────────────────────────────────────────
  const sessions = result?.sessions_created;
  const successLine = [
    sessions !== undefined ? `${sessions} session${sessions === 1 ? '' : 's'}` : null,
    `from ${formatDayMonth(state.startDate)} to ${formatDayMonth(state.deadline)}`,
    remindersOn && state.reminder ? `Reminders by ${REMINDER_LABEL[state.reminder]}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <KeyboardShiftView style={styles.root}>
      <WizardHeader
        title="New study plan"
        subtitle={courseName}
        stepIndex={state.stepIndex}
        total={state.steps.length}
        stepLabel={STEP_TITLE[currentStepId]}
        onClose={requestClose}
      />

      {saved ? (
        <ScrollView contentContainerStyle={styles.successWrap}>
          <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          <Text style={styles.successTitle} accessibilityRole="header">Your plan is ready</Text>
          <Text style={styles.successSub}>{successLine}</Text>
          {reminderFailed && (
            <View style={styles.warnCard} accessibilityLiveRegion="polite">
              <Ionicons name="warning-outline" size={18} color={colors.warning} />
              <Text style={styles.warnText}>Plan saved, but reminders were not set. Set reminders in Reminder settings.</Text>
            </View>
          )}
          <TouchableOpacity style={styles.primaryBtn} onPress={exitScreen} accessibilityRole="button">
            <Text style={styles.primaryBtnText}>View timetable</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.replace('TimetableReminderSettings', { courseId })}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>Reminder settings</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderStep()}
            {state.error ? (
              <View style={styles.errorCard} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
                <Text style={styles.errorText}>{state.error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <WizardBottomBar
            showBack={state.stepIndex > 0}
            nextLabel={currentStepId === 'review' ? 'Create plan' : 'Next'}
            nextEnabled={nextEnabled}
            reason={reason}
            busy={saving}
            onBack={() => dispatch({ type: 'back' })}
            onNext={handleNext}
          />
        </>
      )}

      {saving && (
        <View style={styles.savingOverlay} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.savingText}>Creating your plan...</Text>
        </View>
      )}
    </KeyboardShiftView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg },
  warnCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, marginTop: spacing.sm,
    borderRadius: borderRadius.md, backgroundColor: TINT.amberBg, alignSelf: 'stretch',
  },
  warnText: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontFamily: fontFamily.medium },
  errorCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md, padding: spacing.sm,
    borderRadius: borderRadius.md, backgroundColor: '#FEE2E2',
  },
  errorText: { flex: 1, fontSize: fontSize.sm, color: colors.error, fontFamily: fontFamily.medium },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  savingText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },
  successWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  successTitle: { fontSize: fontSize.xxl, fontFamily: fontFamily.heading, color: colors.text, textAlign: 'center' },
  successSub: { fontSize: fontSize.md, fontFamily: fontFamily.regular, color: colors.textSecondary, textAlign: 'center' },
  primaryBtn: {
    alignSelf: 'stretch', height: 52, borderRadius: borderRadius.md, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.md,
  },
  primaryBtnText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.white },
  secondaryBtn: {
    alignSelf: 'stretch', height: 52, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },
});
