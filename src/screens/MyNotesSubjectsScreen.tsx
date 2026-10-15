import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import NotebookCard from '../components/my-notes/NotebookCard';
import {
  NotesListSkeleton,
  NotesEmptyState,
  NotesErrorState,
} from '../components/my-notes/NotesStateViews';
import {
  getCourseNotebookSubjects,
  getSubjectNoteCounts,
  CourseSubject,
} from '../services/studentNotesService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'MyNotesSubjects'>;

export default function MyNotesSubjectsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const { courseId, courseName } = route.params;
  const { user } = useAuth();

  const [subjects, setSubjects] = useState<CourseSubject[]>([]);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!user?.id) return;
    if (mode === 'refresh') setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const data = await getCourseNotebookSubjects(courseId);
      const list = data ?? [];
      setSubjects(list);
      const subjectIds = list.map((s) => s.subject_id);
      if (subjectIds.length > 0) {
        const counts = await getSubjectNoteCounts(user.id, subjectIds);
        setNoteCounts(counts ?? {});
      } else {
        setNoteCounts({});
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load subjects for this course.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id, courseId]);

  useFocusEffect(
    useCallback(() => {
      load('initial');
    }, [load])
  );

  const goToChapter = (cs: CourseSubject) => {
    navigation.navigate('MyNotesChapter', {
      courseId,
      courseName,
      subjectId: cs.subject_id,
      subjectName: cs.subject?.name,
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} testID="button-back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerEyebrow} numberOfLines={1}>{courseName || 'Course'}</Text>
          <Text style={styles.headerTitle}>Subject notebooks</Text>
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
        ) : subjects.length === 0 ? (
          <NotesEmptyState
            icon="library-outline"
            title="No subjects found"
            message="This course does not have any subjects to take notes on yet."
            testID="empty-subjects"
          />
        ) : (
          <>
            <Text style={styles.countLabel}>
              {subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'}
            </Text>
            {subjects.map((cs) => {
              const count = noteCounts[cs.subject_id] ?? 0;
              return (
                <NotebookCard
                  key={cs.id}
                  thumbnailUrl={cs.subject?.thumbnail_url}
                  title={cs.subject?.name || 'Subject'}
                  subtitle={count === 0 ? 'Fresh notebook' : `${count} ${count === 1 ? 'note' : 'notes'}`}
                  statusLabel="Notes synced"
                  actionLabel="Open notebook"
                  onPress={() => goToChapter(cs)}
                  testID={`card-subject-notebook-${cs.subject_id}`}
                />
              );
            })}
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
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
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
    fontFamily: fontFamily.headingSemiBold,
    fontSize: fontSize.xl,
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
