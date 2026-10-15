import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase, CourseTimetable, ClassRecording, ClassAttendance, ScheduledClass } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { extractJobIdFromUrl, getYouTubeVideoId } from '../utils/mediaResolver';
import YouTubePlayerModal from '../components/YouTubePlayerModal';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type MainTab = 'schedule' | 'attendance' | 'recordings';
type ScheduleFilter = 'today' | 'thisWeek';
type RecordingFilter = 'all' | 'thisWeek' | 'thisMonth';

interface ScheduledClassDisplay {
  id: string;
  subject: string;
  course: string;
  date: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  instructor: string;
  hasMeetingLink: boolean;
  meetingLink?: string;
  // AI Lecture fields
  hasAILecture: boolean;
  aiPresentationJson?: any;
  aiVideoUrl?: string;
  topicTitle?: string;
}


const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formatTime = (timeStr: string): string => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const getDateForDayOfWeek = (dayOfWeek: number, weekOffset: number): Date => {
  const today = new Date();
  const currentDay = today.getDay();
  const startOfCurrentWeek = new Date(today);
  startOfCurrentWeek.setDate(today.getDate() - currentDay);
  const targetDate = new Date(startOfCurrentWeek);
  targetDate.setDate(startOfCurrentWeek.getDate() + (weekOffset * 7) + dayOfWeek);
  return targetDate;
};

const formatDateShort = (date: Date): string => {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function LiveClassesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { openSidebar } = useSidebar();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MainTab>('schedule');
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('thisWeek');
  const [recordingFilter, setRecordingFilter] = useState<RecordingFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [timetables, setTimetables] = useState<CourseTimetable[]>([]);
  const [scheduledClasses, setScheduledClasses] = useState<ScheduledClass[]>([]);
  const [recordings, setRecordings] = useState<ClassRecording[]>([]);
  const [attendance, setAttendance] = useState<ClassAttendance[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedQualities, setSelectedQualities] = useState<Record<string, string>>({});
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [youtubeTitle, setYoutubeTitle] = useState<string>('');

  const getSelectedQuality = (recordingId: string, defaultQuality: string | null) => {
    return selectedQualities[recordingId] || defaultQuality || '720p';
  };

  const setQualityForRecording = (recordingId: string, quality: string) => {
    setSelectedQualities(prev => ({ ...prev, [recordingId]: quality }));
  };

  const getHlsPath = (recording: ClassRecording, quality: string) => {
    switch (quality) {
      case '1080p': return recording.b2_hls_1080p_path;
      case '720p': return recording.b2_hls_720p_path;
      case '480p': return recording.b2_hls_480p_path;
      case '360p': return recording.b2_hls_360p_path;
      default: return recording.b2_hls_720p_path || recording.b2_hls_480p_path;
    }
  };

  const getClassesForWeek = useCallback((offset: number): ScheduledClassDisplay[] => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + (offset * 7));
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    const parseDate = (dateStr: string): Date => {
      const [year, month, day] = dateStr.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      d.setHours(0, 0, 0, 0);
      return d;
    };
    
    // For recurring classes, find the date within THIS WEEK that matches the day_of_week
    const getClassDateInWeek = (dayOfWeek: number): Date => {
      const classDate = new Date(startOfWeek);
      classDate.setDate(startOfWeek.getDate() + dayOfWeek);
      return classDate;
    };
    
    const isDateInWeek = (date: Date): boolean => {
      return date >= startOfWeek && date <= endOfWeek;
    };
    
    const classes: ScheduledClassDisplay[] = [];
    
    // Add classes from course_timetables (recurring)
    // For each timetable, find the date in the current week that matches day_of_week
    // Only show if that date is >= valid_from (class has started)
    timetables
      .filter(tt => {
        if (!tt.is_active) return false;
        
        const classDateInWeek = getClassDateInWeek(tt.day_of_week);
        
        // If valid_from exists, only show if the class date is >= valid_from
        if (tt.valid_from) {
          const validFromDate = parseDate(tt.valid_from);
          return classDateInWeek >= validFromDate;
        }
        
        // If no valid_from, show the class
        return true;
      })
      .forEach(tt => {
        const classDate = getClassDateInWeek(tt.day_of_week);
        
        classes.push({
          id: tt.id,
          subject: tt.subject?.name || 'Unknown Subject',
          course: tt.course?.name || 'Unknown Course',
          date: formatDateShort(classDate),
          dayOfWeek: tt.day_of_week,
          startTime: formatTime(tt.start_time),
          endTime: formatTime(tt.end_time),
          instructor: tt.instructor?.full_name || 'TBA',
          hasMeetingLink: !!tt.meeting_link,
          meetingLink: tt.meeting_link || undefined,
          // Timetable classes don't have AI lecture info
          hasAILecture: false,
        });
      });
    
    // Add classes from scheduled_classes (one-time meetings)
    scheduledClasses
      .filter(sc => {
        const scheduledDate = new Date(sc.scheduled_at);
        return isDateInWeek(scheduledDate);
      })
      .forEach(sc => {
        const scheduledDate = new Date(sc.scheduled_at);
        const durationMinutes = sc.duration_minutes || 60;
        const endTime = new Date(scheduledDate.getTime() + durationMinutes * 60000);
        
        // Check if topic or chapter has AI presentation
        const topicAI = sc.subject_topics?.ai_presentation_json || null;
        const chapterAI = sc.subject_chapters?.ai_presentation_json || null;
        const topicVideoUrl = sc.subject_topics?.ai_generated_video_url || null;
        const chapterVideoUrl = sc.subject_chapters?.ai_generated_video_url || null;
        const hasAI = !!(topicAI || chapterAI || topicVideoUrl || chapterVideoUrl);
        
        classes.push({
          id: sc.id,
          subject: sc.popular_subjects?.name || sc.subject || 'Scheduled Class',
          course: sc.courses?.name || 'Unknown Course',
          date: formatDateShort(scheduledDate),
          dayOfWeek: scheduledDate.getDay(),
          startTime: scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          endTime: endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          instructor: sc.teacher_profiles?.full_name || 'TBA',
          hasMeetingLink: !!sc.meeting_link,
          meetingLink: sc.meeting_link || undefined,
          // AI Lecture fields
          hasAILecture: hasAI,
          aiPresentationJson: topicAI || chapterAI,
          aiVideoUrl: topicVideoUrl || chapterVideoUrl || undefined,
          topicTitle: sc.subject_topics?.title || sc.subject_chapters?.title || sc.subject || 'AI Lecture',
        });
      });
    
    // Sort by day of week, then by start time
    return classes.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [timetables, scheduledClasses]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    
    try {
      setError(null);
      const enrollmentsResult = await supabase.getEnrolledCourses(user.id);
      
      if (enrollmentsResult.success && enrollmentsResult.enrollments) {
        const courseIds = enrollmentsResult.enrollments.map(e => e.course_id);
        setEnrolledCourseIds(courseIds);
        
        if (courseIds.length > 0) {
          // Calculate date range for scheduled classes (2 weeks before and after today)
          const today = new Date();
          const startDate = new Date(today);
          startDate.setDate(today.getDate() - 14);
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(today);
          endDate.setDate(today.getDate() + 30);
          endDate.setHours(23, 59, 59, 999);
          
          const [timetablesResult, scheduledClassesResult, recordingsResult, attendanceResult] = await Promise.all([
            supabase.getCourseTimetables(courseIds),
            supabase.getScheduledClasses(courseIds, startDate, endDate),
            supabase.getClassRecordings(courseIds),
            supabase.getClassAttendance(user.id),
          ]);
          
          if (timetablesResult.success && timetablesResult.timetables) {
            setTimetables(timetablesResult.timetables);
          } else {
            setError(timetablesResult.error || 'Failed to load schedule');
          }
          
          if (scheduledClassesResult.success && scheduledClassesResult.scheduledClasses) {
            setScheduledClasses(scheduledClassesResult.scheduledClasses);
          }
          
          if (recordingsResult.success && recordingsResult.recordings) {
            setRecordings(recordingsResult.recordings);
          }
          
          if (attendanceResult.success && attendanceResult.attendance) {
            setAttendance(attendanceResult.attendance);
          }
        }
      } else {
        setError(enrollmentsResult.error || 'Failed to load courses');
      }
    } catch (err) {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const getWeekRange = () => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + (weekOffset * 7));
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    
    return `${formatDate(startOfWeek)} - ${formatDate(endOfWeek)}, ${endOfWeek.getFullYear()}`;
  };

  const getFilteredClasses = useCallback((): ScheduledClassDisplay[] => {
    const today = new Date();
    const currentDayOfWeek = today.getDay();
    
    if (scheduleFilter === 'today') {
      return getClassesForWeek(0).filter(c => c.dayOfWeek === currentDayOfWeek);
    }
    
    return getClassesForWeek(weekOffset);
  }, [scheduleFilter, weekOffset, getClassesForWeek]);

  const todayClasses = timetables.filter(tt => tt.day_of_week === new Date().getDay());
  const weekClasses = timetables;

  const getNextUpcomingClass = useCallback((): ScheduledClassDisplay | null => {
    const now = new Date();
    
    const parseDate = (dateStr: string): Date => {
      const [year, month, day] = dateStr.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      d.setHours(0, 0, 0, 0);
      return d;
    };
    
    // Find the next occurrence of a class with given day_of_week
    const getNextOccurrence = (dayOfWeek: number, startTime: string, validFrom?: string): Date | null => {
      const today = new Date();
      const currentDayOfWeek = today.getDay();
      const [hours, minutes] = startTime.split(':').map(Number);
      
      // Calculate days until next occurrence of this day_of_week
      let daysUntil = dayOfWeek - currentDayOfWeek;
      if (daysUntil < 0) daysUntil += 7;
      
      // Check if it's today and if the class time has passed
      if (daysUntil === 0) {
        const classTimeToday = new Date(today);
        classTimeToday.setHours(hours, minutes, 0, 0);
        if (classTimeToday <= now) {
          // Today's class has passed, get next week's occurrence
          daysUntil = 7;
        }
      }
      
      const nextDate = new Date(today);
      nextDate.setDate(today.getDate() + daysUntil);
      nextDate.setHours(hours, minutes, 0, 0);
      
      // Check if valid_from constraint is satisfied
      if (validFrom) {
        const validFromDate = parseDate(validFrom);
        // Only the date matters for valid_from check
        const nextDateOnly = new Date(nextDate);
        nextDateOnly.setHours(0, 0, 0, 0);
        if (nextDateOnly < validFromDate) {
          return null; // Class hasn't started yet
        }
      }
      
      return nextDate;
    };
    
    interface UpcomingItem {
      display: ScheduledClassDisplay;
      dateTime: Date;
    }
    
    const upcomingItems: UpcomingItem[] = [];
    
    // Add timetable classes (recurring)
    timetables
      .filter(tt => tt.is_active)
      .forEach(tt => {
        const nextClassDateTime = getNextOccurrence(tt.day_of_week, tt.start_time, tt.valid_from);
        
        if (nextClassDateTime && nextClassDateTime > now) {
          upcomingItems.push({
            display: {
              id: tt.id,
              subject: tt.subject?.name || 'Unknown Subject',
              course: tt.course?.name || 'Unknown Course',
              date: formatDateShort(nextClassDateTime),
              dayOfWeek: tt.day_of_week,
              startTime: formatTime(tt.start_time),
              endTime: formatTime(tt.end_time),
              instructor: tt.instructor?.full_name || 'TBA',
              hasMeetingLink: !!tt.meeting_link,
              meetingLink: tt.meeting_link || undefined,
              hasAILecture: false,
            },
            dateTime: nextClassDateTime,
          });
        }
      });
    
    // Add scheduled classes
    scheduledClasses.forEach(sc => {
      const scheduledDate = new Date(sc.scheduled_at);
      
      if (scheduledDate > now) {
        const durationMinutes = sc.duration_minutes || 60;
        const endTime = new Date(scheduledDate.getTime() + durationMinutes * 60000);
        
        // Check if topic or chapter has AI presentation
        const topicAI = sc.subject_topics?.ai_presentation_json || null;
        const chapterAI = sc.subject_chapters?.ai_presentation_json || null;
        const topicVideoUrl = sc.subject_topics?.ai_generated_video_url || null;
        const chapterVideoUrl = sc.subject_chapters?.ai_generated_video_url || null;
        const hasAI = !!(topicAI || chapterAI || topicVideoUrl || chapterVideoUrl);
        
        upcomingItems.push({
          display: {
            id: sc.id,
            subject: sc.popular_subjects?.name || sc.subject || 'Scheduled Class',
            course: sc.courses?.name || 'Unknown Course',
            date: formatDateShort(scheduledDate),
            dayOfWeek: scheduledDate.getDay(),
            startTime: scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            endTime: endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            instructor: sc.teacher_profiles?.full_name || 'TBA',
            hasMeetingLink: !!sc.meeting_link,
            meetingLink: sc.meeting_link || undefined,
            hasAILecture: hasAI,
            aiPresentationJson: topicAI || chapterAI,
            aiVideoUrl: topicVideoUrl || chapterVideoUrl || undefined,
            topicTitle: sc.subject_topics?.title || sc.subject_chapters?.title || sc.subject || 'AI Lecture',
          },
          dateTime: scheduledDate,
        });
      }
    });
    
    // Sort by date/time and get the next one
    upcomingItems.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
    
    return upcomingItems[0]?.display || null;
  }, [timetables, scheduledClasses]);

  const handleJoinClass = (meetingLink?: string, title?: string) => {
    if (!meetingLink) return;

    const videoId = getYouTubeVideoId(meetingLink);
    if (videoId) {
      console.log('[LiveClasses] Opening in-app YouTube player for video:', videoId);
      setYoutubeTitle(title || 'Live Class');
      setYoutubeVideoId(videoId);
      return;
    }

    Linking.openURL(meetingLink);
  };

  const handleOpenAILecture = async (classItem: ScheduledClassDisplay) => {
    if (classItem.hasAILecture) {
      const extractedJobId = extractJobIdFromUrl(classItem.aiVideoUrl);
      console.log('[LiveClasses] Extracted jobId:', extractedJobId, 'from URL:', classItem.aiVideoUrl);
      
      // Lock orientation to landscape BEFORE navigating to prevent portrait flash
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      
      navigation.navigate('AILecturePlayer', {
        presentationJson: classItem.aiPresentationJson,
        videoUrl: classItem.aiVideoUrl,
        jobId: extractedJobId || undefined,
        topicTitle: classItem.topicTitle,
        startFullscreen: true,
      });
    }
  };

  const renderClassCard = (classItem: ScheduledClassDisplay) => (
    <View key={classItem.id} style={styles.classCard} data-testid={`class-card-${classItem.id}`}>
      <View style={styles.classCardAccent} />
      <View style={styles.classCardContent}>
        <View style={styles.classCardHeader}>
          <View style={styles.dayBadge}>
            <Text style={styles.dayBadgeText}>{DAY_NAMES[classItem.dayOfWeek]}</Text>
          </View>
          <View style={styles.dateContainer}>
            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.classDate}>{classItem.date}</Text>
          </View>
        </View>
        
        <Text style={styles.classSubject}>{classItem.subject}</Text>
        <Text style={styles.classCourse}>{classItem.course}</Text>
        
        <View style={styles.classDetails}>
          <View style={styles.classDetailItem}>
            <View style={styles.detailIconContainer}>
              <Ionicons name="time-outline" size={16} color={colors.primary} />
            </View>
            <Text style={styles.classDetailText}>
              {classItem.startTime} - {classItem.endTime}
            </Text>
          </View>
          <View style={styles.classDetailItem}>
            <View style={styles.detailIconContainer}>
              <Ionicons name="person-outline" size={16} color={colors.primary} />
            </View>
            <Text style={styles.classDetailText}>{classItem.instructor}</Text>
          </View>
        </View>
        
        <View style={styles.classButtonRow}>
          {classItem.hasMeetingLink ? (
            <TouchableOpacity 
              style={[styles.joinButton, classItem.hasAILecture && { flex: 1, marginRight: 8 }]}
              onPress={() => handleJoinClass(classItem.meetingLink, classItem.subject)}
              data-testid={`button-join-${classItem.id}`}
            >
              <LinearGradient
                colors={[colors.primary, '#4ADE80']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.joinButtonGradient}
              >
                <Ionicons name="videocam" size={18} color={colors.white} />
                <Text style={styles.joinButtonText}>Join Class</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : !classItem.hasAILecture ? (
            <View style={styles.meetingLinkRow}>
              <Ionicons name="videocam-off-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.noMeetingText}>No Meeting Link</Text>
            </View>
          ) : null}
          
          {classItem.hasAILecture && (
            <TouchableOpacity 
              style={[styles.aiLectureButton, classItem.hasMeetingLink && { flex: 1 }]}
              onPress={() => handleOpenAILecture(classItem)}
              data-testid={`button-ai-lecture-${classItem.id}`}
            >
              <LinearGradient
                colors={['#10B981', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.joinButtonGradient}
              >
                <Ionicons name="sparkles" size={18} color={colors.white} />
                <Text style={styles.joinButtonText}>AI Lecture</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  const renderScheduleTab = () => {
    const filteredClasses = getFilteredClasses();
    
    return (
      <View style={styles.tabContent}>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterButton, scheduleFilter === 'today' && styles.filterButtonActive]}
            onPress={() => {
              setScheduleFilter('today');
              setWeekOffset(0);
            }}
            data-testid="filter-today"
          >
            <Text style={[styles.filterButtonText, scheduleFilter === 'today' && styles.filterButtonTextActive]}>
              Today ({todayClasses.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, scheduleFilter === 'thisWeek' && styles.filterButtonActive]}
            onPress={() => {
              setScheduleFilter('thisWeek');
              setWeekOffset(0);
            }}
            data-testid="filter-this-week"
          >
            <Text style={[styles.filterButtonText, scheduleFilter === 'thisWeek' && styles.filterButtonTextActive]}>
              This Week {scheduleFilter === 'thisWeek' ? `(${getClassesForWeek(weekOffset).length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {scheduleFilter === 'thisWeek' && (
          <View style={styles.weekNavigation}>
            <TouchableOpacity 
              style={styles.weekNavButton}
              onPress={() => setWeekOffset(weekOffset - 1)}
              data-testid="button-previous-week"
            >
              <Ionicons name="chevron-back" size={16} color={colors.primary} />
              <Text style={styles.weekNavText}>Previous</Text>
            </TouchableOpacity>
            <Text style={styles.weekRangeText}>{getWeekRange()}</Text>
            <TouchableOpacity 
              style={styles.weekNavButton}
              onPress={() => setWeekOffset(weekOffset + 1)}
              data-testid="button-next-week"
            >
              <Text style={styles.weekNavText}>Next</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading schedule...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : filteredClasses.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="calendar-outline" size={48} color={colors.primary} />
            </View>
            <Text style={styles.emptyStateTitle}>
              {scheduleFilter === 'today' ? 'No Classes Today' : 'No Meetings This Week'}
            </Text>
            <Text style={styles.emptyStateText}>
              {scheduleFilter === 'today' 
                ? "You don't have any scheduled classes for today."
                : "There are no meetings scheduled for this week."}
            </Text>
          </View>
        ) : (
          <View style={styles.classList}>
            {filteredClasses.map(renderClassCard)}
          </View>
        )}
      </View>
    );
  };

  const getAttendanceStats = () => {
    const courseGroups: Record<string, { total: number; attended: number; totalSeconds: number }> = {};
    
    attendance.forEach((att) => {
      const courseName = att.scheduled_class?.courses?.name || 'Unknown Course';
      if (!courseGroups[courseName]) {
        courseGroups[courseName] = { total: 0, attended: 0, totalSeconds: 0 };
      }
      courseGroups[courseName].total += 1;
      if (att.status === 'present' || att.status === 'attended') {
        courseGroups[courseName].attended += 1;
        courseGroups[courseName].totalSeconds += att.duration_seconds || 0;
      }
    });

    const totalClasses = attendance.length;
    const classesAttended = attendance.filter(a => a.status === 'present' || a.status === 'attended').length;
    const totalSeconds = attendance.reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const totalTime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    const attendanceRate = totalClasses > 0 ? Math.round((classesAttended / totalClasses) * 100) : 0;

    return {
      attendanceRate,
      classesAttended,
      totalClasses,
      totalTime,
      byCourse: Object.entries(courseGroups).map(([course, data]) => ({
        course,
        attended: data.attended,
        total: data.total,
        percentage: data.total > 0 ? Math.round((data.attended / data.total) * 100) : 0,
      })),
    };
  };

  const renderAttendanceTab = () => {
    const stats = getAttendanceStats();
    
    return (
      <View style={styles.tabContent}>
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, styles.statCardPink]}>
            <View style={styles.statIconContainer}>
              <Ionicons name="trending-up" size={22} color="#EC4899" />
            </View>
            <Text style={styles.statLabel}>Attendance Rate</Text>
            <Text style={[styles.statValue, { color: '#EC4899' }]}>{stats.attendanceRate}%</Text>
          </View>
          <View style={[styles.statCard, styles.statCardGreen]}>
            <View style={styles.statIconContainer}>
              <Ionicons name="checkmark-circle" size={22} color="#10B981" />
            </View>
            <Text style={styles.statLabel}>Classes Attended</Text>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.classesAttended}</Text>
          </View>
          <View style={[styles.statCard, styles.statCardPurple]}>
            <View style={styles.statIconContainer}>
              <Ionicons name="library" size={22} color={colors.primary} />
            </View>
            <Text style={styles.statLabel}>Total Classes</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>{stats.totalClasses}</Text>
          </View>
          <View style={[styles.statCard, styles.statCardBlue]}>
            <View style={styles.statIconContainer}>
              <Ionicons name="time" size={22} color="#6366F1" />
            </View>
            <Text style={styles.statLabel}>Total Time</Text>
            <Text style={[styles.statValue, { color: '#6366F1' }]}>{stats.totalTime}</Text>
          </View>
        </View>

        <View style={styles.attendanceSection}>
          <View style={styles.attendanceSectionHeader}>
            <View style={styles.sectionIconContainer}>
              <Ionicons name="analytics" size={20} color={colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Attendance by Course</Text>
          </View>
          {stats.byCourse.length === 0 ? (
            <Text style={styles.emptyStateText}>No courses enrolled</Text>
          ) : (
            stats.byCourse.map((item, index) => (
              <View key={index} style={styles.courseAttendance}>
                <View style={styles.courseAttendanceHeader}>
                  <Text style={styles.courseName}>{item.course}</Text>
                  <Text style={styles.coursePercentage}>{item.percentage}% ({item.attended}/{item.total})</Text>
                </View>
                <View style={styles.progressBar}>
                  <LinearGradient
                    colors={[colors.primary, '#4ADE80']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.progressFill, { width: `${Math.max(item.percentage, 5)}%` }]}
                  />
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    );
  };

  const getFilteredRecordings = () => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    let filtered = recordings;
    
    if (recordingFilter === 'thisWeek') {
      filtered = recordings.filter(r => new Date(r.scheduled_class?.scheduled_at || r.created_at) >= oneWeekAgo);
    } else if (recordingFilter === 'thisMonth') {
      filtered = recordings.filter(r => new Date(r.scheduled_class?.scheduled_at || r.created_at) >= oneMonthAgo);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        (r.scheduled_class?.subject ?? '').toLowerCase().includes(query) ||
        (r.scheduled_class?.course?.name ?? '').toLowerCase().includes(query)
      );
    }
    
    return filtered;
  };

  const formatRecordingDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '0 min';
    const mins = Math.floor(seconds / 60);
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hrs}h ${remainMins}m`;
    }
    return `${mins} min`;
  };

  const renderRecordingsTab = () => {
    const filteredRecordings = getFilteredRecordings();
    
    return (
      <View style={styles.tabContent}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.primary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search recordings..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            data-testid="input-search-recordings"
          />
        </View>

        <View style={styles.recordingFilterRow}>
          {(['all', 'thisWeek', 'thisMonth'] as RecordingFilter[]).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.recordingFilterButton, recordingFilter === filter && styles.recordingFilterButtonActive]}
              onPress={() => setRecordingFilter(filter)}
              data-testid={`filter-${filter}`}
            >
              <Text style={[styles.recordingFilterText, recordingFilter === filter && styles.recordingFilterTextActive]}>
                {filter === 'all' ? 'All' : filter === 'thisWeek' ? 'This Week' : 'This Month'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {filteredRecordings.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="videocam-outline" size={48} color={colors.primary} />
            </View>
            <Text style={styles.emptyStateTitle}>No Recordings Found</Text>
            <Text style={styles.emptyStateText}>
              {searchQuery 
                ? `No recordings match "${searchQuery}"`
                : 'No past class recordings available yet.'}
            </Text>
          </View>
        ) : (
          filteredRecordings.map((recording) => (
            <View key={recording.id} style={styles.recordingSection}>
              <View style={styles.recordingHeader}>
                <Ionicons name="library-outline" size={20} color={colors.primary} />
                <Text style={styles.recordingTopic}>{recording.scheduled_class?.subject || 'Class Recording'}</Text>
              </View>

              <View style={styles.recordingCard}>
                <LinearGradient
                  colors={['#DCFCE7', '#D1FAE5', '#BBF7D0']}
                  style={styles.videoThumbnail}
                >
                  <View style={styles.playIconContainer}>
                    <Ionicons name="videocam" size={36} color={colors.primary} />
                  </View>
                  <LinearGradient
                    colors={['#10B981', '#059669']}
                    style={styles.readyBadge}
                  >
                    <Ionicons name="play" size={10} color={colors.white} />
                    <Text style={styles.readyText}>Ready</Text>
                  </LinearGradient>
                  {recording.duration_seconds && (
                    <View style={styles.durationBadge}>
                      <Text style={styles.durationText}>{formatDuration(recording.duration_seconds)}</Text>
                    </View>
                  )}
                </LinearGradient>

                <Text style={styles.recordingTitle}>{recording.scheduled_class?.subject || 'Class Recording'}</Text>
                <Text style={styles.recordingCourse}>{recording.scheduled_class?.course?.name || 'Course'}</Text>
                
                <View style={styles.recordingDateRow}>
                  <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                  <Text style={styles.recordingDate}>{formatRecordingDate(recording.scheduled_class?.scheduled_at || recording.created_at)}</Text>
                </View>

                {recording.available_qualities && recording.available_qualities.length > 0 && (
                  <View style={styles.qualityOptions}>
                    {recording.available_qualities.map((quality) => {
                      const isSelected = getSelectedQuality(recording.id, recording.default_quality) === quality;
                      return (
                        <TouchableOpacity 
                          key={quality} 
                          style={[
                            styles.qualityBadge, 
                            isSelected && styles.qualityBadgeActive
                          ]}
                          onPress={() => setQualityForRecording(recording.id, quality)}
                        >
                          <Text style={[
                            styles.qualityText, 
                            isSelected && styles.qualityTextActive
                          ]}>
                            {quality}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <TouchableOpacity 
                  onPress={() => {
                    const selectedQuality = getSelectedQuality(recording.id, recording.default_quality);
                    const hlsPath = getHlsPath(recording, selectedQuality);
                    if (hlsPath && recording.cdn_base_url) {
                      Linking.openURL(`${recording.cdn_base_url}/${hlsPath}`);
                    }
                  }}
                  data-testid={`button-watch-${recording.id}`}
                >
                  <LinearGradient
                    colors={[colors.primary, '#4ADE80']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.watchButton}
                  >
                    <Ionicons name="play" size={18} color={colors.white} />
                    <Text style={styles.watchButtonText}>Watch Recording</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    );
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
              <Ionicons name="calendar" size={20} color={colors.primary} />
            </View>
            <Text style={styles.headerTitle}>My Class Schedule</Text>
          </View>
          <Text style={styles.headerSubtitle}>View your live and upcoming classes based on your enrolled courses</Text>
        </View>
        <HeaderMenuButton onPress={openSidebar} />
      </LinearGradient>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {timetables.length > 0 && (() => {
          const nextClass = getNextUpcomingClass();
          if (!nextClass) return null;
          
          return (
            <View style={styles.nextUpSection}>
              <View style={styles.nextUpHeader}>
                <Ionicons name="arrow-forward-circle" size={24} color={colors.primary} />
                <Text style={styles.nextUpTitle}>Next Up</Text>
              </View>
              
              <View style={styles.upcomingCard}>
                <View style={styles.upcomingCardAccent} />
                <View style={styles.upcomingCardContent}>
                  <View style={styles.upcomingCardHeader}>
                    <LinearGradient
                      colors={[colors.primary, '#4ADE80']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.upcomingBadge}
                    >
                      <Text style={styles.upcomingBadgeText}>Upcoming</Text>
                    </LinearGradient>
                    <View style={styles.dateContainer}>
                      <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.upcomingDate}>{nextClass.date}</Text>
                    </View>
                  </View>
                  
                  <Text style={styles.upcomingSubject}>{nextClass.subject}</Text>
                  <Text style={styles.upcomingCourse}>{nextClass.course}</Text>
                  
                  <View style={styles.upcomingDetails}>
                    <View style={styles.upcomingDetailItem}>
                      <View style={styles.detailIconContainer}>
                        <Ionicons name="time-outline" size={16} color={colors.primary} />
                      </View>
                      <Text style={styles.upcomingDetailText}>
                        {nextClass.startTime} - {nextClass.endTime}
                      </Text>
                    </View>
                    <View style={styles.upcomingDetailItem}>
                      <View style={styles.detailIconContainer}>
                        <Ionicons name="person-outline" size={16} color={colors.primary} />
                      </View>
                      <Text style={styles.upcomingDetailText}>{nextClass.instructor}</Text>
                    </View>
                  </View>
                  
                  {nextClass.hasMeetingLink ? (
                    <TouchableOpacity 
                      style={styles.joinButton}
                      onPress={() => handleJoinClass(nextClass.meetingLink, nextClass.subject)}
                      data-testid="button-join-next"
                    >
                      <LinearGradient
                        colors={[colors.primary, '#4ADE80']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.joinButtonGradient}
                      >
                        <Ionicons name="videocam" size={18} color={colors.white} />
                        <Text style={styles.joinButtonText}>Join Class</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.meetingLinkRow}>
                      <Ionicons name="videocam-off-outline" size={18} color={colors.textSecondary} />
                      <Text style={styles.noMeetingText}>No Meeting Link</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        })()}

        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'schedule' && styles.tabActive]}
            onPress={() => setActiveTab('schedule')}
            data-testid="tab-schedule"
          >
            <Ionicons name="calendar-outline" size={18} color={activeTab === 'schedule' ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'schedule' && styles.tabTextActive]}>Schedule</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'attendance' && styles.tabActive]}
            onPress={() => setActiveTab('attendance')}
            data-testid="tab-attendance"
          >
            <Ionicons name="bar-chart-outline" size={18} color={activeTab === 'attendance' ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'attendance' && styles.tabTextActive]}>Attendance</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'recordings' && styles.tabActive]}
            onPress={() => setActiveTab('recordings')}
            data-testid="tab-recordings"
          >
            <Ionicons name="play-circle-outline" size={18} color={activeTab === 'recordings' ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'recordings' && styles.tabTextActive]}>Recordings</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'schedule' && renderScheduleTab()}
        {activeTab === 'attendance' && renderAttendanceTab()}
        {activeTab === 'recordings' && renderRecordingsTab()}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <YouTubePlayerModal
        visible={!!youtubeVideoId}
        videoId={youtubeVideoId}
        title={youtubeTitle}
        onClose={() => setYoutubeVideoId(null)}
      />
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
    paddingTop: spacing.xl + 24,
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
    borderRadius: 16,
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
    lineHeight: 20,
  },
  content: {
    flex: 1,
    marginTop: -spacing.md,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  nextUpSection: {
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  nextUpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  nextUpTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  upcomingCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  upcomingCardAccent: {
    width: 4,
    backgroundColor: colors.primary,
  },
  upcomingCardContent: {
    flex: 1,
    padding: spacing.md,
  },
  upcomingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  upcomingBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  upcomingBadgeText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  upcomingDate: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  upcomingSubject: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  upcomingCourse: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  upcomingDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  upcomingDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingDetailText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
  },
  meetingLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  classButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  aiLectureButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  noMeetingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  joinButton: {
    marginTop: spacing.sm,
  },
  joinButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
  },
  joinButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  classList: {
    gap: spacing.md,
  },
  classCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  classCardAccent: {
    width: 4,
    backgroundColor: colors.primary,
  },
  classCardContent: {
    flex: 1,
    padding: spacing.md,
  },
  classCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  dayBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: '#DCFCE7',
  },
  dayBadgeText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  classDate: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  classSubject: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  classCourse: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  classDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  classDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  classDetailText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
  },
  errorText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.xl,
    padding: spacing.xs,
    gap: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  tabActive: {
    backgroundColor: '#DCFCE7',
  },
  tabText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  tabContent: {
    padding: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  filterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  filterButtonActive: {
    backgroundColor: colors.text,
  },
  filterButtonText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: colors.white,
  },
  weekNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
  },
  weekNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  weekNavText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  weekRangeText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyStateTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  emptyStateText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    alignItems: 'flex-start',
    gap: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statCardPink: {
    borderLeftWidth: 3,
    borderLeftColor: '#EC4899',
  },
  statCardGreen: {
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  statCardPurple: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  statCardBlue: {
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  attendanceSection: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  attendanceSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  courseAttendance: {
    marginBottom: spacing.md,
  },
  courseAttendanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  courseName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  coursePercentage: {
    fontSize: fontSize.sm,
    color: '#EC4899',
    fontWeight: '700',
  },
  progressBar: {
    height: 10,
    backgroundColor: '#DCFCE7',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  recordingFilterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  recordingFilterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  recordingFilterButtonActive: {
    backgroundColor: colors.text,
  },
  recordingFilterText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
  },
  recordingFilterTextActive: {
    color: colors.white,
  },
  recordingSection: {
    marginBottom: spacing.lg,
  },
  recordingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  recordingTopic: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  recordingCountBadge: {
    backgroundColor: colors.primary,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingCountText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  recordingCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  videoThumbnail: {
    height: 180,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    position: 'relative',
  },
  playIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  readyBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  readyText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  durationBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  durationText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  recordingTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  recordingCourse: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  recordingDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  recordingDate: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  qualityOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  qualityBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: '#FFFFFF',
  },
  qualityBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  qualityText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  qualityTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  watchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  watchButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 100,
  },
});
