import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  supabase as supabaseService,
  EnrolledCourseWithCategory,
  CourseSubject,
  Chapter,
} from '../services/supabase';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';

export interface ReelsFilterSelection {
  label: string;
  chapterIds: string[];
  topicIds: string[];
}

interface ReelsFilterModalProps {
  visible: boolean;
  userId: string | null;
  onClose: () => void;
  onApply: (selection: ReelsFilterSelection) => void;
  onClear: () => void;
}

export default function ReelsFilterModal({
  visible,
  userId,
  onClose,
  onApply,
  onClear,
}: ReelsFilterModalProps) {
  const [courses, setCourses] = useState<EnrolledCourseWithCategory[]>([]);
  const [subjects, setSubjects] = useState<CourseSubject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const [selectedCourse, setSelectedCourse] =
    useState<EnrolledCourseWithCategory | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<CourseSubject | null>(
    null
  );
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !userId) return;
    let cancelled = false;
    const load = async () => {
      setLoadingCourses(true);
      const result = await supabaseService.getEnrolledCoursesWithCategories(
        userId
      );
      if (cancelled) return;
      if (result.success) {
        setCourses(result.courses || []);
      }
      setLoadingCourses(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [visible, userId]);

  const handleSelectCourse = async (course: EnrolledCourseWithCategory) => {
    setSelectedCourse(course);
    setSelectedSubject(null);
    setSelectedChapter(null);
    setSubjects([]);
    setChapters([]);
    setLoadingSubjects(true);
    const result = await supabaseService.getCourseSubjects(course.id);
    if (result.success) {
      setSubjects(result.subjects || []);
    }
    setLoadingSubjects(false);
  };

  const handleSelectSubject = async (subject: CourseSubject) => {
    setSelectedSubject(subject);
    setSelectedChapter(null);
    setChapters([]);
    setLoadingChapters(true);
    const result = await supabaseService.getSubjectChapters(subject.subject.id);
    if (result.success) {
      setChapters(result.chapters || []);
    }
    setLoadingChapters(false);
  };

  const resetSelection = () => {
    setSelectedCourse(null);
    setSelectedSubject(null);
    setSelectedChapter(null);
    setSubjects([]);
    setChapters([]);
  };

  const handleClear = () => {
    resetSelection();
    onClear();
    onClose();
  };

  const handleApply = async () => {
    if (!selectedCourse) return;
    setApplying(true);
    setApplyError(null);
    try {
      let chapterIds: string[] = [];
      let label = selectedCourse.name;

      if (selectedChapter) {
        chapterIds = [selectedChapter.id];
        label = `${selectedSubject?.subject.name ?? selectedCourse.name} › ${selectedChapter.title}`;
      } else if (selectedSubject) {
        const chRes = await supabaseService.getSubjectChapters(
          selectedSubject.subject.id
        );
        if (!chRes.success) {
          setApplyError('Could not load chapters. Please try again.');
          return;
        }
        chapterIds = (chRes.chapters || []).map((c) => c.id);
        label = `${selectedCourse.name} › ${selectedSubject.subject.name}`;
      } else {
        const subjRes = await supabaseService.getCourseSubjects(
          selectedCourse.id
        );
        if (!subjRes.success) {
          setApplyError('Could not load subjects. Please try again.');
          return;
        }
        const courseSubjects = subjRes.subjects || [];
        const chapterLists = await Promise.all(
          courseSubjects.map((s) =>
            supabaseService.getSubjectChapters(s.subject.id)
          )
        );
        if (chapterLists.some((r) => !r.success)) {
          setApplyError('Could not load chapters. Please try again.');
          return;
        }
        chapterIds = chapterLists.flatMap((r) =>
          (r.chapters || []).map((c) => c.id)
        );
        label = selectedCourse.name;
      }

      let topicIds: string[] = [];
      if (chapterIds.length > 0) {
        const topicRes = await supabaseService.getChapterTopics(chapterIds);
        if (!topicRes.success) {
          setApplyError('Could not load topics. Please try again.');
          return;
        }
        topicIds = (topicRes.topics || []).map((t) => t.id);
      }

      onApply({ label, chapterIds, topicIds });
      onClose();
    } catch {
      setApplyError('Something went wrong. Please try again.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle} data-testid="text-filter-title">
              Filter reels
            </Text>
            <TouchableOpacity
              onPress={onClose}
              data-testid="button-close-filter"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.sectionLabel}>Course</Text>
            {loadingCourses ? (
              <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : courses.length === 0 ? (
              <Text style={styles.emptyText}>
                You aren't enrolled in any courses yet.
              </Text>
            ) : (
              <View style={styles.chipRow}>
                {courses.map((course) => {
                  const active = selectedCourse?.id === course.id;
                  return (
                    <TouchableOpacity
                      key={course.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => handleSelectCourse(course)}
                      data-testid={`chip-course-${course.id}`}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {course.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {selectedCourse && (
              <>
                <Text style={styles.sectionLabel}>Subject (optional)</Text>
                {loadingSubjects ? (
                  <ActivityIndicator
                    color={colors.primary}
                    style={styles.loader}
                  />
                ) : subjects.length === 0 ? (
                  <Text style={styles.emptyText}>No subjects available.</Text>
                ) : (
                  <View style={styles.chipRow}>
                    {subjects.map((cs) => {
                      const active = selectedSubject?.id === cs.id;
                      return (
                        <TouchableOpacity
                          key={cs.id}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => handleSelectSubject(cs)}
                          data-testid={`chip-subject-${cs.subject.id}`}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              active && styles.chipTextActive,
                            ]}
                          >
                            {cs.subject.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            {selectedSubject && (
              <>
                <Text style={styles.sectionLabel}>Chapter (optional)</Text>
                {loadingChapters ? (
                  <ActivityIndicator
                    color={colors.primary}
                    style={styles.loader}
                  />
                ) : chapters.length === 0 ? (
                  <Text style={styles.emptyText}>No chapters available.</Text>
                ) : (
                  <View style={styles.chipRow}>
                    {chapters.map((ch) => {
                      const active = selectedChapter?.id === ch.id;
                      return (
                        <TouchableOpacity
                          key={ch.id}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setSelectedChapter(ch)}
                          data-testid={`chip-chapter-${ch.id}`}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              active && styles.chipTextActive,
                            ]}
                          >
                            {ch.title}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {applyError ? (
            <Text style={styles.errorText} data-testid="text-filter-error">
              {applyError}
            </Text>
          ) : null}

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClear}
              data-testid="button-clear-filter"
            >
              <Text style={styles.clearButtonText}>Clear / Show all</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.applyButton,
                (!selectedCourse || applying) && styles.applyButtonDisabled,
              ]}
              onPress={handleApply}
              disabled={!selectedCourse || applying}
              data-testid="button-apply-filter"
            >
              {applying ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.applyButtonText}>Show reels</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  loader: {
    alignSelf: 'flex-start',
    marginVertical: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: '#DC2626',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  clearButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  applyButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
});
