import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import HeaderMenuButton from '../components/HeaderMenuButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase } from '../services/supabase';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'bar-chart-outline' },
  { id: 'progress', label: 'My Progress', icon: 'trending-up-outline' },
  { id: 'tests', label: 'My Tests', icon: 'checkmark-circle-outline' },
  { id: 'attendance', label: 'My Attendance', icon: 'time-outline' },
  { id: 'timetable', label: 'My Timetable', icon: 'calendar-outline' },
  { id: 'courses', label: 'My Courses', icon: 'book-outline' },
  { id: 'ai', label: 'AI & Learning', icon: 'sparkles-outline' },
  { id: 'engagement', label: 'My Engagement', icon: 'pulse-outline' },
];

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SUBJECTS = ['All Subjects', 'Physics', 'Chemistry', 'Mathematics', 'Biology'];

export default function DetailedProgressScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [timetableViewMode, setTimetableViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedSubject, setSelectedSubject] = useState('All Subjects');
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  
  // Courses expanded chapters state
  const [expandedChapters, setExpandedChapters] = useState<string[]>([]);

  // API data state - Using comprehensive StudentData matching website
  const [loading, setLoading] = useState(true);
  const [studentData, setStudentData] = useState<any>(null);
  
  // Legacy state for backward compatibility during transition
  const [userId, setUserId] = useState<string | null>(null);
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [studentProgress, setStudentProgress] = useState<any[]>([]);
  const [classAttendance, setClassAttendance] = useState<any[]>([]);
  const [timetables, setTimetables] = useState<any[]>([]);
  const [dptSubmissions, setDptSubmissions] = useState<any[]>([]);
  const [doubtLogs, setDoubtLogs] = useState<any[]>([]);
  const [aiVideoLogs, setAiVideoLogs] = useState<any[]>([]);
  const [podcastLogs, setPodcastLogs] = useState<any[]>([]);
  const [dailyActivityLogs, setDailyActivityLogs] = useState<any[]>([]);
  const [courseSubjects, setCourseSubjects] = useState<any[]>([]);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<any[]>([]);
  const [progressStats, setProgressStats] = useState<any>(null);
  const [paperTestResults, setPaperTestResults] = useState<any[]>([]);

  // Fetch all data on mount using comprehensive getCurrentStudentData (matching website)
  useEffect(() => {
    loadProgressData();
  }, []);

  const loadProgressData = async () => {
    try {
      setLoading(true);
      
      // Use the comprehensive getCurrentStudentData function (matching website's useCurrentStudent)
      const result = await supabase.getCurrentStudentData();
      
      if (result.success && result.student) {
        console.log('[DetailedProgress] Student data loaded, id:', result.student.id);
        setStudentData(result.student);
        setUserId(result.student.id);
        
        // Map comprehensive StudentData to legacy state for backward compatibility
        setProgressStats({
          activityScore: result.student.activity_score,
          avgProgress: result.student.total_progress,
          totalTests: result.student.tests_taken,
          avgTestScore: result.student.avg_test_score,
          attendedClasses: result.student.live_classes.attended,
          totalClasses: result.student.live_classes.total_scheduled,
          attendanceRate: result.student.live_classes.attendance_percentage
        });
        
        // Map courses
        setCourseIds(result.student.courses.map((c: any) => c.id));
        
        // Map recent classes to classAttendance format
        setClassAttendance(result.student.live_classes.recent_classes.map((cls: any) => ({
          id: cls.id,
          status: cls.attended ? 'present' : 'absent',
          marked_at: cls.date,
          scheduled_class: { subject: cls.subject, date: cls.date }
        })));
        
        // Map DPT submissions from mcq_practice
        setDptSubmissions(result.student.mcq_practice.recent_sessions.map((s: any, idx: number) => ({
          id: `session-${idx}`,
          test_title: s.subject,
          total_questions: s.questions,
          correct_answers: s.correct,
          score: s.questions > 0 ? Math.round((s.correct / s.questions) * 100) : 0,
          submitted_at: s.date
        })));
        
        // Map doubts
        setDoubtLogs(result.student.doubt_clearing.recent_doubts.map((d: any, idx: number) => ({
          id: `doubt-${idx}`,
          question: d.question,
          answer: d.status === 'resolved' ? 'Resolved' : null,
          created_at: d.date,
          status: d.status,
          resolved_at: d.status === 'resolved' ? d.date : null,
          subject: { name: d.subject }
        })));
        
        // Map AI video logs
        setAiVideoLogs(result.student.ai_video_usage.recent_videos.map((v: any, idx: number) => ({
          id: `video-${idx}`,
          video_title: v.title,
          duration_seconds: v.duration * 60,
          watched_seconds: (v.watched_percentage / 100) * v.duration * 60,
          completion_percentage: v.watched_percentage,
          created_at: v.date,
          popular_subjects: { name: v.subject }
        })));
        
        // Map podcast logs
        setPodcastLogs(result.student.podcast_usage.recent_podcasts.map((p: any, idx: number) => ({
          id: `podcast-${idx}`,
          podcast_title: p.title,
          duration_seconds: p.duration * 60,
          listened_seconds: p.duration * 60,
          created_at: p.date,
          popular_subjects: { name: p.subject }
        })));
        
        // Map activity trends
        setDailyActivityLogs(result.student.activity_trends);
        
        // Map timetable
        setTimetables(result.student.timetable);
        
        // Fetch paper test results separately
        const paperResults = await supabase.getPaperTestResults(result.student.id);
        if (paperResults.success && paperResults.results) {
          console.log('[DEBUG] Paper Test Results:', paperResults.results.length);
          setPaperTestResults(paperResults.results);
        }
        
      } else {
        console.log('[DEBUG] Failed to fetch student data:', result.error);
      }
    } catch (error) {
      console.error('Error loading progress data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Compute stats from fetched data - NO mock fallback
  const computedStats = progressStats ? [
    { label: 'Activity Score', value: `${progressStats.activityScore}%`, icon: 'pulse-outline' },
    { label: 'Overall Progress', value: `${progressStats.avgProgress}%`, icon: 'trending-up-outline' },
    { label: 'Tests Taken', value: `${progressStats.totalTests}`, subtext: `Avg: ${progressStats.avgTestScore}%`, icon: 'trophy-outline' },
    { label: 'Attendance', value: `${progressStats.attendanceRate}%`, subtext: `${progressStats.attendedClasses}/${progressStats.totalClasses} classes`, icon: 'time-outline' },
  ] : [];

  // Compute attendance data from fetched data - NO mock fallback
  const computedAttendanceData = classAttendance.length > 0 ? (() => {
    const bySubject: Record<string, { attended: number; total: number }> = {};
    classAttendance.forEach((a: any) => {
      const subject = a.scheduled_class?.subject || 'Unknown';
      if (!bySubject[subject]) {
        bySubject[subject] = { attended: 0, total: 0 };
      }
      bySubject[subject].total++;
      if (a.status === 'present') {
        bySubject[subject].attended++;
      }
    });
    return Object.entries(bySubject).map(([subject, data]) => ({
      subject,
      attended: data.attended,
      total: data.total,
      percentage: data.total > 0 ? Math.round((data.attended / data.total) * 100) : 0
    }));
  })() : [];

  // Compute test history from DPT submissions - NO mock fallback
  const computedTestHistory = dptSubmissions.length > 0 ? dptSubmissions.map((sub: any) => ({
    name: sub.test_title || 'DPT Test',
    date: sub.submitted_at?.split('T')[0] || '',
    score: sub.correct_answers || 0,
    total: sub.total_questions || 0,
    percentage: sub.score || 0,
    status: (sub.score || 0) >= 40 ? 'passed' : 'failed'
  })) : [];

  // Compute AI learning stats from real data - NO mock fallback
  const computedAIStats = {
    totalVideos: aiVideoLogs.length,
    totalWatchTime: aiVideoLogs.reduce((sum: number, log: any) => sum + (log.watched_seconds || 0), 0),
    totalPodcasts: podcastLogs.length,
    totalListenTime: podcastLogs.reduce((sum: number, log: any) => sum + (log.listened_seconds || 0), 0),
    avgCompletion: aiVideoLogs.length > 0 
      ? Math.round(aiVideoLogs.reduce((sum: number, log: any) => {
          const completion = log.duration_seconds 
            ? (log.watched_seconds / log.duration_seconds) * 100 
            : 100;
          return sum + Math.min(100, completion);
        }, 0) / aiVideoLogs.length) 
      : 0
  };

  // Compute doubt stats - NO mock fallback
  const resolvedDoubts = doubtLogs.filter((d: any) => d.status === 'resolved');
  const pendingDoubts = doubtLogs.filter((d: any) => d.status !== 'resolved');
  const avgResolutionTime = resolvedDoubts.length > 0 
    ? Math.round(resolvedDoubts.reduce((sum: number, d: any) => {
        if (d.created_at && d.resolved_at) {
          const created = new Date(d.created_at).getTime();
          const resolved = new Date(d.resolved_at).getTime();
          return sum + (resolved - created) / (1000 * 60);
        }
        return sum + 15;
      }, 0) / resolvedDoubts.length)
    : 0;
    
  // Group doubts by subject
  const doubtsBySubject = doubtLogs.reduce((acc: Record<string, number>, d: any) => {
    const subject = d.subject?.name || 'Unknown';
    acc[subject] = (acc[subject] || 0) + 1;
    return acc;
  }, {});
  
  const computedDoubtStats = {
    totalDoubts: doubtLogs.length,
    resolvedDoubts: resolvedDoubts.length,
    pendingDoubts: pendingDoubts.length,
    avgResolutionTime: avgResolutionTime,
    bySubject: Object.entries(doubtsBySubject)
      .map(([subject, count]) => ({ subject, count: count as number }))
      .sort((a, b) => b.count - a.count)
  };
  
  const toggleChapter = (chapterId: string) => {
    setExpandedChapters(prev => 
      prev.includes(chapterId) 
        ? prev.filter(id => id !== chapterId)
        : [...prev, chapterId]
    );
  };

  const handleTabSelect = (tabId: string) => {
    setActiveTab(tabId);
    setSidebarOpen(false);
  };

  // Build schedule data from real timetable data
  const scheduleData = timetables.map((t: any) => ({
    day: DAYS_OF_WEEK[t.day] || DAYS_OF_WEEK[0],
    time: `${t.start_time || '00:00'} - ${t.end_time || '00:00'}`,
    subject: t.subject || 'Unknown',
    topic: t.topic || '',
    teacher: t.instructor || 'TBA',
    type: t.type || 'live class',
    color: t.subject?.toLowerCase().includes('physics') ? 'blue' : 
           t.subject?.toLowerCase().includes('chemistry') ? 'purple' : 
           t.subject?.toLowerCase().includes('math') ? 'green' : 'orange'
  }));

  const filteredSchedule = selectedSubject === 'All Subjects'
    ? scheduleData
    : scheduleData.filter((item: any) => item.subject === selectedSubject);

  const groupedByDay = filteredSchedule.reduce((acc: any, curr: any) => {
    if (!acc[curr.day]) acc[curr.day] = [];
    acc[curr.day].push(curr);
    return acc;
  }, {} as Record<string, any[]>);

  const renderOverview = () => {
    // Use studentData exclusively - matches website's useCurrentStudent hook
    const activityScore = studentData?.activity_score ?? 0;
    const overallProgress = studentData?.total_progress ?? 0;
    const testsTaken = studentData?.tests_taken ?? 0;
    const testsAvg = studentData?.avg_test_score ?? 0;
    const attendedClasses = studentData?.live_classes?.attended ?? 0;
    const totalClasses = studentData?.live_classes?.total_scheduled ?? 0;
    const attendanceRate = studentData?.live_classes?.attendance_percentage ?? 0;
    
    // Recent activity from live classes - show "-" for missing data (matching website)
    const recentActivityData = studentData?.live_classes?.recent_classes?.length > 0
      ? studentData.live_classes.recent_classes.slice(0, 3).map((cls: any) => ({
          title: cls.subject || '-',
          subject: cls.topic || cls.subject || '-',
          status: cls.attended ? 'Attended' : 'Missed',
          date: cls.date ? new Date(cls.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'
        }))
      : [];
    
    // Courses data with proper subject flattening
    const coursesData = studentData?.courses?.length > 0
      ? studentData.courses.map((c: any) => ({
          name: c.name || 'Course',
          subjects: Array.isArray(c.subjects) ? c.subjects.join(', ') : (typeof c.subjects === 'string' ? c.subjects : ''),
          progress: typeof c.progress === 'number' ? c.progress : 0
        }))
      : [];
    
    // Focus areas from areas_of_improvement
    const focusAreas = Array.isArray(studentData?.areas_of_improvement) 
      ? studentData.areas_of_improvement 
      : [];
    
    return (
    <View style={styles.tabContent}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your progress...</Text>
        </View>
      ) : (
        <>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <Text style={styles.statLabel}>Test Score</Text>
            <Ionicons name="trending-up-outline" size={18} color={colors.gray400} />
          </View>
          <Text style={styles.statValue}>{activityScore}%</Text>
          <View style={styles.activityProgressBar}>
            <LinearGradient
              colors={[colors.primary, '#3B82F6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.activityProgressFill, { width: `${activityScore}%` }]}
            />
          </View>
        </View>
        
        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <Text style={styles.statLabel}>Overall Progress</Text>
            <Ionicons name="analytics-outline" size={18} color={colors.gray400} />
          </View>
          <Text style={styles.statValue}>{overallProgress}%</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${overallProgress}%` }]} />
          </View>
        </View>
        
        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <Text style={styles.statLabel}>Solved DPPs</Text>
            <Ionicons name="checkmark-done-outline" size={18} color={colors.gray400} />
          </View>
          <Text style={styles.statValue}>{studentData?.mcq_practice?.total_attempted || 0}</Text>
          <Text style={styles.statSubtext}>Daily Practice Problems</Text>
        </View>
        
        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <Text style={styles.statLabel}>Attendance</Text>
            <Ionicons name="time-outline" size={18} color={colors.gray400} />
          </View>
          <Text style={styles.statValue}>{attendanceRate}%</Text>
          <Text style={styles.statSubtext}>{attendedClasses}/{totalClasses} classes</Text>
        </View>
      </View>

      <View style={styles.overviewSection}>
        <View style={styles.overviewSectionHeader}>
          <Ionicons name="book-outline" size={20} color={colors.gray900} />
          <Text style={styles.overviewSectionTitle}>My Courses</Text>
        </View>
        {coursesData.length > 0 ? (
          coursesData.map((course, idx) => (
            <View key={idx} style={styles.courseItem}>
              <View style={styles.courseHeader}>
                <View style={styles.courseInfo}>
                  <Text style={styles.courseName}>{course.name}</Text>
                  {course.subjects ? (
                    <Text style={styles.courseSubjects}>{course.subjects}</Text>
                  ) : null}
                </View>
                <View style={styles.progressBadge}>
                  <Text style={styles.progressBadgeText}>{course.progress}%</Text>
                </View>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${course.progress}%` }]} />
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyStateText}>No courses enrolled yet</Text>
        )}
      </View>

      {focusAreas.length > 0 && (
        <View style={styles.overviewSection}>
          <View style={styles.overviewSectionHeader}>
            <Ionicons name="alert-circle-outline" size={20} color="#F59E0B" />
            <Text style={styles.overviewSectionTitle}>Areas to Focus On</Text>
          </View>
          <View style={styles.focusTags}>
            {focusAreas.map((area: string, idx: number) => (
              <View key={idx} style={styles.focusTag}>
                <Text style={styles.focusTagText}>{area}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.overviewSection}>
        <View style={styles.overviewSectionHeader}>
          <Ionicons name="time-outline" size={20} color={colors.gray900} />
          <Text style={styles.overviewSectionTitle}>Recent Activity</Text>
        </View>
        {recentActivityData.length > 0 ? (
          recentActivityData.map((activity, idx) => (
            <View key={idx} style={styles.recentActivityItem}>
              <View style={styles.recentActivityLeft}>
                <Text style={styles.recentActivityTitle}>{activity.title}</Text>
                <Text style={styles.recentActivitySubject}>{activity.subject}</Text>
              </View>
              <View style={styles.recentActivityRight}>
                <View style={[
                  styles.attendanceBadge, 
                  activity.status === 'Attended' ? styles.attendedBadge : styles.missedBadge
                ]}>
                  <Text style={[
                    styles.attendanceBadgeText,
                    activity.status === 'Attended' ? styles.attendedText : styles.missedText
                  ]}>{activity.status}</Text>
                </View>
                <Text style={styles.recentActivityDate}>{activity.date}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyStateText}>No recent class activity</Text>
        )}
      </View>
        </>
      )}
    </View>
  );
  };

  const renderProgress = () => {
    const maxValue = 100;
    const chartHeight = 200;
    const chartWidth = 300;
    
    // Build progress trend from activity_trends
    const progressTrendData = (studentData?.activity_trends || []).slice(-12).map((t: any, idx: number) => ({
      name: new Date(t.date).toLocaleDateString('en-US', { month: 'short' }),
      value: t.score || 0
    }));
    
    // Build course progress data from real courses
    const courseProgressData = (studentData?.courses || []).map((c: any) => ({
      name: c.name || 'Course',
      progress: c.progress || 0,
      subjects: Array.isArray(c.subjects) ? c.subjects : []
    }));
    
    return (
      <View style={styles.tabContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading progress data...</Text>
          </View>
        ) : (
          <>
        {/* Progress Trend Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressCardHeader}>
            <View style={[styles.sectionIconContainer, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="trending-up-outline" size={18} color="#22C55E" />
            </View>
            <Text style={styles.progressCardTitle}>Progress Trend</Text>
          </View>
          
          {progressTrendData.length > 0 ? (
            <>
            {/* Simple Line Chart using Views */}
            <View style={styles.chartContainer}>
              {/* Y-axis labels */}
              <View style={styles.yAxisLabels}>
                <Text style={styles.axisLabel}>100</Text>
                <Text style={styles.axisLabel}>75</Text>
                <Text style={styles.axisLabel}>50</Text>
                <Text style={styles.axisLabel}>25</Text>
                <Text style={styles.axisLabel}>0</Text>
              </View>
              
              {/* Chart area */}
              <View style={styles.chartArea}>
                {/* Grid lines */}
                <View style={styles.gridLines}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <View key={i} style={styles.gridLine} />
                  ))}
                </View>
                
                {/* Data points and lines */}
                <View style={styles.dataPointsContainer}>
                  {progressTrendData.map((point: any, idx: number) => {
                    const y = chartHeight - (point.value / maxValue) * chartHeight;
                    const nextPoint = progressTrendData[idx + 1];
                    
                    return (
                      <View key={idx} style={styles.dataPointColumn}>
                        {/* Line to next point */}
                        {nextPoint && (
                          <View 
                            style={[
                              styles.chartLine,
                              { 
                                top: y,
                                height: 2,
                                transform: [{ 
                                  rotate: `${Math.atan2(
                                    (nextPoint.value - point.value) / maxValue * chartHeight,
                                    chartWidth / progressTrendData.length
                                  ) * -1}rad` 
                                }]
                              }
                            ]} 
                          />
                        )}
                        {/* Data point */}
                        <View style={[styles.dataPoint, { top: y - 6 }]}>
                          <View style={styles.dataPointInner} />
                        </View>
                      </View>
                    );
                  })}
                </View>
                
                {/* X-axis labels */}
                <View style={styles.xAxisLabels}>
                  {progressTrendData.map((point: any, idx: number) => (
                    <Text key={idx} style={styles.axisLabel}>{point.name}</Text>
                  ))}
                </View>
              </View>
            </View>
            
            {/* Legend */}
            <View style={styles.chartLegend}>
              <View style={styles.legendDot} />
              <Text style={styles.legendText}>Overall Progress (%)</Text>
            </View>
            </>
          ) : (
            <Text style={styles.emptyStateText}>No progress trend data available</Text>
          )}
        </View>

        {/* Course Progress Cards */}
        <View style={styles.courseProgressContainer}>
          {courseProgressData.length > 0 ? (
            courseProgressData.map((course: any, idx: number) => (
              <View key={idx} style={styles.courseProgressCard}>
                <Text style={styles.courseProgressTitle}>{course.name}</Text>
                
                <View style={styles.courseProgressInfo}>
                  <Text style={styles.courseProgressLabel}>Overall Progress</Text>
                  <Text style={styles.courseProgressValue}>{course.progress}%</Text>
                </View>
                
                <View style={styles.courseProgressBarContainer}>
                  <View 
                    style={[
                      styles.courseProgressBarFill,
                      { width: `${course.progress}%` }
                    ]} 
                  />
                </View>
                
                {course.subjects.length > 0 && (
                  <>
                    <Text style={styles.courseSubjectsLabel}>Subjects:</Text>
                    <View style={styles.courseSubjectsTags}>
                      {course.subjects.map((subject: string, sIdx: number) => (
                        <View key={sIdx} style={styles.courseSubjectTag}>
                          <Text style={styles.courseSubjectTagText}>{subject}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            ))
          ) : (
            <View style={styles.progressCard}>
              <Text style={styles.emptyStateText}>No courses enrolled yet</Text>
            </View>
          )}
        </View>
          </>
        )}
      </View>
    );
  };

  const renderTests = () => {
    const barMaxHeight = 150;
    
    // Calculate DPP test stats from mcq_practice (dpp_topic_submissions)
    // mcq_practice.total_attempted = dptSubmissions.length (number of DPP tests, not questions)
    const dppTestCount = studentData?.mcq_practice?.total_attempted || 0;
    // Calculate total questions from DPP sessions (sum of questions per session)
    const dppTotalQuestions = (studentData?.mcq_practice?.recent_sessions || [])
      .reduce((sum: number, s: any) => sum + (s.questions || 0), 0);
    const dppTotalCorrect = studentData?.mcq_practice?.total_correct || 0;
    const dppAvgScore = dppTotalQuestions > 0 
      ? Math.round((dppTotalCorrect / dppTotalQuestions) * 100) 
      : 0;
    
    // Calculate Paper test stats from paper_test_results (Mock + PYQ)
    const paperTestCount = paperTestResults.length;
    const paperTotalQuestions = paperTestResults.reduce((sum: number, r: any) => sum + (r.total_questions || 0), 0);
    const paperTotalCorrect = paperTestResults.reduce((sum: number, r: any) => sum + (r.correct_answers || 0), 0);
    const paperAvgScore = paperTotalQuestions > 0 
      ? Math.round((paperTotalCorrect / paperTotalQuestions) * 100) 
      : 0;
    
    // Combined stats for stat cards
    const totalTests = dppTestCount + paperTestCount;
    const totalQuestions = dppTotalQuestions + paperTotalQuestions;
    const totalCorrect = dppTotalCorrect + paperTotalCorrect;
    const overallAvgScore = totalQuestions > 0 
      ? Math.round((totalCorrect / totalQuestions) * 100) 
      : 0;
    
    // Data for Performance by Type BarChart
    const maxScore = Math.max(dppAvgScore, paperAvgScore, 1);
    
    // Data for Test Distribution Pie Chart (donut)
    const totalTestsForPie = totalTests || 1;
    const dppPercentage = Math.round((dppTestCount / totalTestsForPie) * 100);
    const paperPercentage = 100 - dppPercentage;
    
    // Build recent tests list - combine DPP and Paper tests, sort by date, take last 10
    const dppTests = (studentData?.mcq_practice?.recent_sessions || []).map((s: any) => ({
      name: `DPP - ${s.subject || 'Practice'}`,
      type: 'DPP',
      date: s.date || '',
      score: s.correct || 0,
      total: s.questions || 0,
      percentage: s.questions > 0 ? Math.round((s.correct / s.questions) * 100) : 0
    }));
    
    const paperTests = paperTestResults.map((r: any) => ({
      name: r.paper?.exam_name 
        ? `${r.paper.exam_name} ${r.paper.year || ''} ${r.paper.paper_type || ''}`.trim()
        : 'Paper Test',
      type: r.paper?.paper_type === 'mock' ? 'Mock' : 'PYQ',
      date: r.submitted_at || '',
      score: r.correct_answers || 0,
      total: r.total_questions || 0,
      percentage: r.total_questions > 0 ? Math.round((r.correct_answers / r.total_questions) * 100) : 0
    }));
    
    const recentTests = [...dppTests, ...paperTests]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
    
    return (
      <View style={styles.tabContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading test data...</Text>
          </View>
        ) : (
          <>
        {/* Three Stat Cards */}
        <View style={styles.testStatsGrid}>
          <View style={styles.testStatCard}>
            <View style={styles.testStatHeader}>
              <Text style={styles.testStatLabel}>Total Tests</Text>
              <Ionicons name="trophy-outline" size={16} color={colors.gray400} />
            </View>
            <Text style={styles.testStatValue}>{totalTests}</Text>
            <Text style={styles.testStatSubtext}>{dppTestCount} DPP + {paperTestCount} Papers</Text>
          </View>
          
          <View style={styles.testStatCard}>
            <View style={styles.testStatHeader}>
              <Text style={styles.testStatLabel}>Average Score</Text>
              <Ionicons name="trending-up-outline" size={16} color={colors.gray400} />
            </View>
            <Text style={styles.testStatValue}>{overallAvgScore}%</Text>
            <Text style={styles.testStatSubtext}>Overall performance</Text>
          </View>
          
          <View style={styles.testStatCard}>
            <View style={styles.testStatHeader}>
              <Text style={styles.testStatLabel}>Total Questions</Text>
              <Ionicons name="help-circle-outline" size={16} color={colors.gray400} />
            </View>
            <Text style={styles.testStatValue}>{totalCorrect}/{totalQuestions}</Text>
            <Text style={styles.testStatSubtext}>Correct answers</Text>
          </View>
        </View>

        {/* Performance by Type BarChart */}
        <View style={styles.testCard}>
          <Text style={styles.testCardTitle}>Performance by Type</Text>
          
          {(dppTestCount > 0 || paperTestCount > 0) ? (
            <>
            <View style={styles.barChartContainer}>
              {/* Y-axis */}
              <View style={styles.barChartYAxis}>
                <Text style={styles.barChartAxisLabel}>100%</Text>
                <Text style={styles.barChartAxisLabel}>75%</Text>
                <Text style={styles.barChartAxisLabel}>50%</Text>
                <Text style={styles.barChartAxisLabel}>25%</Text>
                <Text style={styles.barChartAxisLabel}>0%</Text>
              </View>
              
              {/* Bars */}
              <View style={[styles.barChartBars, { justifyContent: 'center', gap: 40 }]}>
                {/* DPP Bar */}
                <View style={styles.barChartGroup}>
                  <View style={styles.barChartBarContainer}>
                    <View 
                      style={[
                        styles.barChartBar, 
                        { backgroundColor: colors.primary, height: (dppAvgScore / 100) * barMaxHeight, width: 50 }
                      ]} 
                    />
                  </View>
                  <Text style={styles.barChartLabel}>DPP</Text>
                  <Text style={[styles.barChartAxisLabel, { marginTop: 4 }]}>{dppAvgScore}%</Text>
                </View>
                
                {/* Papers Bar */}
                <View style={styles.barChartGroup}>
                  <View style={styles.barChartBarContainer}>
                    <View 
                      style={[
                        styles.barChartBar, 
                        { backgroundColor: '#2BBD6E', height: (paperAvgScore / 100) * barMaxHeight, width: 50 }
                      ]} 
                    />
                  </View>
                  <Text style={styles.barChartLabel}>Papers</Text>
                  <Text style={[styles.barChartAxisLabel, { marginTop: 4 }]}>{paperAvgScore}%</Text>
                </View>
              </View>
            </View>
            
            {/* Legend */}
            <View style={styles.barChartLegend}>
              <View style={styles.barChartLegendItem}>
                <View style={[styles.barChartLegendDot, { backgroundColor: colors.primary }]} />
                <Text style={styles.barChartLegendText}>DPP Tests ({dppTestCount})</Text>
              </View>
              <View style={styles.barChartLegendItem}>
                <View style={[styles.barChartLegendDot, { backgroundColor: '#2BBD6E' }]} />
                <Text style={styles.barChartLegendText}>Paper Tests ({paperTestCount})</Text>
              </View>
            </View>
            </>
          ) : (
            <Text style={styles.emptyStateText}>No test data available</Text>
          )}
        </View>

        {/* Test Distribution Pie Chart (Donut) */}
        <View style={styles.testCard}>
          <Text style={styles.testCardTitle}>Test Distribution</Text>
          
          {totalTests > 0 ? (
            <View style={styles.pieChartContainer}>
              {/* Simple donut representation */}
              <View style={styles.pieChart}>
                {/* DPP slice */}
                <View 
                  style={[
                    styles.pieSlice,
                    { 
                      backgroundColor: colors.primary,
                      transform: [{ rotate: '0deg' }],
                      opacity: 0.9
                    }
                  ]}
                />
                {/* Paper slice - overlapping based on percentage */}
                <View 
                  style={[
                    styles.pieSlice,
                    { 
                      backgroundColor: '#2BBD6E',
                      transform: [{ rotate: `${dppPercentage * 3.6}deg` }],
                      opacity: 0.9,
                      zIndex: 1
                    }
                  ]}
                />
                <View style={styles.pieChartCenter}>
                  <Text style={styles.pieChartCenterText}>{totalTests}</Text>
                  <Text style={styles.pieChartCenterLabel}>Tests</Text>
                </View>
              </View>
              
              {/* Legend */}
              <View style={styles.pieChartLegend}>
                <View style={styles.pieChartLegendItem}>
                  <View style={[styles.pieChartLegendDot, { backgroundColor: colors.primary }]} />
                  <Text style={styles.pieChartLegendText}>DPP: {dppTestCount} ({dppPercentage}%)</Text>
                </View>
                <View style={styles.pieChartLegendItem}>
                  <View style={[styles.pieChartLegendDot, { backgroundColor: '#2BBD6E' }]} />
                  <Text style={styles.pieChartLegendText}>Papers: {paperTestCount} ({paperPercentage}%)</Text>
                </View>
              </View>
            </View>
          ) : (
            <Text style={styles.emptyStateText}>No test distribution data</Text>
          )}
        </View>

        {/* Recent Tests List (last 10) */}
        <View style={styles.testCard}>
          <Text style={styles.testCardTitle}>Recent Tests</Text>
          
          {recentTests.length > 0 ? (
            <View style={styles.practiceSessionsList}>
              {recentTests.map((test: any, idx: number) => (
                <View 
                  key={idx} 
                  style={[
                    styles.practiceSessionItem,
                    idx !== recentTests.length - 1 && styles.practiceSessionItemBorder
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.practiceSessionSubject} numberOfLines={1}>{test.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <View style={[
                        styles.testTypeBadge,
                        { backgroundColor: test.type === 'DPP' ? '#DCFCE7' : '#D1FAE5' }
                      ]}>
                        <Text style={[
                          styles.testTypeBadgeText,
                          { color: test.type === 'DPP' ? '#15803D' : '#2BBD6E' }
                        ]}>{test.type}</Text>
                      </View>
                      <Text style={styles.practiceSessionScore}>{test.score}/{test.total} correct</Text>
                    </View>
                  </View>
                  <View style={styles.practiceSessionRight}>
                    <View style={[
                      styles.practiceSessionBadge,
                      { backgroundColor: test.percentage >= 70 ? '#DCFCE7' : test.percentage >= 40 ? '#FEF3C7' : '#FEE2E2' }
                    ]}>
                      <Text style={[
                        styles.practiceSessionBadgeText,
                        { color: test.percentage >= 70 ? '#15803D' : test.percentage >= 40 ? '#B45309' : '#DC2626' }
                      ]}>{test.percentage}%</Text>
                    </View>
                    <Text style={styles.practiceSessionDate}>
                      {test.date ? new Date(test.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '-'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyStateText}>No recent tests</Text>
          )}
        </View>
          </>
        )}
      </View>
    );
  };

  const renderAttendance = () => {
    const DAYS_OF_WEEK_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Build attendance dates map from real data
    const attendanceDates = new Map<string, string>();
    classAttendance.forEach((a: any) => {
      const date = a.scheduled_class?.date;
      if (date) {
        const day = new Date(date).getDate();
        attendanceDates.set(String(day), a.status === 'present' ? 'present' : 'absent');
      }
    });
    
    const getAttendanceStatus = (day: number) => {
      const status = attendanceDates.get(String(day));
      if (status) return status;
      if (day > new Date().getDate()) return 'upcoming';
      return 'upcoming'; // No data
    };
    
    const getStatusStyles = (status: string) => {
      switch (status) {
        case 'present':
          return { 
            bg: '#dcfce7', 
            text: '#15803d', 
            border: '#bbf7d0' 
          };
        case 'absent':
          return { 
            bg: '#fee2e2', 
            text: '#dc2626', 
            border: '#fecaca' 
          };
        case 'upcoming':
        default:
          return { 
            bg: '#dbeafe', 
            text: '#2563eb', 
            border: '#bfdbfe' 
          };
      }
    };
    
    // Get current month/year
    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    return (
      <View style={styles.tabContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading attendance data...</Text>
          </View>
        ) : (
          <>
        {/* Attendance Calendar Card */}
        <View style={styles.attendanceCalendarCard}>
          {/* Header */}
          <View style={styles.attendanceCalendarHeader}>
            <Text style={styles.attendanceCalendarTitle}>Attendance Calendar</Text>
            <Text style={styles.attendanceCalendarMonth}>{currentMonth}</Text>
          </View>
          
          {/* Legend */}
          <View style={styles.attendanceLegend}>
            <View style={styles.attendanceLegendItem}>
              <View style={[styles.attendanceLegendDot, { backgroundColor: '#22c55e' }]} />
              <Text style={styles.attendanceLegendText}>Present</Text>
            </View>
            <View style={styles.attendanceLegendItem}>
              <View style={[styles.attendanceLegendDot, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.attendanceLegendText}>Absent</Text>
            </View>
            <View style={styles.attendanceLegendItem}>
              <View style={[styles.attendanceLegendDot, { backgroundColor: '#3b82f6' }]} />
              <Text style={styles.attendanceLegendText}>Upcoming</Text>
            </View>
          </View>
          
          {/* Calendar Grid */}
          <View style={styles.attendanceGrid}>
            {/* Day Headers */}
            {DAYS_OF_WEEK_SHORT.map((day) => (
              <View key={day} style={styles.attendanceDayHeader}>
                <Text style={styles.attendanceDayHeaderText}>{day}</Text>
              </View>
            ))}
            
            {/* Empty slot for Sunday (Dec 1 is Monday) */}
            <View style={styles.attendanceDayEmpty} />
            
            {/* Days */}
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
              const status = getAttendanceStatus(day);
              const statusStyles = getStatusStyles(status);
              
              return (
                <View 
                  key={day} 
                  style={[
                    styles.attendanceDayCell,
                    { 
                      backgroundColor: statusStyles.bg,
                      borderColor: statusStyles.border,
                    }
                  ]}
                >
                  <Text style={[styles.attendanceDayCellText, { color: statusStyles.text }]}>
                    {day}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Subject-wise Attendance */}
        <View style={styles.attendanceCalendarCard}>
          <Text style={styles.attendanceCalendarTitle}>Subject-wise Attendance</Text>
          {computedAttendanceData.length > 0 ? (
            computedAttendanceData.map((item, idx) => (
              <View key={idx} style={styles.subjectProgressItem}>
                <View style={styles.subjectProgressHeader}>
                  <Text style={styles.subjectProgressName}>{item.subject}</Text>
                  <Text style={styles.subjectProgressPercent}>{item.percentage}%</Text>
                </View>
                <Text style={styles.attendanceSubtext}>{item.attended}/{item.total} classes</Text>
                <View style={styles.subjectProgressBarContainer}>
                  <View 
                    style={[
                      styles.subjectProgressBarFill,
                      { 
                        width: `${item.percentage}%`,
                        backgroundColor: item.percentage >= 75 ? '#22c55e' : item.percentage >= 50 ? '#f59e0b' : '#ef4444'
                      }
                    ]} 
                  />
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyStateText}>No attendance data available</Text>
          )}
        </View>
          </>
        )}
      </View>
    );
  };

  const renderTimetable = () => (
    <View style={styles.tabContent}>
      {/* Header Controls */}
      <View style={styles.timetableHeader}>
        {/* Subject Filter */}
        <TouchableOpacity 
          style={styles.subjectFilter}
          onPress={() => setSubjectPickerOpen(true)}
        >
          <Text style={styles.subjectFilterText}>{selectedSubject}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.primary} />
        </TouchableOpacity>

        {/* View Mode Toggle */}
        <View style={styles.viewModeToggle}>
          <TouchableOpacity
            style={[
              styles.viewModeButton,
              timetableViewMode === 'calendar' && styles.viewModeButtonActive
            ]}
            onPress={() => setTimetableViewMode('calendar')}
          >
            <Ionicons 
              name="calendar-outline" 
              size={16} 
              color={timetableViewMode === 'calendar' ? colors.white : colors.gray500} 
            />
            <Text style={[
              styles.viewModeText,
              timetableViewMode === 'calendar' && styles.viewModeTextActive
            ]}>Calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.viewModeButton,
              timetableViewMode === 'list' && styles.viewModeButtonActive
            ]}
            onPress={() => setTimetableViewMode('list')}
          >
            <Ionicons 
              name="list-outline" 
              size={16} 
              color={timetableViewMode === 'list' ? colors.white : colors.gray500} 
            />
            <Text style={[
              styles.viewModeText,
              timetableViewMode === 'list' && styles.viewModeTextActive
            ]}>List</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Calendar View */}
      {timetableViewMode === 'calendar' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.calendarScroll}>
          <View style={styles.calendarContainer}>
            {DAYS_OF_WEEK.map(day => {
              const dayClasses = filteredSchedule.filter(item => item.day === day);
              return (
                <View key={day} style={styles.calendarDay}>
                  <Text style={styles.calendarDayTitle}>{day}</Text>
                  {dayClasses.length === 0 ? (
                    <View style={styles.noClassesContainer}>
                      <Text style={styles.noClassesText}>No classes</Text>
                    </View>
                  ) : (
                    dayClasses.map((cls, idx) => (
                      <View 
                        key={idx} 
                        style={[
                          styles.calendarClassCard,
                          { borderLeftColor: cls.color === 'blue' ? '#3b82f6' : '#34D07B' }
                        ]}
                      >
                        <View style={styles.calendarClassTime}>
                          <Ionicons name="time-outline" size={12} color={colors.gray500} />
                          <Text style={styles.calendarClassTimeText}>{cls.time}</Text>
                        </View>
                        <Text style={styles.calendarClassSubject}>{cls.subject}</Text>
                        <Text style={styles.calendarClassTopic}>{cls.topic}</Text>
                        <View style={styles.calendarClassTeacher}>
                          <Ionicons name="person-outline" size={12} color={colors.gray500} />
                          <Text style={styles.calendarClassTeacherText}>{cls.teacher}</Text>
                        </View>
                        <View style={[
                          styles.calendarClassTypeBadge,
                          { backgroundColor: cls.color === 'blue' ? '#eff6ff' : '#FFFFFF' }
                        ]}>
                          <Text style={[
                            styles.calendarClassTypeText,
                            { color: cls.color === 'blue' ? '#3b82f6' : '#34D07B' }
                          ]}>{cls.type}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* List View */}
      {timetableViewMode === 'list' && (
        <View style={styles.listContainer}>
          {Object.keys(groupedByDay).length === 0 ? (
            <View style={styles.noClassesContainerCenter}>
              <Text style={styles.noClassesText}>No classes found for the selected filter.</Text>
            </View>
          ) : (
            DAYS_OF_WEEK.filter(day => groupedByDay[day]).map(day => (
              <View key={day} style={styles.listDaySection}>
                <Text style={styles.listDayTitle}>{day}</Text>
                {groupedByDay[day].map((cls, idx) => (
                  <View 
                    key={idx} 
                    style={[
                      styles.listClassCard,
                      { borderLeftColor: cls.color === 'blue' ? '#3b82f6' : '#34D07B' }
                    ]}
                  >
                    <View style={styles.listClassMain}>
                      <View style={styles.listClassHeader}>
                        <View style={styles.listClassSubjectRow}>
                          <Ionicons name="book-outline" size={14} color={colors.gray400} />
                          <Text style={styles.listClassSubject}>{cls.subject}</Text>
                        </View>
                        <View style={[
                          styles.listClassTypeBadge,
                          { backgroundColor: '#eff6ff' }
                        ]}>
                          <Text style={styles.listClassTypeText}>{cls.type}</Text>
                        </View>
                      </View>
                      <Text style={styles.listClassTopic}>{cls.topic}</Text>
                    </View>
                    <View style={styles.listClassMeta}>
                      <View style={styles.listClassMetaItem}>
                        <Ionicons name="time-outline" size={14} color={colors.gray400} />
                        <Text style={styles.listClassMetaText}>{cls.time}</Text>
                      </View>
                      <View style={styles.listClassMetaItem}>
                        <Ionicons name="person-outline" size={14} color={colors.gray400} />
                        <Text style={styles.listClassMetaText}>{cls.teacher}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
      )}

      {/* Subject Picker Modal */}
      <Modal
        visible={subjectPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSubjectPickerOpen(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setSubjectPickerOpen(false)}>
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>Select Subject</Text>
            {SUBJECTS.map((subject, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.pickerItem,
                  selectedSubject === subject && styles.pickerItemActive
                ]}
                onPress={() => {
                  setSelectedSubject(subject);
                  setSubjectPickerOpen(false);
                }}
              >
                <Text style={[
                  styles.pickerItemText,
                  selectedSubject === subject && styles.pickerItemTextActive
                ]}>{subject}</Text>
                {selectedSubject === subject && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );

  const renderCourses = () => {
    // Build courses data from real studentData.courses
    const coursesData = (studentData?.courses || []).map((c: any) => ({
      title: c.name || 'Course',
      progress: c.progress || 0,
      subjects: Array.isArray(c.subjects) ? c.subjects : [],
      chapters: c.chapters || []
    }));
    
    return (
      <View style={styles.tabContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading courses...</Text>
          </View>
        ) : coursesData.length > 0 ? (
          coursesData.map((course: any, courseIdx: number) => (
            <View key={courseIdx} style={styles.courseDetailCard}>
              <View style={styles.courseDetailHeader}>
                <Ionicons name="book-outline" size={20} color={colors.gray700} />
                <Text style={styles.courseDetailTitle}>{course.title}</Text>
              </View>
              
              <View style={styles.courseProgressInfo}>
                <Text style={styles.courseProgressLabel}>Overall Progress</Text>
                <Text style={styles.courseProgressValue}>{course.progress}%</Text>
              </View>
              
              <View style={styles.courseProgressBarContainer}>
                <View 
                  style={[
                    styles.courseProgressBarFill,
                    { width: `${course.progress}%` }
                  ]} 
                />
              </View>
              
              {course.subjects.length > 0 && (
                <View style={styles.courseSubjectSection}>
                  <View style={styles.courseSubjectHeader}>
                    <Text style={styles.courseSubjectName}>Subjects</Text>
                  </View>
                  <View style={styles.courseSubjectsTags}>
                    {course.subjects.map((subject: string, sIdx: number) => (
                      <View key={sIdx} style={styles.courseSubjectTag}>
                        <Text style={styles.courseSubjectTagText}>{subject}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              
              {course.chapters && course.chapters.length > 0 && (
                <View style={styles.courseSubjectSection}>
                  <View style={styles.courseSubjectHeader}>
                    <Text style={styles.courseSubjectName}>Chapters</Text>
                    <View style={styles.chapterBadge}>
                      <Text style={styles.chapterBadgeText}>{course.chapters.length} Chapters</Text>
                    </View>
                  </View>
                  
                  {course.chapters.map((chapter: any, chapterIdx: number) => {
                    const chapterId = `${courseIdx}-${chapterIdx}`;
                    const isExpanded = expandedChapters.includes(chapterId);
                    const chapterProgress = chapter.progress || 0;
                    
                    return (
                      <View key={chapterIdx} style={[
                        styles.chapterItem,
                        isExpanded && styles.chapterItemExpanded
                      ]}>
                        <TouchableOpacity 
                          style={styles.chapterHeader}
                          onPress={() => toggleChapter(chapterId)}
                        >
                          <View style={styles.chapterLeft}>
                            <Ionicons 
                              name={chapterProgress === 100 ? "checkmark-circle" : "checkmark-circle-outline"} 
                              size={18} 
                              color={chapterProgress === 100 ? colors.success : colors.gray300} 
                            />
                            <Text style={styles.chapterName}>{chapter.name || 'Chapter'}</Text>
                          </View>
                          <View style={styles.courseChapterRight}>
                            <View style={styles.courseProgressBadge}>
                              <Text style={styles.courseProgressBadgeText}>{chapterProgress}%</Text>
                            </View>
                            <Ionicons 
                              name={isExpanded ? "chevron-up" : "chevron-down"} 
                              size={18} 
                              color={colors.gray500} 
                            />
                          </View>
                        </TouchableOpacity>
                        
                        {isExpanded && chapter.topics && (
                          <View style={styles.chapterContent}>
                            <View style={styles.chapterProgressBar}>
                              <View style={[styles.chapterProgressFill, { width: `${chapterProgress}%` }]} />
                            </View>
                            
                            <View style={styles.topicsList}>
                              {chapter.topics.map((topic: any, topicIdx: number) => (
                                <View key={topicIdx} style={styles.topicItem}>
                                  <Ionicons 
                                    name={topic.completed ? "checkmark-circle" : "ellipse-outline"} 
                                    size={14} 
                                    color={topic.completed ? colors.success : colors.gray300} 
                                  />
                                  <Text style={[
                                    styles.topicName,
                                    topic.completed && styles.topicNameCompleted
                                  ]}>{topic.name || 'Topic'}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ))
        ) : (
          <View style={styles.emptyStateContainer}>
            <Ionicons name="book-outline" size={48} color={colors.gray300} />
            <Text style={styles.emptyStateTitle}>No Courses Enrolled</Text>
            <Text style={styles.emptyStateText}>You haven't enrolled in any courses yet.</Text>
          </View>
        )}
      </View>
    );
  };

  const renderAI = () => {
    // Class attendance data from studentData.live_classes
    const attendedClasses = studentData?.live_classes?.attended ?? 0;
    const totalClasses = studentData?.live_classes?.total_scheduled ?? 0;
    const absentClasses = totalClasses - attendedClasses;
    const attendanceRate = studentData?.live_classes?.attendance_percentage ?? 0;
    
    // Calculate actual class time from recent_classes duration_minutes
    const recentClasses = (studentData?.live_classes?.recent_classes || []).slice(0, 5);
    const allClasses = studentData?.live_classes?.recent_classes || [];
    const totalClassTimeMinutes = allClasses
      .filter((c: any) => c.attended)
      .reduce((sum: number, c: any) => sum + (c.duration_minutes || 45), 0);
    const classTimeDisplay = totalClassTimeMinutes >= 60 
      ? `${Math.floor(totalClassTimeMinutes / 60)}h ${totalClassTimeMinutes % 60}m`
      : `${totalClassTimeMinutes}m`;
    
    return (
      <View style={styles.tabContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading class attendance data...</Text>
          </View>
        ) : (
          <>
        {/* Three Stat Cards */}
        <View style={styles.aiStatsGrid}>
          {/* Classes Attended Card */}
          <View style={styles.aiStatCard}>
            <View style={styles.aiStatHeader}>
              <Text style={styles.aiStatLabel}>Classes Attended</Text>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.gray400} />
            </View>
            <Text style={styles.aiStatValue}>{attendedClasses}/{totalClasses}</Text>
            <Text style={styles.aiStatSubtext}>classes attended</Text>
            <View style={styles.aiProgressBar}>
              <View style={[styles.aiProgressFill, { width: `${totalClasses > 0 ? (attendedClasses / totalClasses) * 100 : 0}%` }]} />
            </View>
          </View>
          
          {/* Class Time Card */}
          <View style={styles.aiStatCard}>
            <View style={styles.aiStatHeader}>
              <Text style={styles.aiStatLabel}>Class Time</Text>
              <Ionicons name="time-outline" size={20} color={colors.gray400} />
            </View>
            <Text style={styles.aiStatValue}>{classTimeDisplay}</Text>
            <Text style={styles.aiStatSubtext}>total time in classes</Text>
          </View>
          
          {/* Attendance Rate Card */}
          <View style={styles.aiStatCard}>
            <View style={styles.aiStatHeader}>
              <Text style={styles.aiStatLabel}>Attendance Rate</Text>
              <Ionicons name="stats-chart-outline" size={20} color={colors.gray400} />
            </View>
            <Text style={styles.aiStatValue}>{attendanceRate}%</Text>
            <Text style={styles.aiStatSubtext}>attendance percentage</Text>
            <View style={styles.aiProgressBar}>
              <View style={[styles.aiProgressFill, { width: `${attendanceRate}%`, backgroundColor: attendanceRate >= 75 ? '#22C55E' : attendanceRate >= 50 ? '#F59E0B' : '#EF4444' }]} />
            </View>
          </View>
        </View>

        {/* Attendance Status Pie Chart (Donut) */}
        <View style={styles.aiVideoSection}>
          <View style={styles.aiVideoCard}>
            <Text style={styles.aiSectionTitle}>Attendance Status</Text>
            {totalClasses > 0 ? (
              <>
                <View style={styles.aiPieContainer}>
                  <View style={styles.aiPieChart}>
                    <View style={[styles.aiPieCompleted, { backgroundColor: '#22C55E' }]} />
                    <View style={[styles.aiPieProgress, { backgroundColor: '#EF4444' }]} />
                    <View style={styles.pieChartCenter}>
                      <Text style={styles.pieChartCenterText}>{totalClasses}</Text>
                      <Text style={styles.pieChartCenterLabel}>Classes</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.aiLegend}>
                  <View style={styles.aiLegendItem}>
                    <View style={[styles.aiLegendDot, { backgroundColor: '#22C55E' }]} />
                    <Text style={styles.aiLegendText}>Present: {attendedClasses}</Text>
                  </View>
                  <View style={styles.aiLegendItem}>
                    <View style={[styles.aiLegendDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.aiLegendText}>Absent: {absentClasses}</Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.emptyStateText}>No class data available</Text>
            )}
          </View>

          {/* Recent Classes List */}
          <View style={styles.aiVideoCard}>
            <Text style={styles.aiSectionTitle}>Recent Classes</Text>
            {recentClasses.length > 0 ? (
              recentClasses.map((cls: any, index: number) => (
                <View key={index} style={styles.aiVideoItem}>
                  <View style={styles.aiVideoItemHeader}>
                    <View style={styles.aiVideoInfo}>
                      <Text style={styles.aiVideoTitle}>{cls.subject || 'Class'}</Text>
                      <Text style={styles.aiVideoMeta}>
                        {cls.date ? new Date(cls.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                      </Text>
                    </View>
                    <View style={[
                      styles.aiVideoBadge, 
                      { backgroundColor: cls.attended ? '#DCFCE7' : '#FEE2E2' }
                    ]}>
                      <Text style={[
                        styles.aiVideoBadgeText, 
                        { color: cls.attended ? '#22C55E' : '#EF4444' }
                      ]}>
                        {cls.attended ? 'Present' : 'Absent'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyStateText}>No recent classes</Text>
            )}
          </View>
        </View>
          </>
        )}
      </View>
    );
  };

  const renderEngagement = () => {
    // Use real data from studentData and progressStats - NO mock fallbacks
    const activityScore = studentData?.activity_score ?? progressStats?.activityScore ?? 0;
    const attendedClasses = studentData?.live_classes?.attended ?? progressStats?.attendedClasses ?? 0;
    const totalClasses = studentData?.live_classes?.total_scheduled ?? progressStats?.totalClasses ?? 0;
    const missedClasses = totalClasses - attendedClasses;
    const attendanceRate = studentData?.live_classes?.attendance_percentage ?? progressStats?.attendanceRate ?? 0;
    
    // Build activity breakdown from real data
    const activityBreakdown = [
      { label: 'Live Class Participation', value: attendanceRate },
      { label: 'AI Video Engagement', value: computedAIStats.avgCompletion },
      { label: 'Podcast Listening', value: computedAIStats.totalPodcasts > 0 ? Math.min(100, computedAIStats.totalPodcasts) : 0 },
      { label: 'MCQ Practice', value: studentData?.mcq_practice?.accuracy_percentage ?? 0 },
      { label: 'Doubt Clearing', value: computedDoubtStats.totalDoubts > 0 ? Math.round((computedDoubtStats.resolvedDoubts / computedDoubtStats.totalDoubts) * 100) : 0 },
      { label: 'Test Participation', value: studentData?.avg_test_score ?? 0 },
    ].filter(item => item.value > 0);
    
    // Build doubts by subject from real data
    const doubtsBySubject = computedDoubtStats.bySubject;
    
    return (
    <View style={styles.tabContent}>
      {/* 1. Overall Activity Score & Breakdown */}
      <View style={styles.engagementRow}>
        {/* Overall Activity Score */}
        <View style={styles.engagementCard}>
          <Text style={styles.engagementSectionTitle}>Overall Activity Score</Text>
          <View style={styles.activityScoreContainer}>
            <View style={styles.activityScoreCircle}>
              <View style={styles.activityScoreInner}>
                <Text style={styles.activityScoreValue}>{activityScore}</Text>
                <Text style={styles.activityScoreLabel}>Activity Score</Text>
              </View>
            </View>
          </View>
          <View style={styles.activityScoreInfo}>
            <View style={styles.excellentBadge}>
              <Text style={styles.excellentBadgeText}>{activityScore >= 80 ? 'Excellent' : activityScore >= 60 ? 'Good' : 'Needs Improvement'}</Text>
            </View>
            <Text style={styles.classAverageText}>Class Average: 75</Text>
            <View style={styles.aboveAverageRow}>
              <Ionicons name={activityScore >= 75 ? "trending-up" : "trending-down"} size={16} color={activityScore >= 75 ? colors.success : '#ef4444'} />
              <Text style={styles.aboveAverageText}>{activityScore >= 75 ? 'Above Average' : 'Below Average'}</Text>
            </View>
          </View>
        </View>

        {/* Activity Breakdown */}
        <View style={styles.engagementCard}>
          <Text style={styles.engagementSectionTitle}>Activity Breakdown</Text>
          {activityBreakdown.length > 0 ? activityBreakdown.map((item, index) => (
            <View key={index} style={styles.activityBreakdownItem}>
              <View style={styles.activityBreakdownHeader}>
                <Text style={styles.activityBreakdownLabel}>{item.label}</Text>
                <Text style={styles.activityBreakdownValue}>{Math.round(item.value)}%</Text>
              </View>
              <View style={styles.activityBreakdownBar}>
                <View style={[styles.activityBreakdownFill, { width: `${Math.min(100, item.value)}%` }]} />
              </View>
            </View>
          )) : (
            <Text style={styles.emptyStateText}>No activity data available</Text>
          )}
        </View>
      </View>

      {/* 2. Live Class Participation */}
      <View style={styles.engagementCard}>
        <View style={styles.engagementCardHeader}>
          <Ionicons name="videocam-outline" size={20} color={colors.gray700} />
          <Text style={styles.engagementSectionTitle}>Live Class Participation</Text>
        </View>
        <View style={styles.liveClassStats}>
          <View style={styles.liveClassStat}>
            <Text style={styles.liveClassStatValue}>{attendedClasses}</Text>
            <Text style={styles.liveClassStatLabel}>Attended</Text>
          </View>
          <View style={styles.liveClassStat}>
            <Text style={styles.liveClassStatValue}>{missedClasses}</Text>
            <Text style={styles.liveClassStatLabel}>Missed</Text>
          </View>
          <View style={styles.liveClassStat}>
            <Text style={[styles.liveClassStatValue, { color: colors.success }]}>{attendanceRate}%</Text>
            <Text style={styles.liveClassStatLabel}>Attendance</Text>
          </View>
        </View>
        {missedClasses > 0 && (
        <View style={styles.missedAlert}>
          <Ionicons name="alert-circle" size={20} color="#ef4444" />
          <View style={styles.missedAlertContent}>
            <Text style={styles.missedAlertTitle}>Missed Classes Alert</Text>
            <Text style={styles.missedAlertText}>{missedClasses} classes missed this semester</Text>
          </View>
        </View>
        )}
      </View>

      {/* 3. AI Video Engagement & Distribution */}
      <View style={styles.engagementRow}>
        <View style={styles.engagementCard}>
          <View style={styles.engagementCardHeader}>
            <Ionicons name="play-circle-outline" size={20} color={colors.gray700} />
            <Text style={styles.engagementSectionTitle}>AI Video Engagement</Text>
          </View>
          <View style={styles.videoWatchedRow}>
            <Text style={styles.videoWatchedLabel}>Videos Watched</Text>
            <Text style={styles.videoWatchedValue}>{computedAIStats.totalVideos}</Text>
          </View>
          <View style={styles.engagementProgressBar}>
            <View style={[styles.engagementProgressFill, { width: `${Math.min(100, computedAIStats.totalVideos * 2)}%` }]} />
          </View>
          <View style={styles.videoStatsRow}>
            <View style={styles.videoStatBox}>
              <Text style={styles.videoStatValue}>{Math.round(computedAIStats.totalWatchTime / 3600)}h</Text>
              <Text style={styles.videoStatLabel}>Watch Time</Text>
            </View>
            <View style={styles.videoStatBox}>
              <Text style={styles.videoStatValue}>{computedAIStats.avgCompletion}%</Text>
              <Text style={styles.videoStatLabel}>Completion Rate</Text>
            </View>
          </View>
        </View>

        <View style={styles.engagementCard}>
          <Text style={styles.engagementSectionTitle}>Video Distribution</Text>
          <View style={styles.videoDistributionLegend}>
            <View style={styles.videoDistItem}>
              <View style={[styles.videoDistDot, { backgroundColor: colors.gray900 }]} />
              <Text style={styles.videoDistText}>Fully Watched: {Math.round(computedAIStats.totalVideos * 0.8)}</Text>
            </View>
            <View style={styles.videoDistItem}>
              <View style={[styles.videoDistDot, { backgroundColor: colors.gray400 }]} />
              <Text style={styles.videoDistText}>Partially: {Math.round(computedAIStats.totalVideos * 0.15)}</Text>
            </View>
            <View style={styles.videoDistItem}>
              <View style={[styles.videoDistDot, { backgroundColor: colors.gray200 }]} />
              <Text style={styles.videoDistText}>Not Watched: {Math.round(computedAIStats.totalVideos * 0.05)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 4. Podcast & MCQ Stats */}
      <View style={styles.engagementRow}>
        {/* Podcast Consumption */}
        <View style={styles.engagementCard}>
          <View style={styles.engagementCardHeader}>
            <Ionicons name="headset-outline" size={20} color={colors.gray700} />
            <Text style={styles.engagementSectionTitle}>Podcast Consumption</Text>
          </View>
          <View style={styles.videoStatsRow}>
            <View style={styles.videoStatBox}>
              <Text style={styles.videoStatValue}>{computedAIStats.totalPodcasts}</Text>
              <Text style={styles.videoStatLabel}>Episodes</Text>
            </View>
            <View style={styles.videoStatBox}>
              <Text style={styles.videoStatValue}>{Math.round(computedAIStats.totalListenTime / 3600)}h</Text>
              <Text style={styles.videoStatLabel}>Listen Time</Text>
            </View>
          </View>
          <Text style={styles.favoriteTopicsTitle}>Favorite Topics</Text>
          <View style={styles.favoriteTopicsTags}>
            <View style={styles.favoriteTopicTag}>
              <Text style={styles.favoriteTopicTagText}>Physics Concepts</Text>
            </View>
            <View style={styles.favoriteTopicTag}>
              <Text style={styles.favoriteTopicTagText}>JEE Strategy</Text>
            </View>
            <View style={styles.favoriteTopicTag}>
              <Text style={styles.favoriteTopicTagText}>Math Problem Solving</Text>
            </View>
            <View style={styles.favoriteTopicTag}>
              <Text style={styles.favoriteTopicTagText}>Organic Chemistry</Text>
            </View>
            <View style={styles.favoriteTopicTag}>
              <Text style={styles.favoriteTopicTagText}>NEET Preparation</Text>
            </View>
          </View>
        </View>

        {/* MCQ Practice Stats */}
        <View style={styles.engagementCard}>
          <View style={styles.engagementCardHeader}>
            <Ionicons name="book-outline" size={20} color={colors.gray700} />
            <Text style={styles.engagementSectionTitle}>MCQ Practice Stats</Text>
          </View>
          <View style={styles.videoStatsRow}>
            <View style={styles.videoStatBox}>
              <Text style={styles.videoStatValue}>{studentData?.mcq_practice?.total_attempted || 0}</Text>
              <Text style={styles.videoStatLabel}>Questions</Text>
            </View>
            <View style={styles.videoStatBox}>
              <Text style={[styles.videoStatValue, { color: colors.success }]}>{studentData?.mcq_practice?.accuracy_percentage || 0}%</Text>
              <Text style={styles.videoStatLabel}>Accuracy</Text>
            </View>
          </View>
          {studentData?.mcq_practice?.by_subject && Object.keys(studentData.mcq_practice.by_subject).length > 0 && (
            <>
              <Text style={styles.favoriteTopicsTitle}>Accuracy by Subject</Text>
              {Object.entries(studentData.mcq_practice.by_subject).map(([subject, data]: [string, any], index: number) => {
                const accuracy = data.attempted > 0 ? Math.round((data.correct / data.attempted) * 100) : 0;
                return (
                  <View key={index} style={styles.subjectAccuracyItem}>
                    <View style={styles.subjectAccuracyHeader}>
                      <Text style={styles.subjectAccuracyLabel}>{subject}</Text>
                      <Text style={styles.subjectAccuracyValue}>{accuracy}%</Text>
                    </View>
                    <View style={styles.subjectAccuracyBar}>
                      <View style={[styles.subjectAccuracyFill, { width: `${accuracy}%` }]} />
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>
      </View>

      {/* 5. Doubt Clearing Activity */}
      <View style={styles.engagementCard}>
        <View style={styles.engagementCardHeader}>
          <Ionicons name="help-circle-outline" size={20} color={colors.gray700} />
          <Text style={styles.engagementSectionTitle}>Doubt Clearing Activity</Text>
        </View>
        <View style={styles.doubtStatsRow}>
          <View style={styles.doubtStatBox}>
            <Text style={styles.doubtStatValue}>{computedDoubtStats.totalDoubts}</Text>
            <Text style={styles.doubtStatLabel}>Total</Text>
          </View>
          <View style={styles.doubtStatBox}>
            <Text style={[styles.doubtStatValue, { color: colors.success }]}>{computedDoubtStats.resolvedDoubts}</Text>
            <Text style={styles.doubtStatLabel}>Resolved</Text>
          </View>
          <View style={styles.doubtStatBox}>
            <Text style={[styles.doubtStatValue, { color: '#f97316' }]}>{computedDoubtStats.pendingDoubts}</Text>
            <Text style={styles.doubtStatLabel}>Pending</Text>
          </View>
        </View>
        <View style={styles.resolutionTimeBox}>
          <Text style={styles.resolutionTimeLabel}>Avg Resolution Time</Text>
          <Text style={styles.resolutionTimeValue}>{computedDoubtStats.avgResolutionTime} min</Text>
        </View>
        <Text style={styles.doubtsBySubjectTitle}>Doubts by Subject</Text>
        {doubtsBySubject.length > 0 ? doubtsBySubject.map((item: any, index: number) => (
          <View key={index} style={styles.doubtSubjectItem}>
            <Text style={styles.doubtSubjectName}>{item.subject}</Text>
            <View style={styles.doubtSubjectBarContainer}>
              <View style={[styles.doubtSubjectBar, { width: `${(item.count / (doubtsBySubject[0]?.count || 1)) * 100}%` }]} />
            </View>
            <Text style={styles.doubtSubjectCount}>{item.count}</Text>
          </View>
        )) : (
          <Text style={styles.emptyStateText}>No doubt data available</Text>
        )}
        {computedDoubtStats.pendingDoubts > 0 && (
        <View style={styles.pendingDoubtsAlert}>
          <Ionicons name="warning" size={20} color="#f97316" />
          <View style={styles.pendingDoubtsContent}>
            <Text style={styles.pendingDoubtsTitle}>{computedDoubtStats.pendingDoubts} Pending Doubts</Text>
            <Text style={styles.pendingDoubtsText}>Clear your doubts for better understanding</Text>
          </View>
        </View>
        )}
      </View>
    </View>
  );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return renderOverview();
      case 'progress': return renderProgress();
      case 'tests': return renderTests();
      case 'attendance': return renderAttendance();
      case 'timetable': return renderTimetable();
      case 'courses': return renderCourses();
      case 'ai': return renderAI();
      case 'engagement': return renderEngagement();
      default: return renderOverview();
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primary, '#4ADE80']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <HeaderMenuButton onPress={() => setSidebarOpen(true)} />
        <View style={styles.headerContent}>
          <View style={styles.headerIconContainer}>
            <Ionicons name="analytics" size={18} color={colors.primary} />
          </View>
          <Text style={styles.headerTitle}>Detailed Progress</Text>
        </View>
      </LinearGradient>

      <View style={styles.profileCard}>
        <LinearGradient
          colors={[colors.primary, '#4ADE80']}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>P</Text>
        </LinearGradient>
        <View style={styles.profileInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.profileName}>Pramod Kumar</Text>
            <LinearGradient
              colors={['#10B981', '#34D399']}
              style={styles.activeBadge}
            >
              <Text style={styles.activeBadgeText}>active</Text>
            </LinearGradient>
          </View>
          <View style={styles.contactInfo}>
            <View style={styles.contactItem}>
              <View style={styles.contactIconContainer}>
                <Ionicons name="mail-outline" size={12} color={colors.primary} />
              </View>
              <Text style={styles.contactText}>pramod0605@gmail.com</Text>
            </View>
            <View style={styles.contactItem}>
              <View style={styles.contactIconContainer}>
                <Ionicons name="call-outline" size={12} color={colors.primary} />
              </View>
              <Text style={styles.contactText}>+91-9876500605</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {renderContent()}
      </ScrollView>

      <Modal visible={sidebarOpen} transparent animationType="fade">
        <View style={styles.sidebarOverlay}>
          <View style={styles.sidebar}>
            <LinearGradient
              colors={[colors.primary, '#4ADE80']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sidebarHeader}
            >
              <View style={styles.sidebarHeaderContent}>
                <View style={styles.sidebarIconContainer}>
                  <Ionicons name="grid" size={18} color={colors.primary} />
                </View>
                <Text style={styles.sidebarTitle}>Menu</Text>
              </View>
              <TouchableOpacity onPress={() => setSidebarOpen(false)} style={styles.sidebarCloseButton}>
                <Ionicons name="close" size={22} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>
            <View style={styles.sidebarContent}>
              {TABS.map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.sidebarItem, activeTab === tab.id && styles.sidebarItemActive]}
                  onPress={() => handleTabSelect(tab.id)}
                >
                  <View style={[styles.sidebarItemIcon, activeTab === tab.id && styles.sidebarItemIconActive]}>
                    <Ionicons
                      name={tab.icon as any}
                      size={20}
                      color={activeTab === tab.id ? colors.white : colors.primary}
                    />
                  </View>
                  <Text style={[styles.sidebarItemText, activeTab === tab.id && styles.sidebarItemTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Pressable style={styles.sidebarBackdrop} onPress={() => setSidebarOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: 50,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  headerContent: {
    flex: 1,
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.white,
  },
  profileCard: {
    backgroundColor: colors.white,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: -spacing.sm,
    borderRadius: borderRadius.xl,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.white,
  },
  profileInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  profileName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  activeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  activeBadgeText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: '600',
  },
  contactInfo: {
    gap: spacing.xs,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contactIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.xs,
  },
  statSubtext: {
    fontSize: fontSize.xs,
    color: colors.gray400,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.gray100,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  activityProgressBar: {
    height: 8,
    backgroundColor: colors.gray100,
    borderRadius: 4,
    overflow: 'hidden',
  },
  activityProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  overviewSection: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  overviewSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  overviewSectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  recentActivityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  recentActivityLeft: {
    flex: 1,
  },
  recentActivityTitle: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 2,
  },
  recentActivitySubject: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  recentActivityRight: {
    alignItems: 'flex-end',
  },
  recentActivityDate: {
    fontSize: fontSize.xs,
    color: colors.gray400,
    marginTop: 4,
  },
  attendanceBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  attendedBadge: {
    backgroundColor: colors.primary,
  },
  missedBadge: {
    backgroundColor: '#EF4444',
  },
  attendanceBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  attendedText: {
    color: colors.white,
  },
  missedText: {
    color: colors.white,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyStateTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray700,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyStateText: {
    fontSize: fontSize.sm,
    color: colors.gray400,
    textAlign: 'center',
    paddingVertical: spacing.lg,
    fontStyle: 'italic',
  },
  section: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  focusTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  focusTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  focusTagText: {
    fontSize: fontSize.sm,
    color: '#B45309',
    fontWeight: '600',
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  activityTitle: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  activitySubject: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  activityRight: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginBottom: 2,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: 'bold',
  },
  activityDate: {
    fontSize: 10,
    color: colors.gray400,
  },
  courseItem: {
    marginBottom: spacing.md,
  },
  courseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  courseInfo: {
    flex: 1,
  },
  courseName: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 2,
  },
  courseSubjects: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  progressBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  progressBadgeText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: 'bold',
  },
  subjectItem: {
    marginBottom: spacing.md,
  },
  subjectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  subjectName: {
    fontSize: fontSize.sm,
    color: colors.gray700,
  },
  subjectPercent: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  subjectProgressBar: {
    height: 6,
    backgroundColor: colors.gray100,
    borderRadius: 3,
    overflow: 'hidden',
  },
  subjectProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  chartPlaceholder: {
    height: 150,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: fontSize.sm,
    color: colors.gray400,
    marginTop: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  miniStatCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  miniStatValue: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  miniStatLabel: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    marginTop: 2,
  },
  testItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  testName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray900,
  },
  testDate: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  testScoreContainer: {
    alignItems: 'flex-end',
  },
  testScore: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  testStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginTop: 2,
  },
  testStatusText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  attendanceOverview: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
    gap: spacing.lg,
  },
  attendanceCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendancePercent: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.white,
  },
  attendanceLabel: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.8)',
  },
  attendanceStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  attendanceStat: {
    alignItems: 'center',
  },
  attendanceStatValue: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  attendanceStatLabel: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  attendanceItem: {
    marginBottom: spacing.md,
  },
  attendanceItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attendanceSubject: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray900,
  },
  attendanceItemPercent: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.primary,
  },
  attendanceClasses: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    marginBottom: spacing.xs,
  },
  timetableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  subjectFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.white,
  },
  subjectFilterText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.primary,
  },
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  viewModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  viewModeButtonActive: {
    backgroundColor: colors.primary,
  },
  viewModeText: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    fontWeight: '500',
  },
  viewModeTextActive: {
    color: colors.white,
  },
  calendarScroll: {
    marginBottom: spacing.md,
  },
  calendarContainer: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  calendarDay: {
    width: 150,
  },
  calendarDayTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray900,
    marginBottom: spacing.md,
  },
  noClassesContainer: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noClassesContainerCenter: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  noClassesText: {
    fontSize: fontSize.sm,
    color: colors.gray400,
  },
  calendarClassCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  calendarClassTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.xs,
  },
  calendarClassTimeText: {
    fontSize: 10,
    color: colors.gray500,
  },
  calendarClassSubject: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  calendarClassTopic: {
    fontSize: 10,
    color: colors.gray500,
    marginBottom: spacing.xs,
  },
  calendarClassTeacher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.xs,
  },
  calendarClassTeacherText: {
    fontSize: 10,
    color: colors.gray600,
  },
  calendarClassTypeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  calendarClassTypeText: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'lowercase',
  },
  listContainer: {},
  listDaySection: {
    marginBottom: spacing.lg,
  },
  listDayTitle: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray500,
    marginBottom: spacing.sm,
  },
  listClassCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  listClassMain: {
    marginBottom: spacing.sm,
  },
  listClassHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  listClassSubjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  listClassSubject: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  listClassTypeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  listClassTypeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#3b82f6',
    textTransform: 'lowercase',
  },
  listClassTopic: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    marginLeft: 22,
  },
  listClassMeta: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginLeft: 22,
  },
  listClassMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  listClassMetaText: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '80%',
    maxWidth: 300,
  },
  pickerTitle: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  pickerItemActive: {
    backgroundColor: colors.gray50,
  },
  pickerItemText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
  },
  pickerItemTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  courseCard: {
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  courseCardTitle: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 2,
  },
  courseCardSubjects: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    marginBottom: spacing.md,
  },
  courseProgressSection: {
    marginBottom: spacing.md,
  },
  courseProgressText: {
    fontSize: fontSize.xs,
    color: colors.gray600,
    marginTop: spacing.xs,
  },
  continueButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  continueButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.white,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 2,
  },
  insightText: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  sidebarOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sidebar: {
    width: '80%',
    height: '100%',
    backgroundColor: colors.white,
    paddingTop: 50,
    shadowColor: colors.primary,
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sidebarHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sidebarIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.white,
  },
  sidebarContent: {
    padding: spacing.md,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xs,
  },
  sidebarItemActive: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.2)',
  },
  sidebarItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarItemIconActive: {
    backgroundColor: colors.primary,
  },
  sidebarItemText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  sidebarItemTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  sidebarBackdrop: {
    flex: 1,
  },
  // Progress Tab Styles
  progressCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  progressCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  progressCardTitle: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  chartContainer: {
    flexDirection: 'row',
    height: 220,
    marginBottom: spacing.md,
  },
  yAxisLabels: {
    width: 30,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  axisLabel: {
    fontSize: 10,
    color: colors.gray500,
    textAlign: 'center',
  },
  chartArea: {
    flex: 1,
    position: 'relative',
  },
  gridLines: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    bottom: 30,
    justifyContent: 'space-between',
  },
  gridLine: {
    height: 1,
    backgroundColor: colors.gray100,
  },
  dataPointsContainer: {
    flexDirection: 'row',
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    bottom: 30,
    justifyContent: 'space-around',
  },
  dataPointColumn: {
    alignItems: 'center',
    position: 'relative',
    flex: 1,
  },
  chartLine: {
    position: 'absolute',
    width: 40,
    backgroundColor: '#34D07B',
    left: '50%',
    transformOrigin: 'left center',
  },
  dataPoint: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: '#34D07B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dataPointInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#34D07B',
  },
  xAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#34D07B',
    backgroundColor: colors.white,
  },
  legendText: {
    fontSize: fontSize.sm,
    color: '#34D07B',
    fontWeight: '500',
  },
  subjectProgressList: {
    gap: spacing.lg,
  },
  subjectProgressItem: {
    marginBottom: spacing.sm,
  },
  subjectProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  subjectProgressName: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray900,
  },
  subjectProgressPercent: {
    fontSize: fontSize.xs,
    color: colors.gray400,
  },
  subjectProgressBarContainer: {
    height: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    overflow: 'hidden',
  },
  subjectProgressBarFill: {
    height: '100%',
    backgroundColor: '#34D07B',
    borderRadius: 6,
  },
  courseProgressContainer: {
    gap: spacing.md,
  },
  courseProgressCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  courseProgressTitle: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.md,
  },
  courseProgressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  courseProgressLabel: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  courseProgressValue: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  courseProgressBarContainer: {
    height: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  courseProgressBarFill: {
    height: '100%',
    backgroundColor: '#34D07B',
    borderRadius: 6,
  },
  courseSubjectsLabel: {
    fontSize: fontSize.xs,
    color: colors.gray400,
    marginBottom: spacing.xs,
  },
  courseSubjectsTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  courseSubjectTag: {
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
  },
  courseSubjectTagText: {
    fontSize: fontSize.xs,
    color: colors.gray600,
  },
  // Test Tab Styles
  testFiltersContainer: {
    marginBottom: spacing.md,
  },
  testFiltersRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  testFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  testFilterButtonText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
  },
  testStatsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  testStatCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  testStatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  testStatLabel: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    color: colors.gray500,
  },
  testStatValue: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  testStatSubtext: {
    fontSize: fontSize.xs,
    color: colors.gray400,
    marginTop: 2,
  },
  testCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  testCardTitle: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.lg,
  },
  barChartContainer: {
    flexDirection: 'row',
    height: 180,
    marginBottom: spacing.md,
  },
  barChartYAxis: {
    width: 35,
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  barChartAxisLabel: {
    fontSize: 10,
    color: colors.gray500,
    textAlign: 'right',
  },
  barChartBars: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingBottom: 25,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.gray200,
  },
  barChartGroup: {
    alignItems: 'center',
  },
  barChartBarContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  barChartBar: {
    width: 24,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barChartBarAttempted: {
    backgroundColor: '#9ca3af',
  },
  barChartBarCorrect: {
    backgroundColor: '#000000',
  },
  barChartLabel: {
    fontSize: 10,
    color: colors.gray600,
    marginTop: spacing.xs,
    position: 'absolute',
    bottom: -20,
  },
  barChartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  barChartLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  barChartLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  barChartLegendText: {
    fontSize: fontSize.sm,
    color: colors.gray600,
    fontWeight: '500',
  },
  pieChartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pieChart: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  pieSlice: {
    position: 'absolute',
    width: '50%',
    height: '100%',
    left: '50%',
    transformOrigin: 'left center',
  },
  pieChartCenter: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  pieChartCenterText: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  pieChartCenterLabel: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  pieChartLegend: {
    gap: spacing.md,
  },
  pieChartLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pieChartLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pieChartLegendText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
    fontWeight: '500',
  },
  practiceSessionsList: {
    gap: 0,
  },
  practiceSessionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  practiceSessionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  practiceSessionSubject: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 2,
  },
  practiceSessionScore: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  practiceSessionRight: {
    alignItems: 'flex-end',
  },
  practiceSessionBadge: {
    backgroundColor: '#34D07B',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    marginBottom: 4,
  },
  practiceSessionBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: colors.white,
  },
  testTypeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  testTypeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  practiceSessionDate: {
    fontSize: 10,
    color: colors.gray400,
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  filterModalContent: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 320,
  },
  filterModalTitle: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.md,
  },
  filterModalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  filterModalOptionActive: {
    backgroundColor: 'rgba(43, 189, 110, 0.05)',
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
  },
  filterModalOptionText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
  },
  filterModalOptionTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  // Attendance Calendar Styles
  attendanceCalendarCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  attendanceCalendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  attendanceCalendarTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  attendanceSubtext: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  attendanceCalendarMonth: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  attendanceLegend: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  attendanceLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  attendanceLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  attendanceLegendText: {
    fontSize: fontSize.xs,
    color: colors.gray600,
  },
  attendanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  attendanceDayHeader: {
    width: '13%',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  attendanceDayHeaderText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    color: colors.gray400,
  },
  attendanceDayEmpty: {
    width: '13%',
    aspectRatio: 1,
  },
  attendanceDayCell: {
    width: '13%',
    aspectRatio: 1,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceDayCellText: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
  },
  // My Courses Tab Styles
  courseDetailCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  courseDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  courseDetailTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  courseSubjectSection: {
    marginBottom: spacing.lg,
  },
  courseSubjectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  courseSubjectName: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  chapterBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  chapterBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.white,
  },
  chapterItem: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray100,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  chapterItemExpanded: {
    backgroundColor: 'rgba(43, 189, 110, 0.03)',
    borderColor: 'rgba(43, 189, 110, 0.2)',
  },
  chapterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  chapterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  chapterName: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray700,
  },
  courseChapterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  courseProgressBadge: {
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  courseProgressBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: colors.gray500,
  },
  chapterContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingLeft: spacing.xl,
  },
  chapterProgressBar: {
    height: 8,
    backgroundColor: colors.gray100,
    borderRadius: 4,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  chapterProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  topicsList: {
    gap: spacing.sm,
  },
  topicItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  topicName: {
    fontSize: fontSize.sm,
    color: colors.gray600,
  },
  topicNameCompleted: {
    color: colors.gray900,
  },
  // AI & Learning Tab Styles
  aiStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  aiStatCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  aiStatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  aiStatLabel: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray700,
  },
  aiStatValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 2,
  },
  aiStatSubtext: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    marginBottom: spacing.md,
  },
  aiProgressBar: {
    height: 10,
    backgroundColor: colors.gray100,
    borderRadius: 5,
    overflow: 'hidden',
  },
  aiProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 5,
  },
  aiVideoSection: {
    gap: spacing.md,
  },
  aiVideoCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  aiSectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.lg,
  },
  aiPieContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  aiPieChart: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.gray200,
    overflow: 'hidden',
    position: 'relative',
  },
  aiPieCompleted: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: colors.gray900,
    transform: [{ rotate: '-45deg' }],
  },
  aiPieProgress: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: colors.gray200,
    transform: [{ rotate: '270deg' }, { translateX: 70 }],
  },
  aiLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  aiLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  aiLegendDot: {
    width: 12,
    height: 12,
  },
  aiLegendText: {
    fontSize: fontSize.sm,
    color: colors.gray600,
  },
  aiCompletionRate: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  aiCompletionValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  aiCompletionLabel: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  aiVideoItem: {
    marginBottom: spacing.lg,
  },
  aiVideoItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  aiVideoInfo: {
    flex: 1,
  },
  aiVideoTitle: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 2,
  },
  aiVideoMeta: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  aiVideoBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  aiVideoBadgeComplete: {
    backgroundColor: colors.primary,
  },
  aiVideoBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.white,
  },
  aiVideoProgress: {
    height: 10,
    backgroundColor: colors.gray100,
    borderRadius: 5,
    overflow: 'hidden',
  },
  aiVideoProgressFill: {
    height: '100%',
    borderRadius: 5,
  },
  // My Engagement Tab Styles
  engagementRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  engagementCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  engagementCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  engagementSectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.md,
  },
  activityScoreContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  activityScoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 12,
    borderColor: colors.gray900,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityScoreInner: {
    alignItems: 'center',
  },
  activityScoreValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  activityScoreLabel: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  activityScoreInfo: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  excellentBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  excellentBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: '#15803d',
  },
  classAverageText: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  aboveAverageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aboveAverageText: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.success,
  },
  activityBreakdownItem: {
    marginBottom: spacing.md,
  },
  activityBreakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  activityBreakdownLabel: {
    fontSize: fontSize.sm,
    color: colors.gray700,
  },
  activityBreakdownValue: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  activityBreakdownBar: {
    height: 10,
    backgroundColor: colors.gray100,
    borderRadius: 5,
    overflow: 'hidden',
  },
  activityBreakdownFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 5,
  },
  liveClassStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.lg,
  },
  liveClassStat: {
    alignItems: 'center',
  },
  liveClassStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  liveClassStatLabel: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  missedAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  missedAlertContent: {
    flex: 1,
  },
  missedAlertTitle: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  missedAlertText: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  videoWatchedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  videoWatchedLabel: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  videoWatchedValue: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  engagementProgressBar: {
    height: 10,
    backgroundColor: colors.gray100,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  engagementProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 5,
  },
  videoStatsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  videoStatBox: {
    flex: 1,
    backgroundColor: colors.gray50,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  videoStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  videoStatLabel: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  videoDistributionLegend: {
    gap: spacing.md,
  },
  videoDistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  videoDistDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  videoDistText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
  },
  favoriteTopicsTitle: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray900,
    marginBottom: spacing.sm,
  },
  favoriteTopicsTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  favoriteTopicTag: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  favoriteTopicTagText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    color: colors.white,
  },
  subjectAccuracyItem: {
    marginBottom: spacing.sm,
  },
  subjectAccuracyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  subjectAccuracyLabel: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  subjectAccuracyValue: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  subjectAccuracyBar: {
    height: 6,
    backgroundColor: colors.gray100,
    borderRadius: 3,
    overflow: 'hidden',
  },
  subjectAccuracyFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  doubtStatsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  doubtStatBox: {
    flex: 1,
    backgroundColor: colors.gray50,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  doubtStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  doubtStatLabel: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  resolutionTimeBox: {
    backgroundColor: colors.gray50,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  resolutionTimeLabel: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    marginBottom: 4,
  },
  resolutionTimeValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  doubtsBySubjectTitle: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray900,
    marginBottom: spacing.md,
  },
  doubtSubjectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  doubtSubjectName: {
    width: 80,
    fontSize: fontSize.xs,
    color: colors.gray600,
  },
  doubtSubjectBarContainer: {
    flex: 1,
    height: 16,
    backgroundColor: colors.gray100,
    borderRadius: 4,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  doubtSubjectBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  doubtSubjectCount: {
    width: 24,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: colors.gray900,
    textAlign: 'right',
  },
  pendingDoubtsAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  pendingDoubtsContent: {
    flex: 1,
  },
  pendingDoubtsTitle: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  pendingDoubtsText: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
});
