// Step 1 of 5 · What to study (plan D.3). Whole course or a chosen set of subjects,
// with the old chapter/topic picker kept under a collapsed "advanced" link.

import { useState, Dispatch } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontFamily, borderRadius, spacing } from '../../../constants/theme';
import SimpleSelect, { SelectOption } from '../SimpleSelect';
import EmptyState from '../../reminders/EmptyState';
import { formatMinutesLabel, WizardAction, WizardState } from './state';

const SEARCH_THRESHOLD = 12;

export default function StepScope({
  state, dispatch, subjects, subjectsLoading, subjectsError, onRetrySubjects,
  advanced, content, onRetry,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  subjects: SelectOption[];
  subjectsLoading: boolean;
  subjectsError: string | null;
  onRetrySubjects(): void;
  advanced: {
    subjectId: string | null;
    onSubjectId(id: string | null): void;
    chapters: SelectOption[];
    chaptersLoading: boolean;
    topics: SelectOption[];
    topicsLoading: boolean;
  };
  content: { totalMinutes: number; lectureCount: number; itemCount: number; loading: boolean; error: string | null };
  onRetry(): void;
}) {
  const inAdvanced = state.scopeMode === 'chapter' || state.scopeMode === 'topic';
  const [showAdvanced, setShowAdvanced] = useState(inAdvanced);
  const [search, setSearch] = useState('');

  const total = state.allSubjectIds.length;
  const selectedSet = new Set(state.subjectIds);
  const visibleSubjects = subjects.filter(s =>
    !search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function pickMode(mode: 'course' | 'subjects') {
    dispatch({ type: 'setScopeMode', mode });
  }

  function pickAdvancedChapter(id: string | null) {
    if (!id) { dispatch({ type: 'setScopeMode', mode: 'course' }); return; }
    if (advanced.subjectId) dispatch({ type: 'setSubjects', ids: [advanced.subjectId] });
    dispatch({ type: 'setScopeMode', mode: 'chapter' });
    dispatch({ type: 'setChapter', id });
  }

  function pickAdvancedTopic(id: string | null) {
    if (!id) { dispatch({ type: 'setTopic', id: null }); dispatch({ type: 'setScopeMode', mode: 'chapter' }); return; }
    dispatch({ type: 'setScopeMode', mode: 'topic' });
    dispatch({ type: 'setTopic', id });
  }

  // Count line under the choices (plan C.1 step 3, D.3).
  let pill: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string } | null = null;
  if (content.loading) pill = { icon: 'time-outline', color: colors.primary, text: 'Counting lectures...' };
  else if (content.error) pill = { icon: 'alert-circle-outline', color: colors.error, text: content.error };
  else if (content.itemCount === 0 && state.allSubjectIds.length > 0) {
    pill = { icon: 'alert-circle-outline', color: colors.error, text: 'These subjects have no published lectures yet. Pick other subjects.' };
  } else if (content.itemCount > 0) {
    pill = {
      icon: 'film-outline', color: colors.primary,
      text: `${formatMinutesLabel(content.totalMinutes)} across ${content.lectureCount} lecture${content.lectureCount === 1 ? '' : 's'}`,
    };
  }

  return (
    <View>
      <Text style={styles.question} accessibilityRole="header">What do you want to plan?</Text>

      <ChoiceCard
        selected={state.scopeMode === 'course'}
        title="Whole course"
        subtitle={total > 0 ? `All ${total} subject${total === 1 ? '' : 's'}` : 'All subjects'}
        onPress={() => pickMode('course')}
      />
      <ChoiceCard
        selected={state.scopeMode === 'subjects'}
        title="Pick subjects"
        subtitle="Choose which subjects to include"
        onPress={() => pickMode('subjects')}
      />

      {state.scopeMode === 'subjects' && (
        <View style={styles.subjectBlock}>
          {subjectsLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.md }} />
          ) : subjectsError ? (
            <EmptyState
              icon="alert-circle-outline"
              title="Could not load subjects"
              actionLabel="Try again"
              onAction={onRetrySubjects}
              compact
            />
          ) : subjects.length === 0 ? (
            <EmptyState icon="book-outline" title="This course has no subjects yet" compact />
          ) : (
            <>
              {subjects.length > SEARCH_THRESHOLD && (
                <TextInput
                  style={styles.search}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search subjects"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Search subjects"
                  autoCorrect={false}
                />
              )}
              <View style={styles.bulkRow}>
                <TouchableOpacity
                  style={styles.bulkBtn}
                  onPress={() => dispatch({ type: 'setSubjects', ids: state.allSubjectIds })}
                  accessibilityRole="button"
                  accessibilityLabel="Select all subjects"
                >
                  <Text style={styles.bulkText}>Select all</Text>
                </TouchableOpacity>
                <Text style={styles.dot}>·</Text>
                <TouchableOpacity
                  style={styles.bulkBtn}
                  onPress={() => dispatch({ type: 'setSubjects', ids: [] })}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all subjects"
                >
                  <Text style={styles.bulkText}>Clear</Text>
                </TouchableOpacity>
              </View>
              {/* Plain map instead of FlatList: a FlatList nested in this ScrollView triggers
                  RN's nested-VirtualizedList warning. Course subject counts are small. */}
              {visibleSubjects.map(s => {
                const checked = selectedSet.has(s.id);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.subjectRow}
                    onPress={() => dispatch({ type: 'toggleSubject', id: s.id })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={s.name}
                  >
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={checked ? colors.primary : colors.textMuted}
                    />
                    <Text style={styles.subjectName} numberOfLines={2}>{s.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </View>
      )}

      {pill && (
        <View style={[styles.pill, pill.color === colors.error && styles.pillError]}>
          {content.loading
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Ionicons name={pill.icon} size={16} color={pill.color} />}
          <Text style={styles.pillText}>{pill.text}</Text>
          {content.error ? (
            <TouchableOpacity onPress={onRetry} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel="Try counting again">
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {!showAdvanced ? (
        <TouchableOpacity
          style={styles.advancedLink}
          onPress={() => setShowAdvanced(true)}
          accessibilityRole="button"
          accessibilityLabel="Plan a single chapter or topic instead"
        >
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          <Text style={styles.advancedText}>Plan a single chapter or topic instead</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.advancedBlock}>
          <Text style={styles.advancedTitle}>Single chapter or topic</Text>
          <SimpleSelect
            label="Subject"
            options={subjects}
            value={advanced.subjectId}
            onChange={id => { advanced.onSubjectId(id); dispatch({ type: 'setChapter', id: null }); }}
            placeholder="Pick a subject…"
          />
          {advanced.subjectId && (
            <SimpleSelect
              label="Chapter"
              options={advanced.chapters}
              value={inAdvanced ? state.chapterId : null}
              onChange={pickAdvancedChapter}
              placeholder="Pick a chapter…"
              loading={advanced.chaptersLoading}
            />
          )}
          {inAdvanced && state.chapterId && (
            <SimpleSelect
              label="Topic"
              options={advanced.topics}
              value={state.scopeMode === 'topic' ? state.topicId : null}
              onChange={pickAdvancedTopic}
              placeholder="Pick a topic…"
              loading={advanced.topicsLoading}
            />
          )}
        </View>
      )}
    </View>
  );
}

function ChoiceCard({ selected, title, subtitle, onPress }: {
  selected: boolean;
  title: string;
  subtitle: string;
  onPress(): void;
}) {
  return (
    <TouchableOpacity
      style={[styles.choice, selected && styles.choiceSelected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceSub}>{subtitle}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  question: { fontSize: fontSize.xxl, fontFamily: fontFamily.heading, color: colors.text, marginBottom: spacing.md },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    minHeight: 64, padding: spacing.md, marginBottom: spacing.sm,
    borderRadius: borderRadius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white,
  },
  choiceSelected: { borderColor: colors.primary, backgroundColor: '#F0FDF4' },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.gray300,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  choiceTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },
  choiceSub: { fontSize: fontSize.md, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },

  subjectBlock: { marginTop: spacing.sm, gap: 4 },
  search: {
    minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm, fontSize: fontSize.md, fontFamily: fontFamily.regular, color: colors.text,
    backgroundColor: colors.white, marginBottom: spacing.xs,
  },
  bulkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bulkBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  bulkText: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.primary },
  dot: { color: colors.textMuted, fontSize: fontSize.md },
  subjectRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    minHeight: 52, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.gray100,
  },
  subjectName: { flex: 1, fontSize: fontSize.md, fontFamily: fontFamily.medium, color: colors.text },

  pill: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: spacing.md,
    padding: spacing.sm, borderRadius: borderRadius.md, backgroundColor: '#F0FDF4',
    borderWidth: 1, borderColor: colors.border,
  },
  pillError: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
  pillText: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontFamily: fontFamily.medium },
  retryBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  retryText: { fontSize: fontSize.sm, color: colors.primary, fontFamily: fontFamily.semiBold },

  advancedLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, marginTop: spacing.md },
  advancedText: { fontSize: fontSize.md, color: colors.primary, fontFamily: fontFamily.semiBold },
  advancedBlock: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  advancedTitle: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.semiBold, marginBottom: spacing.xs },
});
