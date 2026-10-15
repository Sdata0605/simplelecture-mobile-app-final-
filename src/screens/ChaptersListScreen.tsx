import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase, Chapter, Topic } from '../services/supabase';
import { useCourseFreeAccess } from '../hooks/useCourseFreeAccess';
import { openAskAI } from '../services/askAIStore';

type ChaptersListRouteProp = RouteProp<RootStackParamList, 'ChaptersList'>;

interface ChapterWithTopics extends Chapter {
  topics: Topic[];
}

export default function ChaptersListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ChaptersListRouteProp>();
  const { subjectId, subjectName, isPreview, courseId, courseName, previewAiLimit, previewDoubtsLimit } = route.params;

  const { freeChapters } = useCourseFreeAccess(isPreview ? (courseId ?? '') : '');
  const freeChapterIds = new Set(freeChapters.map(fc => fc.chapter_id));

  const [chapters, setChapters] = useState<ChapterWithTopics[]>([]);
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState<string | null>(null);
  const [topicErrors, setTopicErrors] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchChapters();
  }, [subjectId]);

  const fetchChapters = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await supabase.getSubjectChapters(subjectId);
      if (result.success && result.chapters) {
        setChapters(result.chapters.map((ch: Chapter) => ({ ...ch, topics: [] })));
      } else {
        setError(result.error || 'Failed to load chapters');
      }
    } catch (err) {
      setError('Failed to load chapters. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTopics = async (chapterId: string) => {
    setLoadingTopics(chapterId);
    setTopicErrors(prev => ({ ...prev, [chapterId]: false }));
    try {
      const result = await supabase.getChapterTopics([chapterId]);
      if (result.success && result.topics) {
        const filtered = result.topics.filter((t: Topic) => t.chapter_id === chapterId);
        setChapters(prev =>
          prev.map(ch => (ch.id === chapterId ? { ...ch, topics: filtered } : ch))
        );
      } else {
        setTopicErrors(prev => ({ ...prev, [chapterId]: true }));
      }
    } catch (err) {
      console.error('Error fetching topics:', err);
      setTopicErrors(prev => ({ ...prev, [chapterId]: true }));
    } finally {
      setLoadingTopics(null);
    }
  };

  const toggleChapter = async (chapterId: string) => {
    if (isPreview && !freeChapterIds.has(chapterId)) {
      Alert.alert(
        'Chapter Locked',
        'Enroll in this course to access all chapters.',
        [{ text: 'OK' }]
      );
      return;
    }
    if (expandedChapterId === chapterId) {
      setExpandedChapterId(null);
    } else {
      setExpandedChapterId(chapterId);
      const chapter = chapters.find(ch => ch.id === chapterId);
      if (chapter && chapter.topics.length === 0) {
        await fetchTopics(chapterId);
      }
    }
  };

  const handleTopicPress = (topic: Topic, chapter: ChapterWithTopics) => {
    navigation.navigate('TopicDetails', {
      topicId: topic.id,
      subjectId,
      subjectName,
      chapterId: chapter.id,
      chapterNumber: chapter.chapter_number,
      topicNumber: topic.topic_number,
      topicTitle: topic.title,
      ...(isPreview ? {
        isPreview: true,
        courseId,
        courseName,
        previewAiLimit: previewAiLimit ?? 3,
        previewDoubtsLimit: previewDoubtsLimit ?? 3,
      } : {}),
    });
  };

  const handleChapterContentPress = (chapter: ChapterWithTopics) => {
    navigation.navigate('ChapterContent', {
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterNumber: chapter.chapter_number,
      subjectId,
      subjectName,
    });
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[colors.primary, '#4ADE80']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{subjectName}</Text>
          <View style={{ width: 36 }} />
        </LinearGradient>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading chapters...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[colors.primary, '#4ADE80']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{subjectName}</Text>
          <View style={{ width: 36 }} />
        </LinearGradient>
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchChapters}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primary, '#4ADE80']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.white} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{subjectName}</Text>
          <View style={styles.headerSubtitleRow}>
            <Text style={styles.headerSubtitle}>{chapters.length} Chapters</Text>
            {isPreview && (
              <View style={styles.previewBadge}>
                <Ionicons name="eye" size={10} color={colors.primary} />
                <Text style={styles.previewBadgeText}>FREE PREVIEW</Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={styles.aiTeacherBtn}
          onPress={() => openAskAI({ subjectId, subjectName })}
          data-testid="button-subject-aiteacher"
          activeOpacity={0.85}
        >
          <Ionicons name="school" size={13} color={colors.primary} />
          <Text style={styles.aiTeacherBtnText}>AI Teacher</Text>
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <TouchableOpacity
          style={styles.aiTeacherCard}
          activeOpacity={0.88}
          onPress={() => openAskAI({ subjectId, subjectName })}
          data-testid="card-subject-aiteacher"
        >
          <LinearGradient
            colors={['#0F766E', '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.aiTeacherCardGradient}
          >
            <View style={styles.aiTeacherCardIcon}>
              <Ionicons name="school" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.aiTeacherCardTitle}>Ask {subjectName} AI Teacher</Text>
                <View style={styles.aiTeacherCardBadge}>
                  <Text style={styles.aiTeacherCardBadgeText}>24/7 TUTOR</Text>
                </View>
              </View>
              <Text style={styles.aiTeacherCardSubtitle} numberOfLines={1}>
                Voice & chat doubt solver mapped to your syllabus
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
        {chapters.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="book-outline" size={40} color={colors.primary} />
            </View>
            <Text style={styles.emptyText}>No chapters available yet</Text>
          </View>
        ) : (
          chapters.map((chapter, index) => {
            const isExpanded = expandedChapterId === chapter.id;
            const isLocked = isPreview && !freeChapterIds.has(chapter.id);
            return (
              <View key={chapter.id} style={[styles.chapterCard, isLocked && styles.chapterCardLocked]} data-testid={`chapter-card-${chapter.id}`}>
                <TouchableOpacity
                  style={styles.chapterHeader}
                  onPress={() => toggleChapter(chapter.id)}
                  activeOpacity={isLocked ? 0.5 : 0.7}
                >
                  <LinearGradient
                    colors={isLocked ? ['#9CA3AF', '#6B7280'] : (index % 2 === 0 ? [colors.primary, '#4ADE80'] : ['#10B981', '#34D399'])}
                    style={styles.chapterNumberBadge}
                  >
                    <Text style={styles.chapterNumberText}>
                      {String(chapter.chapter_number).padStart(2, '0')}
                    </Text>
                  </LinearGradient>
                  <View style={styles.chapterInfo}>
                    <Text style={[styles.chapterTitle, isLocked && styles.chapterTitleLocked]}>{chapter.title}</Text>
                    {isLocked ? (
                      <Text style={styles.lockedLabel}>Enroll to unlock</Text>
                    ) : chapter.description ? (
                      <Text style={styles.chapterDesc} numberOfLines={isExpanded ? undefined : 2}>
                        {chapter.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.chapterRight}>
                    {isLocked ? (
                      <Ionicons name="lock-closed" size={18} color="#9CA3AF" />
                    ) : loadingTopics === chapter.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={colors.textSecondary}
                      />
                    )}
                  </View>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.expandedContent}>
                    {!isPreview && <TouchableOpacity
                      style={styles.chapterContentBtn}
                      onPress={() => handleChapterContentPress(chapter)}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={[colors.primary, '#4ADE80']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.chapterContentBtnGradient}
                      >
                        <View style={styles.chapterContentIcon}>
                          <Ionicons name="folder-open" size={16} color={colors.white} />
                        </View>
                        <Text style={styles.chapterContentBtnText}>Chapter Content</Text>
                        <Ionicons name="arrow-forward" size={16} color={colors.white} style={{ marginLeft: 'auto' }} />
                      </LinearGradient>
                    </TouchableOpacity>}

                    {loadingTopics === chapter.id ? (
                      <View style={styles.topicsLoading}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={styles.topicsLoadingText}>Loading topics...</Text>
                      </View>
                    ) : topicErrors[chapter.id] ? (
                      <View style={styles.topicsEmpty}>
                        <Text style={styles.topicsEmptyText}>Failed to load topics</Text>
                        <TouchableOpacity onPress={() => fetchTopics(chapter.id)} style={styles.retrySmall}>
                          <Text style={styles.retrySmallText}>Tap to retry</Text>
                        </TouchableOpacity>
                      </View>
                    ) : chapter.topics.length === 0 ? (
                      <View style={styles.topicsEmpty}>
                        <Text style={styles.topicsEmptyText}>No topics available</Text>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.topicsLabel}>TOPICS ({chapter.topics.length})</Text>
                        {chapter.topics.map((topic) => (
                          <TouchableOpacity
                            key={topic.id}
                            style={styles.topicItem}
                            onPress={() => handleTopicPress(topic, chapter)}
                            activeOpacity={0.7}
                            data-testid={`topic-item-${topic.id}`}
                          >
                            <View style={styles.topicLeft}>
                              <View style={styles.topicNumberBadge}>
                                <Text style={styles.topicNumberText}>{topic.topic_number}</Text>
                              </View>
                              <Text style={styles.topicName} numberOfLines={2}>{topic.title}</Text>
                            </View>
                            <View style={styles.topicRight}>
                              {!!topic.video_id && (
                                <Ionicons name="play-circle" size={16} color={colors.primary} />
                              )}
                              {!!topic.estimated_duration_minutes && (
                                <View style={styles.durationBadge}>
                                  <Text style={styles.durationText}>
                                    {formatDuration(topic.estimated_duration_minutes)}
                                  </Text>
                                </View>
                              )}
                              <Ionicons name="chevron-forward" size={16} color={colors.gray400} />
                            </View>
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: 48,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: fontSize.md,
    color: colors.error,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  retryButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  retryText: {
    color: colors.white,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingTop: spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  chapterCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.06)',
  },
  chapterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  chapterNumberBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterNumberText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.white,
  },
  chapterInfo: {
    flex: 1,
  },
  chapterTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  chapterDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  chapterRight: {
    paddingLeft: spacing.xs,
  },
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chapterContentBtn: {
    marginBottom: spacing.sm,
    borderRadius: 12,
    overflow: 'hidden',
  },
  chapterContentBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    gap: spacing.sm,
  },
  chapterContentIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterContentBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.white,
  },
  topicsLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  topicsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  topicsLoadingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  topicsEmpty: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  topicsEmptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  retrySmall: {
    marginTop: spacing.xs,
  },
  retrySmallText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
  },
  topicItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  topicLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  topicNumberBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicNumberText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primary,
  },
  topicName: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
  },
  topicRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  durationBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  durationText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 40,
  },
  chapterCardLocked: {
    opacity: 0.6,
    backgroundColor: '#F3F4F6',
  },
  chapterTitleLocked: {
    color: '#6B7280',
  },
  lockedLabel: {
    fontSize: fontSize.xs,
    color: '#9CA3AF',
    marginTop: 2,
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  previewBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  aiTeacherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  aiTeacherBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  aiTeacherCard: {
    marginBottom: spacing.md,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  aiTeacherCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  aiTeacherCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTeacherCardTitle: {
    fontSize: fontSize.sm + 1,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  aiTeacherCardBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  aiTeacherCardBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  aiTeacherCardSubtitle: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
});
