import { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize } from '../constants/theme';
import { supabase, PyqQuestion } from '../services/supabase';
import MathText, { containsLatex, buildKatexHtml, escapeHtml } from './MathText';

interface PYQTabProps {
  subjectId?: string;
}

const PYQ_TYPES = [
  { key: 'consolidated', label: 'Consolidated' },
  { key: 'important', label: 'Important' },
  { key: 'predictive', label: 'Predictive' },
] as const;

const DIFFICULTY_COLORS: Record<string, string> = {
  Low: '#10B981',
  Medium: '#F59E0B',
  Intermediate: '#F97316',
  Advanced: '#EF4444',
};

const PAGE_SIZE = 50;

function convertMathpixToStandard(text: string): string {
  if (!text) return '';
  let result = text;
  result = result.replace(/\\\(/g, '$').replace(/\\\)/g, '$');
  result = result.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
  return result;
}

function getOptionText(value: string | { text: string }): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'text' in value) return value.text;
  return String(value);
}

function stripLatex(text: string): string {
  return text
    .replace(/\$\$(.*?)\$\$/gs, '$1')
    .replace(/\$(.*?)\$/g, '$1')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MathOptionsWebView = memo(({ options }: { options: Record<string, any> }) => {
  const [height, setHeight] = useState(40);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setTimedOut(true), 2000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const onMessage = useCallback((event: any) => {
    const h = parseInt(event.nativeEvent.data, 10);
    if (h && h > 0) {
      setHeight(h);
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  }, []);

  const entries = Object.entries(options);

  if (timedOut && height <= 40) {
    return (
      <View style={styles.optionsList}>
        {entries.map(([key, value]) => {
          const text = convertMathpixToStandard(getOptionText(value));
          return (
            <View key={key} style={styles.optionPill}>
              <Text style={styles.optionLabel}>{key}.</Text>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionPlainText}>{stripLatex(text)}</Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  const optionsHtml = entries.map(([key, value]) => {
    const text = convertMathpixToStandard(getOptionText(value));
    return `<div style="display:flex;align-items:baseline;gap:6px;background:#F9FAFB;border-radius:8px;padding:6px 10px;margin-bottom:5px;">
<span style="font-weight:600;color:#6B7280;min-width:18px;">${key}.</span>
<span style="flex:1;color:#374151;">${escapeHtml(text)}</span>
</div>`;
  }).join('');

  const html = buildKatexHtml(optionsHtml, '#374151');

  return (
    <View style={[styles.optionsList, { height, overflow: 'hidden' }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={onMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scalesPageToFit={false}
        cacheEnabled={true}
        startInLoadingState={false}
      />
    </View>
  );
});

export default function PYQTab({ subjectId }: PYQTabProps) {
  const [activePyqType, setActivePyqType] = useState<string>('consolidated');
  const [questions, setQuestions] = useState<PyqQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const loadedCountRef = useRef(0);

  const fetchQuestions = useCallback(async (append: boolean = false) => {
    if (!subjectId) return;
    const offset = append ? loadedCountRef.current : 0;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const result = await supabase.getPyqQuestions(subjectId, activePyqType, undefined, undefined, PAGE_SIZE, offset);
      if (result.success && result.questions) {
        if (append) {
          setQuestions(prev => {
            const next = [...prev, ...result.questions!];
            loadedCountRef.current = next.length;
            return next;
          });
        } else {
          setQuestions(result.questions);
          loadedCountRef.current = result.questions.length;
        }
        setHasMore(result.hasMore || false);
      } else if (!append) {
        setQuestions([]);
        loadedCountRef.current = 0;
        setHasMore(false);
      }
    } catch (error) {
      console.error('[PYQTab] Error fetching questions:', error);
      if (!append) {
        setQuestions([]);
        loadedCountRef.current = 0;
        setHasMore(false);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [subjectId, activePyqType]);

  useEffect(() => {
    setQuestions([]);
    setHasMore(false);
    loadedCountRef.current = 0;
    fetchQuestions(false);
  }, [subjectId, activePyqType]);

  const renderSkeleton = () => (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCard} />
      ))}
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="document-text-outline" size={48} color={colors.gray300} />
      <Text style={styles.emptyText}>
        No {activePyqType} questions available yet.
      </Text>
    </View>
  );

  const renderOptions = (question: PyqQuestion) => {
    if (question.question_format === 'true_false') {
      return (
        <View style={styles.trueFalseRow}>
          <View style={styles.trueFalsePill}>
            <Text style={styles.trueFalseText}>True</Text>
          </View>
          <View style={styles.trueFalsePill}>
            <Text style={styles.trueFalseText}>False</Text>
          </View>
        </View>
      );
    }

    if (question.question_format === 'mcq' && question.options) {
      const entries = Object.entries(question.options);
      const anyLatex = entries.some(([, value]) => {
        const text = convertMathpixToStandard(getOptionText(value));
        return containsLatex(text);
      });

      if (anyLatex) {
        return <MathOptionsWebView options={question.options} />;
      }

      return (
        <View style={styles.optionsList}>
          {entries.map(([key, value]) => {
            const optionText = convertMathpixToStandard(getOptionText(value));
            return (
              <View key={key} style={styles.optionPill}>
                <Text style={styles.optionLabel}>{key}.</Text>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionPlainText}>{optionText}</Text>
                </View>
              </View>
            );
          })}
        </View>
      );
    }

    return null;
  };

  const renderBadges = (question: PyqQuestion) => (
    <View style={styles.badgeRow}>
      <View style={styles.badgeOutline}>
        <Text style={styles.badgeOutlineText}>
          {question.question_format === 'true_false' ? 'true/false' : question.question_format}
        </Text>
      </View>
      {question.difficulty && (
        <View style={[styles.badgeFilled, { backgroundColor: (DIFFICULTY_COLORS[question.difficulty] || colors.gray400) + '20' }]}>
          <Text style={[styles.badgeFilledText, { color: DIFFICULTY_COLORS[question.difficulty] || colors.gray400 }]}>
            {question.difficulty}
          </Text>
        </View>
      )}
      {question.marks != null && (
        <View style={styles.badgeSecondary}>
          <Text style={styles.badgeSecondaryText}>{question.marks} marks</Text>
        </View>
      )}
    </View>
  );

  const renderQuestionText = (text: string) => {
    const normalized = convertMathpixToStandard(text);
    if (containsLatex(normalized)) {
      return <MathText content={normalized} color={colors.gray800} />;
    }
    return <Text style={styles.questionPlainText}>{normalized}</Text>;
  };

  const renderQuestionCard = (question: PyqQuestion, index: number) => {
    return (
      <View key={question.id} style={styles.questionCard} data-testid={`card-pyq-question-${question.id}`}>
        <View style={styles.questionHeader}>
          <Text style={styles.questionNumber}>Q{index + 1}.</Text>
          <View style={styles.questionTextContainer}>
            {renderQuestionText(question.question_text)}
          </View>
        </View>
        {question.question_image_url ? (
          <Image
            source={{ uri: question.question_image_url }}
            style={styles.questionImage}
            resizeMode="contain"
          />
        ) : null}
        {renderOptions(question)}
        {renderBadges(question)}
      </View>
    );
  };

  if (!subjectId) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.gray300} />
        <Text style={styles.emptyText}>No subject selected.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="document-text-outline" size={20} color={colors.primary} />
        <Text style={styles.headerTitle}>PYQ's</Text>
      </View>

      <View style={styles.tabStrip}>
        {PYQ_TYPES.map((type) => {
          const isActive = activePyqType === type.key;
          return (
            <TouchableOpacity
              key={type.key}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActivePyqType(type.key)}
              data-testid={`button-pyq-type-${type.key}`}
            >
              <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                {type.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? renderSkeleton() : questions.length === 0 ? renderEmpty() : (
        <View style={styles.questionsList}>
          {questions.map((q, i) => renderQuestionCard(q, i))}
          {hasMore && (
            <TouchableOpacity
              style={styles.loadMoreButton}
              onPress={() => fetchQuestions(true)}
              disabled={loadingMore}
              data-testid="button-load-more-pyq"
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.loadMoreText}>Load More Questions</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.gray900,
  },
  tabStrip: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: colors.gray100,
    borderRadius: 10,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray500,
  },
  tabButtonTextActive: {
    color: '#fff',
  },
  questionsList: {
    paddingHorizontal: 16,
  },
  questionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.gray200,
    marginBottom: 10,
  },
  questionHeader: {
    flexDirection: 'row',
    gap: 6,
  },
  questionNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
  },
  questionTextContainer: {
    flex: 1,
  },
  questionPlainText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.gray800,
  },
  questionImage: {
    width: '100%',
    height: 192,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gray200,
    marginTop: 10,
  },
  optionsList: {
    marginTop: 10,
  },
  optionPill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.gray50,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 5,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray600,
    marginTop: 1,
    minWidth: 18,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionPlainText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.gray700,
  },
  trueFalseRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  trueFalsePill: {
    flex: 1,
    backgroundColor: colors.gray50,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  trueFalseText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray600,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  badgeOutline: {
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeOutlineText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.gray500,
    textTransform: 'uppercase',
  },
  badgeFilled: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeFilledText: {
    fontSize: 10,
    fontWeight: '600',
  },
  badgeSecondary: {
    backgroundColor: colors.gray100,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeSecondaryText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.gray500,
  },
  loadMoreButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: colors.gray400,
    textAlign: 'center',
  },
  skeletonContainer: {
    paddingHorizontal: 16,
    gap: 12,
  },
  skeletonCard: {
    height: 80,
    borderRadius: 12,
    backgroundColor: colors.gray100,
  },
});
