import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import MathText from '../components/MathText';
import { stripEmbeddedOptions } from '../utils/questionText';
import { supabase } from '../services/supabase';
import {
  useSelfTest,
  useSelfTestQuestions,
  deriveStatus,
  normalizeOptions,
  submitSelfTest,
  SubmitAnswerInput,
} from '../hooks/useMyTests';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'MyTestTake'>;

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function MyTestTakeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const { testId } = route.params;

  const { test, isLoading: testLoading } = useSelfTest(testId);
  const { data: questions, isLoading: qLoading, error: qError, refetch: refetchQuestions } = useSelfTestQuestions(testId);

  const [mcqAnswers, setMcqAnswers] = useState<Record<string, string>>({});
  const [writtenText, setWrittenText] = useState<Record<string, string>>({});
  const [writtenImages, setWrittenImages] = useState<Record<string, { uri: string; mimeType: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [currentIndex, setCurrentIndex] = useState(0);
  const submittedRef = useRef(false);
  const autoSubmitTriedRef = useRef(false);

  const orderedQuestions = useMemo(() => {
    const mcq = questions.filter((q) => q.section === 'mcq');
    const written = questions.filter((q) => q.section !== 'mcq');
    return [...mcq, ...written];
  }, [questions]);

  const windowEnd = useMemo(() => {
    if (!test) return 0;
    return new Date(test.scheduled_at).getTime() + (test.duration_minutes || 0) * 60 * 1000;
  }, [test]);

  const answeredCount = useMemo(() => {
    let n = 0;
    for (const q of orderedQuestions) {
      if (q.section === 'mcq') {
        if (mcqAnswers[q.id]) n++;
      } else if ((writtenText[q.id] ?? '').trim() || writtenImages[q.id]) {
        n++;
      }
    }
    return n;
  }, [orderedQuestions, mcqAnswers, writtenText, writtenImages]);

  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current || !test) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        const profile = await supabase.getUserProfile();
        const studentId = profile.user?.id;
        if (!studentId) {
          submittedRef.current = false;
          setSubmitting(false);
          Alert.alert('Sign in required', 'Please sign in to submit your test.');
          return;
        }

        const answers: Record<string, SubmitAnswerInput> = {};
        const uploadFailures: number[] = [];
        let qIndex = 0;
        for (const q of orderedQuestions) {
          qIndex += 1;
          if (q.section === 'mcq') {
            answers[q.id] = { selected_option: mcqAnswers[q.id] ?? null };
          } else {
            let imageUrl: string | null = null;
            const img = writtenImages[q.id];
            if (img) {
              const up = await supabase.uploadAnswerImage({
                userId: studentId,
                questionId: q.id,
                imageUri: img.uri,
                mimeType: img.mimeType,
              });
              if (up.success && up.publicUrl) {
                imageUrl = up.publicUrl;
              } else {
                uploadFailures.push(qIndex);
              }
            }
            answers[q.id] = {
              answer_text: (writtenText[q.id] ?? '').trim() || null,
              answer_image_url: imageUrl,
            };
          }
        }

        // Don't silently drop a student's image answer — let them retry.
        if (uploadFailures.length > 0) {
          submittedRef.current = false;
          setSubmitting(false);
          Alert.alert(
            'Image upload failed',
            `Couldn't upload the answer image for question ${uploadFailures.join(', ')}. Check your connection and submit again.`
          );
          return;
        }

        await submitSelfTest({ selfTestId: testId, studentId, questions: orderedQuestions, answers });
        navigation.replace('MyTestResult', { testId });
      } catch (e: any) {
        submittedRef.current = false;
        setSubmitting(false);
        Alert.alert('Submission failed', e?.message ?? 'Please try again.');
        return;
      }
    },
    [test, orderedQuestions, mcqAnswers, writtenText, writtenImages, testId, navigation]
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-submit once when the window closes. Guarded so a failed auto-submit
  // (e.g. image upload error) does not retry every second while still mounted.
  useEffect(() => {
    if (!test || submittedRef.current || submitting || autoSubmitTriedRef.current) return;
    if (windowEnd && now >= windowEnd && orderedQuestions.length > 0) {
      autoSubmitTriedRef.current = true;
      doSubmit(true);
    }
  }, [now, windowEnd, test, submitting, orderedQuestions.length, doSubmit]);

  const pickImage = async (questionId: string) => {
    const choose = (source: 'camera' | 'library') => async () => {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Please allow access to add an answer image.');
        return;
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setWrittenImages((prev) => ({ ...prev, [questionId]: { uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' } }));
      }
    };
    Alert.alert('Upload Answer Image', 'Choose source', [
      { text: 'Camera', onPress: choose('camera') },
      { text: 'Photo Library', onPress: choose('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmSubmit = () => {
    if (orderedQuestions.length === 0) {
      Alert.alert('Cannot submit', 'No questions are loaded for this test.');
      return;
    }
    const unanswered = orderedQuestions.length - answeredCount;
    Alert.alert(
      'Submit test?',
      unanswered > 0 ? `You have ${unanswered} unanswered question(s).` : 'Submit your answers for grading?',
      [
        { text: 'Keep working', style: 'cancel' },
        { text: 'Submit', style: 'destructive', onPress: () => doSubmit(false) },
      ]
    );
  };

  if (testLoading || qLoading) {
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
          <Text style={styles.muted}>Test not found.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (qError || orderedQuestions.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
          <Text style={styles.muted}>
            {qError ? "Couldn't load this test's questions." : 'No questions are available for this test.'}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => refetchQuestions()} testID="button-retry-questions">
            <Text style={styles.primaryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const status = deriveStatus(test, now);

  if (status !== 'live') {
    const msg =
      status === 'submitted'
        ? 'You have already submitted this test.'
        : status === 'upcoming'
        ? 'This test has not started yet.'
        : 'The window for this test has closed.';
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={48} color={colors.textMuted} />
          <Text style={styles.muted}>{msg}</Text>
          {status === 'submitted' ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.replace('MyTestResult', { testId })}>
              <Text style={styles.primaryBtnText}>View Result</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.primaryBtnText}>Go Back</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const remaining = windowEnd - now;
  const lowTime = remaining <= 60 * 1000;

  const safeIndex = Math.min(currentIndex, orderedQuestions.length - 1);
  const q = orderedQuestions[safeIndex];
  const isMcq = q.section === 'mcq';
  const opts = isMcq ? normalizeOptions(q.options) : [];
  const img = writtenImages[q.id];
  const isLast = safeIndex === orderedQuestions.length - 1;
  const isFirst = safeIndex === 0;
  const isAnswered = isMcq
    ? !!mcqAnswers[q.id]
    : !!(writtenText[q.id] ?? '').trim() || !!img;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={confirmSubmit} testID="button-exit">
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerSection} testID="text-section">
            {isMcq ? 'Multiple Choice' : 'Written Answer'}
          </Text>
          <Text style={styles.headerCount} testID="text-question-count">
            Q {safeIndex + 1} of {orderedQuestions.length}
          </Text>
        </View>
        <View style={[styles.timer, lowTime && styles.timerLow]}>
          <Ionicons name="time-outline" size={14} color={lowTime ? colors.error : colors.primary} />
          <Text style={[styles.timerText, lowTime && { color: colors.error }]} testID="text-timer">
            {formatClock(remaining)}
          </Text>
        </View>
      </View>

      <View style={styles.progressBarWrap}>
        <View style={[styles.progressBarFill, { width: `${orderedQuestions.length ? ((safeIndex + 1) / orderedQuestions.length) * 100 : 0}%` }]} />
      </View>
      <Text style={styles.progressLabel} testID="text-progress">{answeredCount} / {orderedQuestions.length} answered</Text>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <View style={styles.qCard} testID={`card-question-${q.id}`}>
            <View style={styles.qHeaderRow}>
              <Text style={styles.qNumber}>Q{safeIndex + 1}</Text>
              <Text style={styles.qMarks}>{q.marks ?? 1} mark{(q.marks ?? 1) > 1 ? 's' : ''}</Text>
            </View>
            <MathText content={stripEmbeddedOptions(q.question_text, q.options)} textStyle={styles.qText} color={colors.text} />

            {isMcq ? (
              <View style={styles.optionsWrap}>
                {opts.map((o) => {
                  const selected = mcqAnswers[q.id] === o.key;
                  return (
                    <TouchableOpacity
                      key={`${q.id}-${o.key}`}
                      style={[styles.option, selected && styles.optionSelected]}
                      onPress={() => setMcqAnswers((p) => ({ ...p, [q.id]: o.key }))}
                      testID={`option-${q.id}-${o.key}`}
                    >
                      <View style={[styles.optionKey, selected && styles.optionKeySelected]}>
                        <Text style={[styles.optionKeyText, selected && { color: colors.white }]}>{o.key}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <MathText content={o.text} textStyle={styles.optionText} color={colors.text} />
                      </View>
                      {selected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.writtenWrap}>
                <TextInput
                  style={styles.textArea}
                  multiline
                  placeholder="Type your answer here…"
                  placeholderTextColor={colors.textMuted}
                  value={writtenText[q.id] ?? ''}
                  onChangeText={(t) => setWrittenText((p) => ({ ...p, [q.id]: t }))}
                  testID={`input-answer-${q.id}`}
                />
                {img ? (
                  <View style={styles.imagePreviewRow}>
                    <Image source={{ uri: img.uri }} style={styles.imagePreview} />
                    <TouchableOpacity
                      style={styles.removeImageBtn}
                      onPress={() => setWrittenImages((p) => { const c = { ...p }; delete c[q.id]; return c; })}
                      testID={`button-remove-image-${q.id}`}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <Text style={styles.removeImageText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage(q.id)} testID={`button-upload-image-${q.id}`}>
                    <Ionicons name="camera-outline" size={18} color={colors.primary} />
                    <Text style={styles.uploadBtnText}>Add answer image</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, isFirst && styles.navBtnDisabled]}
            onPress={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={isFirst}
            testID="button-prev-question"
          >
            <Ionicons name="chevron-back" size={18} color={isFirst ? colors.textMuted : colors.primary} />
            <Text style={[styles.navBtnText, isFirst && { color: colors.textMuted }]}>Previous</Text>
          </TouchableOpacity>

          {isLast ? (
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={confirmSubmit}
              disabled={submitting}
              testID="button-submit-test"
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color={colors.white} />
                  <Text style={styles.submitBtnText}>Submit Test</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.nextBtn}
              onPress={() => setCurrentIndex((i) => Math.min(orderedQuestions.length - 1, i + 1))}
              testID="button-next-question"
            >
              <Text style={styles.nextBtnText}>{isAnswered ? 'Next' : 'Skip'}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.white} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  muted: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', fontFamily: fontFamily.regular },
  primaryBtn: { marginTop: spacing.md, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  primaryBtnText: { color: colors.white, fontFamily: fontFamily.semiBold, fontSize: fontSize.md },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: fontSize.md, color: colors.text, fontFamily: fontFamily.semiBold },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerSection: { fontSize: fontSize.xs, color: colors.primary, fontFamily: fontFamily.semiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  headerCount: { fontSize: fontSize.md, color: colors.text, fontFamily: fontFamily.semiBold },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0FDF4', borderRadius: borderRadius.full, paddingHorizontal: 10, paddingVertical: 5 },
  timerLow: { backgroundColor: '#FEF2F2' },
  timerText: { fontSize: fontSize.md, color: colors.primary, fontFamily: fontFamily.semiBold, fontVariant: ['tabular-nums'] },
  progressBarWrap: { height: 4, backgroundColor: colors.gray200, marginTop: 0 },
  progressBarFill: { height: 4, backgroundColor: colors.primary },
  progressLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: fontFamily.medium, paddingHorizontal: spacing.md, paddingTop: 6 },
  list: { padding: spacing.md, gap: spacing.md },
  sectionHeader: { fontSize: fontSize.sm, color: colors.gray600, fontFamily: fontFamily.semiBold, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm, marginBottom: spacing.xs },
  qCard: { backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  qHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qNumber: { fontSize: fontSize.sm, color: colors.primary, fontFamily: fontFamily.semiBold },
  qMarks: { fontSize: fontSize.xs, color: colors.gray600, fontFamily: fontFamily.medium, backgroundColor: colors.gray100, borderRadius: borderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  qText: { fontSize: fontSize.md, lineHeight: 22 },
  optionsWrap: { gap: spacing.sm, marginTop: spacing.xs },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1.5, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.sm },
  optionSelected: { borderColor: colors.primary, backgroundColor: '#F0FDF4' },
  optionKey: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  optionKeySelected: { backgroundColor: colors.primary },
  optionKeyText: { fontSize: fontSize.sm, color: colors.gray600, fontFamily: fontFamily.semiBold },
  optionText: { fontSize: fontSize.md },
  writtenWrap: { gap: spacing.sm, marginTop: spacing.xs },
  textArea: { borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.sm, minHeight: 100, textAlignVertical: 'top', fontSize: fontSize.md, color: colors.text, fontFamily: fontFamily.regular },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed', borderRadius: borderRadius.md, paddingVertical: 10 },
  uploadBtnText: { color: colors.primary, fontSize: fontSize.sm, fontFamily: fontFamily.semiBold },
  imagePreviewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  imagePreview: { width: 64, height: 64, borderRadius: borderRadius.md, backgroundColor: colors.gray100 },
  removeImageBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  removeImageText: { color: colors.error, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  footer: { padding: spacing.md, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1.5, borderColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 14, paddingHorizontal: spacing.md },
  navBtnDisabled: { borderColor: colors.border },
  navBtnText: { color: colors.primary, fontSize: fontSize.md, fontFamily: fontFamily.semiBold },
  nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 14 },
  nextBtnText: { color: colors.white, fontSize: fontSize.md, fontFamily: fontFamily.semiBold },
  submitBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 14 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: colors.white, fontSize: fontSize.md, fontFamily: fontFamily.semiBold },
});
