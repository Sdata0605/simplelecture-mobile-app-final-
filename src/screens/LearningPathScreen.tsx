import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase, CourseSubject } from '../services/supabase';

type LearningPathRouteProp = RouteProp<RootStackParamList, 'LearningPath'>;

export default function LearningPathScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<LearningPathRouteProp>();
  const { courseId, courseName, isPreview, previewAiLimit, previewDoubtsLimit } = route.params;

  const [subjects, setSubjects] = useState<CourseSubject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubjects();
  }, [courseId]);

  const fetchSubjects = async () => {
    setLoadingSubjects(true);
    setError(null);
    const result = await supabase.getCourseSubjects(courseId);
    if (result.success && result.subjects) {
      setSubjects(result.subjects);
    } else {
      setError(result.error || 'Failed to load subjects');
    }
    setLoadingSubjects(false);
  };

  const handleSubjectPress = (subjectId: string, subjectName: string) => {
    navigation.navigate('ChaptersList', {
      subjectId,
      subjectName,
      ...(isPreview ? {
        isPreview: true,
        courseId,
        courseName,
        previewAiLimit: previewAiLimit ?? 3,
        previewDoubtsLimit: previewDoubtsLimit ?? 3,
      } : {}),
    });
  };

  const filteredSubjects = subjects.filter(
    (cs) => cs.subject.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loadingSubjects) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[colors.primary, '#4ADE80']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Course Content</Text>
            <View style={{ width: 36 }} />
          </View>
        </LinearGradient>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading subjects...</Text>
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
          <View style={styles.headerTop}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Course Content</Text>
            <View style={{ width: 36 }} />
          </View>
        </LinearGradient>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchSubjects}>
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
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Course Content</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.primary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search subjects..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {filteredSubjects.length > 0 ? (
          filteredSubjects.map((courseSubject) => (
            <View key={courseSubject.id} style={styles.subjectContainer}>
              <TouchableOpacity
                style={styles.subjectCard}
                onPress={() => handleSubjectPress(courseSubject.subject.id, courseSubject.subject.name)}
                activeOpacity={0.8}
                data-testid={`subject-card-${courseSubject.subject.id}`}
              >
                <View style={styles.subjectHeader}>
                  <View style={styles.subjectIcon}>
                    <Ionicons name="book" size={24} color={colors.white} />
                  </View>
                  <View style={styles.subjectInfo}>
                    <Text style={styles.subjectName}>{courseSubject.subject.name}</Text>
                    <Text style={styles.subjectMeta}>Tap to view chapters</Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.primary}
                  />
                </View>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={colors.gray300} />
            <Text style={styles.emptyText}>No subjects found</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray50,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: 44,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.white,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.gray900,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.gray500,
  },
  errorText: {
    fontSize: fontSize.md,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  retryButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  retryText: {
    color: colors.white,
    fontWeight: '600',
  },
  subjectContainer: {
    marginBottom: spacing.md,
  },
  subjectCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.08)',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  subjectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  subjectIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectInfo: {
    flex: 1,
  },
  subjectName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.gray900,
  },
  subjectMeta: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.gray500,
    marginTop: spacing.md,
  },
});
