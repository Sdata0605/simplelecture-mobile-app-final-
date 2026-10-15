import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';
import DashboardStudyPlanStrip from '../components/DashboardStudyPlanStrip';
import { openAskAI } from '../services/askAIStore';
import { 
  supabase, 
  User, 
  Profile, 
  DashboardEnrollment, 
  DPTSubmission,
  CourseTimetable,
  ScheduledClass
} from '../services/supabase';

const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  } catch {
    return dateString;
  }
};

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface DashboardSubjectWithProgress {
  subject_id: string;
  course_id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  chaptersTotal: number;
  chaptersCompleted: number;
  pendingAssignments: number;
}

interface UpcomingClass {
  id: string;
  subject: string;
  instructor: string;
  date: Date;
  startTime: string;
  endTime: string;
  meetingLink: string | null;
}

export default function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { openSidebar } = useSidebar();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [enrollments, setEnrollments] = useState<DashboardEnrollment[]>([]);
  const [subjects, setSubjects] = useState<DashboardSubjectWithProgress[]>([]);
  const [dptSubmissions, setDptSubmissions] = useState<DPTSubmission[]>([]);
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [attendancePercentage, setAttendancePercentage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [studyPlanRefreshKey, setStudyPlanRefreshKey] = useState(0);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    setStudyPlanRefreshKey(k => k + 1);
    await loadDashboardData(true);
    setRefreshing(false);
  };

  const loadDashboardData = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      
      const storedUser = await supabase.getStoredUser();
      if (!storedUser) {
        setLoading(false);
        return;
      }
      setUser(storedUser);

      const profileResult = await supabase.getProfile(storedUser.id);
      if (profileResult.success && profileResult.profile) {
        setProfile(profileResult.profile);
      }

      const enrollmentsResult = await supabase.getDashboardEnrollments(storedUser.id);
      if (enrollmentsResult.success && enrollmentsResult.enrollments) {
        setEnrollments(enrollmentsResult.enrollments);
        
        const courseIds = enrollmentsResult.enrollments.map(e => e.course_id);
        
        if (courseIds.length > 0) {
          // Calculate date range for scheduled classes
          const now = new Date();
          const endDate = new Date(now);
          endDate.setDate(now.getDate() + 7);
          
          const [subjectsResult, attendanceResult, timetablesResult, scheduledClassesResult] = await Promise.all([
            supabase.getDashboardSubjectsWithProgress(storedUser.id, courseIds),
            supabase.getDashboardAttendancePercentage(storedUser.id, courseIds),
            supabase.getCourseTimetables(courseIds),
            supabase.getScheduledClasses(courseIds, now, endDate),
          ]);
          
          if (subjectsResult.success && subjectsResult.subjects) {
            setSubjects(subjectsResult.subjects);
          }
          if (attendanceResult.success && attendanceResult.percentage !== undefined) {
            setAttendancePercentage(attendanceResult.percentage);
          }
          
          // Merge upcoming classes from both sources
          const upcoming = getUpcomingClasses(
            timetablesResult.success ? timetablesResult.timetables || [] : [],
            scheduledClassesResult.success ? scheduledClassesResult.scheduledClasses || [] : []
          );
          setUpcomingClasses(upcoming);
        }
      }

      const dptResult = await supabase.getDPTSubmissions(storedUser.id);
      if (dptResult.success && dptResult.submissions) {
        setDptSubmissions(dptResult.submissions);
      }
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUpcomingClasses = (timetables: CourseTimetable[], scheduledClasses: ScheduledClass[]): UpcomingClass[] => {
    const classes: UpcomingClass[] = [];
    const now = new Date();
    
    // Helper to format time as HH:MM
    const formatTimeHHMM = (date: Date): string => {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };
    
    // Add scheduled classes (one-time meetings)
    scheduledClasses.forEach(sc => {
      const scheduledDate = new Date(sc.scheduled_at);
      if (scheduledDate > now) {
        const durationMinutes = sc.duration_minutes || 60;
        const endTime = new Date(scheduledDate.getTime() + durationMinutes * 60000);
        
        classes.push({
          id: sc.id,
          subject: sc.popular_subjects?.name || sc.subject || 'Scheduled Class',
          instructor: sc.teacher_profiles?.full_name || 'Instructor',
          date: scheduledDate,
          startTime: formatTimeHHMM(scheduledDate),
          endTime: formatTimeHHMM(endTime),
          meetingLink: sc.meeting_link,
        });
      }
    });
    
    // Add recurring classes from timetables
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(now);
      checkDate.setDate(now.getDate() + i);
      checkDate.setHours(0, 0, 0, 0);
      const dayOfWeek = checkDate.getDay();
      
      const dayEntries = timetables.filter(t => t.day_of_week === dayOfWeek && t.is_active);
      
      dayEntries.forEach(entry => {
        // Check valid_from constraint
        if (entry.valid_from) {
          const validFromDate = new Date(entry.valid_from);
          validFromDate.setHours(0, 0, 0, 0);
          if (checkDate < validFromDate) return;
        }
        
        // Check valid_until constraint (if class has expired)
        if (entry.valid_until) {
          const validUntilDate = new Date(entry.valid_until);
          validUntilDate.setHours(23, 59, 59, 999);
          if (checkDate > validUntilDate) return;
        }
        
        const [hours, minutes] = entry.start_time.split(':').map(Number);
        const classDate = new Date(checkDate);
        classDate.setHours(hours, minutes, 0, 0);
        
        if (classDate > now) {
          classes.push({
            id: `timetable-${entry.id}-${checkDate.toISOString().split('T')[0]}`,
            subject: entry.subject?.name || 'Class',
            instructor: entry.instructor?.full_name || 'Instructor',
            date: classDate,
            startTime: entry.start_time,
            endTime: entry.end_time,
            meetingLink: entry.meeting_link,
          });
        }
      });
    }
    
    // Sort by date and limit to 5
    return classes.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 5);
  };

  const getDisplayName = (): string => {
    if (profile?.full_name) return profile.full_name;
    if (user?.full_name) return user.full_name;
    return 'Student';
  };

  const getInitial = (): string => {
    const name = getDisplayName();
    return name.charAt(0).toUpperCase();
  };

  const getStudentId = (): string => {
    if (user?.id) {
      return user.id.substring(0, 8).toUpperCase();
    }
    return 'N/A';
  };

  const getEmail = (): string => {
    return user?.email || '';
  };

  const getCourseBundleName = (): string => {
    if (enrollments.length > 0 && enrollments[0].courses) {
      return enrollments[0].courses.name;
    }
    return 'No Courses Enrolled';
  };

  const getDptStreak = (): number => {
    if (dptSubmissions.length === 0) return 0;
    
    const submissionDates = new Set(dptSubmissions.map(s => s.test_date));
    let streak = 0;
    let checkDate = new Date();
    
    const formatDateStr = (date: Date): string => {
      return date.toISOString().split('T')[0];
    };
    
    while (submissionDates.has(formatDateStr(checkDate))) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
    
    return streak;
  };

  const getDptAverage = (): number => {
    if (dptSubmissions.length === 0) return 0;
    
    const validSubmissions = dptSubmissions.filter(s => 
      s.total_questions && s.total_questions > 0
    );
    
    if (validSubmissions.length === 0) return 0;
    
    const total = validSubmissions.reduce((sum, s) => {
      const percentage = s.total_questions 
        ? Math.round(((s.correct_answers || 0) / s.total_questions) * 100)
        : (s.score || 0);
      return sum + percentage;
    }, 0);
    
    return Math.round(total / validSubmissions.length);
  };

  const getDaySubmitted = (dayIndex: number): boolean => {
    const today = new Date();
    const currentDayOfWeek = today.getDay();
    const daysAgo = (currentDayOfWeek - dayIndex + 7) % 7;
    
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - daysAgo);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    return dptSubmissions.some(s => s.test_date === targetDateStr);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingIconContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primaryDark, colors.primary, '#4ADE80']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing.md }]}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIconContainer}>
              <Ionicons name="grid" size={20} color={colors.primary} />
            </View>
            <Text style={styles.headerTitle}>Dashboard</Text>
          </View>
          <Text style={styles.headerSubtitle}>Track your learning journey</Text>
        </View>
        <HeaderMenuButton onPress={openSidebar} />
      </LinearGradient>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeCardAccent} />
          <View style={styles.welcomeCardContent}>
            <View style={styles.welcomeRow}>
              <LinearGradient
                colors={[colors.primary, '#4ADE80']}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{getInitial()}</Text>
              </LinearGradient>
              <View style={styles.welcomeInfo}>
                <Text style={styles.welcomeTitle} data-testid="text-welcome-name">Welcome, {getDisplayName()}!</Text>
                <Text style={styles.welcomeSubtitle}>
                  Keep up the great work! Every day is a step closer to your goals.
                </Text>
                <View style={styles.emailRow}>
                  <Ionicons name="mail-outline" size={14} color={colors.primary} />
                  <Text style={styles.emailText} data-testid="text-user-email">{getEmail()}</Text>
                </View>
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={[styles.statItem, styles.statItemPink]}>
                <View style={styles.statIconContainer}>
                  <Ionicons name="bar-chart" size={18} color="#EC4899" />
                </View>
                <View style={styles.statTextCol}>
                  <Text style={styles.statLabel}>Attendance</Text>
                  <Text style={[styles.statValue, { color: '#DB2777' }]} data-testid="text-attendance">{attendancePercentage}%</Text>
                </View>
              </View>
              <View style={[styles.statItem, styles.statItemPurple]}>
                <View style={styles.statIconContainer}>
                  <Ionicons name="id-card" size={18} color={colors.primary} />
                </View>
                <View style={styles.statTextCol}>
                  <Text style={styles.statLabel}>Student ID</Text>
                  <Text style={[styles.statValue, { color: colors.primaryDark }]} data-testid="text-student-id">{getStudentId()}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <DashboardStudyPlanStrip userId={user?.id ?? null} refreshSignal={studyPlanRefreshKey} />

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <View style={styles.cardIconContainer}>
                <Ionicons name="clipboard" size={18} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>Daily Practice Test</Text>
            </View>
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>Pending Today</Text>
            </View>
          </View>
          <View style={styles.daysRow}>
            {WEEK_DAYS.map((day, i) => {
              const isToday = i === new Date().getDay();
              const hasSubmission = getDaySubmitted(i);
              return (
                <View key={i} style={[
                  styles.dayCircle, 
                  isToday && styles.dayCircleActive,
                  hasSubmission && !isToday && styles.dayCircleCompleted
                ]}>
                  <Text style={[
                    styles.dayText, 
                    isToday && styles.dayTextActive,
                    hasSubmission && !isToday && styles.dayTextCompleted
                  ]}>{day}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.dptStatsRow}>
            <View style={styles.dptStat}>
              <Text style={styles.dptStatLabel}>Streak</Text>
              <View style={styles.streakValue}>
                <Ionicons name="flame" size={18} color="#F97316" />
                <Text style={styles.dptStatValue} data-testid="text-dpt-streak">{getDptStreak()} days</Text>
              </View>
            </View>
            <View style={styles.dptStat}>
              <Text style={styles.dptStatLabel}>Average Score</Text>
              <Text style={styles.dptStatValue} data-testid="text-dpt-average">{getDptAverage()}%</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.cardIconContainer}>
                <Ionicons name="book" size={18} color={colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>My Courses</Text>
            </View>
            <TouchableOpacity style={styles.browseMore} data-testid="button-browse-courses">
              <Ionicons name="search-outline" size={16} color={colors.primary} />
              <Text style={styles.browseMoreText}>Browse More</Text>
            </TouchableOpacity>
          </View>
          <LinearGradient
            colors={['#FFFFFF', '#D1FAE5']}
            style={styles.bundleBadge}
          >
            <Ionicons name="ribbon" size={16} color={colors.primary} />
            <Text style={styles.bundleBadgeText} data-testid="text-bundle-name">{getCourseBundleName()}</Text>
          </LinearGradient>
          {subjects.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="book-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.emptyStateText}>No subjects found</Text>
            </View>
          ) : (
            subjects.map((subject, index) => {
              const progress = subject.chaptersTotal > 0 
                ? Math.round((subject.chaptersCompleted / subject.chaptersTotal) * 100) 
                : 0;
              return (
                <View key={subject.subject_id} style={styles.courseCard} data-testid={`card-subject-${subject.subject_id}`}>
                  <View style={[styles.courseCardAccent, { backgroundColor: index % 2 === 0 ? colors.primary : '#10B981' }]} />
                  <View style={styles.courseCardContent}>
                    <View style={styles.courseHeader}>
                      <LinearGradient
                        colors={index % 2 === 0 ? [colors.primary, '#4ADE80'] : ['#10B981', '#34D399']}
                        style={styles.courseIcon}
                      >
                        <Ionicons name="book" size={20} color={colors.white} />
                      </LinearGradient>
                      <View style={styles.courseInfo}>
                        <Text style={styles.courseTitle}>{subject.name}</Text>
                        <View style={styles.subjectMeta}>
                          <Text style={styles.courseChapters}>{subject.chaptersTotal} chapters</Text>
                          {subject.pendingAssignments > 0 && (
                            <View style={styles.pendingAssignmentBadge}>
                              <Text style={styles.pendingAssignmentText}>{subject.pendingAssignments} pending</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                    <View style={styles.progressSection}>
                      <View style={styles.progressHeader}>
                        <Text style={styles.progressLabel}>Progress</Text>
                        <Text style={styles.progressPercent}>{progress}%</Text>
                      </View>
                      <View style={styles.progressBar}>
                        <LinearGradient
                          colors={[colors.primary, '#4ADE80']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.progressFill, { width: `${Math.max(progress, 5)}%` }]}
                        />
                      </View>
                      <Text style={styles.chaptersCompleted}>
                        {subject.chaptersCompleted} of {subject.chaptersTotal} chapters completed
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.pyqBanner}
                      data-testid={`banner-pyq-${subject.subject_id}`}
                      activeOpacity={0.7}
                      onPress={() => navigation.navigate('TopicDetails', {
                        subjectId: subject.subject_id,
                        subjectName: subject.name,
                        openTab: 'pyqs',
                      })}
                    >
                      <Text style={styles.pyqBannerText}>✨ Up to 80% questions from Model Papers!</Text>
                      <View style={styles.pyqBadgeRow}>
                        <View style={[styles.pyqBadge, { backgroundColor: '#FEE2E2' }]}>
                          <Text style={[styles.pyqBadgeText, { color: '#DC2626' }]}>Predicted</Text>
                        </View>
                        <View style={[styles.pyqBadge, { backgroundColor: '#D1FAE5' }]}>
                          <Text style={[styles.pyqBadgeText, { color: '#059669' }]}>Important</Text>
                        </View>
                        <View style={[styles.pyqBadge, { backgroundColor: '#EDE9FE' }]}>
                          <Text style={[styles.pyqBadgeText, { color: '#7C3AED' }]}>PYQ</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.courseActions}>
                      <TouchableOpacity 
                        style={styles.studyButton} 
                        data-testid={`button-study-${subject.subject_id}`}
                        onPress={() => navigation.navigate('ChaptersList', { 
                          subjectId: subject.subject_id, 
                          subjectName: subject.name 
                        })}
                      >
                        <Ionicons name="book-outline" size={16} color={colors.primary} />
                        <Text style={styles.studyButtonText}>Study</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        data-testid={`button-ai-${subject.subject_id}`}
                        onPress={() => openAskAI({ subjectId: subject.subject_id, subjectName: subject.name })}
                      >
                        <LinearGradient
                          colors={[colors.primary, '#4ADE80']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.aiButton}
                        >
                          <Ionicons name="chatbubble-ellipses" size={16} color={colors.white} />
                          <Text style={styles.aiButtonText}>Ask AI Teacher</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      data-testid={`button-pyq-${subject.subject_id}`}
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('TopicDetails', {
                        subjectId: subject.subject_id,
                        subjectName: subject.name,
                        openTab: 'pyqs',
                      })}
                    >
                      <LinearGradient
                        colors={['#F97316', '#FB923C']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.pyqButton}
                      >
                        <Text style={styles.pyqButtonText}>✨ ⭐ Important & Predicted Questions</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardIconContainer}>
              <Ionicons name="videocam" size={18} color={colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Upcoming Classes</Text>
          </View>
          {upcomingClasses.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="calendar-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.emptyStateText}>No upcoming classes scheduled</Text>
            </View>
          ) : (
            upcomingClasses.map((cls) => (
              <View key={cls.id} style={styles.classItem} data-testid={`card-class-${cls.id}`}>
                <View style={styles.classIconContainer}>
                  <Ionicons name="videocam" size={20} color={colors.primary} />
                </View>
                <View style={styles.classInfo}>
                  <Text style={styles.classTitle}>{cls.subject}</Text>
                  <Text style={styles.classInstructor}>{cls.instructor}</Text>
                  <View style={styles.classDueRow}>
                    <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.classDue}>
                      {formatDate(cls.date.toISOString())} at {cls.startTime.substring(0, 5)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity 
                  style={styles.joinButton}
                  onPress={() => cls.meetingLink && navigation.navigate('LiveClasses' as any)}
                >
                  <Text style={styles.joinButtonText}>Join</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  loadingIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
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
  content: {
    flex: 1,
    marginTop: -spacing.lg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
  },
  contentContainer: {
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  welcomeCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  welcomeCardAccent: {
    width: 5,
    backgroundColor: colors.primary,
  },
  welcomeCardContent: {
    flex: 1,
    padding: spacing.md,
  },
  welcomeRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: {
    fontSize: 24,
    fontFamily: fontFamily.heading,
    color: colors.white,
  },
  welcomeInfo: {
    flex: 1,
  },
  welcomeTitle: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.heading,
    color: colors.text,
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 8,
    lineHeight: 19,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: '#E7F8EF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  emailText: {
    fontSize: fontSize.xs,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  statItemPink: {
    backgroundColor: '#FDF2F8',
    borderColor: '#FBCFE8',
  },
  statItemPurple: {
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
  },
  statIconContainer: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  statTextCol: {
    flex: 1,
  },
  statValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: spacing.md + 2,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardIconContainer: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    backgroundColor: '#E7F8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },
  pendingBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  pendingBadgeText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: '700',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  dayCircleCompleted: {
    backgroundColor: '#E7F8EF',
    borderColor: colors.primary,
  },
  dayText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  dayTextActive: {
    color: colors.white,
  },
  dayTextCompleted: {
    color: colors.primaryDark,
  },
  dptStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  dptStat: {
    alignItems: 'center',
  },
  dptStatLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  streakValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dptStatValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
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
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },
  browseMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  browseMoreText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  bundleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    backgroundColor: '#E7F8EF',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  bundleBadgeText: {
    fontSize: fontSize.sm,
    color: colors.primaryDark,
    fontWeight: '600',
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E7F8EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyStateText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  courseCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#EEF1F4',
  },
  courseCardAccent: {
    width: 5,
  },
  courseCardContent: {
    flex: 1,
    padding: spacing.md,
  },
  courseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  courseIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseInfo: {
    flex: 1,
  },
  courseTitle: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    marginBottom: 2,
  },
  courseChapters: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  subjectMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pendingAssignmentBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  pendingAssignmentText: {
    fontSize: fontSize.xs,
    color: '#D97706',
    fontWeight: '600',
  },
  progressSection: {
    marginBottom: spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  progressLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  progressPercent: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E7EBEF',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  chaptersCompleted: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  pyqBanner: {
    backgroundColor: '#FFF9E6',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#FBBF24',
  },
  pyqBannerText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 6,
  },
  pyqBadgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  pyqBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pyqBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pyqButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  pyqButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
  courseActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  studyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: '#E7F8EF',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  studyButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  aiButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
  },
  aiButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
  classItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  classIconContainer: {
    width: 46,
    height: 46,
    borderRadius: borderRadius.md,
    backgroundColor: '#E7F8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  classInfo: {
    flex: 1,
  },
  classTitle: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    marginBottom: 2,
  },
  classInstructor: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  classDueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  classDue: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  joinButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.white,
  },
  assignmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  assignmentIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignmentInfo: {
    flex: 1,
  },
  assignmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  assignmentTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  statusBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.md,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: '#F59E0B',
    fontWeight: '600',
  },
  assignmentMeta: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  assignmentMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  assignmentMarks: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  assignmentDue: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  submitButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  submitButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
  bottomSpacer: {
    height: 100,
  },
});
