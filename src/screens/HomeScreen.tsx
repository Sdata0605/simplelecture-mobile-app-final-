import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
  RefreshControl,
} from 'react-native';
import { CourseCardSkeleton } from '../components/SkeletonLoader';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, ExploreCourse, EnrolledCourseWithCategory } from '../services/supabase';
import { getUnreadCount } from '../services/notificationStorage';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';
import HomeHeroBanner from '../components/HomeHeroBanner';
import HeroVideoBanner from '../components/HeroVideoBanner';
import AITeacherShowcase from '../components/aiteacher/AITeacherShowcase';
import { AITeacherPlanModal } from '../components/aiteacher/AITeacherPlanModal';
import { useAITeacherSubscription } from '../services/aiTeacherSubscription';
import { aiTeacherDestination } from '../services/aiTeacherPromo';
import { openAskAI } from '../services/askAIStore';
import { useCourseFreePreviewLimits } from '../hooks/useCourseFreeAccess';

const SSLC_COURSE_ID = '4c10bc8e-acbc-4b76-b7f5-54376c030cb0';
const SSLC_COURSE_NAME = 'Class 10 (SSLC - Karnataka)';

const { width } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { openSidebar } = useSidebar();
  const { hasActivePlan, plans } = useAITeacherSubscription();
  const [plansOpen, setPlansOpen] = useState(false);
  const { aiLimit: sslcAiLimit, doubtsLimit: sslcDoubtsLimit } = useCourseFreePreviewLimits(SSLC_COURSE_ID);

  const [featuredMyCourses, setFeaturedMyCourses] = useState<ExploreCourse[]>([]);
  const [newestMyCourses, setNewestMyCourses] = useState<ExploreCourse[]>([]);
  const [bestMyCourses, setBestMyCourses] = useState<ExploreCourse[]>([]);
  const [enrolledMyCourses, setEnrolledMyCourses] = useState<EnrolledCourseWithCategory[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [loadingNewest, setLoadingNewest] = useState(true);
  const [loadingBest, setLoadingBest] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);

  // The promo card leads to the Ask AI screen (the one the lecture player has) with a plan, otherwise to the plans.
  const openAITeacher = useCallback(() => {
    if (aiTeacherDestination(hasActivePlan) === 'teacher') openAskAI();
    else setPlansOpen(true);
  }, [hasActivePlan]);

  const loadHomeData = useCallback(async () => {
    setLoadingFeatured(true);
    setLoadingNewest(true);
    setLoadingBest(true);

    try {
      // Purchased / enrolled courses for the signed-in user (shown in their own section)
      const enrolledPromise = user?.id
        ? supabase.getEnrolledMyCoursesWithCategories(user.id)
        : Promise.resolve({ success: true, courses: [] as EnrolledCourseWithCategory[] });

      let savedInterests: string[] = [];
      try {
        const raw = await AsyncStorage.getItem('@user_interests');
        if (raw) savedInterests = JSON.parse(raw);
      } catch {}

      // Expand selected top-level categories to include all descendant categories
      let categoryIds: string[] = [];
      if (savedInterests.length > 0) {
        const catRes = await supabase.getCategories();
        if (catRes.success && catRes.categories && catRes.categories.length > 0) {
          const idSet = new Set<string>();
          savedInterests.forEach((id) => {
            supabase
              .getAllDescendantCategoryIds(catRes.categories!, id)
              .forEach((d) => idSet.add(d));
          });
          categoryIds = Array.from(idSet);
        } else {
          categoryIds = savedInterests;
        }
      }

      if (categoryIds.length > 0) {
        // Personalized: derive all discovery sections from the category-restricted pool only
        const [poolRes, enrolledRes] = await Promise.all([
          supabase.getMyCoursesByCategory(categoryIds),
          enrolledPromise,
        ]);

        const pool = poolRes.success && poolRes.courses ? poolRes.courses : [];

        if (pool.length > 0) {
          const featured = [...pool]
            .sort((a, b) => (b.student_count || 0) - (a.student_count || 0))
            .slice(0, 5);
          const newest = [...pool]
            .sort(
              (a, b) =>
                new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
            )
            .slice(0, 5);
          const best = [...pool]
            .filter((c) => c.rating != null)
            .sort(
              (a, b) =>
                (b.rating || 0) - (a.rating || 0) ||
                (b.review_count || 0) - (a.review_count || 0)
            )
            .slice(0, 5);

          setFeaturedMyCourses(featured);
          setNewestMyCourses(newest);
          setBestMyCourses(best);
        } else {
          // Selected categories have no courses yet -> graceful featured fallback
          const fallbackRes = await supabase.getFeaturedMyCourses(3);
          setFeaturedMyCourses(fallbackRes.success && fallbackRes.courses ? fallbackRes.courses : []);
          setNewestMyCourses([]);
          setBestMyCourses([]);
        }

        setEnrolledMyCourses(enrolledRes.success && enrolledRes.courses ? enrolledRes.courses : []);
      } else {
        // No saved interests -> fall back to the prior all-category behavior so Home isn't empty
        const [featuredRes, newestRes, bestRes, enrolledRes] = await Promise.all([
          supabase.getFeaturedMyCourses(3),
          supabase.getNewestMyCourses(5),
          supabase.getBestMyCourses(5),
          enrolledPromise,
        ]);

        setFeaturedMyCourses(featuredRes.success && featuredRes.courses ? featuredRes.courses : []);
        setNewestMyCourses(newestRes.success && newestRes.courses ? newestRes.courses : []);
        setBestMyCourses(bestRes.success && bestRes.courses ? bestRes.courses : []);
        setEnrolledMyCourses(enrolledRes.success && enrolledRes.courses ? enrolledRes.courses : []);
      }
    } finally {
      setLoadingFeatured(false);
      setLoadingNewest(false);
      setLoadingBest(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      getUnreadCount().then(setNotifUnreadCount);
      refreshUser();
      loadHomeData();
    }, [loadHomeData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    getUnreadCount().then(setNotifUnreadCount);
    refreshUser();
    try {
      await loadHomeData();
    } finally {
      setRefreshing(false);
    }
  }, [loadHomeData]);

  const formatDuration = (months: number | null) => {
    if (!months) return 'Self-paced';
    return months === 1 ? '1 Month' : `${months} Months`;
  };

  const formatPrice = (price: number | null) => {
    if (!price) return 'Free';
    return `₹${price.toLocaleString('en-IN')}`;
  };

  return (
    <View style={styles.container}>
      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={styles.mainContentInner}>
          <LinearGradient
            colors={[colors.primary, '#4ADE80']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.header, { paddingTop: insets.top + spacing.xs }]}
          >
            <View style={styles.headerTop}>
              <View style={styles.greeting}>
                <Text style={styles.greetingName}>Hi {user?.full_name || user?.email?.split('@')[0] || 'there'}</Text>
                <Text style={styles.greetingSubtext}>Let's start learning!</Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => navigation.navigate('MainTabs', { screen: 'MyCourses' })}
                  data-testid="button-search-courses"
                >
                  <Ionicons name="search" size={20} color={colors.white} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => navigation.navigate('Notifications')}
                  data-testid="button-notifications"
                >
                  <Ionicons name="notifications-outline" size={20} color={colors.white} />
                  {notifUnreadCount > 0 && (
                    <View style={styles.notifBadge}>
                      <Text style={styles.notifBadgeText}>
                        {notifUnreadCount > 9 ? '9+' : notifUnreadCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <HeaderMenuButton onPress={openSidebar} />
              </View>
            </View>
          </LinearGradient>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
          >
            <HomeHeroBanner
              onPrimaryPress={() => navigation.navigate('MainTabs', { screen: 'MyCourses' })}
              onPreviewPress={() =>
                navigation.navigate('LearningPath', {
                  courseId: SSLC_COURSE_ID,
                  courseName: SSLC_COURSE_NAME,
                  isPreview: true,
                  previewAiLimit: sslcAiLimit ?? 3,
                  previewDoubtsLimit: sslcDoubtsLimit ?? 3,
                })
              }
            />

            <HeroVideoBanner />

            {!hasActivePlan && <AITeacherShowcase price={plans.byok_500.price} onPress={openAITeacher} />}

            {enrolledMyCourses.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <View style={styles.sectionIconContainer}>
                      <Ionicons name="book" size={18} color={colors.primary} />
                    </View>
                    <Text style={styles.sectionTitle}>Continue Learning</Text>
                  </View>
                  <TouchableOpacity style={styles.viewAllButton} onPress={() => navigation.navigate('MainTabs', { screen: 'MyCourses' })}>
                    <Text style={styles.viewAll}>View All</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                  <View style={styles.coursesRow}>
                    {enrolledMyCourses.map((course) => (
                      <TouchableOpacity
                        key={course.id}
                        style={styles.courseCard}
                        onPress={() => navigation.navigate('LearningPath', { courseId: course.id })}
                        data-testid={`card-enrolled-course-${course.id}`}
                      >
                        {course.thumbnail_url && !course.thumbnail_url.startsWith('data:') ? (
                          <Image
                            source={{ uri: course.thumbnail_url }}
                            style={styles.courseImagePlaceholder}
                            resizeMode="cover"
                          />
                        ) : (
                          <LinearGradient
                            colors={['#DCFCE7', '#D1FAE5', '#BBF7D0']}
                            style={styles.courseImagePlaceholder}
                          >
                            <View style={styles.smallPlayIcon}>
                              <Ionicons name="play" size={20} color={colors.primary} />
                            </View>
                          </LinearGradient>
                        )}
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle} numberOfLines={2}>{course.name}</Text>
                          {course.short_description && (
                            <Text style={styles.cardDescription} numberOfLines={1}>
                              {course.short_description}
                            </Text>
                          )}
                          <View style={styles.enrolledBadge}>
                            <Ionicons name="checkmark-circle" size={12} color={colors.primary} />
                            <Text style={styles.enrolledBadgeText}>Enrolled</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionIconContainer}>
                    <Ionicons name="star" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.sectionTitle}>Featured MyCourses</Text>
                </View>
                <TouchableOpacity style={styles.viewAllButton} onPress={() => navigation.navigate('MainTabs', { screen: 'MyCourses' })}>
                  <Text style={styles.viewAll}>View All</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
              
              {loadingFeatured ? (
                <CourseCardSkeleton variant="featured" />
              ) : featuredMyCourses.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconContainer}>
                    <Ionicons name="school-outline" size={40} color={colors.primary} />
                  </View>
                  <Text style={styles.emptyStateText}>No featured courses available</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                  <View style={styles.coursesRow}>
                    {featuredMyCourses.map((course) => (
                      <TouchableOpacity 
                        key={course.id}
                        style={styles.courseCard}
                        onPress={() => navigation.navigate('ViewCourse', { courseId: course.id })}
                        data-testid={`card-featured-course-${course.id}`}
                      >
                        {course.thumbnail_url && !course.thumbnail_url.startsWith('data:') ? (
                          <Image 
                            source={{ uri: course.thumbnail_url }} 
                            style={styles.courseImagePlaceholder}
                            resizeMode="cover"
                          />
                        ) : (
                          <LinearGradient
                            colors={['#DCFCE7', '#D1FAE5', '#BBF7D0']}
                            style={styles.courseImagePlaceholder}
                          >
                            <View style={styles.smallPlayIcon}>
                              <Ionicons name="play" size={20} color={colors.primary} />
                            </View>
                          </LinearGradient>
                        )}
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle} numberOfLines={2}>{course.name}</Text>
                          {course.short_description && (
                            <Text style={styles.cardDescription} numberOfLines={1}>
                              {course.short_description}
                            </Text>
                          )}
                          {!!course.rating && (
                            <View style={styles.ratingRow}>
                              <Text style={styles.ratingNumber}>{course.rating.toFixed(1)}</Text>
                              <View style={styles.starsRow}>
                                {[1, 2, 3, 4, 5].map((i) => (
                                  <Ionicons 
                                    key={i} 
                                    name={i <= Math.floor(course.rating || 0) ? "star" : i - 0.5 <= (course.rating || 0) ? "star-half" : "star-outline"} 
                                    size={12} 
                                    color="#F59E0B" 
                                  />
                                ))}
                              </View>
                              {!!course.review_count && (
                                <Text style={styles.reviewCount}>({course.review_count.toLocaleString()})</Text>
                              )}
                            </View>
                          )}
                          <Text style={styles.cardPrice}>{formatPrice(course.price_inr)}</Text>
                          {course.is_coming_soon ? (
                            <View style={styles.comingSoonBadge}>
                              <Text style={styles.comingSoonText}>Coming Soon</Text>
                            </View>
                          ) : (!!course.rating && course.rating >= 4.5 && (
                            <View style={styles.bestsellerBadge}>
                              <Text style={styles.bestsellerText}>Bestseller</Text>
                            </View>
                          ))}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionIconContainer}>
                    <Ionicons name="sparkles" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.sectionTitle}>Newest MyCourses</Text>
                </View>
                <TouchableOpacity style={styles.viewAllButton} onPress={() => navigation.navigate('MainTabs', { screen: 'MyCourses' })}>
                  <Text style={styles.viewAll}>View All</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
              {loadingNewest ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                  <View style={styles.coursesRow}>
                    <CourseCardSkeleton variant="compact" />
                    <CourseCardSkeleton variant="compact" />
                    <CourseCardSkeleton variant="compact" />
                  </View>
                </ScrollView>
              ) : newestMyCourses.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconContainer}>
                    <Ionicons name="school-outline" size={40} color={colors.primary} />
                  </View>
                  <Text style={styles.emptyStateText}>No new courses available</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                  <View style={styles.coursesRow}>
                    {newestMyCourses.map((course) => (
                      <TouchableOpacity 
                        key={course.id} 
                        style={styles.courseCard}
                        onPress={() => navigation.navigate('ViewCourse', { courseId: course.id })}
                        data-testid={`card-newest-course-${course.id}`}
                      >
                        {course.thumbnail_url && !course.thumbnail_url.startsWith('data:') ? (
                          <Image 
                            source={{ uri: course.thumbnail_url }} 
                            style={styles.courseImagePlaceholder}
                            resizeMode="cover"
                          />
                        ) : (
                          <LinearGradient
                            colors={['#DCFCE7', '#D1FAE5', '#BBF7D0']}
                            style={styles.courseImagePlaceholder}
                          >
                            <View style={styles.smallPlayIcon}>
                              <Ionicons name="play" size={20} color={colors.primary} />
                            </View>
                          </LinearGradient>
                        )}
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle} numberOfLines={2}>{course.name}</Text>
                          {course.short_description && (
                            <Text style={styles.cardDescription} numberOfLines={1}>
                              {course.short_description}
                            </Text>
                          )}
                          {!!course.rating && (
                            <View style={styles.ratingRow}>
                              <Text style={styles.ratingNumber}>{course.rating.toFixed(1)}</Text>
                              <View style={styles.starsRow}>
                                {[1, 2, 3, 4, 5].map((i) => (
                                  <Ionicons 
                                    key={i} 
                                    name={i <= Math.floor(course.rating || 0) ? "star" : i - 0.5 <= (course.rating || 0) ? "star-half" : "star-outline"} 
                                    size={12} 
                                    color="#F59E0B" 
                                  />
                                ))}
                              </View>
                              {!!course.review_count && (
                                <Text style={styles.reviewCount}>({course.review_count.toLocaleString()})</Text>
                              )}
                            </View>
                          )}
                          <Text style={styles.cardPrice}>{formatPrice(course.price_inr)}</Text>
                          {course.is_coming_soon ? (
                            <View style={styles.comingSoonBadge}>
                              <Text style={styles.comingSoonText}>Coming Soon</Text>
                            </View>
                          ) : (!!course.rating && course.rating >= 4.5 && (
                            <View style={styles.bestsellerBadge}>
                              <Text style={styles.bestsellerText}>Bestseller</Text>
                            </View>
                          ))}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionIconContainer}>
                    <Ionicons name="trophy" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.sectionTitle}>Best Rated</Text>
                </View>
                <TouchableOpacity style={styles.viewAllButton} onPress={() => navigation.navigate('MainTabs', { screen: 'MyCourses' })}>
                  <Text style={styles.viewAll}>View All</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
              
              {loadingBest ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                  <View style={styles.coursesRow}>
                    <CourseCardSkeleton variant="compact" />
                    <CourseCardSkeleton variant="compact" />
                    <CourseCardSkeleton variant="compact" />
                  </View>
                </ScrollView>
              ) : bestMyCourses.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconContainer}>
                    <Ionicons name="ribbon-outline" size={40} color={colors.primary} />
                  </View>
                  <Text style={styles.emptyStateText}>Top rated courses coming soon</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                  <View style={styles.coursesRow}>
                    {bestMyCourses.map((course) => (
                      <TouchableOpacity 
                        key={course.id} 
                        style={styles.courseCard}
                        onPress={() => navigation.navigate('ViewCourse', { courseId: course.id })}
                        data-testid={`card-best-course-${course.id}`}
                      >
                        {course.thumbnail_url && !course.thumbnail_url.startsWith('data:') ? (
                          <Image 
                            source={{ uri: course.thumbnail_url }} 
                            style={styles.courseImagePlaceholder}
                            resizeMode="cover"
                          />
                        ) : (
                          <LinearGradient
                            colors={['#DCFCE7', '#D1FAE5', '#BBF7D0']}
                            style={styles.courseImagePlaceholder}
                          >
                            <View style={styles.smallPlayIcon}>
                              <Ionicons name="play" size={20} color={colors.primary} />
                            </View>
                          </LinearGradient>
                        )}
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle} numberOfLines={2}>{course.name}</Text>
                          {course.short_description && (
                            <Text style={styles.cardDescription} numberOfLines={1}>
                              {course.short_description}
                            </Text>
                          )}
                          {!!course.rating && (
                            <View style={styles.ratingRow}>
                              <Text style={styles.ratingNumber}>{course.rating.toFixed(1)}</Text>
                              <View style={styles.starsRow}>
                                {[1, 2, 3, 4, 5].map((i) => (
                                  <Ionicons 
                                    key={i} 
                                    name={i <= Math.floor(course.rating || 0) ? "star" : i - 0.5 <= (course.rating || 0) ? "star-half" : "star-outline"} 
                                    size={12} 
                                    color="#F59E0B" 
                                  />
                                ))}
                              </View>
                              {!!course.review_count && (
                                <Text style={styles.reviewCount}>({course.review_count.toLocaleString()})</Text>
                              )}
                            </View>
                          )}
                          <Text style={styles.cardPrice}>{formatPrice(course.price_inr)}</Text>
                          {course.is_coming_soon ? (
                            <View style={styles.comingSoonBadge}>
                              <Text style={styles.comingSoonText}>Coming Soon</Text>
                            </View>
                          ) : (!!course.rating && course.rating >= 4.5 && (
                            <View style={styles.bestsellerBadge}>
                              <Text style={styles.bestsellerText}>Bestseller</Text>
                            </View>
                          ))}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </View>
      </View>

      <AITeacherPlanModal visible={plansOpen} onClose={() => setPlansOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: width * 0.75,
    paddingTop: 60,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
  },
  sidebarProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  sidebarAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarText: {
    color: colors.white,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  sidebarName: {
    color: colors.white,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  sidebarSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  sidebarScroll: {
    flex: 1,
  },
  sidebarScrollContent: {
    paddingBottom: 110,
  },
  sidebarMenu: {
    gap: 0,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.xl,
  },
  menuItemActive: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  menuIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  menuItemTextActive: {
    color: colors.primary,
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginHorizontal: spacing.md,
    marginTop: 16,
    marginBottom: 4,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginTop: 4,
  },
  logoutIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  mainContentInner: {
    flex: 1,
  },
  header: {
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  menuButton: {
    marginRight: spacing.md,
    padding: spacing.xs,
  },
  greeting: {
    flex: 1,
  },
  greetingName: {
    color: colors.white,
    fontSize: fontSize.xl,
    fontFamily: fontFamily.bold,
  },
  greetingSubtext: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 0,
  },
  section: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.heading,
    color: colors.text,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAll: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  cardInfo: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  horizontalScroll: {
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
  },
  coursesRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingRight: spacing.md,
  },
  courseCard: {
    width: 170,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  courseImagePlaceholder: {
    height: 100,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  smallPlayIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.bold,
    color: colors.text,
    lineHeight: 18,
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: 15,
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  ratingNumber: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.bold,
    color: '#B4690E',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  reviewCount: {
    fontSize: 10,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  cardPrice: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.extraBold,
    color: colors.text,
  },
  enrolledBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 6,
  },
  enrolledBadgeText: {
    fontSize: 10,
    fontFamily: fontFamily.bold,
    color: colors.primary,
  },
  bestsellerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECEB98',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 4,
  },
  bestsellerText: {
    fontSize: 10,
    fontFamily: fontFamily.bold,
    color: '#3D3C0A',
  },
  comingSoonBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 4,
  },
  comingSoonText: {
    fontSize: 10,
    fontFamily: fontFamily.bold,
    color: '#0369A1',
  },
  loadingContainer: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyState: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyStateText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 100,
  },
});
