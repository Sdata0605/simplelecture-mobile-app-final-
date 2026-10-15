import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors } from '../constants/theme';
import { supabase, ClassRecording, VideoWatchProgress } from '../services/supabase';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface GroupedRecordings {
  [subjectName: string]: ClassRecording[];
}

export default function RecordingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [recordings, setRecordings] = useState<ClassRecording[]>([]);
  const [watchProgress, setWatchProgress] = useState<{ [key: string]: VideoWatchProgress }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');

  const fetchRecordings = async () => {
    try {
      setError(null);
      const [recordingsResult, userResult] = await Promise.all([
        supabase.getAllRecordings(),
        supabase.getStoredUser(),
      ]);
      
      if (recordingsResult.success && recordingsResult.recordings) {
        setRecordings(recordingsResult.recordings);
        
        if (userResult?.id && recordingsResult.recordings.length > 0) {
          fetchWatchProgress(userResult.id, recordingsResult.recordings);
        }
      } else {
        setError(recordingsResult.error || 'Failed to fetch recordings');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchWatchProgress = async (userId: string, recs: ClassRecording[]) => {
    try {
      const progressMap: { [key: string]: VideoWatchProgress } = {};
      const batchSize = 10;
      for (let i = 0; i < recs.length; i += batchSize) {
        const batch = recs.slice(i, i + batchSize);
        const progressPromises = batch.map(async (rec) => {
          const result = await supabase.getWatchProgress(rec.id, userId);
          if (result.success && result.progress) {
            progressMap[rec.id] = result.progress;
          }
        });
        await Promise.all(progressPromises);
      }
      setWatchProgress(progressMap);
    } catch (err) {
      console.log('Failed to fetch watch progress:', err);
    }
  };

  useEffect(() => {
    fetchRecordings();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecordings();
  };

  const courses = useMemo(() => {
    const uniqueCourses = new Map<string, string>();
    recordings.forEach((rec) => {
      const courseName = rec.course?.name || rec.scheduled_class?.course?.name;
      const courseId = rec.course_id || rec.scheduled_class?.course_id;
      if (courseName && courseId) {
        uniqueCourses.set(courseId, courseName);
      }
    });
    return Array.from(uniqueCourses.entries()).map(([id, name]) => ({ id, name }));
  }, [recordings]);

  const subjects = useMemo(() => {
    const uniqueSubjects = new Map<string, string>();
    recordings.forEach((rec) => {
      const subjectName = rec.subject?.name || rec.scheduled_class?.subject;
      const subjectId = rec.subject_id;
      if (subjectName && subjectId) {
        uniqueSubjects.set(subjectId, subjectName);
      }
    });
    return Array.from(uniqueSubjects.entries()).map(([id, name]) => ({ id, name }));
  }, [recordings]);

  const filteredRecordings = useMemo(() => {
    return recordings.filter((rec) => {
      const title = rec.recording_title || rec.topic?.title || rec.scheduled_class?.subject || '';
      const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase());
      
      const courseId = rec.course_id || rec.scheduled_class?.course_id;
      const matchesCourse = selectedCourse === 'all' || courseId === selectedCourse;
      
      const subjectId = rec.subject_id;
      const matchesSubject = selectedSubject === 'all' || subjectId === selectedSubject;
      
      return matchesSearch && matchesCourse && matchesSubject;
    });
  }, [recordings, searchQuery, selectedCourse, selectedSubject]);

  const groupedRecordings = useMemo(() => {
    const grouped: GroupedRecordings = {};
    filteredRecordings.forEach((rec) => {
      const subjectName = rec.subject?.name || rec.scheduled_class?.subject || 'Other';
      if (!grouped[subjectName]) {
        grouped[subjectName] = [];
      }
      grouped[subjectName].push(rec);
    });
    return grouped;
  }, [filteredRecordings]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return { text: 'Ready', color: '#10B981' };
      case 'processing':
        return { text: 'Processing', color: '#F59E0B' };
      case 'uploaded':
        return { text: 'Uploaded', color: '#6366F1' };
      default:
        return { text: status, color: '#6B7280' };
    }
  };

  const handleRecordingPress = (recording: ClassRecording) => {
    console.log('Recording pressed:', recording.id, 'status:', recording.processing_status);
    navigation.navigate('WatchRecording', { recordingId: recording.id });
  };

  const getPlaceholderGradient = (index: number): [string, string] => {
    const gradients: [string, string][] = [
      ['#2BBD6E', '#4ADE80'],
      ['#3B82F6', '#60A5FA'],
      ['#10B981', '#34D399'],
      ['#F59E0B', '#FBBF24'],
      ['#EF4444', '#F87171'],
      ['#EC4899', '#F472B6'],
      ['#6366F1', '#818CF8'],
      ['#14B8A6', '#2DD4BF'],
    ];
    return gradients[index % gradients.length];
  };

  const renderRecordingCard = ({ item, index }: { item: ClassRecording; index: number }) => {
    const title = item.recording_title || item.topic?.title || item.scheduled_class?.subject || 'Untitled Recording';
    const chapterInfo = item.chapter ? `Ch ${item.chapter.chapter_number}: ${item.chapter.title}` : null;
    const courseName = item.course?.name || item.scheduled_class?.course?.name;
    const teacherName = item.scheduled_class?.teacher?.full_name;
    const statusBadge = getStatusBadge(item.processing_status);
    const progress = watchProgress[item.id];
    const progressPercent = progress?.progress_percent || 0;
    const isPlayable = item.processing_status === 'ready' || item.processing_status === 'uploaded';
    const thumbnailUrl = item.thumbnail_url;
    const gradientColors = getPlaceholderGradient(index);

    return (
      <TouchableOpacity
        style={[styles.recordingCard, !isPlayable && styles.disabledCard]}
        onPress={() => handleRecordingPress(item)}
        activeOpacity={0.7}
        data-testid={`card-recording-${item.id}`}
      >
        <View style={styles.thumbnailContainer}>
          {thumbnailUrl ? (
            <Image 
              source={{ uri: thumbnailUrl }} 
              style={styles.thumbnailImage}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.thumbnailPlaceholder}
            >
              <View style={styles.placeholderContent}>
                <Ionicons name="videocam" size={28} color="rgba(255,255,255,0.9)" />
                <Text style={styles.placeholderText} numberOfLines={1}>
                  {title.substring(0, 15)}{title.length > 15 ? '...' : ''}
                </Text>
              </View>
            </LinearGradient>
          )}
          <View style={styles.playOverlay}>
            <View style={styles.playIconCircle}>
              <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 2 }} />
            </View>
          </View>
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.duration_seconds)}</Text>
          </View>
          {progressPercent > 0 && (
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
            </View>
          )}
        </View>

        <View style={styles.recordingInfo}>
          <Text style={styles.recordingTitle} numberOfLines={2}>{title}</Text>
          
          {chapterInfo && (
            <Text style={styles.chapterText} numberOfLines={1}>{chapterInfo}</Text>
          )}
          
          {courseName && (
            <View style={styles.courseRow}>
              <Ionicons name="book-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.courseName} numberOfLines={1}>{courseName}</Text>
            </View>
          )}

          {teacherName && (
            <View style={styles.teacherRow}>
              <Ionicons name="person-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.teacherName}>{teacherName}</Text>
            </View>
          )}

          <View style={styles.cardFooter}>
            <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${statusBadge.color}20` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusBadge.color }]} />
              <Text style={[styles.statusText, { color: statusBadge.color }]}>{statusBadge.text}</Text>
            </View>
          </View>

          {item.available_qualities?.length > 0 && (
            <View style={styles.qualitiesRow}>
              {item.available_qualities.slice(0, 3).map((quality) => (
                <View key={quality} style={styles.qualityBadge}>
                  <Text style={styles.qualityText}>{quality}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSubjectGroup = (subjectName: string, subjectRecordings: ClassRecording[]) => (
    <View key={subjectName} style={styles.subjectGroup}>
      <View style={styles.subjectHeader}>
        <View style={styles.subjectIconContainer}>
          <Ionicons name="folder-outline" size={18} color={colors.primary} />
        </View>
        <Text style={styles.subjectTitle}>{subjectName}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{subjectRecordings.length}</Text>
        </View>
      </View>
      <FlatList
        data={subjectRecordings}
        renderItem={renderRecordingCard}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading recordings...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchRecordings}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primary, '#4ADE80']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            data-testid="button-back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Recordings</Text>
          <View style={styles.headerRight} />
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search recordings..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            data-testid="input-search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.filtersScroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContent}
      >
        <TouchableOpacity
          style={[styles.filterChip, selectedCourse === 'all' && styles.filterChipActive]}
          onPress={() => setSelectedCourse('all')}
          data-testid="filter-all-courses"
        >
          <Text style={[styles.filterChipText, selectedCourse === 'all' && styles.filterChipTextActive]}>
            All Courses
          </Text>
        </TouchableOpacity>
        {courses.map((course) => (
          <TouchableOpacity
            key={course.id}
            style={[styles.filterChip, selectedCourse === course.id && styles.filterChipActive]}
            onPress={() => setSelectedCourse(course.id)}
            data-testid={`filter-course-${course.id}`}
          >
            <Text style={[styles.filterChipText, selectedCourse === course.id && styles.filterChipTextActive]}>
              {course.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {subjects.length > 0 && (
        <ScrollView
          style={styles.subFiltersScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
        >
          <TouchableOpacity
            style={[styles.subFilterChip, selectedSubject === 'all' && styles.subFilterChipActive]}
            onPress={() => setSelectedSubject('all')}
            data-testid="filter-all-subjects"
          >
            <Text style={[styles.subFilterChipText, selectedSubject === 'all' && styles.subFilterChipTextActive]}>
              All Subjects
            </Text>
          </TouchableOpacity>
          {subjects.map((subject) => (
            <TouchableOpacity
              key={subject.id}
              style={[styles.subFilterChip, selectedSubject === subject.id && styles.subFilterChipActive]}
              onPress={() => setSelectedSubject(subject.id)}
              data-testid={`filter-subject-${subject.id}`}
            >
              <Text style={[styles.subFilterChipText, selectedSubject === subject.id && styles.subFilterChipTextActive]}>
                {subject.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {Object.keys(groupedRecordings).length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="videocam-off-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No recordings found</Text>
            <Text style={styles.emptyText}>
              {searchQuery || selectedCourse !== 'all' || selectedSubject !== 'all'
                ? 'Try adjusting your filters'
                : 'Your class recordings will appear here'}
            </Text>
          </View>
        ) : (
          Object.entries(groupedRecordings).map(([subjectName, recs]) =>
            renderSubjectGroup(subjectName, recs)
          )
        )}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.white,
  },
  headerRight: {
    width: 40,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  filtersScroll: {
    maxHeight: 50,
    marginTop: 16,
  },
  subFiltersScroll: {
    maxHeight: 44,
    marginTop: 8,
  },
  filtersContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  subFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(43, 189, 110, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.2)',
  },
  subFilterChipActive: {
    backgroundColor: 'rgba(43, 189, 110, 0.2)',
    borderColor: colors.primary,
  },
  subFilterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
  },
  subFilterChipTextActive: {
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingTop: 16,
  },
  subjectGroup: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  subjectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  subjectIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  subjectTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  recordingCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 12,
    marginBottom: 12,
    padding: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  disabledCard: {
    opacity: 0.5,
  },
  thumbnailContainer: {
    width: 120,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  playIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  recordingInfo: {
    flex: 1,
    marginLeft: 12,
  },
  recordingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  chapterText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  courseName: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 4,
    flex: 1,
  },
  teacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  teacherName: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  qualitiesRow: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 4,
  },
  qualityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
  },
  qualityText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  bottomPadding: {
    height: 100,
  },
});
