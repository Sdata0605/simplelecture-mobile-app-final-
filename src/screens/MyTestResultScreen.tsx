import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import MathText from '../components/MathText';
import {
  useSelfTest,
  useSelfTestQuestions,
  useSelfTestAnswers,
  useChapterTopicNames,
  regradeSelfTest,
  deriveStatus,
  SelfTestQuestion,
  SelfTestAnswer,
} from '../hooks/useMyTests';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'MyTestResult'>;

interface Tier { label: string; color: string; bg: string; icon: any; }
function getTier(pct: number): Tier {
  if (pct >= 90) return { label: 'Outstanding', color: '#7C3AED', bg: '#F5F3FF', icon: 'trophy' };
  if (pct >= 75) return { label: 'Great work', color: '#16A34A', bg: '#F0FDF4', icon: 'ribbon' };
  if (pct >= 50) return { label: 'Good effort', color: '#2563EB', bg: '#EFF6FF', icon: 'thumbs-up' };
  return { label: 'Keep practising', color: '#DC2626', bg: '#FEF2F2', icon: 'fitness' };
}

export default function MyTestResultScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const { testId } = route.params;

  const { test, isLoading: testLoading, refetch: refetchTest } = useSelfTest(testId);
  const { data: questions, isLoading: qLoading } = useSelfTestQuestions(testId);
  const { data: answers, isLoading: aLoading, refetch: refetchAnswers } = useSelfTestAnswers(testId);
  const [regrading, setRegrading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refetchTest();
      refetchAnswers();
    }, [refetchTest, refetchAnswers])
  );

  const answerByQ = useMemo(() => {
    const m = new Map<string, SelfTestAnswer>();
    answers.forEach((a) => m.set(a.self_test_question_id, a));
    return m;
  }, [answers]);

  const orderedQuestions = useMemo(() => {
    const mcq = questions.filter((q) => q.section === 'mcq');
    const written = questions.filter((q) => q.section !== 'mcq');
    return [...mcq, ...written];
  }, [questions]);

  // Per-chapter performance + weak topics derived from graded answers.
  const { chapterStats, weakTopics } = useMemo(() => {
    const chapterAgg = new Map<string, { scored: number; max: number }>();
    const topicAgg = new Map<string, { scored: number; max: number }>();
    for (const q of questions) {
      const a = answerByQ.get(q.id);
      const scored = a?.marks_awarded ?? 0;
      const max = a?.max_marks ?? q.marks ?? 1;
      if (q.chapter_id) {
        const c = chapterAgg.get(q.chapter_id) ?? { scored: 0, max: 0 };
        c.scored += scored; c.max += max; chapterAgg.set(q.chapter_id, c);
      }
      if (q.topic_id) {
        const t = topicAgg.get(q.topic_id) ?? { scored: 0, max: 0 };
        t.scored += scored; t.max += max; topicAgg.set(q.topic_id, t);
      }
    }
    const chapterStats = Array.from(chapterAgg.entries()).map(([id, v]) => ({
      id, pct: v.max > 0 ? Math.round((v.scored / v.max) * 100) : 0, scored: v.scored, max: v.max,
    }));
    const weakTopics = Array.from(topicAgg.entries())
      .map(([id, v]) => ({ id, pct: v.max > 0 ? Math.round((v.scored / v.max) * 100) : 0 }))
      .filter((t) => t.pct < 50);
    return { chapterStats, weakTopics };
  }, [questions, answerByQ]);

  const { chapterMap, topicMap } = useChapterTopicNames(
    chapterStats.map((c) => c.id),
    weakTopics.map((t) => t.id)
  );

  const handleRegrade = async () => {
    setRegrading(true);
    try {
      await regradeSelfTest(testId);
      await Promise.all([refetchTest(), refetchAnswers()]);
      Alert.alert('Re-evaluated', 'Your answers have been re-graded.');
    } catch (e: any) {
      Alert.alert('Re-evaluation failed', e?.message ?? 'Please try again later.');
    } finally {
      setRegrading(false);
    }
  };

  if (testLoading || qLoading || aLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!test) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.muted}>Result not found.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!test.submitted_at) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Ionicons name="hourglass-outline" size={48} color={colors.textMuted} />
          <Text style={styles.gateTitle}>No result yet</Text>
          <Text style={styles.muted}>
            This test hasn't been submitted, so there's no result to show.
          </Text>
          {deriveStatus(test) === 'live' ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.replace('MyTestTake', { testId })}
              testID="button-take-test"
            >
              <Text style={styles.primaryBtnText}>Take Test</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()} testID="button-go-back">
              <Text style={styles.primaryBtnText}>Go Back</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const pct = test.percentage ?? 0;
  const tier = getTier(pct);
  const totalScore = test.total_score ?? 0;
  const totalMax = orderedQuestions.reduce((s, q) => s + (answerByQ.get(q.id)?.max_marks ?? q.marks ?? 1), 0);
  const hasPending = answers.some((a) => (a.ai_feedback ?? '').toLowerCase().includes('pending'));

  let counter = 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} testID="button-back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Result</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <View style={[styles.scoreCard, { backgroundColor: tier.bg }]}>
          <Ionicons name={tier.icon} size={36} color={tier.color} />
          <Text style={[styles.scorePct, { color: tier.color }]} testID="text-score-percentage">{pct}%</Text>
          <Text style={[styles.tierLabel, { color: tier.color }]}>{tier.label}</Text>
          <Text style={styles.scoreSub} testID="text-score-fraction">{totalScore} / {totalMax} marks</Text>
          <Text style={styles.testTitle} numberOfLines={2}>{test.title}</Text>
          <View style={styles.scoreBreakdown}>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownValue}>{test.mcq_score ?? 0}</Text>
              <Text style={styles.breakdownLabel}>MCQ</Text>
            </View>
            <View style={styles.breakdownDivider} />
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownValue}>{test.written_score ?? 0}</Text>
              <Text style={styles.breakdownLabel}>Written</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.regradeBtn} onPress={handleRegrade} disabled={regrading} testID="button-regrade">
          {regrading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text style={styles.regradeText}>Re-evaluate with AI</Text>
            </>
          )}
        </TouchableOpacity>
        {hasPending && (
          <Text style={styles.pendingNote} testID="text-pending-note">
            Some written answers are still pending AI grading. Tap “Re-evaluate with AI” to grade them.
          </Text>
        )}

        {weakTopics.length > 0 && (
          <View style={styles.weakCard} testID="card-weak-topics">
            <View style={styles.weakHeader}>
              <Ionicons name="alert-circle" size={18} color={colors.warning} />
              <Text style={styles.weakTitle}>Topics to review</Text>
            </View>
            <View style={styles.weakChips}>
              {weakTopics.map((t) => (
                <View key={t.id} style={styles.weakChip} testID={`chip-weak-topic-${t.id}`}>
                  <Text style={styles.weakChipText}>{topicMap.get(t.id) ?? 'Topic'} · {t.pct}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {chapterStats.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Performance by chapter</Text>
            {chapterStats.map((c) => (
              <View key={c.id} style={styles.barRow} testID={`bar-chapter-${c.id}`}>
                <View style={styles.barHeader}>
                  <Text style={styles.barLabel} numberOfLines={1}>{chapterMap.get(c.id) ?? 'Chapter'}</Text>
                  <Text style={[styles.barPct, { color: c.pct < 50 ? colors.error : colors.primary }]}>{c.pct}%</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${c.pct}%`, backgroundColor: c.pct < 50 ? colors.error : colors.primary }]} />
                </View>
                <Text style={styles.barSub}>{c.scored} / {c.max} marks</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Answer review</Text>
          {orderedQuestions.map((q) => {
            counter += 1;
            const a = answerByQ.get(q.id);
            return <ReviewItem key={q.id} q={q} a={a} index={counter} />;
          })}
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ReviewItem({ q, a, index }: { q: SelfTestQuestion; a: SelfTestAnswer | undefined; index: number }) {
  const isMcq = q.section === 'mcq';
  const correct = !!a?.is_correct;
  const marks = a?.marks_awarded ?? 0;
  const max = a?.max_marks ?? q.marks ?? 1;
  const [showYours, setShowYours] = useState(false);
  const [showCorrect, setShowCorrect] = useState(false);

  const yourAnswer = a?.answer_text || a?.extracted_text || '';
  const correctAnswer = q.correct_answer || '';

  return (
    <View style={styles.reviewCard} testID={`card-review-${q.id}`}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewNum}>Q{index}</Text>
        <View style={[styles.reviewStatus, { backgroundColor: correct ? '#F0FDF4' : '#FEF2F2' }]}>
          <Ionicons name={correct ? 'checkmark-circle' : 'close-circle'} size={14} color={correct ? colors.success : colors.error} />
          <Text style={[styles.reviewStatusText, { color: correct ? colors.success : colors.error }]}>{marks} / {max}</Text>
        </View>
      </View>
      <MathText content={q.question_text} textStyle={styles.reviewQText} color={colors.text} />

      {isMcq ? (
        <View style={styles.reviewBody}>
          <Text style={styles.reviewLabel}>Your answer: <Text style={styles.reviewValue}>{a?.selected_option ?? '—'}</Text></Text>
          {!correct && (
            <Text style={styles.reviewLabel}>Correct: <Text style={[styles.reviewValue, { color: colors.success }]}>{q.correct_answer ?? '—'}</Text></Text>
          )}
        </View>
      ) : (
        <View style={styles.reviewBody}>
          {!!a?.answer_image_url && <Image source={{ uri: a.answer_image_url }} style={styles.reviewImage} />}

          <TouchableOpacity
            style={styles.expandRow}
            onPress={() => setShowYours((v) => !v)}
            testID={`button-toggle-your-answer-${q.id}`}
          >
            <Ionicons name="person-outline" size={14} color={colors.text} />
            <Text style={styles.expandLabel}>Your answer</Text>
            <Ionicons name={showYours ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </TouchableOpacity>
          {showYours && (
            <View style={styles.expandBody} testID={`text-your-answer-${q.id}`}>
              {yourAnswer ? (
                <MathText content={yourAnswer} textStyle={styles.reviewValue} color={colors.text} />
              ) : (
                <Text style={styles.expandEmpty}>No answer provided.</Text>
              )}
            </View>
          )}

          <TouchableOpacity
            style={styles.expandRow}
            onPress={() => setShowCorrect((v) => !v)}
            testID={`button-toggle-correct-answer-${q.id}`}
          >
            <Ionicons name="checkmark-done-outline" size={14} color={colors.success} />
            <Text style={[styles.expandLabel, { color: colors.success }]}>Correct answer</Text>
            <Ionicons name={showCorrect ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </TouchableOpacity>
          {showCorrect && (
            <View style={styles.expandBody} testID={`text-correct-answer-${q.id}`}>
              {correctAnswer ? (
                <MathText content={correctAnswer} textStyle={styles.reviewValue} color={colors.text} />
              ) : (
                <Text style={styles.expandEmpty}>Model answer not available.</Text>
              )}
            </View>
          )}

          {!!a?.ai_feedback && (
            <View style={styles.feedbackBox}>
              <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
              <Text style={styles.feedbackText}>{a.ai_feedback}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  muted: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', fontFamily: fontFamily.regular },
  primaryBtn: { marginTop: spacing.md, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  primaryBtnText: { color: colors.white, fontFamily: fontFamily.semiBold, fontSize: fontSize.md },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.xl, color: colors.text, fontFamily: fontFamily.heading },
  list: { padding: spacing.md, gap: spacing.md },
  scoreCard: { borderRadius: borderRadius.xl, padding: spacing.lg, alignItems: 'center', gap: 4 },
  scorePct: { fontSize: 44, fontFamily: fontFamily.heading, lineHeight: 50 },
  tierLabel: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold },
  scoreSub: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.medium },
  testTitle: { fontSize: fontSize.md, color: colors.text, fontFamily: fontFamily.semiBold, textAlign: 'center', marginTop: spacing.xs },
  scoreBreakdown: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm, backgroundColor: colors.white, borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  breakdownItem: { alignItems: 'center' },
  breakdownValue: { fontSize: fontSize.lg, color: colors.text, fontFamily: fontFamily.semiBold },
  breakdownLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: fontFamily.regular },
  breakdownDivider: { width: 1, height: 28, backgroundColor: colors.border },
  regradeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 12, backgroundColor: '#F0FDF4' },
  regradeText: { color: colors.primary, fontSize: fontSize.md, fontFamily: fontFamily.semiBold },
  weakCard: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: borderRadius.lg, padding: spacing.md, gap: 6 },
  weakHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weakTitle: { fontSize: fontSize.md, color: '#92400E', fontFamily: fontFamily.semiBold },
  weakChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  weakChip: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A', borderRadius: borderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  weakChipText: { fontSize: fontSize.xs, color: '#92400E', fontFamily: fontFamily.medium },
  pendingNote: { fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: fontFamily.regular },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, color: colors.text, fontFamily: fontFamily.semiBold },
  barRow: { backgroundColor: colors.white, borderRadius: borderRadius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, gap: 6 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  barLabel: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontFamily: fontFamily.medium },
  barSub: { fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: fontFamily.regular },
  barPct: { fontSize: fontSize.sm, fontFamily: fontFamily.semiBold },
  barTrack: { height: 8, backgroundColor: colors.gray100, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  reviewCard: { backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewNum: { fontSize: fontSize.sm, color: colors.primary, fontFamily: fontFamily.semiBold },
  reviewStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: borderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  reviewStatusText: { fontSize: fontSize.xs, fontFamily: fontFamily.semiBold },
  reviewQText: { fontSize: fontSize.md, lineHeight: 21 },
  reviewBody: { gap: 6 },
  reviewLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.medium },
  reviewValue: { color: colors.text, fontFamily: fontFamily.regular },
  reviewImage: { width: '100%', height: 160, borderRadius: borderRadius.md, backgroundColor: colors.gray100, resizeMode: 'cover' },
  feedbackBox: { flexDirection: 'row', gap: 6, backgroundColor: '#F0FDF4', borderRadius: borderRadius.md, padding: spacing.sm },
  feedbackText: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontFamily: fontFamily.regular, lineHeight: 19 },
  gateTitle: { fontSize: fontSize.lg, color: colors.text, fontFamily: fontFamily.semiBold, marginTop: spacing.xs },
  expandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  expandLabel: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontFamily: fontFamily.semiBold },
  expandBody: { paddingBottom: spacing.xs, paddingLeft: 20 },
  expandEmpty: { fontSize: fontSize.sm, color: colors.textMuted, fontFamily: fontFamily.regular, fontStyle: 'italic' },
});
