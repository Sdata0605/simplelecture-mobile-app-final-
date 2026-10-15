import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase, EnrolledCourseWithCategory, ParentCategory } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function MyCoursesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { openSidebar } = useSidebar();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [courses, setCourses] = useState<EnrolledCourseWithCategory[]>([]);
  const [parentCategories, setParentCategories] = useState<ParentCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchEnrolledCoursesWithCategories();
  }, []);

  const fetchEnrolledCoursesWithCategories = async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    setError('');
    
    const result = await supabase.getEnrolledCoursesWithCategories(user.id);
    
    if (result.success) {
      setCourses(result.courses || []);
      setParentCategories(result.parentCategories || []);
    } else {
      setError(result.error || 'Failed to load courses');
    }
    
    setIsLoading(false);
  };

  const getCompletedCoursesCount = () => {
    return courses.filter(c => c.progress === 100).length;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Filter courses by search and selected category
  const filteredCourses = useMemo(() => {
    let filtered = courses;
    
    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(c => c.parentCategoryId === selectedCategory);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(query) ||
        (c.short_description && c.short_description.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [courses, selectedCategory, searchQuery]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primary, '#4ADE80']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + spacing.md }]}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIconContainer}>
              <Ionicons name="book" size={20} color={colors.primary} />
            </View>
            <Text style={styles.headerTitle}>My Courses</Text>
          </View>
          <Text style={styles.headerSubtitle}>Continue your learning journey</Text>
        </View>
        <HeaderMenuButton onPress={openSidebar} />
      </LinearGradient>

      <View style={styles.searchWrapper}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.primary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search my courses..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <View style={styles.loadingIconContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
          <Text style={styles.loadingText}>Loading your courses...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statsContainer}>
            <View style={[styles.statCard, styles.statCardGreenPrimary]}>
              <View style={styles.statIconContainer}>
                <Ionicons name="book" size={22} color={colors.primary} />
              </View>
              <Text style={styles.statLabel}>Enrolled Courses</Text>
              <Text style={[styles.statNumber, { color: colors.primary }]}>{courses.length}</Text>
            </View>
            <View style={[styles.statCard, styles.statCardGreen]}>
              <View style={styles.statIconContainer}>
                <Ionicons name="checkmark-circle" size={22} color="#10B981" />
              </View>
              <Text style={styles.statLabel}>Completed</Text>
              <Text style={[styles.statNumber, { color: '#10B981' }]}>{getCompletedCoursesCount()}</Text>
            </View>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <View style={styles.errorIconContainer}>
                <Ionicons name="alert-circle" size={32} color="#EF4444" />
              </View>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={fetchEnrolledCoursesWithCategories}>
                <LinearGradient
                  colors={[colors.primary, '#4ADE80']}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Category Filter Tabs */}
          {parentCategories.length > 0 && (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.categoryTabsContainer}
              contentContainerStyle={styles.categoryTabsContent}
            >
              <TouchableOpacity
                style={[
                  styles.categoryTab,
                  selectedCategory === 'all' && styles.categoryTabActive,
                ]}
                onPress={() => setSelectedCategory('all')}
              >
                <Text style={[
                  styles.categoryTabText,
                  selectedCategory === 'all' && styles.categoryTabTextActive,
                ]}>
                  All Programs
                </Text>
              </TouchableOpacity>
              {parentCategories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryTab,
                    selectedCategory === category.id && styles.categoryTabActive,
                  ]}
                  onPress={() => setSelectedCategory(category.id)}
                >
                  <Text style={[
                    styles.categoryTabText,
                    selectedCategory === category.id && styles.categoryTabTextActive,
                  ]}>
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconContainer}>
              <Ionicons name="library" size={18} color={colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>
              {filteredCourses.length} {filteredCourses.length === 1 ? 'Course' : 'Courses'}
            </Text>
          </View>

          {filteredCourses.length === 0 && !isLoading ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="book-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No courses found</Text>
              <Text style={styles.emptySubtext}>
                {searchQuery || selectedCategory !== 'all' 
                  ? 'Try adjusting your filters' 
                  : 'Explore courses to get started'}
              </Text>
              {!searchQuery && selectedCategory === 'all' && (
                <TouchableOpacity onPress={() => navigation.navigate('Courses')}>
                  <LinearGradient
                    colors={[colors.primary, '#4ADE80']}
                    style={styles.exploreButton}
                  >
                    <Text style={styles.exploreButtonText}>Explore Courses</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.white} />
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {filteredCourses.map((course) => (
            <TouchableOpacity
              key={course.id}
              style={styles.courseCard}
              onPress={() => navigation.navigate('LearningPath', { courseId: course.id })}
              activeOpacity={0.7}
              data-testid={`card-my-course-${course.id}`}
            >
              <View style={styles.cardRow}>
                {course.thumbnail_url && !course.thumbnail_url.startsWith('data:') ? (
                  <Image 
                    source={{ uri: course.thumbnail_url }} 
                    style={styles.courseThumb}
                    resizeMode="cover"
                  />
                ) : (
                  <LinearGradient
                    colors={['#D1FAE5', '#A7F3D0', '#6EE7B7']}
                    style={styles.courseThumb}
                  >
                    <Ionicons name="book" size={22} color={colors.primary} />
                  </LinearGradient>
                )}

                <View style={styles.cardInfo}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.enrolledBadge}>
                      <Ionicons name="checkmark-circle" size={10} color="#10B981" />
                      <Text style={styles.enrolledBadgeText}>Enrolled</Text>
                    </View>
                    {course.parentCategoryName && (
                      <Text style={styles.categoryLabel}>{course.parentCategoryName}</Text>
                    )}
                  </View>

                  <Text style={styles.courseTitle} numberOfLines={2}>{course.name}</Text>

                  <View style={styles.metaRow}>
                    {course.duration_months && (
                      <>
                        <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                        <Text style={styles.metaText}>{course.duration_months}mo</Text>
                      </>
                    )}
                    <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.metaText}>{formatDate(course.enrolled_at)}</Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => navigation.navigate('LearningPath', { courseId: course.id })}
                    style={styles.startButtonWrap}
                    data-testid={`button-start-${course.id}`}
                  >
                    <LinearGradient
                      colors={[colors.primary, '#4ADE80']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.startButton}
                    >
                      <Ionicons name="play" size={14} color={colors.white} />
                      <Text style={styles.startButtonText}>
                        {course.progress > 0 ? 'Continue' : 'Start Learning'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}
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
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
    marginTop: 2,
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
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    marginTop: spacing.xs,
    marginLeft: 44,
  },
  searchWrapper: {
    paddingHorizontal: spacing.md,
    marginTop: -spacing.md,
    marginBottom: spacing.md,
    zIndex: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    height: 52,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  searchInput: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  contentContainer: {
    paddingTop: spacing.sm,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    alignItems: 'center',
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.06)',
  },
  statCardGreenPrimary: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  statCardGreen: {
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.md,
  },
  errorIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  errorText: {
    color: '#EF4444',
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
    textAlign: 'center',
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
  categoryTabsContainer: {
    marginBottom: spacing.md,
  },
  categoryTabsContent: {
    paddingVertical: spacing.xs,
    gap: spacing.sm,
    flexDirection: 'row',
  },
  categoryTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.2)',
    marginRight: spacing.sm,
  },
  categoryTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryTabText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
  },
  categoryTabTextActive: {
    color: colors.white,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
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
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  exploreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  exploreButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  courseCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.06)',
  },
  cardRow: {
    flexDirection: 'row',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  courseThumb: {
    width: 88,
    height: 88,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  enrolledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  enrolledBadgeText: {
    fontSize: 10,
    color: '#10B981',
    fontWeight: '600',
  },
  categoryLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  courseTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 5,
  },
  metaText: {
    fontSize: 10,
    color: colors.textSecondary,
    marginRight: 4,
  },
  startButtonWrap: {
    alignSelf: 'flex-start',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: borderRadius.md,
  },
  startButtonText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 100,
  },
});
