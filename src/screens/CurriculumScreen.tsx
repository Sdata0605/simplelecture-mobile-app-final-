import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase, Chapter, Topic } from '../services/supabase';

const FEATURES = [
  { icon: 'bulb', title: 'AI-Based Tutorial', desc: 'Personalized learning paths adapted to your pace.', color: '#34D07B' },
  { icon: 'chatbubble-ellipses', title: 'Instant AI Assistance', desc: 'Get real-time answers to your doubts 24/7.', color: '#EC4899' },
  { icon: 'layers', title: 'Question Bank', desc: 'Access to 5000+ practice questions with solutions.', color: '#10B981' },
  { icon: 'pencil', title: 'Practice Sessions', desc: 'Topic-wise practice drills to strengthen concepts.', color: '#F59E0B' },
  { icon: 'time', title: 'Daily Practice Test', desc: 'Regular assessments to track your progress.', color: '#6366F1' },
  { icon: 'document-text', title: 'Detailed Notes', desc: 'Comprehensive study material for revision.', color: '#06B6D4' },
];

interface ChapterWithTopics extends Chapter {
  topics: Topic[];
}

export default function CurriculumScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Curriculum'>>();
  const { subjectId, subjectName } = route.params || {};
  
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ChapterWithTopics[]>([]);
  const [topicCounts, setTopicCounts] = useState<Record<string, number>>({});
  const [countsLoaded, setCountsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchChapters();
  }, [subjectId]);

  const fetchChapters = async () => {
    if (!subjectId) {
      setLoading(false);
      return;
    }

    setError(null);
    setCountsLoaded(false);
    setTopicCounts({});
    try {
      const result = await supabase.getSubjectChapters(subjectId);
      console.log('[Curriculum] Chapters result success:', result.success, 'count:', result.chapters?.length || 0);
      if (result.success && result.chapters) {
        console.log('[Curriculum] First chapter:', result.chapters[0]);
        const chaptersWithTopics: ChapterWithTopics[] = result.chapters.map((ch: Chapter) => ({
          ...ch,
          topics: [],
        }));
        setChapters(chaptersWithTopics);

        const chapterIds = chaptersWithTopics.map(ch => ch.id).filter(Boolean);
        const countsResult = await supabase.getChapterTopicCounts(chapterIds);
        if (countsResult.success && countsResult.counts) {
          setTopicCounts(countsResult.counts);
          setCountsLoaded(true);
        }
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      console.error('Error fetching chapters:', err);
      setError('Failed to load chapters. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTopicsForChapter = async (chapterId: string) => {
    setLoadingTopics(chapterId);
    try {
      const result = await supabase.getChapterTopics([chapterId]);
      if (result.success && result.topics) {
        const filteredTopics = result.topics.filter((t: Topic) => t.chapter_id === chapterId);
        setChapters(prev => prev.map(ch => 
          ch.id === chapterId ? { ...ch, topics: filteredTopics } : ch
        ));
      }
    } catch (err) {
      console.error('Error fetching topics:', err);
    } finally {
      setLoadingTopics(null);
    }
  };

  const toggleChapter = async (chapterId: string) => {
    console.log('[Curriculum] toggleChapter called with:', chapterId, 'current expandedChapter:', expandedChapter);
    if (expandedChapter === chapterId) {
      setExpandedChapter(null);
    } else {
      setExpandedChapter(chapterId);
      const chapter = chapters.find(ch => ch.id === chapterId);
      console.log('[Curriculum] Found chapter:', chapter?.id, chapter?.title);
      if (chapter && chapter.topics.length === 0) {
        await fetchTopicsForChapter(chapterId);
      }
    }
  };

  const navigateToChapterContent = (chapter: typeof chapters[0]) => {
    if (!subjectId || !subjectName) return;
    navigation.navigate('ChapterContent', {
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterNumber: chapter.chapter_number,
      subjectId: subjectId,
      subjectName: subjectName,
    });
  };

  const formatChapterNumber = (num: number) => {
    return num.toString().padStart(2, '0');
  };

  const totalTopics = countsLoaded
    ? Object.values(topicCounts).reduce((sum, n) => sum + n, 0)
    : chapters.reduce((sum, ch) => sum + (ch.topics?.length || 0), 0);

  const getTopicCount = (chapter: ChapterWithTopics): number => {
    if (countsLoaded) return topicCounts[chapter.id] ?? 0;
    return chapter.topics?.length ?? 0;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingIconContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Text style={styles.loadingText}>Loading curriculum...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.errorIconContainer}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
        </View>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={fetchChapters}>
          <LinearGradient
            colors={[colors.primary, '#4ADE80']}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[colors.primary, '#4ADE80']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconContainer}>
                <Ionicons name="book" size={16} color={colors.primary} />
              </View>
              <Text style={styles.headerTitle}>{subjectName || 'Subject'}</Text>
            </View>
            <Text style={styles.headerSubtitle}>
              {chapters.length} Chapters | {totalTopics} Topics
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.mainContent}>
          <View style={styles.introSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconContainer}>
                <Ionicons name="sparkles" size={18} color={colors.primary} />
              </View>
              <Text style={styles.introTitle}>Complete Learning Experience</Text>
            </View>
            <Text style={styles.introDesc}>
              Everything you need to master {subjectName || 'this subject'} in one comprehensive package
            </Text>
          </View>

          <View style={styles.featuresGrid}>
            {FEATURES.map((feature, idx) => (
              <View key={idx} style={styles.featureCard}>
                <View style={[styles.featureIconContainer, { backgroundColor: feature.color + '20' }]}>
                  <Ionicons name={feature.icon as any} size={22} color={feature.color} />
                </View>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDesc}>{feature.desc}</Text>
              </View>
            ))}
          </View>

          <View style={styles.curriculumSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconContainer}>
                <Ionicons name="list" size={18} color={colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Course Curriculum</Text>
            </View>
            
            {chapters.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="book-outline" size={40} color={colors.primary} />
                </View>
                <Text style={styles.emptyText}>No chapters available yet</Text>
              </View>
            ) : (
              chapters.map((chapter, index) => {
                console.log('[Curriculum] Rendering chapter:', chapter.id, chapter.title, 'expandedChapter:', expandedChapter);
                return (
                <View key={chapter.id || index} style={styles.chapterCard}>
                  <TouchableOpacity
                    style={styles.chapterHeader}
                    onPress={() => toggleChapter(chapter.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.chapterLeft}>
                      <LinearGradient
                        colors={index % 2 === 0 ? [colors.primary, '#4ADE80'] : ['#10B981', '#34D399']}
                        style={styles.chapterNumber}
                      >
                        <Text style={styles.chapterNumberText}>
                          {formatChapterNumber(chapter.chapter_number)}
                        </Text>
                      </LinearGradient>
                      <View style={styles.chapterTextContainer}>
                        <Text style={styles.chapterName}>{chapter.title}</Text>
                        {chapter.description && (
                          <Text style={styles.chapterDesc} numberOfLines={2}>
                            {chapter.description}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.chapterRight}>
                      <View style={styles.topicsBadge}>
                        <Text style={styles.topicsBadgeText}>
                          {getTopicCount(chapter)} Topics
                        </Text>
                      </View>
                      <Ionicons
                        name={expandedChapter === chapter.id ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={colors.textSecondary}
                      />
                    </View>
                  </TouchableOpacity>

                  {expandedChapter === chapter.id && (
                    <View style={styles.topicsContainer}>
                      {/* Chapter Content Button - Always visible when expanded */}
                      <TouchableOpacity
                        style={styles.chapterContentButton}
                        onPress={() => navigateToChapterContent(chapter)}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={[colors.primary, '#4ADE80']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.chapterContentButtonGradient}
                        >
                          <View style={styles.chapterContentIconContainer}>
                            <Ionicons name="folder-open" size={18} color={colors.white} />
                          </View>
                          <Text style={styles.chapterContentButtonText}>Chapter Content</Text>
                          <Ionicons name="arrow-forward" size={16} color={colors.white} style={{ marginLeft: 'auto' }} />
                        </LinearGradient>
                      </TouchableOpacity>

                      <Text style={styles.topicsLabel}>TOPICS</Text>

                      {loadingTopics === chapter.id ? (
                        <View style={styles.topicsLoading}>
                          <ActivityIndicator size="small" color={colors.primary} />
                          <Text style={styles.topicsLoadingText}>Loading topics...</Text>
                        </View>
                      ) : chapter.topics.length === 0 ? (
                        <View style={styles.topicsEmpty}>
                          <Text style={styles.topicsEmptyText}>No topics available</Text>
                        </View>
                      ) : (
                        chapter.topics.map((topic, topicIdx) => (
                          <View
                            key={topic.id}
                            style={styles.topicItem}
                          >
                            <View style={styles.topicLeft}>
                              <View style={styles.topicIconContainer}>
                                <Ionicons name="ellipse-outline" size={18} color={colors.textSecondary} />
                              </View>
                              <Text style={styles.topicName}>{topic.title}</Text>
                            </View>
                            <View style={styles.topicDurationBadge}>
                              <Text style={styles.topicDurationText}>
                                {topic.estimated_duration_minutes ? `${topic.estimated_duration_minutes}m` : ''}
                              </Text>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
              })
            )}
          </View>
        </View>

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  errorIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: fontSize.md,
    color: '#EF4444',
    marginBottom: spacing.md,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  retryButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: 44,
    paddingBottom: spacing.md,
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
  headerContent: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginLeft: 36,
  },
  mainContent: {
    marginTop: -spacing.md,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  introSection: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  introDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginLeft: 44,
    lineHeight: 20,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  featureCard: {
    width: '48%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.06)',
  },
  featureIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  featureTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  featureDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  curriculumSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
  },
  emptyIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
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
    borderRadius: borderRadius.xl,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.06)',
  },
  chapterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  chapterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  chapterNumber: {
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
  chapterTextContainer: {
    flex: 1,
  },
  chapterName: {
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  topicsBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
  },
  topicsBadgeText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
  },
  topicsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  chapterContentButton: {
    marginBottom: spacing.md,
  },
  chapterContentButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  chapterContentIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterContentButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.white,
  },
  topicsLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  topicDurationBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
  },
  topicDurationText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '500',
  },
  topicsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  topicsLoadingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  topicsEmpty: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  topicsEmptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  topicItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  topicLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  topicIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicName: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
  },
  bottomSpacer: {
    height: 100,
  },
});
