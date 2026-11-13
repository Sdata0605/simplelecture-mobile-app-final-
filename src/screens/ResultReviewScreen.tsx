import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, FlatList, Animated, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../constants/theme';
import SummaryHero from '../components/results/SummaryHero';
import FilterChips, { FilterKey } from '../components/results/FilterChips';
import QuestionReviewCard from '../components/results/QuestionReviewCard';
import {
  ReviewItem,
  buildReviewItems,
  countStatuses,
  formatReviewDate,
  getResultTitle,
  parsePercent,
} from '../utils/resultHelpers';

type Route = RouteProp<RootStackParamList, 'ResultReview'>;
type Nav = NativeStackNavigationProp<RootStackParamList, 'ResultReview'>;

type LoadStatus = 'loading' | 'error' | 'ready';

/** Unwraps test_questions rows ({ question: {...} }) or returns flat question objects. */
const unwrapQuestion = (row: any) => (row && row.question) || row;

export default function ResultReviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const result: any = route.params?.result ?? {};

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const paperId: string | null = result.paper_id ?? null;
      const source: string | undefined = result.source;
      const answerMap: Record<string, any> = { ...(result.answers || {}) };
      let questions: any[] = [];

      if (source === 'paper_test_results') {
        const userId = await AsyncStorage.getItem('user_id');
        if (paperId) {
          const [qRes, aRes] = await Promise.all([
            supabase.getPreviousYearQuestions(paperId),
            userId ? supabase.getStudentAnswers(paperId, userId) : Promise.resolve({ success: true, answers: [] as any[] }),
          ]);
          if (!qRes.success) throw new Error(qRes.error || 'Failed to load questions');
          questions = (qRes.questions || []).map(unwrapQuestion);
          (aRes.answers || []).forEach((row: any) => {
            if (row?.question_id === null || row?.question_id === undefined) return;
            const key = String(row.question_id);
            if (answerMap[key] === undefined || answerMap[key] === null) {
              answerMap[key] = {
                student_answer: row.student_answer ?? row.answer ?? '',
                is_correct: row.is_correct,
                marks_awarded: row.marks_awarded,
                max_marks: row.max_marks,
                feedback: row.feedback,
                image_url: row.image_url,
              };
            }
          });
        }
      } else {
        const ids = Object.keys(answerMap);
        const qRes = await supabase.getQuestionsByIds(ids);
        if (!qRes.success) throw new Error(qRes.error || 'Failed to load questions');
        questions = qRes.questions || [];
      }

      const built = buildReviewItems(questions, answerMap);
      if (!mounted.current) return;
      setItems(built);
      setStatus('ready');
    } catch (e) {
      console.log('[ResultReviewScreen] load failed', e);
      if (!mounted.current) return;
      setStatus('error');
    }
    // result is a route param and does not change for this screen instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => countStatuses(items), [items]);
  const totalQuestions = items.length > 0 ? items.length : Number(result.total_questions) || 0;
  const percent = useMemo(() => {
    const explicit = parsePercent(result.percentage);
    if (explicit !== null) return explicit;
    return totalQuestions > 0 ? Math.round((counts.correct / totalQuestions) * 100) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.percentage, counts.correct, totalQuestions]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'correct':
        return items.filter((i) => i.status === 'correct');
      case 'wrong':
        return items.filter((i) => i.status === 'wrong');
      case 'unanswered':
        return items.filter((i) => i.status === 'unanswered');
      default:
        return items;
    }
  }, [items, filter]);

  const filterCounts = {
    all: items.length,
    correct: counts.correct,
    wrong: counts.wrong,
    unanswered: counts.unanswered,
  };

  const title = getResultTitle(result);
  const dateLabel = formatReviewDate(result.submitted_at);

  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>
      <View style={styles.headerText}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {dateLabel ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {dateLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );

  const renderBody = () => {
    if (status === 'loading') return <Skeleton />;

    if (status === 'error') {
      return (
        <CenteredMessage
          icon="cloud-offline-outline"
          iconSize={48}
          title="Couldn't load your answers"
          action={
            <Pressable
              onPress={load}
              accessibilityRole="button"
              accessibilityLabel="Retry"
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          }
        />
      );
    }

    if (items.length === 0) {
      return (
        <CenteredMessage
          icon="document-text-outline"
          iconSize={48}
          title="Questions for this test are not available."
        />
      );
    }

    return (
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => <QuestionReviewCard item={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <SummaryHero
              category={result.paper_category}
              dateIso={result.submitted_at}
              percent={percent}
              correct={counts.correct}
              total={totalQuestions}
              timeSeconds={result.time_taken_seconds}
              wrong={counts.wrong}
              unanswered={counts.unanswered}
            />
            <View style={styles.chipsWrap}>
              <FilterChips value={filter} counts={filterCounts} onChange={setFilter} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyFilter}>No questions in this filter.</Text>
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {header}
      {renderBody()}
    </SafeAreaView>
  );
}

function Skeleton() {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={styles.skeletonWrap}>
      {[0, 1, 2].map((i) => (
        <Animated.View key={i} style={[styles.skeletonCard, { opacity }]}>
          <View style={[styles.skeletonLine, { width: '30%' }]} />
          <View style={[styles.skeletonLine, { width: '90%', height: 14 }]} />
          <View style={[styles.skeletonLine, { width: '70%', height: 14 }]} />
        </Animated.View>
      ))}
    </View>
  );
}

function CenteredMessage({
  icon,
  iconSize,
  title,
  action,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconSize: number;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.centered}>
      <Ionicons name={icon} size={iconSize} color={colors.textMuted} />
      <Text style={styles.centeredTitle}>{title}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: fontFamily.headingSemiBold,
    fontSize: fontSize.lg + 2,
    color: colors.text,
  },
  headerSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  listHeader: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  chipsWrap: {
    marginTop: 0,
  },
  emptyFilter: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  skeletonWrap: {
    padding: spacing.md,
    gap: spacing.md,
  },
  skeletonCard: {
    height: 140,
    backgroundColor: colors.gray200,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.gray300,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  centeredTitle: {
    fontFamily: fontFamily.headingSemiBold,
    fontSize: fontSize.lg + 2,
    color: colors.text,
    textAlign: 'center',
  },
  retryButton: {
    height: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.white,
  },
});
