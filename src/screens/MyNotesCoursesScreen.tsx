import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, fontFamily } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import NotebookCard from '../components/my-notes/NotebookCard';
import {
  NotesListSkeleton,
  NotesEmptyState,
  NotesErrorState,
} from '../components/my-notes/NotesStateViews';
import { getEnrolledCourseNotebooks, EnrolledCourseNotebook } from '../services/studentNotesService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function MyNotesCoursesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { openSidebar } = useSidebar();

  const [courses, setCourses] = useState<EnrolledCourseNotebook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!user?.id) return;
    if (mode === 'refresh') setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const data = await getEnrolledCourseNotebooks(user.id);
      setCourses(data ?? []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load your course notebooks.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load('initial');
    }, [load])
  );

  const goToSubjects = (course: EnrolledCourseNotebook) => {
    navigation.navigate('MyNotesSubjects', {
      courseId: course.course_id,
      courseName: course.course_name,
    });
  };

  const browseCourses = () => {
    navigation.navigate('MainTabs', { screen: 'MyCourses' });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <HeaderMenuButton onPress={openSidebar} variant="light" />
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerEyebrow}>My Notes</Text>
          <Text style={styles.headerTitle}>Every idea, in one place</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => load('refresh')} tintColor={colors.primary} />
        }
      >
        {isLoading ? (
          <NotesListSkeleton count={4} />
        ) : error ? (
          <NotesErrorState message={error} onRetry={() => load('initial')} />
        ) : courses.length === 0 ? (
          <NotesEmptyState
            icon="book-outline"
            title="No notebooks yet"
            message="Enroll in a course to start capturing lecture notes here."
            actionLabel="Browse courses"
            onAction={browseCourses}
            testID="empty-courses"
          />
        ) : (
          <>
            <Text style={styles.countLabel}>
              {courses.length} {courses.length === 1 ? 'course notebook' : 'course notebooks'}
            </Text>
            {courses.map((course) => (
              <NotebookCard
                key={course.course_id}
                thumbnailUrl={course.thumbnail_url}
                title={course.course_name}
                subtitle={course.short_description}
                progress={course.progress ?? undefined}
                metaPills={
                  course.duration_months
                    ? [{ icon: 'time-outline', label: `${course.duration_months} months` }]
                    : undefined
                }
                actionLabel="Open notes"
                onPress={() => goToSubjects(course)}
                testID={`card-course-notebook-${course.course_id}`}
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerEyebrow: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerTitle: {
    fontFamily: fontFamily.heading,
    fontSize: fontSize.xxl,
    color: colors.text,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 120,
  },
  countLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
});
