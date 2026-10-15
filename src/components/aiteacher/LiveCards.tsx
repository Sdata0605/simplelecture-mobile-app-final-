import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../../constants/theme';
import { QuizItem, VisualData } from '../../services/aiTeacherLiveService';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// 1. Interactive Slide Card
export function LiveSlideCard({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <View style={styles.slideCard}>
      <LinearGradient
        colors={['#ECFDF5', '#FFFFFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.slideGradient}
      >
        <View style={styles.cardHeaderRow}>
          <Ionicons name="easel-outline" size={16} color="#059669" />
          <Text style={styles.slideTitle}>{title}</Text>
        </View>
        <View style={styles.bulletsWrap}>
          {bullets.map((b, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{b}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

// 2. Interactive MCQ Quiz Card
export function LiveQuizCard({
  quiz,
  onAnswer,
}: {
  quiz: QuizItem;
  onAnswer?: (index: number) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;

  const handleSelect = (index: number) => {
    if (answered) return;
    setPicked(index);
    onAnswer?.(index);
  };

  return (
    <View style={styles.quizCard}>
      <View style={styles.quizHeader}>
        <View style={styles.quizBadge}>
          <Ionicons name="help-circle" size={13} color="#D97706" />
          <Text style={styles.quizBadgeText}>Interactive Quiz</Text>
        </View>
      </View>

      <Text style={styles.quizQuestion}>{quiz.question}</Text>

      <View style={styles.quizOptionsList}>
        {quiz.options.map((opt, i) => {
          const isCorrect = i === quiz.correctIndex;
          const isPicked = picked === i;

          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.quizOptionBtn,
                answered && isCorrect && styles.quizOptionCorrect,
                answered && isPicked && !isCorrect && styles.quizOptionWrong,
                answered && !isPicked && !isCorrect && { opacity: 0.6 },
              ]}
              onPress={() => handleSelect(i)}
              disabled={answered}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.optionLetterCircle,
                  answered && isCorrect && { backgroundColor: '#10B981', borderColor: '#10B981' },
                  answered && isPicked && !isCorrect && { backgroundColor: '#EF4444', borderColor: '#EF4444' },
                ]}
              >
                <Text
                  style={[
                    styles.optionLetterText,
                    answered && (isCorrect || isPicked) && { color: '#FFFFFF' },
                  ]}
                >
                  {LETTERS[i] || `${i + 1}`}
                </Text>
              </View>
              <Text style={styles.quizOptionText}>{opt}</Text>
              {answered && isCorrect && (
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              )}
              {answered && isPicked && !isCorrect && (
                <Ionicons name="close-circle" size={18} color="#EF4444" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {answered && (
        <View style={styles.quizFeedbackBox}>
          <Text
            style={[
              styles.quizFeedbackText,
              picked === quiz.correctIndex ? { color: '#047857' } : { color: '#B91C1C' },
            ]}
          >
            {picked === quiz.correctIndex
              ? '✨ Correct! Excellent work!'
              : `❌ Not quite. The correct answer was option ${LETTERS[quiz.correctIndex]}.`}
          </Text>
          {quiz.explanation ? (
            <Text style={styles.quizExplanationText}>💡 {quiz.explanation}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

// 3. Visual Card (Scenes, Steps, Timelines, Comparisons)
export function LiveVisualCard({ visual }: { visual: VisualData }) {
  const { kind, title, items, caption } = visual;

  return (
    <View style={styles.visualCard}>
      <View style={styles.visualHeader}>
        <Ionicons
          name={kind === 'steps' ? 'list' : kind === 'timeline' ? 'time' : 'sparkles'}
          size={16}
          color="#0369A1"
        />
        <Text style={styles.visualTitle}>{title}</Text>
      </View>

      {kind === 'steps' ? (
        <View style={styles.stepsWrap}>
          {items.map((it, i) => (
            <View key={i} style={styles.stepItemRow}>
              <View style={styles.stepIndexPill}>
                <Text style={styles.stepIndexText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepEmoji}>{it.emoji}</Text>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{it.title}</Text>
                {it.text ? <Text style={styles.stepDesc}>{it.text}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.sceneWrap}>
          {items.map((it, i) => (
            <View key={i} style={styles.sceneItem}>
              <Text style={styles.sceneEmoji}>{it.emoji}</Text>
              <Text style={styles.sceneTitle}>{it.title}</Text>
              {it.text ? <Text style={styles.sceneText}>{it.text}</Text> : null}
            </View>
          ))}
        </View>
      )}

      {caption ? (
        <View style={styles.captionBox}>
          <Text style={styles.captionText}>💡 {caption}</Text>
        </View>
      ) : null}
    </View>
  );
}

// 4. Understand Check Card
export function LiveUnderstandCard({
  topic,
  onChoose,
}: {
  topic?: string;
  onChoose: (choice: 'got_it' | 'somewhat' | 'confused') => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (choice: 'got_it' | 'somewhat' | 'confused') => {
    if (selected) return;
    setSelected(choice);
    onChoose(choice);
  };

  return (
    <View style={styles.understandCard}>
      <Text style={styles.understandQuestion}>
        Are you understanding{topic ? ` "${topic}"` : ' this concept'}?
      </Text>
      <View style={styles.understandBtnsRow}>
        <TouchableOpacity
          style={[styles.understandBtn, selected === 'got_it' && styles.understandBtnActive]}
          onPress={() => handleSelect('got_it')}
          disabled={!!selected}
        >
          <Text style={styles.understandEmoji}>👍</Text>
          <Text style={styles.understandBtnLabel}>Got it!</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.understandBtn, selected === 'somewhat' && styles.understandBtnActive]}
          onPress={() => handleSelect('somewhat')}
          disabled={!!selected}
        >
          <Text style={styles.understandEmoji}>🤔</Text>
          <Text style={styles.understandBtnLabel}>Somewhat</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.understandBtn, selected === 'confused' && styles.understandBtnActive]}
          onPress={() => handleSelect('confused')}
          disabled={!!selected}
        >
          <Text style={styles.understandEmoji}>😕</Text>
          <Text style={styles.understandBtnLabel}>Confused</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// 5. Big Question Card
export function LiveBigQuestionCard({
  question,
  hint,
  onSubmit,
}: {
  question: string;
  hint?: string;
  onSubmit: (ans: string) => void;
}) {
  const [answerText, setAnswerText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!answerText.trim() || submitted) return;
    setSubmitted(true);
    onSubmit(answerText.trim());
  };

  return (
    <View style={styles.bigqCard}>
      <View style={styles.bigqHeader}>
        <Ionicons name="create-outline" size={16} color="#7C3AED" />
        <Text style={styles.bigqBadge}>Concept Challenge</Text>
      </View>

      <Text style={styles.bigqQuestion}>{question}</Text>
      {hint ? <Text style={styles.bigqHint}>💡 Hint: {hint}</Text> : null}

      {!submitted ? (
        <View style={styles.bigqInputWrap}>
          <TextInput
            style={styles.bigqInput}
            placeholder="Type your explanation here..."
            placeholderTextColor={colors.textMuted}
            value={answerText}
            onChangeText={setAnswerText}
            multiline
            numberOfLines={3}
          />
          <TouchableOpacity
            style={[styles.bigqSubmitBtn, !answerText.trim() && { opacity: 0.5 }]}
            onPress={handleSubmit}
            disabled={!answerText.trim()}
          >
            <Text style={styles.bigqSubmitText}>Submit for Teacher Feedback</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.bigqSubmittedBox}>
          <Ionicons name="checkmark-done" size={16} color="#059669" />
          <Text style={styles.bigqSubmittedText}>Answer submitted! Teacher is reviewing...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Slide Card
  slideCard: {
    width: '100%',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginVertical: 4,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  slideGradient: {
    padding: spacing.md,
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
    paddingBottom: 6,
  },
  slideTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: '#065F46',
    flex: 1,
  },
  bulletsWrap: {
    gap: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletDot: {
    fontSize: fontSize.md,
    color: '#059669',
    lineHeight: 18,
  },
  bulletText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.text,
    lineHeight: 18,
  },

  // Quiz Card
  quizCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginVertical: 4,
    gap: spacing.sm,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  quizHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quizBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  quizBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
    textTransform: 'uppercase',
  },
  quizQuestion: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 20,
  },
  quizOptionsList: {
    gap: 8,
    marginTop: 2,
  },
  quizOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  quizOptionCorrect: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  quizOptionWrong: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  optionLetterCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  optionLetterText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  quizOptionText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.text,
    lineHeight: 18,
  },
  quizFeedbackBox: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    gap: 4,
  },
  quizFeedbackText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  quizExplanationText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },

  // Visual Card
  visualCard: {
    width: '100%',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginVertical: 4,
    gap: spacing.sm,
  },
  visualHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  visualTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: '#0369A1',
  },
  stepsWrap: {
    gap: 8,
  },
  stepItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    padding: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  stepIndexPill: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndexText: {
    fontSize: 10,
    color: colors.white,
    fontWeight: '800',
  },
  stepEmoji: {
    fontSize: 20,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
  },
  stepDesc: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  sceneWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  sceneItem: {
    alignItems: 'center',
    width: 80,
    padding: 6,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  sceneEmoji: {
    fontSize: 28,
  },
  sceneTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: 2,
  },
  sceneText: {
    fontSize: 9,
    color: colors.textMuted,
    textAlign: 'center',
  },
  captionBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 6,
    borderRadius: borderRadius.md,
  },
  captionText: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#0284C7',
  },

  // Understand Card
  understandCard: {
    width: '100%',
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginVertical: 4,
    gap: 8,
  },
  understandQuestion: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#5B21B6',
    textAlign: 'center',
  },
  understandBtnsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  understandBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: borderRadius.lg,
    paddingVertical: 8,
    gap: 4,
  },
  understandBtnActive: {
    borderColor: '#7C3AED',
    backgroundColor: '#EDE9FE',
  },
  understandEmoji: {
    fontSize: 20,
  },
  understandBtnLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D28D9',
  },

  // Big Question Card
  bigqCard: {
    width: '100%',
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginVertical: 4,
    gap: 8,
  },
  bigqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bigqBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7C3AED',
    textTransform: 'uppercase',
  },
  bigqQuestion: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 18,
  },
  bigqHint: {
    fontSize: 11,
    color: '#6D28D9',
    fontStyle: 'italic',
  },
  bigqInputWrap: {
    gap: 8,
  },
  bigqInput: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: borderRadius.md,
    padding: 8,
    fontSize: fontSize.xs,
    color: colors.text,
    textAlignVertical: 'top',
  },
  bigqSubmitBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: borderRadius.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  bigqSubmitText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
  },
  bigqSubmittedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  bigqSubmittedText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },
});
