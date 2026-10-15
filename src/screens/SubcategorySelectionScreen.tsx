import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, Category, ExploreCourse } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontFamily } from '../constants/theme';

interface SubcategoryGroup {
  parentName: string;
  parentIcon: string;
  subcategories: Category[];
}

interface CourseHint {
  id: string;
  name: string;
  rating: number | null;
  student_count: number | null;
}

function formatStudentCount(count: number | null): string {
  if (!count) return '0';
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

function CourseHintCard({ courses }: { courses: CourseHint[] }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, []);

  if (courses.length === 0) return null;

  return (
    <Animated.View style={[styles.hintContainer, { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>
      <View style={styles.hintHeader}>
        <Ionicons name="trending-up" size={12} color={colors.primary} />
        <Text style={styles.hintTitle}>Top Courses</Text>
      </View>
      {courses.map((course, index) => (
        <View key={course.id} style={[styles.hintRow, index < courses.length - 1 && styles.hintRowBorder]} data-testid={`hint-course-${course.id}`}>
          <Text style={styles.hintCourseName} numberOfLines={1}>{course.name}</Text>
          <View style={styles.hintMeta}>
            <View style={styles.hintRating}>
              <Ionicons name="star" size={10} color={colors.yellow[400]} />
              <Text style={styles.hintRatingText}>{course.rating != null ? course.rating.toFixed(1) : '—'}</Text>
            </View>
            <Text style={styles.hintStudents}>{formatStudentCount(course.student_count)} students</Text>
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

export default function SubcategorySelectionScreen({ navigation, route }: any) {
  const { markInterestsSelected, user, resolveLandingTab } = useAuth();
  const selectedCategoryIds: string[] = route.params?.selectedCategoryIds || [];
  const [groups, setGroups] = useState<SubcategoryGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseHints, setCourseHints] = useState<Record<string, CourseHint[]>>({});
  const fetchingRef = useRef<Set<string>>(new Set());
  const childCategoryMapRef = useRef<Record<string, string[]>>({});

  useEffect(() => {
    fetchSubcategories();
  }, []);

  const fetchSubcategories = async () => {
    const result = await supabase.getCategories();
    if (result.success && result.categories) {
      const allCategories = result.categories;
      const parentMap = new Map<string, Category>();
      allCategories
        .filter((c) => c.level === 1 && selectedCategoryIds.includes(c.id))
        .forEach((c) => parentMap.set(c.id, c));

      const subcats = allCategories.filter(
        (c) => c.level === 2 && c.parent_id && selectedCategoryIds.includes(c.parent_id)
      );

      const level3Cats = allCategories.filter((c) => c.level === 3);
      const childMap: Record<string, string[]> = {};
      subcats.forEach((sub) => {
        const childIds = level3Cats
          .filter((c) => c.parent_id === sub.id)
          .map((c) => c.id);
        childMap[sub.id] = childIds;
      });
      childCategoryMapRef.current = childMap;

      const grouped: SubcategoryGroup[] = [];
      parentMap.forEach((parent) => {
        const children = subcats.filter((s) => s.parent_id === parent.id);
        if (children.length > 0) {
          grouped.push({
            parentName: parent.name,
            parentIcon: getCategoryIcon(parent.icon, parent.name),
            subcategories: children,
          });
        }
      });

      if (grouped.length === 0) {
        await AsyncStorage.setItem('@interests_selected', 'true');
        markInterestsSelected();
        const initialTab = user ? await resolveLandingTab(user.id) : 'Home';
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { initialTab } }] });
        return;
      }

      setGroups(grouped);
      prefetchCourseHints(subcats, childMap);
    }
    setLoading(false);
  };

  const getCategoryIdsForLookup = (subId: string): string[] => {
    const children = childCategoryMapRef.current[subId] || [];
    return [subId, ...children];
  };

  const prefetchCourseHints = async (subcats: Category[], childMap: Record<string, string[]>) => {
    const promises = subcats.map(async (sub) => {
      if (fetchingRef.current.has(sub.id)) return;
      fetchingRef.current.add(sub.id);
      try {
        const lookupIds = [sub.id, ...(childMap[sub.id] || [])];
        const result = await supabase.getTopCoursesByCategory(lookupIds, 3);
        if (result.success && result.courses && result.courses.length > 0) {
          const hints: CourseHint[] = result.courses.map((c: ExploreCourse) => ({
            id: c.id,
            name: c.name,
            rating: c.rating,
            student_count: c.student_count,
          }));
          setCourseHints((prev) => ({ ...prev, [sub.id]: hints }));
        } else if (!result.success) {
          fetchingRef.current.delete(sub.id);
        }
      } catch {
        fetchingRef.current.delete(sub.id);
      }
    });
    await Promise.allSettled(promises);
  };

  const getCategoryIcon = (icon: string | null, name: string) => {
    if (icon && icon.length <= 2) return icon;
    const iconMap: Record<string, string> = {
      'Board Exams': '📚',
      'Medical Entrance': '🩺',
      'Engineering Entrance': '⚙️',
      'Pharmacy Courses': '💊',
      'Integrated Programs': '🎯',
      'Research': '🔬',
      'Business Studies': '💼',
      'Accounts': '📊',
      'Data Science': '📈',
      'Architecture': '🏛️',
      'Economics': '💰',
      'Puc': '📖',
    };
    return iconMap[name] || '📖';
  };

  const toggleSubcategory = (id: string) => {
    const wasSelected = selectedIds.includes(id);
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
    if (!wasSelected && !courseHints[id] && !fetchingRef.current.has(id)) {
      fetchingRef.current.add(id);
      const lookupIds = getCategoryIdsForLookup(id);
      supabase.getTopCoursesByCategory(lookupIds, 3).then((result) => {
        if (result.success && result.courses && result.courses.length > 0) {
          const hints: CourseHint[] = result.courses.map((c: ExploreCourse) => ({
            id: c.id,
            name: c.name,
            rating: c.rating,
            student_count: c.student_count,
          }));
          setCourseHints((p) => ({ ...p, [id]: hints }));
        } else if (!result.success) {
          fetchingRef.current.delete(id);
        }
      }).catch(() => {
        fetchingRef.current.delete(id);
      });
    }
  };

  const completeOnboarding = async () => {
    await AsyncStorage.setItem('@interests_selected', 'true');
    markInterestsSelected();
    const initialTab = user ? await resolveLandingTab(user.id) : 'Home';
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { initialTab } }] });
  };

  const handleContinue = () => {
    completeOnboarding();
  };

  const handleSkip = () => {
    completeOnboarding();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} data-testid="text-subcategory-title">Select your subjects</Text>
              <Text style={styles.subtitle} data-testid="text-subcategory-subtitle">
                Choose specific subjects you'd like to explore
              </Text>
            </View>
            <TouchableOpacity onPress={handleSkip} style={styles.skipButton} data-testid="button-skip-subcategories">
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>

        {groups.map((group) => (
          <View key={group.parentName} style={styles.groupContainer}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupIcon}>{group.parentIcon}</Text>
              <Text style={styles.groupTitle}>{group.parentName}</Text>
            </View>
            <View style={styles.grid}>
              {group.subcategories.map((sub) => {
                const isSelected = selectedIds.includes(sub.id);
                const hints = courseHints[sub.id];
                return (
                  <View key={sub.id} style={styles.cardWrapper}>
                    <TouchableOpacity
                      style={[styles.categoryCard, isSelected && styles.categoryCardSelected]}
                      onPress={() => toggleSubcategory(sub.id)}
                      activeOpacity={0.7}
                      data-testid={`button-subcategory-${sub.id}`}
                    >
                      <Text style={styles.categoryIcon}>
                        {getCategoryIcon(sub.icon, sub.name)}
                      </Text>
                      <Text style={[styles.categoryName, isSelected && styles.categoryNameSelected]}>
                        {sub.name}
                      </Text>
                      {isSelected && (
                        <View style={styles.checkmark}>
                          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                        </View>
                      )}
                    </TouchableOpacity>
                    {isSelected && hints && hints.length > 0 && (
                      <CourseHintCard courses={hints} />
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.bottomBar}>
        <Text style={styles.selectedCount} data-testid="text-subcategory-selected-count">
          {selectedIds.length} selected
        </Text>
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
          data-testid="button-continue-subcategories"
        >
          <Text style={styles.continueText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  header: {
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontFamily: fontFamily.heading,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  skipButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: 4,
  },
  skipText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  groupContainer: {
    marginBottom: spacing.xl,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  groupIcon: {
    fontSize: 22,
    marginRight: spacing.sm,
  },
  groupTitle: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.bold,
    color: colors.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cardWrapper: {
    width: '47%',
  },
  categoryCard: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    position: 'relative',
  },
  categoryCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#F0FDF4',
  },
  categoryIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  categoryName: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    textAlign: 'center',
  },
  categoryNameSelected: {
    color: colors.primary,
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  hintContainer: {
    marginTop: spacing.xs,
    backgroundColor: '#F0FDF4',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  hintHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  hintTitle: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.bold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hintRow: {
    paddingVertical: 4,
  },
  hintRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D1FAE5',
  },
  hintCourseName: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    marginBottom: 2,
  },
  hintMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hintRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  hintRatingText: {
    fontSize: 9,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  hintStudents: {
    fontSize: 9,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedCount: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  continueButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    minWidth: 140,
    alignItems: 'center',
  },
  continueText: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.bold,
    color: colors.white,
  },
});
