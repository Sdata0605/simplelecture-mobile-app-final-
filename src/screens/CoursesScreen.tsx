import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';
import { supabase, Category, ExploreCourse } from '../services/supabase';
import { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type CoursesRouteProp = RouteProp<RootStackParamList, 'Courses'>;

export default function CoursesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { openSidebar } = useSidebar();
  const route = useRoute<CoursesRouteProp>();
  const initialSearchQuery = route.params?.searchQuery || '';
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<Category | null>(null);
  const [selectedSuperSubCategory, setSelectedSuperSubCategory] = useState<Category | null>(null);
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [courses, setCourses] = useState<ExploreCourse[]>([]);
  const [allCourses, setAllCourses] = useState<ExploreCourse[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isLoadingAllCourses, setIsLoadingAllCourses] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
    fetchAllCourses();
  }, []);

  useEffect(() => {
    if (route.params?.searchQuery) {
      setSearchQuery(route.params.searchQuery);
    }
  }, [route.params?.searchQuery]);

  useEffect(() => {
    fetchCourses();
  }, [selectedCategory, selectedSubCategory, selectedSuperSubCategory, categories]);

  const fetchCategories = async () => {
    setIsLoadingCategories(true);
    setError(null);
    const result = await supabase.getCategories();
    if (result.success && result.categories) {
      setCategories(result.categories);
    } else {
      setError(result.error || 'Failed to load categories');
    }
    setIsLoadingCategories(false);
  };

  const fetchAllCourses = async () => {
    setIsLoadingAllCourses(true);
    const result = await supabase.getCoursesByCategory([]);
    if (result.success && result.courses) {
      setAllCourses(result.courses);
    }
    setIsLoadingAllCourses(false);
  };

  const fetchCourses = async () => {
    setIsLoadingCourses(true);
    
    let categoryIds: string[] = [];
    
    if (selectedSuperSubCategory) {
      categoryIds = [selectedSuperSubCategory.id];
    } else if (selectedSubCategory) {
      categoryIds = supabase.getAllDescendantCategoryIds(categories, selectedSubCategory.id);
    } else if (selectedCategory) {
      categoryIds = supabase.getAllDescendantCategoryIds(categories, selectedCategory.id);
    }
    
    const result = await supabase.getCoursesByCategory(categoryIds);
    if (result.success && result.courses) {
      setCourses(result.courses);
    } else {
      setCourses([]);
    }
    setIsLoadingCourses(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchCategories(), fetchCourses(), fetchAllCourses()]);
    setRefreshing(false);
  };

  const level1Categories = categories.filter(c => c.level === 1);
  
  const level2Categories = selectedCategory 
    ? categories.filter(c => c.level === 2 && c.parent_id === selectedCategory.id)
    : [];
  
  const level3Categories = selectedSubCategory 
    ? categories.filter(c => c.level === 3 && c.parent_id === selectedSubCategory.id)
    : [];

  const filteredCourses = useMemo(() => {
    if (!searchQuery) return courses;
    return courses.filter(course => 
      course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.short_description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [courses, searchQuery]);

  const filteredAllCourses = useMemo(() => {
    if (!searchQuery) return allCourses;
    return allCourses.filter(course => 
      course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.short_description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allCourses, searchQuery]);

  const clearFilters = () => {
    setSelectedCategory(null);
    setSelectedSubCategory(null);
    setSelectedSuperSubCategory(null);
    setSearchQuery('');
  };

  const hasActiveFilters = selectedCategory || selectedSubCategory || selectedSuperSubCategory || searchQuery;

  const formatPrice = (price: number | null) => {
    if (price === null) return 'Free';
    return `₹${price.toLocaleString('en-IN')}`;
  };

  const getDiscountPercent = (original: number | null, current: number | null) => {
    if (!original || !current || original <= current) return null;
    return Math.round(((original - current) / original) * 100);
  };

  const handleViewCourse = (courseId: string) => {
    navigation.navigate('ViewCourse', { courseId });
  };

  const renderCategoryIcon = (icon: string | null) => {
    if (!icon) return null;
    if (icon.length <= 2) {
      return <Text style={styles.categoryEmoji}>{icon}</Text>;
    }
    return <Ionicons name={icon as any} size={16} color={colors.primary} />;
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primary, '#4ADE80']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIconContainer}>
              <Ionicons name="compass" size={16} color={colors.primary} />
            </View>
            <Text style={styles.headerTitle}>Explore Courses</Text>
          </View>
          <Text style={styles.headerSubtitle}>Find the perfect course for your learning journey</Text>
        </View>
        <HeaderMenuButton onPress={openSidebar} />
      </LinearGradient>

      <View style={styles.searchWrapper}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.primary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for courses..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            data-testid="input-search"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} data-testid="button-clear-search">
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {isLoadingCategories && (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingIconContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
            <Text style={styles.loadingText}>Loading categories...</Text>
          </View>
        )}

        {error && !isLoadingCategories && (
          <View style={styles.errorContainer}>
            <View style={styles.errorIconContainer}>
              <Ionicons name="alert-circle" size={32} color="#EF4444" />
            </View>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchCategories}>
              <LinearGradient
                colors={[colors.primary, '#4ADE80']}
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {!isLoadingCategories && !error && (
          <>
            {filteredAllCourses.length > 0 && (
              <View style={styles.famousSection}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconContainer}>
                    <Ionicons name="flame" size={20} color="#F59E0B" />
                  </View>
                  <Text style={styles.sectionTitle}>{searchQuery ? 'Search Results' : 'Most Famous'}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalList}>
                  {filteredAllCourses.map((course) => (
                    <TouchableOpacity
                      key={course.id}
                      style={styles.horizontalCourseCard}
                      onPress={() => navigation.navigate('ViewCourse', { courseId: course.id })}
                      activeOpacity={0.8}
                      data-testid={`famous-course-${course.id}`}
                    >
                      {course.thumbnail_url && !course.thumbnail_url.startsWith('data:') ? (
                        <Image source={{ uri: course.thumbnail_url }} style={styles.horizontalCourseThumbnail} />
                      ) : (
                        <View style={styles.horizontalThumbnailPlaceholder}>
                          <Ionicons name="book" size={32} color={colors.white} />
                        </View>
                      )}
                      <View style={styles.horizontalCourseInfo}>
                        <Text style={styles.horizontalCourseTitle} numberOfLines={2}>{course.name}</Text>
                        {course.short_description && (
                          <Text style={styles.horizontalDescription} numberOfLines={1}>{course.short_description}</Text>
                        )}
                        {!!course.rating && (
                          <View style={styles.horizontalRatingRow}>
                            <Text style={styles.horizontalRatingNum}>{course.rating.toFixed(1)}</Text>
                            <View style={styles.horizontalStarsRow}>
                              {[1, 2, 3, 4, 5].map((i) => (
                                <Ionicons 
                                  key={i} 
                                  name={i <= Math.floor(course.rating || 0) ? "star" : i - 0.5 <= (course.rating || 0) ? "star-half" : "star-outline"} 
                                  size={11} 
                                  color="#F59E0B" 
                                />
                              ))}
                            </View>
                            {!!course.review_count && (
                              <Text style={styles.horizontalReviewCount}>({course.review_count.toLocaleString()})</Text>
                            )}
                          </View>
                        )}
                        {course.price_inr !== null && (
                          <Text style={styles.horizontalPrice}>{formatPrice(course.price_inr)}</Text>
                        )}
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
                </ScrollView>
              </View>
            )}

            {isLoadingAllCourses && allCourses.length === 0 && (
              <View style={styles.loadingFamous}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingFamousText}>Loading popular courses...</Text>
              </View>
            )}

            {searchQuery && filteredAllCourses.length === 0 && !isLoadingAllCourses && (
              <View style={styles.noResultsContainer}>
                <View style={styles.noResultsIconContainer}>
                  <Ionicons name="search-outline" size={40} color={colors.primary} />
                </View>
                <Text style={styles.noResultsTitle}>No courses found</Text>
                <Text style={styles.noResultsText}>Try a different search term</Text>
                <TouchableOpacity 
                  style={styles.clearSearchButton}
                  onPress={() => setSearchQuery('')}
                >
                  <Text style={styles.clearSearchButtonText}>Clear Search</Text>
                </TouchableOpacity>
              </View>
            )}

            {level1Categories.length > 0 && (
              <View style={styles.filterSection}>
                <View style={styles.filterHeader}>
                  <View style={styles.filterIconContainer}>
                    <Ionicons name="apps" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.filterTitle}>Categories</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.filterRow}>
                    {level1Categories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.filterChip, selectedCategory?.id === cat.id && styles.filterChipActive]}
                        onPress={() => {
                          if (selectedCategory?.id === cat.id) {
                            setSelectedCategory(null);
                            setSelectedSubCategory(null);
                            setSelectedSuperSubCategory(null);
                          } else {
                            setSelectedCategory(cat);
                            setSelectedSubCategory(null);
                            setSelectedSuperSubCategory(null);
                          }
                        }}
                        data-testid={`filter-category-${cat.id}`}
                      >
                        {renderCategoryIcon(cat.icon)}
                        <Text style={[styles.filterChipText, selectedCategory?.id === cat.id && styles.filterChipTextActive]}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {level2Categories.length > 0 && (
              <View style={styles.filterSection}>
                <View style={styles.filterHeader}>
                  <View style={styles.filterIconContainer}>
                    <Ionicons name="layers" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.filterTitle}>Sub Categories</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.filterRow}>
                    {level2Categories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.filterChip, selectedSubCategory?.id === cat.id && styles.filterChipActive]}
                        onPress={() => {
                          if (selectedSubCategory?.id === cat.id) {
                            setSelectedSubCategory(null);
                            setSelectedSuperSubCategory(null);
                          } else {
                            setSelectedSubCategory(cat);
                            setSelectedSuperSubCategory(null);
                          }
                        }}
                        data-testid={`filter-subcategory-${cat.id}`}
                      >
                        {cat.icon && renderCategoryIcon(cat.icon)}
                        <Text style={[styles.filterChipText, selectedSubCategory?.id === cat.id && styles.filterChipTextActive]}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {level3Categories.length > 0 && (
              <View style={styles.filterSection}>
                <View style={styles.filterHeader}>
                  <View style={styles.filterIconContainer}>
                    <Ionicons name="options" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.filterTitle}>Specific</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.filterRow}>
                    {level3Categories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.filterChip, selectedSuperSubCategory?.id === cat.id && styles.filterChipActive]}
                        onPress={() => {
                          setSelectedSuperSubCategory(selectedSuperSubCategory?.id === cat.id ? null : cat);
                        }}
                        data-testid={`filter-subsubcategory-${cat.id}`}
                      >
                        <Text style={[styles.filterChipText, selectedSuperSubCategory?.id === cat.id && styles.filterChipTextActive]}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {hasActiveFilters && (
              <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters} data-testid="button-clear-filters">
                <Ionicons name="close" size={16} color={colors.primary} />
                <Text style={styles.clearFiltersText}>Clear All Filters</Text>
              </TouchableOpacity>
            )}

            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>
                {isLoadingCourses ? 'Loading...' : `${filteredCourses.length} Courses Found`}
              </Text>
            </View>

            {isLoadingCourses ? (
              <View style={styles.coursesLoadingContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : filteredCourses.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="search-outline" size={40} color={colors.primary} />
                </View>
                <Text style={styles.emptyStateTitle}>No courses found</Text>
                <Text style={styles.emptyStateText}>Try adjusting your filters or search query</Text>
              </View>
            ) : (
              filteredCourses.map((course) => {
                const discount = getDiscountPercent(course.original_price_inr, course.price_inr);
                return (
                  <TouchableOpacity 
                    key={course.id} 
                    style={styles.courseCard}
                    onPress={() => handleViewCourse(course.id)}
                    activeOpacity={0.7}
                    data-testid={`card-course-${course.id}`}
                  >
                    {course.thumbnail_url && !course.thumbnail_url.startsWith('data:') ? (
                      <Image source={{ uri: course.thumbnail_url }} style={styles.courseImage} resizeMode="cover" />
                    ) : (
                      <LinearGradient
                        colors={['#FFFFFF', '#D1FAE5', '#A7F3D0']}
                        style={styles.courseImage}
                      >
                        <View style={styles.coursePlayIcon}>
                          <Ionicons name="book" size={24} color={colors.primary} />
                        </View>
                      </LinearGradient>
                    )}
                    
                    {!!discount && (
                      <View style={styles.discountBadge}>
                        <Text style={styles.discountText}>{discount}% OFF</Text>
                      </View>
                    )}
                    
                    <View style={styles.courseContent}>
                      <Text style={styles.courseTitle} numberOfLines={2}>{course.name}</Text>
                      
                      {course.short_description && (
                        <Text style={styles.courseDescription} numberOfLines={1}>{course.short_description}</Text>
                      )}
                      
                      {!!course.rating && (
                        <View style={styles.courseRatingRow}>
                          <Text style={styles.courseRatingNum}>{course.rating.toFixed(1)}</Text>
                          <View style={styles.courseStarsRow}>
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Ionicons 
                                key={i} 
                                name={i <= Math.floor(course.rating || 0) ? "star" : i - 0.5 <= (course.rating || 0) ? "star-half" : "star-outline"} 
                                size={13} 
                                color="#F59E0B" 
                              />
                            ))}
                          </View>
                          {!!course.review_count && (
                            <Text style={styles.courseReviewCount}>({course.review_count.toLocaleString()})</Text>
                          )}
                        </View>
                      )}
                      
                      <View style={styles.coursePriceRow}>
                        <Text style={styles.coursePrice}>{formatPrice(course.price_inr)}</Text>
                        {!!course.original_price_inr && course.original_price_inr > (course.price_inr || 0) && (
                          <Text style={styles.originalPrice}>{formatPrice(course.original_price_inr)}</Text>
                        )}
                      </View>
                      
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
                );
              })
            )}
          </>
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
    paddingTop: 50,
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
    fontFamily: fontFamily.bold,
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
    marginLeft: 36,
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
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
  coursesLoadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    margin: spacing.md,
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
  famousSection: {
    marginBottom: spacing.lg,
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
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.heading,
    color: colors.text,
  },
  horizontalList: {
    marginLeft: -spacing.md,
    paddingLeft: spacing.md,
  },
  horizontalCourseCard: {
    width: 170,
    backgroundColor: 'transparent',
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  horizontalCourseThumbnail: {
    width: '100%',
    height: 100,
    borderRadius: borderRadius.sm,
  },
  horizontalThumbnailPlaceholder: {
    width: '100%',
    height: 100,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizontalCourseInfo: {
    paddingTop: spacing.sm,
  },
  horizontalCourseTitle: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.bold,
    color: colors.text,
    marginBottom: 2,
    lineHeight: 18,
  },
  horizontalDescription: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: 15,
    marginBottom: 4,
  },
  horizontalRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  horizontalRatingNum: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.bold,
    color: '#B4690E',
  },
  horizontalStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  horizontalReviewCount: {
    fontSize: 10,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  horizontalPrice: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.extraBold,
    color: colors.text,
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
  loadingFamous: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  loadingFamousText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  filterSection: {
    marginBottom: spacing.md,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  filterIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTitle: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.heading,
    color: colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterChipText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: colors.white,
  },
  categoryEmoji: {
    fontSize: 16,
  },
  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  clearFiltersText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  resultsHeader: {
    marginBottom: spacing.md,
  },
  resultsCount: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.heading,
    color: colors.text,
  },
  emptyState: {
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
  emptyStateTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyStateText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  courseCard: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  courseImage: {
    height: 180,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  coursePlayIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: '#EF4444',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  discountText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.white,
  },
  courseContent: {
    paddingTop: spacing.sm,
  },
  courseTitle: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.bold,
    color: colors.text,
    marginBottom: 2,
    lineHeight: 20,
  },
  courseDescription: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginBottom: 4,
    lineHeight: 18,
  },
  courseRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  courseRatingNum: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.bold,
    color: '#B4690E',
  },
  courseStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  courseReviewCount: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  coursePriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  coursePrice: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.extraBold,
    color: colors.text,
  },
  originalPrice: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  noResultsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    marginHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    marginTop: spacing.md,
  },
  noResultsIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  noResultsTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  noResultsText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  clearSearchButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
  },
  clearSearchButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.white,
  },
  bottomSpacer: {
    height: 100,
  },
});
