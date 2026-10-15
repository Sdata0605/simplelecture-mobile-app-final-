/**
 * NotePage renders the content of a single study-note page:
 * prose, callouts (definition/formula/equation), bullets, images, questions.
 *
 * All math/chemistry notation renders through MathText (KaTeX WebView) —
 * MathText falls back to plain <Text> when a snippet contains no LaTeX,
 * so plain-prose pages stay cheap.
 *
 * Receives a pre-built NotePage object — all parsing happened in notePagination.ts.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { NotePage as NotePageType } from '../../../types/topicNotes';
import { colors, spacing, borderRadius } from '../../../constants/theme';
import MathText from '../../MathText';
import { stripEmbeddedOptions, extractImageTokens } from '../../../utils/questionText';
import { normalizeOptions, resolveCorrectAnswer } from '../../../utils/questionOptions';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NotePageProps {
  page: NotePageType;
  scrollable?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CalloutBlock({ type, text }: { type: string; text: string }) {
  const icon =
    type === 'definition'
      ? 'book-outline'
      : type === 'formula'
      ? 'calculator-outline'
      : 'flask-outline';

  const accent =
    type === 'definition'
      ? '#3B82F6'
      : type === 'formula'
      ? '#8B5CF6'
      : '#10B981';

  return (
    <View style={[s.callout, { borderLeftColor: accent }]}>
      <View style={s.calloutHeader}>
        <Ionicons name={icon as any} size={14} color={accent} />
        <Text style={[s.calloutType, { color: accent }]}>
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </Text>
      </View>
      {/* Formula/equation callouts often carry bare LaTeX with no $...$ */}
      <MathText
        content={text}
        textStyle={s.calloutText}
        color={colors.text}
        mathOnly={type === 'formula' || type === 'equation'}
      />
    </View>
  );
}

function BulletItem({ text }: { text: string }) {
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletDot}>•</Text>
      <MathText
        content={text}
        style={s.bulletContent}
        textStyle={s.bulletText}
        color={colors.text}
      />
    </View>
  );
}

function NoteImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      source={{ uri: url }}
      style={s.noteImage}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

function QuestionCard({
  question,
  isImportant,
}: {
  question: NotePageType['questions']['important'][0];
  isImportant: boolean;
}) {
  const [showAnswer, setShowAnswer] = useState(false);
  // Strip duplicated inline options, then pull out markdown image tokens:
  // broken refs (bare filenames) vanish; real http(s) URLs render as images.
  const qParts = extractImageTokens(
    stripEmbeddedOptions(question.question_text, question.options),
  );
  const questionText = qParts.text;
  const options = normalizeOptions(question.options).map((opt) => ({
    ...opt,
    ...extractImageTokens(opt.text),
  }));
  // correct_answer can also carry image tokens when it's free text.
  const answerParts = extractImageTokens(
    resolveCorrectAnswer(
      question.correct_answer,
      options.map((o) => ({ key: o.key, text: o.text })),
    ),
  );
  const answerLabel = answerParts.text;
  const explanationParts = extractImageTokens(question.explanation);
  const hasReveal =
    !!answerLabel ||
    answerParts.images.length > 0 ||
    !!explanationParts.text ||
    explanationParts.images.length > 0;
  const difficulty = (question.difficulty ?? '').trim();

  return (
    <View style={[s.qCard, isImportant && s.qCardImportant]}>
      <View style={s.qBadgeRow}>
        {isImportant && (
          <View style={s.importantBadge}>
            <Ionicons name="star" size={10} color="#fff" />
            <Text style={s.importantBadgeText}>Important</Text>
          </View>
        )}
        {!!difficulty && (
          <View style={s.metaChip}>
            <Text style={s.metaChipText}>
              {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
            </Text>
          </View>
        )}
        {question.is_ai_generated === true && (
          <View style={s.metaChip}>
            <Text style={s.metaChipText}>AI</Text>
          </View>
        )}
      </View>

      {!!questionText && (
        <MathText content={questionText} textStyle={s.qText} color={colors.text} />
      )}
      {qParts.images.map((url, i) => (
        <NoteImage key={`qimg-${i}`} url={url} />
      ))}

      {options.length > 0 && (
        <View style={s.qOptions}>
          {options.map((opt) => (
            <View key={opt.key} style={s.qOptionRow}>
              <Text style={s.qOptionKey}>{opt.key}.</Text>
              <View style={s.qOptionContent}>
                {!!opt.text && (
                  <MathText
                    content={opt.text}
                    textStyle={s.qOptionText}
                    color={colors.text}
                  />
                )}
                {opt.images.map((url, i) => (
                  <NoteImage key={`optimg-${opt.key}-${i}`} url={url} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {hasReveal && (
        <TouchableOpacity
          activeOpacity={0.7}
          style={s.answerToggle}
          onPress={() => setShowAnswer((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={showAnswer ? 'Hide answer' : 'Show answer'}
        >
          <Ionicons
            name={showAnswer ? 'eye-off-outline' : 'eye-outline'}
            size={13}
            color={colors.primary}
          />
          <Text style={s.answerToggleText}>
            {showAnswer ? 'Hide answer' : 'Show answer'}
          </Text>
        </TouchableOpacity>
      )}

      {showAnswer && (
        <View style={s.qExplanationBox}>
          {!!answerLabel && (
            <View style={s.answerRow}>
              <Text style={s.answerLabel}>Answer: </Text>
              <MathText
                content={answerLabel}
                style={s.answerContent}
                textStyle={s.answerText}
                color={colors.text}
              />
            </View>
          )}
          {answerParts.images.map((url, i) => (
            <NoteImage key={`ansimg-${i}`} url={url} />
          ))}
          {!!explanationParts.text && (
            <MathText
              content={explanationParts.text}
              textStyle={s.qExplanation}
              color={colors.textSecondary}
            />
          )}
          {explanationParts.images.map((url, i) => (
            <NoteImage key={`expimg-${i}`} url={url} />
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NotePage({ page, scrollable = true }: NotePageProps) {
  const content = (
    <View style={s.container}>
      {/* Section title on the first page */}
      {page.isFirstPageOfSection && (
        <View style={s.sectionHeader}>
          {page.sectionType && page.sectionType !== 'content' && (
            <View style={s.typeBadge}>
              <Text style={s.typeBadgeText}>{page.sectionType}</Text>
            </View>
          )}
          <Text style={s.sectionTitle}>{page.sectionTitle}</Text>
        </View>
      )}

      {/* "Continued" indicator for mid-section pages */}
      {!page.isFirstPageOfSection && page.totalPagesInSection > 1 && (
        <Text style={s.continued}>{page.sectionTitle} (continued)</Text>
      )}

      {/* Callouts — first page only */}
      {page.callouts.map((c, i) => (
        <CalloutBlock key={`callout-${i}`} type={c.type} text={c.text} />
      ))}

      {/* Prose */}
      {!!page.prose && (
        <MathText
          content={page.prose}
          style={s.proseBlock}
          textStyle={s.prose}
          color={colors.text}
        />
      )}

      {/* Bullets — last page only */}
      {page.bullets.length > 0 && (
        <View style={s.bulletSection}>
          <Text style={s.sectionSubLabel}>Key Points</Text>
          {page.bullets.map((b, i) => (
            <BulletItem key={`bullet-${i}`} text={b.text} />
          ))}
        </View>
      )}

      {/* Images — last page only */}
      {page.images.length > 0 && (
        <View style={s.imageSection}>
          {page.images.map((img, i) => (
            <NoteImage key={`img-${i}`} url={img.url} />
          ))}
        </View>
      )}

      {/* Questions — last page only */}
      {(page.questions.important.length > 0 ||
        page.questions.practice.length > 0) && (
        <View style={s.questionsSection}>
          {page.questions.important.length > 0 && (
            <>
              <Text style={s.sectionSubLabel}>Important Questions</Text>
              {page.questions.important.map((q) => (
                <QuestionCard key={q.id} question={q} isImportant />
              ))}
            </>
          )}
          {page.questions.practice.length > 0 && (
            <>
              <Text style={s.sectionSubLabel}>Practice Questions</Text>
              {page.questions.practice.map((q) => (
                <QuestionCard key={q.id} question={q} isImportant={false} />
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );

  if (scrollable) {
    return <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>{content}</ScrollView>;
  }
  return content;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  container: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm },

  // Section header
  sectionHeader: { marginBottom: spacing.sm },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '22',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius?.sm ?? 4,
    marginBottom: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 24,
    marginBottom: spacing.xs,
  },
  continued: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },

  // Prose
  proseBlock: { marginBottom: spacing.sm },
  prose: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
  },

  // Callouts
  callout: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 4,
  },
  calloutType: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  calloutText: { fontSize: 14, color: colors.text, lineHeight: 20 },

  // Bullets
  bulletSection: { marginBottom: spacing.sm },
  sectionSubLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  bulletRow: { flexDirection: 'row', marginBottom: 4, paddingRight: 8 },
  bulletDot: {
    fontSize: 15,
    color: colors.primary,
    marginRight: 6,
    lineHeight: 22,
  },
  bulletContent: { flex: 1 },
  bulletText: { fontSize: 14, color: colors.text, lineHeight: 22 },

  // Images
  imageSection: { marginBottom: spacing.sm },
  noteImage: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginBottom: spacing.xs,
    backgroundColor: colors.gray100,
  },

  // Questions
  questionsSection: { marginBottom: spacing.sm },
  qCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qCardImportant: {
    borderColor: '#FBBF24',
    backgroundColor: '#FFFBEB',
  },
  qBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  importantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
    gap: 3,
  },
  importantBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  metaChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
  },
  metaChipText: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  qText: { fontSize: 13, color: colors.text, lineHeight: 20 },
  qOptions: { marginTop: 6 },
  qOptionRow: { flexDirection: 'row', marginBottom: 3, paddingRight: 8 },
  qOptionKey: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginRight: 5,
    lineHeight: 20,
  },
  qOptionContent: { flex: 1 },
  qOptionText: { fontSize: 13, color: colors.text, lineHeight: 20 },
  answerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
    gap: 4,
    paddingVertical: 2,
  },
  answerToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  answerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  answerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    lineHeight: 18,
  },
  answerContent: { flex: 1 },
  answerText: { fontSize: 12, color: colors.text, lineHeight: 18, fontWeight: '600' },
  qExplanationBox: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  qExplanation: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  qHint: { fontSize: 11, color: colors.textMuted, marginTop: 4, fontStyle: 'italic' },
});
