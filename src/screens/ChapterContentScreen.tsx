import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Dimensions,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Buffer } from 'buffer';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase, TopicVideo, Assignment, AssignmentQuestion, AssignmentSubmission, QuestionItem, SubjectiveGradeResult } from '../services/supabase';
import MathText from '../components/MathText';
import PYQTab from '../components/PYQTab';
import DoubtsTab from '../components/DoubtsTab';

const TABS = [
  { id: 'videos', label: 'Classes', icon: 'play-circle-outline' },
  { id: 'ai', label: 'AI', icon: 'sparkles-outline' },
  { id: 'questions', label: 'Questions', icon: 'list-outline' },
  { id: 'assignments', label: 'Assignments', icon: 'document-text-outline' },
  { id: 'pyqs', label: "PYQ's", icon: 'document-text-outline' },
  { id: 'results', label: 'Results', icon: 'trophy-outline' },
  { id: 'doubts', label: 'Doubts', icon: 'help-circle-outline' },
];

function isMCQ(question: QuestionItem): boolean {
  const mcqTypes = ['mcq', 'single_choice', 'multiple_choice'];
  if (question.question_format && mcqTypes.includes(question.question_format.toLowerCase())) return true;
  if (question.question_type && mcqTypes.includes(question.question_type.toLowerCase())) return true;
  if (question.options && Object.keys(question.options).length > 0) return true;
  return false;
}

function getOptionText(value: any): string {
  if (value && typeof value === 'object' && 'text' in value) return value.text;
  return String(value);
}

function getDifficultyStyle(difficulty: string): { bg: string; color: string } {
  const d = difficulty?.toLowerCase() || '';
  if (d === 'low' || d === 'easy') return { bg: '#D1FAE5', color: '#059669' };
  if (d === 'medium') return { bg: '#DBEAFE', color: '#2563EB' };
  if (d === 'intermediate') return { bg: '#FEF3C7', color: '#D97706' };
  if (d === 'advanced' || d === 'hard') return { bg: '#FEE2E2', color: '#DC2626' };
  return { bg: '#F3F4F6', color: '#6B7280' };
}

interface QuestionGradeResult {
  questionId: string;
  isCorrect: boolean;
  marksAwarded: number;
  maxMarks: number;
  feedback?: string;
  selectedAnswer?: string;
  isPending?: boolean;
}

export default function ChapterContentScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ChapterContent'>>();
  const { chapterId, chapterTitle, chapterNumber, subjectId, subjectName } = route.params || {};
  const insets = useSafeAreaInsets();
  
  const [activeTab, setActiveTab] = useState('videos');
  
  // Videos state
  const [videos, setVideos] = useState<TopicVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<TopicVideo | null>(null);
  
  // Assignments state
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [assignmentView, setAssignmentView] = useState<'list' | 'detail' | 'test' | 'results'>('list');
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);
  const [currentAssignment, setCurrentAssignment] = useState<Assignment | null>(null);
  const [assignmentAnswers, setAssignmentAnswers] = useState<{ [questionId: string]: string }>({});
  const [assignmentCurrentIndex, setAssignmentCurrentIndex] = useState(0);
  const [assignmentTimeRemaining, setAssignmentTimeRemaining] = useState(0);
  const [assignmentStartTime, setAssignmentStartTime] = useState<number>(0);
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);
  const [assignmentResult, setAssignmentResult] = useState<AssignmentSubmission | null>(null);
  const [assignmentFlagged, setAssignmentFlagged] = useState<{ [questionId: string]: boolean }>({});
  const [showAssignmentPalette, setShowAssignmentPalette] = useState(false);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<{ [id: string]: AssignmentSubmission }>({});
  const [assignmentResultsLoading, setAssignmentResultsLoading] = useState(false);
  const [selfPracticeLoading, setSelfPracticeLoading] = useState(false);
  const assignmentTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Results state
  const [myResults, setMyResults] = useState<any[]>([]);
  const [myResultsLoading, setMyResultsLoading] = useState(false);
  const [myResultsError, setMyResultsError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<any | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewQuestions, setReviewQuestions] = useState<any[]>([]);
  const [reviewQuestionsLoading, setReviewQuestionsLoading] = useState(false);
  const [studentAnswers, setStudentAnswers] = useState<any[]>([]);
  
  // Questions state (MCQ + Subjective)
  const [questionsList, setQuestionsList] = useState<QuestionItem[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [questionDifficulties, setQuestionDifficulties] = useState<string[]>([]);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('All');
  const [questionScreen, setQuestionScreen] = useState<'test' | 'results' | 'review'>('test');
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [questionCurrentIndex, setQuestionCurrentIndex] = useState(0);
  const [selectedQuestionCount, setSelectedQuestionCount] = useState<number>(10);
  const [activeQuestions, setActiveQuestions] = useState<QuestionItem[]>([]);
  const [questionFlagged, setQuestionFlagged] = useState<Set<string>>(new Set());
  const [showPalette, setShowPalette] = useState(false);
  const [selectedTimerMinutes, setSelectedTimerMinutes] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [testStartTime, setTestStartTime] = useState<number>(0);
  const [questionCounts, setQuestionCounts] = useState<{ all: number; Low: number; Medium: number; Intermediate: number; Advanced: number }>({ all: 0, Low: 0, Medium: 0, Intermediate: 0, Advanced: 0 });
  const [userId, setUserId] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [gradeResults, setGradeResults] = useState<QuestionGradeResult[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scoredMarks, setScoredMarks] = useState(0);
  const [totalMarks, setTotalMarks] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  // Load user ID on mount
  useEffect(() => {
    const loadUserId = async () => {
      const storedUserId = await AsyncStorage.getItem('user_id');
      setUserId(storedUserId);
    };
    loadUserId();
  }, []);

  // Timer effect
  useEffect(() => {
    if (questionScreen === 'test' && timeRemaining !== null && timeRemaining > 0) {
      timerRef.current = setTimeout(() => {
        setTimeRemaining((prev) => {
          if (prev !== null && prev <= 1) {
            handleSubmitQuestions();
            return 0;
          }
          return prev !== null ? prev - 1 : prev;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [questionScreen, timeRemaining]);

  // Assignment timer effect
  useEffect(() => {
    if (assignmentView === 'test' && assignmentTimeRemaining > 0) {
      assignmentTimerRef.current = setInterval(() => {
        setAssignmentTimeRemaining(prev => {
          if (prev <= 1) {
            if (assignmentTimerRef.current) clearInterval(assignmentTimerRef.current);
            submitAssignment();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (assignmentTimerRef.current) clearInterval(assignmentTimerRef.current);
    };
  }, [assignmentView]);

  // Fetch question counts - use chapter-level (topic_id IS NULL)
  const fetchQuestionCounts = async () => {
    if (!chapterId) return;
    const result = await supabase.getMCQQuestionCounts({ chapterId, chapterOnly: true });
    if (result.success && result.counts) {
      setQuestionCounts(result.counts);
    }
  };

  // Fetch subject-level videos (topic_id is null)
  const fetchSubjectVideos = async () => {
    if (!subjectId) return;
    setVideosLoading(true);
    setVideosError(null);
    try {
      const result = await supabase.getSubjectVideos(subjectId);
      if (result.success && result.videos) {
        setVideos(result.videos);
      } else {
        setVideosError(result.error || 'Failed to load videos');
      }
    } catch (err) {
      setVideosError('Failed to load videos');
    } finally {
      setVideosLoading(false);
    }
  };

  const fetchAssignments = async () => {
    if (!subjectId || !chapterId) return;
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    try {
      const result = await supabase.getAssignments(subjectId, chapterId);
      if (result.success && result.assignments) {
        setAssignments(result.assignments);
        if (result.assignments.length > 0 && userId) {
          const assignmentIds = result.assignments.map(a => a.id);
          const submissionsResult = await supabase.getSubmissionStatus(userId, assignmentIds);
          if (submissionsResult.success && submissionsResult.submissions) {
            const submissionMap: { [id: string]: AssignmentSubmission } = {};
            for (const sub of submissionsResult.submissions) {
              submissionMap[sub.assignment_id] = sub;
            }
            setAssignmentSubmissions(submissionMap);
          }
        }
      } else {
        setAssignmentsError(result.error || 'Failed to load assignments');
      }
    } catch (err) {
      setAssignmentsError('Failed to load assignments');
    } finally {
      setAssignmentsLoading(false);
    }
  };

  const startAssignment = async (assignmentId: string) => {
    const result = await supabase.getAssignmentDetails(assignmentId);
    if (result.success && result.assignment) {
      setCurrentAssignment(result.assignment);
      setAssignmentAnswers({});
      setAssignmentFlagged({});
      setAssignmentCurrentIndex(0);
      setAssignmentStartTime(Date.now());
      setAssignmentTimeRemaining(result.assignment.duration_minutes * 60);
      setAssignmentView('test');
      setSelectedAssignment(assignmentId);
    } else {
      Alert.alert('Error', result.error || 'Failed to load assignment');
    }
  };

  const submitAssignment = async () => {
    if (!currentAssignment || !userId) return;
    setAssignmentSubmitting(true);
    const timeTaken = Math.floor((Date.now() - assignmentStartTime) / 1000);
    const result = await supabase.submitAssignment(
      userId,
      currentAssignment.id,
      currentAssignment.questions,
      assignmentAnswers,
      timeTaken
    );
    if (result.success && result.submission) {
      setAssignmentResult(result.submission);
      setAssignmentSubmissions(prev => ({
        ...prev,
        [currentAssignment.id]: result.submission as AssignmentSubmission
      }));
      setAssignmentView('results');
    } else {
      Alert.alert('Error', result.error || 'Failed to submit assignment');
    }
    setAssignmentSubmitting(false);
  };

  const resetAssignmentView = () => {
    setAssignmentView('list');
    setSelectedAssignment(null);
    setCurrentAssignment(null);
    setAssignmentAnswers({});
    setAssignmentFlagged({});
    setAssignmentResult(null);
    setAssignmentCurrentIndex(0);
    setShowAssignmentPalette(false);
  };

  const viewGradedResults = async (assignmentId: string, submission: AssignmentSubmission) => {
    setAssignmentResultsLoading(true);
    setSelectedAssignment(assignmentId);
    try {
      const result = await supabase.getAssignmentDetails(assignmentId);
      if (result.success && result.assignment) {
        setCurrentAssignment(result.assignment);
        setAssignmentResult(submission);
        setAssignmentView('results');
      } else {
        Alert.alert('Error', result.error || 'Failed to load assignment details');
        setSelectedAssignment(null);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load assignment details');
      setSelectedAssignment(null);
    }
    setAssignmentResultsLoading(false);
  };

  const openAssignmentDetail = async (assignmentId: string) => {
    const result = await supabase.getAssignmentDetails(assignmentId);
    if (result.success && result.assignment) {
      setCurrentAssignment(result.assignment);
      setSelectedAssignment(assignmentId);
      setAssignmentView('detail');
    } else {
      Alert.alert('Error', result.error || 'Failed to load assignment');
    }
  };

  const handleCreateSelfPractice = async () => {
    if (!subjectId) return;
    setSelfPracticeLoading(true);
    try {
      const result = await supabase.createSelfPracticeAssignment({
        subjectId,
        chapterId,
      });
      if (result.success && result.assignmentId) {
        await fetchAssignments();
        await openAssignmentDetail(result.assignmentId);
      } else {
        Alert.alert('Error', result.error || 'Failed to create practice assignment');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to create practice assignment');
    } finally {
      setSelfPracticeLoading(false);
    }
  };

  const fetchTestResults = async () => {
    if (!userId || !chapterId) return;
    setMyResultsLoading(true);
    setMyResultsError(null);
    try {
      const result = await supabase.getChapterTestResults(userId, chapterId, subjectId);
      if (result.success && result.results) {
        setMyResults(result.results);
      } else {
        setMyResultsError(result.error || 'Failed to load results');
      }
    } catch (err) {
      setMyResultsError('Failed to load results');
    } finally {
      setMyResultsLoading(false);
    }
  };

  const fetchReviewData = async (result: any) => {
    if (!userId) return;
    setReviewQuestionsLoading(true);
    setReviewQuestions([]);
    setStudentAnswers([]);
    try {
      const paperId = result.paper_id;
      const source = result.source;
      if (source === 'paper_test_results') {
        const [questionsResult, answersResult] = await Promise.all([
          supabase.getPreviousYearQuestions(paperId),
          supabase.getStudentAnswers(paperId, userId),
        ]);
        if (questionsResult.success && questionsResult.questions) {
          setReviewQuestions(questionsResult.questions);
        }
        if (answersResult.success && answersResult.answers) {
          setStudentAnswers(answersResult.answers);
        }
      } else if (source === 'test_results') {
        const questionsResult = await supabase.getTestQuestions(paperId);
        if (questionsResult.success && questionsResult.questions) {
          const mappedQuestions = questionsResult.questions.map((tq: any) => ({
            id: tq.question?.id || tq.question_id,
            question_text: tq.question?.question_text || '',
            options: tq.question?.options || null,
            correct_answer: tq.question?.correct_answer || null,
            explanation: tq.question?.explanation || null,
            difficulty: tq.question?.difficulty || 'medium',
            question_format: tq.question?.question_format || null,
          }));
          setReviewQuestions(mappedQuestions);
        }
      }
    } catch (error) {
      console.error('[fetchReviewData] Error:', error);
    }
    setReviewQuestionsLoading(false);
  };

  const handleOpenReview = (result: any) => {
    setSelectedResult(result);
    setShowReviewModal(true);
    fetchReviewData(result);
  };

  const getGradingStatusBadge = (status: string | null) => {
    switch (status) {
      case 'pending':
        return { label: 'Pending', color: '#F59E0B', icon: 'time-outline' };
      case 'ai_graded':
        return { label: 'AI Graded', color: '#3B82F6', icon: 'checkmark-circle-outline' };
      case 'graded':
        return { label: 'Graded', color: '#22C55E', icon: 'checkmark-circle' };
      default:
        return { label: 'Unknown', color: '#6B7280', icon: 'help-outline' };
    }
  };

  const formatResultDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  // Fetch chapter-level questions (MCQ + subjective)
  const fetchChapterQuestions = async () => {
    if (!chapterId) return;
    setQuestionsLoading(true);
    setQuestionsError(null);
    try {
      const result = await supabase.getChapterQuestions(chapterId);
      if (result.success && result.questions) {
        setQuestionsList(result.questions);
        setActiveQuestions(result.questions);
        const diffs = new Set(result.questions.map(q => q.difficulty).filter(Boolean));
        setQuestionDifficulties(['All', ...Array.from(diffs)]);
      } else {
        setQuestionsError(result.error || 'Failed to load questions');
      }
    } catch (err) {
      setQuestionsError('Failed to load questions');
    } finally {
      setQuestionsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'videos' && subjectId) {
      fetchSubjectVideos();
    } else if (activeTab === 'questions' && chapterId) {
      fetchChapterQuestions();
      fetchQuestionCounts();
    } else if (activeTab === 'assignments' && chapterId) {
      fetchAssignments();
    } else if (activeTab === 'results' && userId && chapterId) {
      fetchTestResults();
    }
  }, [activeTab, subjectId, chapterId]);

  // Fetch initial data on mount
  useEffect(() => {
    if (subjectId) {
      fetchSubjectVideos();
    }
  }, [subjectId]);


  const handleSelectAnswer = (questionId: string, answer: string) => {
    setQuestionAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleStartQuestionTest = () => {
    const questionsToUse = questionsList.slice(0, selectedQuestionCount);
    setActiveQuestions(questionsToUse);
    setQuestionAnswers({});
    setQuestionCurrentIndex(0);
    setQuestionFlagged(new Set());
    setGradeResults([]);
    setTestStartTime(Date.now());
    if (selectedTimerMinutes) {
      setTimeRemaining(selectedTimerMinutes * 60);
    } else {
      setTimeRemaining(null);
    }
    setQuestionScreen('test');
  };

  const handleFlagQuestion = (questionId: string) => {
    setQuestionFlagged(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmitQuestions = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setIsSubmitting(true);
    setTimeRemaining(null);

    const timeTaken = Math.floor((Date.now() - testStartTime) / 1000);
    const results: QuestionGradeResult[] = [];
    let totalScoredMarks = 0;
    let totalMaxMarks = 0;
    let totalCorrect = 0;
    let hasSubjectivePending = false;

    // Step 1: Grade MCQs locally + subjective via AI
    for (const q of activeQuestions) {
      const userAnswer = questionAnswers[q.id] || '';
      const qMarks = q.marks || 1;
      totalMaxMarks += qMarks;

      if (isMCQ(q)) {
        const isCorrect = userAnswer && q.correct_answer && userAnswer.toLowerCase() === q.correct_answer.toLowerCase();
        const awarded = isCorrect ? qMarks : 0;
        if (isCorrect) totalCorrect++;
        totalScoredMarks += awarded;
        results.push({
          questionId: q.id,
          isCorrect: !!isCorrect,
          marksAwarded: awarded,
          maxMarks: qMarks,
          selectedAnswer: userAnswer,
        });
      } else {
        if (!userAnswer.trim()) {
          results.push({
            questionId: q.id,
            isCorrect: false,
            marksAwarded: 0,
            maxMarks: qMarks,
            selectedAnswer: userAnswer,
            feedback: 'No answer provided',
          });
        } else {
          try {
            const gradeResult = await supabase.gradeSubjectiveAnswer({
              questionId: q.id,
              questionText: q.question_text,
              questionType: q.question_type,
              correctAnswer: q.correct_answer,
              studentAnswer: userAnswer,
              maxMarks: qMarks,
            });
            if (gradeResult.success && gradeResult.result) {
              const r = gradeResult.result;
              totalScoredMarks += r.marks_awarded;
              if (r.is_correct) totalCorrect++;
              results.push({
                questionId: q.id,
                isCorrect: r.is_correct,
                marksAwarded: r.marks_awarded,
                maxMarks: qMarks,
                selectedAnswer: userAnswer,
                feedback: r.feedback,
              });
            } else {
              hasSubjectivePending = true;
              results.push({
                questionId: q.id,
                isCorrect: false,
                marksAwarded: 0,
                maxMarks: qMarks,
                selectedAnswer: userAnswer,
                feedback: 'Pending AI review',
                isPending: true,
              });
            }
          } catch {
            hasSubjectivePending = true;
            results.push({
              questionId: q.id,
              isCorrect: false,
              marksAwarded: 0,
              maxMarks: qMarks,
              selectedAnswer: userAnswer,
              feedback: 'Pending AI review',
              isPending: true,
            });
          }
        }
      }
    }

    setGradeResults(results);
    setScoredMarks(totalScoredMarks);
    setTotalMarks(totalMaxMarks);
    setCorrectCount(totalCorrect);
    setQuestionScreen('results');

    // Step 2 & 3: Create test record + save result
    if (userId && chapterId) {
      try {
        const testRecord = await supabase.createPracticeTestRecord({
          subjectId: subjectId || undefined,
          chapterId,
          totalMarks: totalMaxMarks,
          createdBy: userId,
        });

        const percentage = totalMaxMarks > 0 ? Math.round((totalScoredMarks / totalMaxMarks) * 100) : 0;
        const answersToSave: Record<string, string> = {};
        results.forEach(r => {
          answersToSave[r.questionId] = r.selectedAnswer || '';
        });

        await supabase.savePracticeTestResult({
          testId: testRecord.testId,
          studentId: userId,
          subjectId: subjectId || undefined,
          score: totalScoredMarks,
          totalQuestions: activeQuestions.length,
          percentage,
          answers: answersToSave,
          gradingStatus: hasSubjectivePending ? 'pending' : 'graded',
        });
      } catch (err) {
        console.error('[Questions] Error saving test result:', err);
      }
    }
    setIsSubmitting(false);
  };

  const handleRetakeTest = () => {
    setTimeRemaining(null);
    setQuestionFlagged(new Set());
    setQuestionAnswers({});
    setQuestionCurrentIndex(0);
    setGradeResults([]);
    setScoredMarks(0);
    setTotalMarks(0);
    setCorrectCount(0);
    setQuestionScreen('test');
  };

  const getScoreColor = (percentage: number | null) => {
    if (percentage === null) return '#6B7280';
    if (percentage >= 70) return '#22C55E';
    if (percentage >= 40) return '#EAB308';
    return '#EF4444';
  };

  const renderVideosTab = () => {
    if (videosLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading videos...</Text>
        </View>
      );
    }

    if (videosError) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={styles.errorText}>{videosError}</Text>
          <TouchableOpacity onPress={fetchSubjectVideos}>
            <LinearGradient colors={[colors.primary, '#4ADE80']} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      );
    }

    if (selectedVideo) {
      return (
        <View style={styles.videoPlayerContainer}>
          <TouchableOpacity style={styles.closeVideoButton} onPress={() => setSelectedVideo(null)}>
            <Ionicons name="close" size={24} color={colors.white} />
          </TouchableOpacity>
          <WebView
            source={{ uri: `https://player.vimeo.com/video/${selectedVideo.video_id}?autoplay=1&quality=auto` }}
            style={styles.webView}
            allowsFullscreenVideo
            javaScriptEnabled
          />
          <View style={styles.videoInfo}>
            <Text style={styles.videoTitle}>{selectedVideo.title}</Text>
            {selectedVideo.description && (
              <Text style={styles.videoDescription}>{selectedVideo.description}</Text>
            )}
          </View>
        </View>
      );
    }

    if (videos.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="videocam-outline" size={40} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No Chapter Videos</Text>
          <Text style={styles.emptyText}>Chapter-level videos will appear here</Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {videos.map((video) => (
          <TouchableOpacity
            key={video.id}
            style={styles.videoCard}
            onPress={() => setSelectedVideo(video)}
          >
            <View style={styles.videoThumbnail}>
              <Ionicons name="play-circle" size={40} color={colors.primary} />
            </View>
            <View style={styles.videoCardContent}>
              <Text style={styles.videoCardTitle} numberOfLines={2}>{video.title}</Text>
              {video.description && (
                <Text style={styles.videoCardDescription} numberOfLines={2}>{video.description}</Text>
              )}
              <View style={styles.videoCardMeta}>
                {video.duration_seconds && (
                  <View style={styles.durationBadge}>
                    <Ionicons name="time-outline" size={12} color={colors.primary} />
                    <Text style={styles.durationText}>{Math.floor(video.duration_seconds / 60)}m</Text>
                  </View>
                )}
                {video.language && (
                  <View style={styles.languageBadge}>
                    <Text style={styles.languageText}>{video.language}</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderAITab = () => {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="sparkles" size={40} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>AI Assistant</Text>
        <Text style={styles.emptyText}>Ask questions about this chapter and get AI-powered explanations</Text>
        <Text style={styles.comingSoonText}>Coming Soon</Text>
      </View>
    );
  };

  const renderAssignmentsTab = () => {
    const formatTimer = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getAssignmentStatus = (assignment: Assignment) => {
      const submission = assignmentSubmissions[assignment.id];
      if (submission) {
        return submission.graded_at ? 'graded' : 'submitted';
      }
      if (assignment.valid_until) {
        const now = new Date();
        const validUntil = new Date(assignment.valid_until);
        if (!isNaN(validUntil.getTime()) && validUntil.getFullYear() >= 2000) {
          if (now > validUntil) return 'overdue';
        }
      }
      return 'pending';
    };

    const formatDueDate = (dateStr: string | null | undefined) => {
      if (!dateStr) return 'No due date';
      const timestamp = Date.parse(dateStr);
      if (isNaN(timestamp)) return 'No due date';
      const date = new Date(timestamp);
      if (date.getFullYear() < 2000) return 'No due date';
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    if (assignmentsLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading assignments...</Text>
        </View>
      );
    }

    if (assignmentsError) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={styles.errorText}>{assignmentsError}</Text>
          <TouchableOpacity onPress={fetchAssignments}>
            <LinearGradient colors={[colors.primary, '#4ADE80']} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      );
    }

    if (assignmentResultsLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading results...</Text>
        </View>
      );
    }

    // Results view
    if (assignmentView === 'results' && assignmentResult && currentAssignment) {
      const isPassed = assignmentResult.percentage >= (currentAssignment.passing_marks / currentAssignment.total_marks * 100);
      const feedbackMessage = assignmentResult.percentage >= 60 ? 'Good job!' : 'Keep practicing!';

      return (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={aStyles.backToListButton} onPress={resetAssignmentView}>
            <Ionicons name="chevron-back" size={16} color={colors.primary} />
            <Text style={aStyles.backToListText}>Back to Assignments</Text>
          </TouchableOpacity>

          <View style={aStyles.scoreCard}>
            <View style={aStyles.scoreCardHeader}>
              <View>
                <Text style={aStyles.scoreCardTitle}>Your Score</Text>
                <Text style={aStyles.scoreCardValue}>{assignmentResult.score}/{currentAssignment.total_marks}</Text>
              </View>
              <View style={[styles.scoreCircle, isPassed ? { borderColor: '#22C55E' } : { borderColor: '#EF4444' }]}>
                <Text style={[styles.scorePercentage, isPassed ? { color: '#22C55E' } : { color: '#EF4444' }]}>
                  {assignmentResult.percentage}%
                </Text>
              </View>
            </View>
            <View style={aStyles.feedbackSection}>
              <Text style={aStyles.feedbackLabel}>Feedback:</Text>
              <Text style={aStyles.feedbackText}>{assignmentResult.feedback || feedbackMessage}</Text>
            </View>
            <View style={aStyles.statsRow}>
              <View style={aStyles.statItem}>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                <Text style={aStyles.statText}>
                  {Object.values(assignmentResult.answers || {}).filter((a: any) => a?.is_correct).length} Correct
                </Text>
              </View>
              <View style={aStyles.statItem}>
                <Ionicons name="close-circle" size={18} color="#EF4444" />
                <Text style={aStyles.statText}>
                  {Object.values(assignmentResult.answers || {}).filter((a: any) => !a?.is_correct && a?.text_answer).length} Incorrect
                </Text>
              </View>
              <View style={aStyles.statItem}>
                <Ionicons name="remove-circle" size={18} color={colors.textSecondary} />
                <Text style={aStyles.statText}>
                  {(currentAssignment.questions || []).length - Object.values(assignmentResult.answers || {}).filter((a: any) => a?.text_answer).length} Unanswered
                </Text>
              </View>
            </View>
          </View>

          <Text style={aStyles.sectionTitle}>Question Review</Text>

          {(currentAssignment.questions || []).map((q, index) => {
            const answer = assignmentResult.answers[q.id];
            const isCorrect = answer?.is_correct;
            const qType = q.type?.toLowerCase().trim() || '';

            return (
              <View key={q.id} style={aStyles.gradedQuestionCard}>
                <View style={aStyles.questionHeaderRow}>
                  <Text style={aStyles.questionNumber}>Question {index + 1}</Text>
                  <View style={[aStyles.marksBadge, isCorrect ? { backgroundColor: '#D1FAE5' } : { backgroundColor: '#FEE2E2' }]}>
                    <Text style={[aStyles.marksBadgeText, isCorrect ? { color: '#059669' } : { color: '#DC2626' }]}>
                      {answer?.marks_awarded || 0}/{q.marks} marks
                    </Text>
                  </View>
                </View>
                <MathText content={q.question || ''} style={aStyles.questionText} />

                {(qType === 'mcq' || qType === 'multiple_choice' || qType === 'single_choice' || (q.options && q.options.length > 0 && qType !== 'true_false')) && q.options && q.options.length > 0 && (
                  <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                    {q.options.map((option, optIndex) => {
                      const optionLetter = String.fromCharCode(65 + optIndex);
                      let correctVal = (q.correct_answer || '').trim();
                      if (/^[A-Da-d]$/.test(correctVal) && q.options.length > 0) {
                        const ci = correctVal.toUpperCase().charCodeAt(0) - 65;
                        if (ci >= 0 && ci < q.options.length) {
                          correctVal = typeof q.options[ci] === 'string' ? q.options[ci] : (q.options[ci] as any)?.text || '';
                        }
                      }
                      const optText = typeof option === 'string' ? option : (option as any)?.text || '';
                      const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
                      const isCorrectOption = norm(correctVal) === norm(optText);
                      let studentVal = (answer?.text_answer || '').trim();
                      if (/^[A-Da-d]$/.test(studentVal) && q.options.length > 0) {
                        const si = studentVal.toUpperCase().charCodeAt(0) - 65;
                        if (si >= 0 && si < q.options.length) {
                          studentVal = typeof q.options[si] === 'string' ? q.options[si] : (q.options[si] as any)?.text || '';
                        }
                      }
                      const isSelectedOption = norm(studentVal) === norm(optText);

                      return (
                        <View
                          key={optIndex}
                          style={[
                            aStyles.gradedOption,
                            isCorrectOption && aStyles.gradedOptionCorrect,
                            isSelectedOption && !isCorrectOption && aStyles.gradedOptionWrong,
                          ]}
                        >
                          <Text style={[
                            aStyles.gradedOptionText,
                            isCorrectOption && { color: '#166534' },
                            isSelectedOption && !isCorrectOption && { color: '#991B1B' },
                          ]}>{optionLetter}. {option}</Text>
                          {isCorrectOption && <Ionicons name="checkmark-circle" size={18} color="#22C55E" />}
                          {isSelectedOption && !isCorrectOption && <Ionicons name="close-circle" size={18} color="#EF4444" />}
                        </View>
                      );
                    })}
                  </View>
                )}

                {(qType === 'short_answer' || qType === 'long_answer' || qType === 'application' || qType === 'fill_blank' || qType === 'case_study' || qType === 'real_world_application' || qType === 'diagram') && (
                  <View style={aStyles.subjectiveAnswerBox}>
                    <Text style={aStyles.answerLabel}>Your Answer:</Text>
                    <Text style={aStyles.answerText}>{answer?.text_answer || 'No answer provided'}</Text>
                    {qType === 'fill_blank' && q.correct_answer && (
                      <View style={{ marginTop: spacing.sm }}>
                        <Text style={aStyles.answerLabel}>Correct Answer:</Text>
                        <Text style={[aStyles.answerText, { color: '#22C55E' }]}>{q.correct_answer}</Text>
                      </View>
                    )}
                  </View>
                )}

                {answer?.feedback && (
                  <View style={aStyles.aFeedbackBox}>
                    <Text style={aStyles.aFeedbackLabel}>Feedback:</Text>
                    <Text style={aStyles.aFeedbackText}>{answer.feedback}</Text>
                  </View>
                )}
              </View>
            );
          })}

          <TouchableOpacity style={aStyles.tryAgainButton} onPress={() => {
            if (currentAssignment) startAssignment(currentAssignment.id);
          }}>
            <Ionicons name="refresh-outline" size={20} color={colors.white} />
            <Text style={aStyles.tryAgainButtonText}>Try Again</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    // Test view
    if (assignmentView === 'test' && currentAssignment) {
      const questions = currentAssignment.questions || [];
      if (questions.length === 0) {
        return (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No questions available</Text>
            <TouchableOpacity onPress={resetAssignmentView}>
              <LinearGradient colors={[colors.primary, '#4ADE80']} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Go Back</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        );
      }
      const currentQuestion = questions[assignmentCurrentIndex];
      const normalizedType = currentQuestion.type?.toLowerCase().trim() || '';
      const answeredCount = Object.keys(assignmentAnswers).filter(k => assignmentAnswers[k]).length;

      return (
        <View style={{ flex: 1 }}>
          <View style={aStyles.testHeader}>
            <View style={aStyles.timerContainer}>
              <Ionicons name="time-outline" size={20} color={assignmentTimeRemaining < 60 ? '#EF4444' : colors.primary} />
              <Text style={[aStyles.timerText, assignmentTimeRemaining < 60 && { color: '#EF4444' }]}>
                {formatTimer(assignmentTimeRemaining)}
              </Text>
            </View>
            <TouchableOpacity
              style={aStyles.paletteButton}
              onPress={() => setShowAssignmentPalette(!showAssignmentPalette)}
            >
              <Ionicons name="grid-outline" size={20} color={colors.primary} />
              <Text style={aStyles.paletteButtonText}>{answeredCount}/{questions.length}</Text>
            </TouchableOpacity>
          </View>

          {showAssignmentPalette && (
            <View style={aStyles.paletteOverlay}>
              <View style={aStyles.paletteModal}>
                <View style={aStyles.paletteHeader}>
                  <Text style={aStyles.paletteTitle}>Question Palette</Text>
                  <TouchableOpacity onPress={() => setShowAssignmentPalette(false)}>
                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={aStyles.paletteLegend}>
                  <View style={aStyles.legendItem}>
                    <View style={[aStyles.legendDot, { backgroundColor: '#22C55E' }]} />
                    <Text style={aStyles.legendText}>Answered</Text>
                  </View>
                  <View style={aStyles.legendItem}>
                    <View style={[aStyles.legendDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={aStyles.legendText}>Flagged</Text>
                  </View>
                  <View style={aStyles.legendItem}>
                    <View style={[aStyles.legendDot, { backgroundColor: '#E5E7EB' }]} />
                    <Text style={aStyles.legendText}>Not Answered</Text>
                  </View>
                </View>
                <View style={aStyles.paletteGrid}>
                  {questions.map((q, idx) => {
                    const isAnswered = !!assignmentAnswers[q.id];
                    const isFlagged = !!assignmentFlagged[q.id];
                    const isCurrent = idx === assignmentCurrentIndex;
                    return (
                      <TouchableOpacity
                        key={q.id}
                        style={[
                          aStyles.paletteItem,
                          isAnswered && aStyles.paletteItemAnswered,
                          isFlagged && aStyles.paletteItemFlagged,
                          isCurrent && aStyles.paletteItemCurrent,
                        ]}
                        onPress={() => {
                          setAssignmentCurrentIndex(idx);
                          setShowAssignmentPalette(false);
                        }}
                      >
                        <Text style={[
                          aStyles.paletteItemText,
                          (isAnswered || isCurrent) && { color: colors.white }
                        ]}>{idx + 1}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
            <View style={aStyles.questionCard}>
              <View style={aStyles.questionHeaderRow}>
                <Text style={aStyles.questionNumber}>Question {assignmentCurrentIndex + 1} of {questions.length}</Text>
                <View style={aStyles.questionTypeBadge}>
                  <Text style={aStyles.questionTypeText}>
                    {normalizedType === 'mcq' ? 'Multiple Choice' :
                     normalizedType === 'true_false' ? 'True/False' :
                     normalizedType === 'short_answer' ? 'Short Answer' :
                     normalizedType === 'long_answer' ? 'Long Answer' :
                     normalizedType === 'fill_blank' ? 'Fill in the Blank' :
                     normalizedType === 'diagram' ? 'Diagram' :
                     normalizedType === 'case_study' ? 'Case Study' :
                     normalizedType === 'real_world_application' ? 'Real-world Application' : 'Application'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[aStyles.flagBtn, assignmentFlagged[currentQuestion.id] && aStyles.flagBtnActive]}
                  onPress={() => setAssignmentFlagged(prev => ({
                    ...prev,
                    [currentQuestion.id]: !prev[currentQuestion.id]
                  }))}
                >
                  <Ionicons
                    name={assignmentFlagged[currentQuestion.id] ? 'flag' : 'flag-outline'}
                    size={20}
                    color={assignmentFlagged[currentQuestion.id] ? '#EF4444' : colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <Text style={aStyles.questionMarks}>{currentQuestion.marks} mark{currentQuestion.marks > 1 ? 's' : ''}</Text>
              <MathText content={currentQuestion.question || ''} style={aStyles.questionText} />

              {currentQuestion.image_url && (
                <Image source={{ uri: currentQuestion.image_url }} style={{ width: '100%', height: 150, borderRadius: borderRadius.md, marginBottom: spacing.sm }} resizeMode="contain" />
              )}

              {(normalizedType === 'mcq' || normalizedType === 'multiple_choice' || normalizedType === 'single_choice' || (currentQuestion.options && currentQuestion.options.length > 0 && normalizedType !== 'true_false')) && currentQuestion.options && currentQuestion.options.length > 0 && (
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  {currentQuestion.options.map((option, idx) => {
                    const optionLetter = String.fromCharCode(65 + idx);
                    const optText = typeof option === 'string' ? option : (option as any)?.text || String(option);
                    const isSelected = assignmentAnswers[currentQuestion.id] === optionLetter;
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[aStyles.optionButton, isSelected && aStyles.optionButtonSelected]}
                        onPress={() => setAssignmentAnswers(prev => ({ ...prev, [currentQuestion.id]: optionLetter }))}
                      >
                        <View style={[aStyles.optionCircle, isSelected && aStyles.optionCircleSelected]}>
                          <Text style={[aStyles.optionLetter, isSelected && { color: colors.white }]}>{optionLetter}</Text>
                        </View>
                        <MathText content={optText} style={{ flex: 1 }} textStyle={[aStyles.optionText, isSelected && { color: colors.primary, fontWeight: '600' }]} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {normalizedType === 'true_false' && (
                <View style={aStyles.trueFalseContainer}>
                  {['True', 'False'].map((option) => {
                    const isSelected = assignmentAnswers[currentQuestion.id]?.toLowerCase() === option.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[aStyles.trueFalseButton, isSelected && aStyles.trueFalseButtonSelected]}
                        onPress={() => setAssignmentAnswers(prev => ({ ...prev, [currentQuestion.id]: option }))}
                      >
                        <Text style={[aStyles.trueFalseText, isSelected && { color: colors.white }]}>{option}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {(!currentQuestion.options || currentQuestion.options.length === 0) && (normalizedType === 'short_answer' || normalizedType === 'long_answer' || normalizedType === 'application' || normalizedType === 'fill_blank' || normalizedType === 'case_study' || normalizedType === 'real_world_application' || normalizedType === 'subjective' || normalizedType === 'descriptive' || normalizedType === 'numeric' || normalizedType === 'practical' || normalizedType === 'diagram') && (
                <TextInput
                  style={[
                    aStyles.answerInput,
                    (normalizedType === 'long_answer' || normalizedType === 'case_study' || normalizedType === 'real_world_application' || normalizedType === 'descriptive' || normalizedType === 'subjective') && { minHeight: 150 },
                    (normalizedType === 'fill_blank' || normalizedType === 'numeric') && { minHeight: 50 }
                  ]}
                  placeholder={
                    normalizedType === 'fill_blank' ? 'Type the missing word or phrase...' :
                    normalizedType === 'short_answer' || normalizedType === 'numeric' ? 'Type your answer...' :
                    'Type your detailed answer here...'
                  }
                  placeholderTextColor={colors.textSecondary}
                  multiline={normalizedType !== 'fill_blank' && normalizedType !== 'numeric'}
                  numberOfLines={normalizedType === 'long_answer' || normalizedType === 'case_study' || normalizedType === 'real_world_application' || normalizedType === 'descriptive' || normalizedType === 'subjective' ? 8 : normalizedType === 'fill_blank' || normalizedType === 'numeric' ? 1 : 4}
                  textAlignVertical={(normalizedType === 'fill_blank' || normalizedType === 'numeric') ? 'center' : 'top'}
                  value={assignmentAnswers[currentQuestion.id] || ''}
                  onChangeText={(text) => setAssignmentAnswers(prev => ({ ...prev, [currentQuestion.id]: text }))}
                />
              )}

              {(!currentQuestion.options || currentQuestion.options.length === 0) && normalizedType !== 'true_false' && normalizedType !== 'short_answer' && normalizedType !== 'long_answer' && normalizedType !== 'application' && normalizedType !== 'fill_blank' && normalizedType !== 'case_study' && normalizedType !== 'real_world_application' && normalizedType !== 'subjective' && normalizedType !== 'descriptive' && normalizedType !== 'numeric' && normalizedType !== 'practical' && normalizedType !== 'diagram' && normalizedType !== 'mcq' && normalizedType !== 'multiple_choice' && normalizedType !== 'single_choice' && (
                <TextInput
                  style={[aStyles.answerInput, { minHeight: 100 }]}
                  placeholder="Type your answer here..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  value={assignmentAnswers[currentQuestion.id] || ''}
                  onChangeText={(text) => setAssignmentAnswers(prev => ({ ...prev, [currentQuestion.id]: text }))}
                />
              )}
            </View>
          </ScrollView>

          <View style={aStyles.testFooter}>
            <TouchableOpacity
              style={[aStyles.navButton, assignmentCurrentIndex === 0 && { opacity: 0.4 }]}
              onPress={() => assignmentCurrentIndex > 0 && setAssignmentCurrentIndex(prev => prev - 1)}
              disabled={assignmentCurrentIndex === 0}
            >
              <Ionicons name="chevron-back" size={20} color={assignmentCurrentIndex === 0 ? colors.textSecondary : colors.primary} />
              <Text style={[aStyles.navButtonText, assignmentCurrentIndex === 0 && { color: colors.textSecondary }]}>Previous</Text>
            </TouchableOpacity>

            {assignmentCurrentIndex === questions.length - 1 ? (
              <TouchableOpacity
                style={aStyles.submitTestButton}
                onPress={() => {
                  Alert.alert(
                    'Submit Assignment',
                    `You have answered ${answeredCount} of ${questions.length} questions. Are you sure you want to submit?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Submit', onPress: submitAssignment }
                    ]
                  );
                }}
                disabled={assignmentSubmitting}
              >
                {assignmentSubmitting ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Text style={aStyles.submitTestButtonText}>Submit</Text>
                    <Ionicons name="checkmark-circle" size={20} color={colors.white} />
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={aStyles.navButton}
                onPress={() => setAssignmentCurrentIndex(prev => prev + 1)}
              >
                <Text style={aStyles.navButtonText}>Next</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    // Detail view
    if (assignmentView === 'detail' && currentAssignment) {
      const submission = assignmentSubmissions[currentAssignment.id];
      const passingPercentage = currentAssignment.total_marks > 0
        ? Math.round((currentAssignment.passing_marks / currentAssignment.total_marks) * 100)
        : 0;

      return (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={aStyles.backToListButton} onPress={resetAssignmentView}>
            <Ionicons name="chevron-back" size={16} color={colors.primary} />
            <Text style={aStyles.backToListText}>Back to Assignments</Text>
          </TouchableOpacity>

          <View style={aStyles.detailCard}>
            <View style={aStyles.detailIconRow}>
              <View style={aStyles.detailIcon}>
                <Ionicons name="document-text" size={28} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={aStyles.detailTitle}>{currentAssignment.title}</Text>
                {currentAssignment.description ? (
                  <Text style={aStyles.detailDesc}>{currentAssignment.description}</Text>
                ) : null}
              </View>
            </View>

            <View style={aStyles.detailMetaGrid}>
              <View style={aStyles.detailMetaItem}>
                <Ionicons name="help-circle-outline" size={18} color={colors.primary} />
                <Text style={aStyles.detailMetaValue}>{(currentAssignment.questions || []).length}</Text>
                <Text style={aStyles.detailMetaLabel}>Questions</Text>
              </View>
              <View style={aStyles.detailMetaItem}>
                <Ionicons name="star-outline" size={18} color={colors.primary} />
                <Text style={aStyles.detailMetaValue}>{currentAssignment.total_marks}</Text>
                <Text style={aStyles.detailMetaLabel}>Total Marks</Text>
              </View>
              <View style={aStyles.detailMetaItem}>
                <Ionicons name="time-outline" size={18} color={colors.primary} />
                <Text style={aStyles.detailMetaValue}>{currentAssignment.duration_minutes}</Text>
                <Text style={aStyles.detailMetaLabel}>Minutes</Text>
              </View>
              <View style={aStyles.detailMetaItem}>
                <Ionicons name="trophy-outline" size={18} color={colors.primary} />
                <Text style={aStyles.detailMetaValue}>{passingPercentage}%</Text>
                <Text style={aStyles.detailMetaLabel}>To Pass</Text>
              </View>
            </View>

            {currentAssignment.instructions ? (
              <View style={aStyles.instructionsBox}>
                <Text style={aStyles.instructionsLabel}>Instructions</Text>
                <Text style={aStyles.instructionsText}>{currentAssignment.instructions}</Text>
              </View>
            ) : null}

            {submission && (
              <View style={aStyles.pastAttemptBox}>
                <Ionicons name="checkmark-done-circle" size={18} color="#2BBD6E" />
                <Text style={aStyles.pastAttemptText}>
                  Previous attempt: {submission.score}/{currentAssignment.total_marks} ({submission.percentage}%)
                </Text>
              </View>
            )}

            <TouchableOpacity onPress={() => startAssignment(currentAssignment.id)}>
              <LinearGradient colors={[colors.primary, '#4ADE80']} style={aStyles.solveButton}>
                <Ionicons name="pencil" size={20} color={colors.white} />
                <Text style={aStyles.solveButtonText}>Solve Assignment</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      );
    }

    // Empty state
    if (assignments.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="document-text-outline" size={40} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No Assignments</Text>
          <Text style={styles.emptyText}>Assignments for this chapter will appear here</Text>
          {subjectId && (
            <TouchableOpacity onPress={handleCreateSelfPractice} disabled={selfPracticeLoading} style={{ marginTop: spacing.md }}>
              <LinearGradient colors={[colors.primary, '#4ADE80']} style={[aStyles.newPracticeButton, selfPracticeLoading && { opacity: 0.6 }]}>
                {selfPracticeLoading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={18} color={colors.white} />
                    <Text style={aStyles.newPracticeButtonText}>New Practice</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // List view
    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {subjectId && (
          <TouchableOpacity onPress={handleCreateSelfPractice} disabled={selfPracticeLoading} style={{ marginBottom: spacing.md }}>
            <LinearGradient colors={[colors.primary, '#4ADE80']} style={[aStyles.newPracticeButton, selfPracticeLoading && { opacity: 0.6 }]}>
              {selfPracticeLoading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={18} color={colors.white} />
                  <Text style={aStyles.newPracticeButtonText}>New Practice</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}

        {assignments.map((assignment) => {
          const status = getAssignmentStatus(assignment);
          const submission = assignmentSubmissions[assignment.id];

          return (
            <TouchableOpacity
              key={assignment.id}
              style={aStyles.assignmentListCard}
              onPress={() => {
                if (status === 'graded' && submission) {
                  viewGradedResults(assignment.id, submission);
                } else {
                  openAssignmentDetail(assignment.id);
                }
              }}
            >
              <View style={[
                aStyles.assignmentLeftBorder,
                status === 'pending' && { backgroundColor: '#F59E0B' },
                status === 'overdue' && { backgroundColor: '#EF4444' },
                status === 'submitted' && { backgroundColor: '#3B82F6' },
                status === 'graded' && { backgroundColor: '#2BBD6E' },
              ]} />
              <View style={{ flex: 1, padding: spacing.md }}>
                <View style={aStyles.assignmentListHeader}>
                  <Text style={styles.assignmentTitle} numberOfLines={2}>{assignment.title}</Text>
                  <View style={[
                    aStyles.statusBadge,
                    status === 'pending' && { backgroundColor: '#F59E0B' },
                    status === 'overdue' && { backgroundColor: '#EF4444' },
                    status === 'submitted' && { backgroundColor: '#3B82F6' },
                    status === 'graded' && { backgroundColor: '#2BBD6E' },
                  ]}>
                    <Ionicons
                      name={
                        status === 'pending' ? 'time-outline' :
                        status === 'overdue' ? 'alert-circle-outline' :
                        status === 'submitted' ? 'hourglass-outline' : 'checkmark-circle-outline'
                      }
                      size={12}
                      color={colors.white}
                    />
                    <Text style={aStyles.statusBadgeText}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Text>
                  </View>
                </View>
                {assignment.description ? (
                  <Text style={styles.assignmentDescription} numberOfLines={1}>{assignment.description}</Text>
                ) : null}
                <View style={styles.assignmentMeta}>
                  <Text style={aStyles.metaLabel}>
                    Due: <Text style={aStyles.metaValue}>{formatDueDate(assignment.valid_until)}</Text>
                  </Text>
                  <Text style={aStyles.metaLabel}>
                    Marks: <Text style={aStyles.metaValue}>{assignment.total_marks}</Text>
                  </Text>
                  <Text style={aStyles.metaLabel}>
                    Duration: <Text style={aStyles.metaValue}>{assignment.duration_minutes} min</Text>
                  </Text>
                </View>
                {submission && (
                  <View style={aStyles.scoreTag}>
                    <Text style={aStyles.scoreTagText}>Score: {submission.score}/{assignment.total_marks} ({submission.percentage}%)</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  const getCategoryStyle = (category: string) => {
      switch (category) {
        case 'previous_year':
          return { icon: 'school' as const, bgColor: '#FEF3C7', iconColor: '#D97706' };
        case 'proficiency':
          return { icon: 'trophy' as const, bgColor: '#FFFFFF', iconColor: colors.primary };
        case 'dpp':
          return { icon: 'flame' as const, bgColor: '#FEE2E2', iconColor: '#DC2626' };
        default:
          return { icon: 'clipboard' as const, bgColor: '#DBEAFE', iconColor: '#2563EB' };
      }
    };

  const renderResultsTab = () => {
    if (myResultsLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your results...</Text>
        </View>
      );
    }

    if (myResultsError) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={styles.errorText}>{myResultsError}</Text>
          <TouchableOpacity onPress={fetchTestResults}>
            <LinearGradient colors={[colors.primary, '#4ADE80']} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: colors.text }}>My Results</Text>
          <View style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
            <Text style={{ fontSize: fontSize.xs, fontWeight: '600', color: colors.primary }}>{myResults.length} Tests</Text>
          </View>
        </View>

        {myResults.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="trophy-outline" size={40} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No Results Yet</Text>
            <Text style={styles.emptyText}>Complete some tests to see your results here</Text>
          </View>
        ) : (
          <View>
            {myResults.map((result: any) => {
              const statusBadge = getGradingStatusBadge(result.grading_status);
              const scoreColor = getScoreColor(result.percentage);
              const categoryLabel = result.paper_category?.replace('_', ' ').toUpperCase() || 'TEST';
              const catStyle = getCategoryStyle(result.paper_category);

              return (
                <View key={result.id} style={{
                  backgroundColor: colors.white,
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: '#E9D5FF',
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.1,
                  shadowRadius: 8,
                  elevation: 4,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <View style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: catStyle.bgColor,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}>
                      <Ionicons name={catStyle.icon} size={24} color={catStyle.iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 }} numberOfLines={2}>
                        {result.paper?.exam_name || 'Test'}{result.paper?.year ? ` ${result.paper.year}` : ''}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <View style={{
                          backgroundColor: colors.primary + '15',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 12,
                        }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>
                            {categoryLabel}
                          </Text>
                        </View>
                        {result.paper?.year && (
                          <View style={{
                            backgroundColor: '#DBEAFE',
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 12,
                          }}>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#2563EB' }}>
                              {result.paper.year}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={{
                      alignItems: 'center',
                      backgroundColor: scoreColor === '#22C55E' ? '#D1FAE5' : scoreColor === '#F59E0B' || scoreColor === '#EAB308' ? '#FEF3C7' : '#FEE2E2',
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 12,
                      minWidth: 70,
                    }}>
                      <Text style={{ fontSize: 20, fontWeight: '800', color: scoreColor }}>
                        {result.percentage !== null ? `${Math.round(result.percentage)}%` : 'N/A'}
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: scoreColor, marginTop: 2 }}>
                        {result.score}/{result.total_questions}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 14, marginBottom: 14 }}>
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#F3F4F6',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 20,
                    }}>
                      <Ionicons name="calendar-outline" size={14} color="#6B7280" />
                      <Text style={{ fontSize: 12, fontWeight: '500', color: '#4B5563', marginLeft: 4 }}>
                        {result.submitted_at ? new Date(result.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date(result.submitted_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'N/A'}
                      </Text>
                    </View>
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#F3F4F6',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 20,
                    }}>
                      <Ionicons name="time-outline" size={14} color="#6B7280" />
                      <Text style={{ fontSize: 12, fontWeight: '500', color: '#4B5563', marginLeft: 4 }}>
                        {formatResultDuration(result.time_taken_seconds)}
                      </Text>
                    </View>
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#F3F4F6',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 20,
                    }}>
                      <Ionicons name="help-circle-outline" size={14} color="#6B7280" />
                      <Text style={{ fontSize: 12, fontWeight: '500', color: '#4B5563', marginLeft: 4 }}>
                        {result.total_questions} Qs
                      </Text>
                    </View>
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: statusBadge.color + '20',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 20,
                    }}>
                      <Ionicons name={statusBadge.icon as any} size={14} color={statusBadge.color} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: statusBadge.color, marginLeft: 4 }}>
                        {statusBadge.label}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.primary,
                      paddingVertical: 12,
                      borderRadius: 12,
                      gap: 8,
                    }}
                    onPress={() => handleOpenReview(result)}
                  >
                    <Ionicons name="eye-outline" size={18} color={colors.white} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.white }}>Review Answers</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <Modal visible={showReviewModal} animationType="slide" transparent>
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}>
            <View style={{
              backgroundColor: colors.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '90%',
              padding: spacing.md,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: colors.text }}>Test Review</Text>
                <TouchableOpacity onPress={() => {
                  setShowReviewModal(false);
                  setSelectedResult(null);
                  setReviewQuestions([]);
                  setStudentAnswers([]);
                }}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              {selectedResult && (
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  <View style={{
                    backgroundColor: '#F9FAFB',
                    borderRadius: 12,
                    padding: spacing.md,
                    marginBottom: spacing.md,
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                          {selectedResult.paper?.exam_name || 'Test'}
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
                          Submitted {selectedResult.submitted_at ? new Date(selectedResult.submitted_at).toLocaleDateString() : 'N/A'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 32, fontWeight: '800', color: getScoreColor(selectedResult.percentage) }}>
                          {selectedResult.percentage !== null ? `${Math.round(selectedResult.percentage)}%` : 'N/A'}
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                          {selectedResult.score}/{selectedResult.total_questions} correct
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: 8 }}>
                      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                        Time: {formatResultDuration(selectedResult.time_taken_seconds)}
                      </Text>
                    </View>
                  </View>

                  {reviewQuestionsLoading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={styles.loadingText}>Loading questions...</Text>
                    </View>
                  ) : (
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>Questions Review</Text>
                      {reviewQuestions.map((question: any, index: number) => {
                        const userAnswer = selectedResult.answers?.[question.id];
                        const studentAnswer = studentAnswers.find((a: any) => a.question_id === question.id);
                        const isCorrect = userAnswer && question.correct_answer &&
                          userAnswer.toString().toLowerCase().trim() === question.correct_answer.toString().toLowerCase().trim();
                        const hasImageAnswer = !!studentAnswer?.answer_image_url;
                        const showClearDoubt = !isCorrect && selectedResult.percentage !== null && selectedResult.percentage <= 50;

                        let borderColor = '#E5E7EB';
                        let statusText = 'Not Answered';
                        let statusColor = '#6B7280';
                        let statusIcon = 'remove-circle-outline';

                        if (!userAnswer && !hasImageAnswer) {
                          borderColor = '#E5E7EB';
                          statusText = 'Not Answered';
                          statusColor = '#6B7280';
                          statusIcon = 'remove-circle-outline';
                        } else if (hasImageAnswer && !userAnswer) {
                          borderColor = '#3B82F6';
                          statusText = 'Image Submitted';
                          statusColor = '#3B82F6';
                          statusIcon = 'image-outline';
                        } else if (isCorrect) {
                          borderColor = '#22C55E';
                          statusText = 'Correct';
                          statusColor = '#22C55E';
                          statusIcon = 'checkmark-circle';
                        } else {
                          borderColor = '#EF4444';
                          statusText = 'Incorrect';
                          statusColor = '#EF4444';
                          statusIcon = 'close-circle';
                        }

                        const handleClearDoubt = () => {
                          setShowReviewModal(false);
                          setActiveTab('ai');
                        };

                        return (
                          <View key={question.id} style={{
                            backgroundColor: colors.white,
                            borderRadius: 12,
                            padding: spacing.md,
                            marginBottom: spacing.sm,
                            borderLeftWidth: 4,
                            borderLeftColor: borderColor,
                            borderWidth: 1,
                            borderColor: '#E5E7EB',
                          }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 14,
                                  backgroundColor: colors.primary + '15',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{index + 1}</Text>
                                </View>
                                {question.difficulty && (
                                  <View style={{
                                    backgroundColor: getDifficultyStyle(question.difficulty).bg,
                                    paddingHorizontal: 8,
                                    paddingVertical: 2,
                                    borderRadius: 10,
                                  }}>
                                    <Text style={{
                                      fontSize: 10,
                                      fontWeight: '600',
                                      color: getDifficultyStyle(question.difficulty).color,
                                      textTransform: 'capitalize',
                                    }}>{question.difficulty}</Text>
                                  </View>
                                )}
                              </View>
                              <View style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: statusColor + '15',
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 12,
                                gap: 4,
                              }}>
                                <Ionicons name={statusIcon as any} size={14} color={statusColor} />
                                <Text style={{ fontSize: 11, fontWeight: '600', color: statusColor }}>{statusText}</Text>
                              </View>
                            </View>

                            <View style={{ marginBottom: spacing.sm }}>
                              <MathText
                                content={question.question_text || ''}
                                style={{}}
                                textStyle={{ fontSize: 14, lineHeight: 22 }}
                                color={colors.text}
                              />
                            </View>

                            {hasImageAnswer && studentAnswer?.answer_image_url && (
                              <View style={{ marginBottom: spacing.sm }}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 4 }}>Your Image Answer:</Text>
                                <Image
                                  source={{ uri: studentAnswer.answer_image_url }}
                                  style={{ width: '100%', height: 150, borderRadius: 8 }}
                                  resizeMode="contain"
                                />
                              </View>
                            )}

                            <View style={{ backgroundColor: '#F9FAFB', borderRadius: 8, padding: spacing.sm }}>
                              {userAnswer && (
                                <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#6B7280', width: 100 }}>Your Answer:</Text>
                                  <View style={{ flex: 1 }}>
                                    <MathText
                                      content={String(userAnswer)}
                                      textStyle={{ fontSize: 13, fontWeight: '600' }}
                                      color={isCorrect ? '#22C55E' : '#EF4444'}
                                    />
                                  </View>
                                </View>
                              )}

                              {!isCorrect && question.correct_answer && (
                                <View style={{ flexDirection: 'row' }}>
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#6B7280', width: 100 }}>Correct:</Text>
                                  <View style={{ flex: 1 }}>
                                    <MathText
                                      content={String(question.correct_answer)}
                                      textStyle={{ fontSize: 13, fontWeight: '600' }}
                                      color="#22C55E"
                                    />
                                  </View>
                                </View>
                              )}
                            </View>

                            {question.explanation && (
                              <View style={{ marginTop: spacing.sm, backgroundColor: '#FFFFFF', padding: spacing.sm, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#22C55E' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                  <Ionicons name="bulb-outline" size={14} color="#059669" />
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#059669' }}>Explanation</Text>
                                </View>
                                <MathText
                                  content={question.explanation}
                                  textStyle={{ fontSize: 13, lineHeight: 20 }}
                                  color={colors.text}
                                />
                              </View>
                            )}

                            {showClearDoubt && !isCorrect && (userAnswer || hasImageAnswer) && (
                              <TouchableOpacity
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: '#FFFFFF',
                                  paddingVertical: 10,
                                  borderRadius: 8,
                                  marginTop: spacing.sm,
                                  gap: 6,
                                }}
                                onPress={handleClearDoubt}
                              >
                                <Ionicons name="sparkles" size={16} color={colors.primary} />
                                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>Clear Doubt with AI</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  };

  const renderDoubtsTab = () => {
    if (!subjectId) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.textLight} />
          <Text style={styles.emptyTitle}>No Subject</Text>
          <Text style={styles.emptyText}>Subject information is not available.</Text>
        </View>
      );
    }
    return (
      <DoubtsTab
        subjectId={subjectId}
        subjectName={subjectName}
        studentId={userId || undefined}
      />
    );
  };

  const renderQuestionConfigScreen = () => {
    const questionCountOptions = [5, 10, 15, 20, 25];
    const timerOptions = [null, 5, 10, 15, 20, 30];
    const maxQuestions = questionsList.length;
    const mcqCount = questionsList.filter(q => isMCQ(q)).length;
    const subjectiveCount = questionsList.filter(q => !isMCQ(q)).length;

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.mcqCountsCard}>
          <Text style={styles.mcqCountsTitle}>Questions by Difficulty</Text>
          <View style={styles.mcqCountsRow}>
            <View style={styles.mcqCountItem}>
              <Text style={styles.mcqCountValue}>{questionCounts.all}</Text>
              <Text style={styles.mcqCountLabel}>Total</Text>
            </View>
            <View style={[styles.mcqCountItem, styles.mcqCountEasy]}>
              <Text style={styles.mcqCountValue}>{questionCounts.Low}</Text>
              <Text style={styles.mcqCountLabel}>Easy</Text>
            </View>
            <View style={[styles.mcqCountItem, styles.mcqCountMedium]}>
              <Text style={styles.mcqCountValue}>{questionCounts.Medium}</Text>
              <Text style={styles.mcqCountLabel}>Medium</Text>
            </View>
            <View style={[styles.mcqCountItem, styles.mcqCountHard]}>
              <Text style={styles.mcqCountValue}>{questionCounts.Intermediate + questionCounts.Advanced}</Text>
              <Text style={styles.mcqCountLabel}>Hard</Text>
            </View>
          </View>
          {(mcqCount > 0 || subjectiveCount > 0) && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginTop: spacing.sm }}>
              <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{mcqCount} MCQ</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{subjectiveCount} Subjective</Text>
            </View>
          )}
        </View>

        <View style={styles.mcqConfigCard}>
          <View style={styles.mcqConfigHeader}>
            <View style={styles.mcqConfigIconContainer}>
              <Ionicons name="settings-outline" size={24} color={colors.primary} />
            </View>
            <Text style={styles.mcqConfigTitle}>Configure Your Test</Text>
          </View>

          <View style={styles.mcqConfigSection}>
            <Text style={styles.mcqConfigLabel}>Difficulty Level</Text>
            <View style={styles.difficultyTabs}>
              {questionDifficulties.map((diff) => (
                <TouchableOpacity
                  key={diff}
                  style={[styles.difficultyTab, selectedDifficulty === diff && styles.difficultyTabActive]}
                  onPress={() => setSelectedDifficulty(diff)}
                >
                  <Text style={[styles.difficultyTabText, selectedDifficulty === diff && styles.difficultyTabTextActive]}>
                    {diff}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.mcqConfigSection}>
            <Text style={styles.mcqConfigLabel}>Number of Questions</Text>
            <Text style={styles.availableText}>{maxQuestions} questions available</Text>
            <View style={styles.countTabs}>
              {questionCountOptions.filter(c => c <= maxQuestions || c === questionCountOptions[0]).map((count) => (
                <TouchableOpacity
                  key={count}
                  style={[styles.countTab, selectedQuestionCount === count && styles.countTabActive, count > maxQuestions && styles.countTabDisabled]}
                  onPress={() => count <= maxQuestions && setSelectedQuestionCount(count)}
                  disabled={count > maxQuestions}
                >
                  <Text style={[styles.countTabText, selectedQuestionCount === count && styles.countTabTextActive, count > maxQuestions && styles.countTabTextDisabled]}>
                    {count}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.mcqConfigSection}>
            <Text style={styles.mcqConfigLabel}>Time Limit (minutes)</Text>
            <View style={styles.countTabs}>
              {timerOptions.map((mins) => (
                <TouchableOpacity
                  key={mins ?? 'none'}
                  style={[styles.countTab, selectedTimerMinutes === mins && styles.countTabActive]}
                  onPress={() => setSelectedTimerMinutes(mins)}
                >
                  <Text style={[styles.countTabText, selectedTimerMinutes === mins && styles.countTabTextActive]}>
                    {mins === null ? 'No Limit' : `${mins}m`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.startTestButton, maxQuestions === 0 && styles.startTestButtonDisabled]}
            onPress={handleStartQuestionTest}
            disabled={maxQuestions === 0}
          >
            <LinearGradient
              colors={maxQuestions > 0 ? [colors.primary, '#4ADE80'] : ['#9CA3AF', '#9CA3AF']}
              style={styles.startTestButtonGradient}
            >
              <Text style={styles.startTestButtonText}>Start Test</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  const renderQuestionPalette = () => {
    const answeredCount = Object.keys(questionAnswers).filter(id => questionAnswers[id]).length;
    const flaggedCount = questionFlagged.size;

    return (
      <Modal visible={showPalette} transparent animationType="slide">
        <View style={styles.paletteOverlay}>
          <View style={styles.paletteContainer}>
            <View style={styles.paletteHeader}>
              <Text style={styles.paletteTitle}>Question Navigator</Text>
              <TouchableOpacity onPress={() => setShowPalette(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.paletteLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
                <Text style={styles.legendText}>Answered ({answeredCount})</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#9CA3AF' }]} />
                <Text style={styles.legendText}>Unanswered ({activeQuestions.length - answeredCount})</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={styles.legendText}>Flagged ({flaggedCount})</Text>
              </View>
            </View>

            <ScrollView style={styles.paletteGrid} showsVerticalScrollIndicator={false}>
              <View style={styles.paletteGridInner}>
                {activeQuestions.map((q, idx) => {
                  const isAnswered = !!questionAnswers[q.id];
                  const isFlagged = questionFlagged.has(q.id);
                  const isCurrent = idx === questionCurrentIndex;
                  
                  return (
                    <TouchableOpacity
                      key={q.id}
                      style={[
                        styles.paletteItem,
                        isAnswered && styles.paletteItemAnswered,
                        isFlagged && styles.paletteItemFlagged,
                        isCurrent && styles.paletteItemCurrent,
                      ]}
                      onPress={() => {
                        setQuestionCurrentIndex(idx);
                        setShowPalette(false);
                      }}
                    >
                      <Text style={[
                        styles.paletteItemText,
                        (isAnswered || isCurrent) && styles.paletteItemTextLight,
                      ]}>{idx + 1}</Text>
                      {isFlagged && (
                        <Ionicons name="flag" size={10} color={isCurrent ? colors.white : '#F59E0B'} style={styles.paletteFlag} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.paletteSubmit} onPress={() => { setShowPalette(false); handleSubmitQuestions(); }}>
              <Text style={styles.paletteSubmitText}>Submit Test</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderQuestionTestScreen = () => {
    if (activeQuestions.length === 0) return null;
    
    const currentQuestion = activeQuestions[questionCurrentIndex];
    const options = currentQuestion.options || {};
    const isFlagged = questionFlagged.has(currentQuestion.id);
    const isCurrentMCQ = isMCQ(currentQuestion);
    const diffStyle = getDifficultyStyle(currentQuestion.difficulty);

    return (
      <View style={styles.mcqTestContainer}>
        {renderQuestionPalette()}
        
        <View style={styles.mcqTestHeader}>
          <View style={styles.mcqProgressContainer}>
            <View style={styles.mcqProgressBar}>
              <View style={[styles.mcqProgressFill, { width: `${((questionCurrentIndex + 1) / activeQuestions.length) * 100}%` }]} />
            </View>
            <Text style={styles.mcqProgressText}>{questionCurrentIndex + 1} / {activeQuestions.length}</Text>
          </View>
          <View style={styles.mcqTestActions}>
            {timeRemaining !== null && (
              <View style={[styles.timerBadge, timeRemaining < 60 && styles.timerBadgeWarning]}>
                <Ionicons name="time-outline" size={14} color={timeRemaining < 60 ? '#EF4444' : colors.primary} />
                <Text style={[styles.timerText, timeRemaining < 60 && styles.timerTextWarning]}>{formatTime(timeRemaining)}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.paletteButton} onPress={() => setShowPalette(true)}>
              <Ionicons name="grid-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.mcqQuestionScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.mcqCard}>
            <View style={styles.mcqHeader}>
              <View style={styles.mcqBadge}>
                <Text style={styles.mcqBadgeText}>Q{questionCurrentIndex + 1}</Text>
              </View>
              <View style={styles.mcqMetaRow}>
                <Text style={[styles.mcqDifficultyBadge, { backgroundColor: diffStyle.bg, color: diffStyle.color }]}>{currentQuestion.difficulty}</Text>
                {!isCurrentMCQ && (
                  <View style={{ backgroundColor: '#E0E7FF', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm }}>
                    <Text style={{ fontSize: fontSize.xs, color: '#4338CA', fontWeight: '500' }}>Subjective</Text>
                  </View>
                )}
                {currentQuestion.is_important && (
                  <View style={styles.importantBadge}>
                    <Ionicons name="star" size={10} color="#D97706" />
                    <Text style={styles.importantBadgeText}>Important</Text>
                  </View>
                )}
                <Text style={styles.mcqMarks}>{currentQuestion.marks || 1} Mark{(currentQuestion.marks || 1) > 1 ? 's' : ''}</Text>
              </View>
              <TouchableOpacity onPress={() => handleFlagQuestion(currentQuestion.id)} style={styles.flagButton}>
                <Ionicons name={isFlagged ? 'flag' : 'flag-outline'} size={20} color={isFlagged ? '#F59E0B' : colors.gray400} />
              </TouchableOpacity>
            </View>

            {currentQuestion.question_image_url && (
              <Image
                source={{ uri: currentQuestion.question_image_url }}
                style={{ width: '100%', height: 200, borderRadius: borderRadius.md, marginBottom: spacing.md }}
                resizeMode="contain"
              />
            )}

            <MathText 
              content={currentQuestion.question_text} 
              style={styles.mcqQuestion}
            />

            {isCurrentMCQ ? (
              Object.entries(options).map(([key, value]) => {
                const isSelected = questionAnswers[currentQuestion.id] === key;
                const optionText = getOptionText(value);
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.mcqOption, isSelected && styles.mcqOptionSelected]}
                    onPress={() => handleSelectAnswer(currentQuestion.id, key)}
                  >
                    <Text style={[styles.mcqOptionLabel, isSelected && styles.mcqOptionLabelSelected]}>{key.toUpperCase()}.</Text>
                    <MathText 
                      content={optionText} 
                      style={[styles.mcqOptionText, isSelected && styles.mcqOptionTextSelected]}
                    />
                  </TouchableOpacity>
                );
              })
            ) : (
              <TextInput
                style={styles.subjectiveInput}
                placeholder="Type your answer here..."
                placeholderTextColor={colors.gray400}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                value={questionAnswers[currentQuestion.id] || ''}
                onChangeText={(text) => handleSelectAnswer(currentQuestion.id, text)}
              />
            )}
          </View>
        </ScrollView>

        <View style={[styles.mcqNavigation, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <TouchableOpacity 
            style={[styles.mcqNavButton, questionCurrentIndex === 0 && styles.mcqNavButtonDisabled]}
            onPress={() => setQuestionCurrentIndex(Math.max(0, questionCurrentIndex - 1))}
            disabled={questionCurrentIndex === 0}
          >
            <Ionicons name="chevron-back" size={18} color={questionCurrentIndex === 0 ? colors.gray300 : colors.primary} />
            <Text style={[styles.mcqNavButtonText, questionCurrentIndex === 0 && styles.mcqNavButtonTextDisabled]}>Previous</Text>
          </TouchableOpacity>

          {questionCurrentIndex < activeQuestions.length - 1 ? (
            <TouchableOpacity 
              style={styles.mcqNavButtonNext}
              onPress={() => setQuestionCurrentIndex(questionCurrentIndex + 1)}
            >
              <Text style={styles.mcqNavButtonNextText}>Next</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.mcqSubmitButton}
              onPress={handleSubmitQuestions}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.mcqSubmitButtonText}>Submit Test</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderQuestionResultsScreen = () => {
    const percentage = totalMarks > 0 ? Math.round((scoredMarks / totalMarks) * 100) : 0;
    const scoreColor = getScoreColor(percentage);
    const hasPending = gradeResults.some(r => r.isPending);

    return (
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.resultsContainer}>
          <View style={styles.resultsCard}>
            <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
              <Text style={[styles.scorePercentage, { color: scoreColor }]}>{percentage}%</Text>
              <Text style={styles.scoreLabel}>Score</Text>
            </View>
            <Text style={styles.scoreDetails}>{scoredMarks}/{totalMarks} marks</Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>
              {correctCount} of {activeQuestions.length} correct
            </Text>
            {hasPending && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: '#FEF3C7', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.md, marginBottom: spacing.sm }}>
                <Ionicons name="time-outline" size={16} color="#D97706" />
                <Text style={{ fontSize: fontSize.xs, color: '#92400E' }}>Some subjective answers are pending AI review</Text>
              </View>
            )}
            
            <View style={styles.resultsActions}>
              <TouchableOpacity style={styles.reviewButton} onPress={() => setQuestionScreen('review')}>
                <Ionicons name="eye-outline" size={20} color={colors.primary} />
                <Text style={styles.reviewButtonText}>Review Answers</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.retakeButton} onPress={handleRetakeTest}>
                <Ionicons name="refresh-outline" size={20} color={colors.white} />
                <Text style={styles.retakeButtonText}>Take Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderQuestionReviewScreen = () => {
    return (
      <ScrollView style={styles.reviewContainer} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backToResultsButton} onPress={() => setQuestionScreen('results')}>
          <Ionicons name="arrow-back" size={18} color={colors.primary} />
          <Text style={styles.backToResultsText}>Back to Results</Text>
        </TouchableOpacity>
        
        {activeQuestions.map((q, index) => {
          const grade = gradeResults.find(r => r.questionId === q.id);
          const isCorrect = grade?.isCorrect || false;
          const options = q.options || {};
          const isQMCQ = isMCQ(q);
          const diffStyle = getDifficultyStyle(q.difficulty);
          const borderColor = grade?.isPending ? '#F59E0B' : isCorrect ? '#22C55E' : '#EF4444';

          return (
            <View key={q.id} style={[styles.reviewCard, { borderLeftColor: borderColor }]}>
              <View style={styles.reviewHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={styles.reviewQuestionNumber}>Q{index + 1}</Text>
                  <Text style={[styles.mcqDifficultyBadge, { backgroundColor: diffStyle.bg, color: diffStyle.color }]}>{q.difficulty}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{grade?.marksAwarded || 0}/{grade?.maxMarks || q.marks || 1}</Text>
                  {grade?.isPending ? (
                    <View style={[styles.reviewStatusBadge, { backgroundColor: '#F59E0B' }]}>
                      <Ionicons name="time-outline" size={14} color={colors.white} />
                      <Text style={styles.reviewStatusText}>Pending</Text>
                    </View>
                  ) : (
                    <View style={[styles.reviewStatusBadge, isCorrect ? styles.reviewStatusCorrect : styles.reviewStatusIncorrect]}>
                      <Ionicons name={isCorrect ? 'checkmark' : 'close'} size={14} color={colors.white} />
                      <Text style={styles.reviewStatusText}>{isCorrect ? 'Correct' : 'Incorrect'}</Text>
                    </View>
                  )}
                </View>
              </View>

              {q.question_image_url && (
                <Image
                  source={{ uri: q.question_image_url }}
                  style={{ width: '100%', height: 150, borderRadius: borderRadius.md, marginBottom: spacing.sm }}
                  resizeMode="contain"
                />
              )}

              <MathText content={q.question_text} style={styles.reviewQuestionText} />
              
              {isQMCQ ? (
                Object.entries(options).map(([key, value]) => {
                  const userAnswer = grade?.selectedAnswer || '';
                  const isUserAnswer = userAnswer === key;
                  const isCorrectOption = q.correct_answer && key.toLowerCase() === q.correct_answer.toLowerCase();
                  const optionText = getOptionText(value);
                  let optionStyle = styles.reviewOption;
                  if (isCorrectOption) optionStyle = { ...optionStyle, ...styles.reviewOptionCorrect };
                  else if (isUserAnswer && !isCorrectOption) optionStyle = { ...optionStyle, ...styles.reviewOptionIncorrect };

                  return (
                    <View key={key} style={optionStyle}>
                      <Text style={styles.mcqOptionLabel}>{key.toUpperCase()}.</Text>
                      <MathText 
                        content={optionText} 
                        style={styles.mcqOptionText}
                      />
                      {isCorrectOption && <Ionicons name="checkmark" size={16} color="#22C55E" style={{ marginLeft: 'auto' }} />}
                    </View>
                  );
                })
              ) : (
                <View style={{ marginBottom: spacing.sm }}>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs }}>Your Answer:</Text>
                  <View style={{ backgroundColor: '#F9FAFB', padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: borderColor }}>
                    <Text style={{ fontSize: fontSize.sm, color: colors.text }}>{grade?.selectedAnswer || 'No answer provided'}</Text>
                  </View>
                  {grade?.feedback && (
                    <View style={{ marginTop: spacing.sm, backgroundColor: grade.isPending ? '#FEF3C7' : '#EFF6FF', padding: spacing.md, borderRadius: borderRadius.md }}>
                      <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: grade.isPending ? '#92400E' : '#1E40AF', marginBottom: spacing.xs }}>
                        {grade.isPending ? 'Status:' : 'AI Feedback:'}
                      </Text>
                      <Text style={{ fontSize: fontSize.sm, color: grade.isPending ? '#92400E' : '#1E3A5F', lineHeight: 20 }}>{grade.feedback}</Text>
                    </View>
                  )}
                </View>
              )}

              {q.explanation && (
                <View style={styles.explanationBox}>
                  <Text style={styles.explanationLabel}>Explanation:</Text>
                  <MathText content={q.explanation} style={styles.explanationText} />
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const renderQuestionsTab = () => {
    if (questionsLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading questions...</Text>
        </View>
      );
    }

    if (questionsError) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={styles.errorText}>{questionsError}</Text>
          <TouchableOpacity onPress={fetchChapterQuestions}>
            <LinearGradient colors={[colors.primary, '#4ADE80']} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      );
    }

    if (isSubmitting) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Grading answers...</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs }}>AI is evaluating subjective answers</Text>
        </View>
      );
    }

    if (questionsLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading questions...</Text>
        </View>
      );
    }
    if (questionsError) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyText}>{questionsError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchChapterQuestions}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (activeQuestions.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="help-circle-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No questions available for this chapter yet.</Text>
        </View>
      );
    }

    switch (questionScreen) {
      case 'test':
        return renderQuestionTestScreen();
      case 'results':
        return renderQuestionResultsScreen();
      case 'review':
        return renderQuestionReviewScreen();
      default:
        return renderQuestionTestScreen();
    }
  };

  const renderPyqsTab = () => {
    return <PYQTab subjectId={subjectId} />;
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'videos':
        return renderVideosTab();
      case 'ai':
        return renderAITab();
      case 'questions':
        return renderQuestionsTab();
      case 'assignments':
        return renderAssignmentsTab();
      case 'pyqs':
        return renderPyqsTab();
      case 'results':
        return renderResultsTab();
      case 'doubts':
        return renderDoubtsTab();
      default:
        return null;
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
          <Ionicons name="arrow-back" size={20} color={colors.white} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIconContainer}>
              <Ionicons name="folder-open" size={16} color={colors.primary} />
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>Ch {chapterNumber}: {chapterTitle}</Text>
          </View>
          <Text style={styles.headerSubtitle}>{subjectName} - Chapter Content</Text>
        </View>
      </LinearGradient>

      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => {
                setActiveTab(tab.id);
                if (tab.id === 'questions') {
                  setQuestionScreen('test');
                }
                if (tab.id === 'assignments') {
                  setAssignmentView('list');
                }
              }}
            >
              <Ionicons
                name={tab.icon as any}
                size={18}
                color={activeTab === tab.id ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.content}>
        {renderTabContent()}
      </View>
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
    paddingTop: 44,
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
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
    flex: 1,
  },
  headerSubtitle: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
    marginLeft: 36,
  },
  tabsContainer: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tabsScroll: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
    padding: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: '#EF4444',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  retryButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  comingSoonText: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  videoPlayerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeVideoButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webView: {
    flex: 1,
  },
  videoInfo: {
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  videoTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  videoDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  videoCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  videoThumbnail: {
    width: 100,
    height: 80,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoCardContent: {
    flex: 1,
    padding: spacing.sm,
  },
  videoCardTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  videoCardDescription: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  videoCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  durationText: {
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  languageBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  languageText: {
    fontSize: fontSize.xs,
    color: '#0284C7',
  },
  paperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  paperIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  paperCardContent: {
    flex: 1,
  },
  paperTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  paperMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  yearBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  yearText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: '600',
  },
  paperQuestions: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  mcqConfigCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  mcqConfigHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  mcqConfigIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mcqConfigTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  mcqConfigSection: {
    marginBottom: spacing.lg,
  },
  mcqConfigLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  availableText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  difficultyTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  difficultyTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: '#F3F4F6',
  },
  difficultyTabActive: {
    backgroundColor: colors.primary,
  },
  difficultyTabText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  difficultyTabTextActive: {
    color: colors.white,
  },
  countTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  countTab: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.lg,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countTabActive: {
    backgroundColor: colors.primary,
  },
  countTabDisabled: {
    opacity: 0.4,
  },
  countTabText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  countTabTextActive: {
    color: colors.white,
  },
  countTabTextDisabled: {
    color: colors.gray300,
  },
  startTestButton: {
    marginTop: spacing.md,
  },
  startTestButtonDisabled: {
    opacity: 0.5,
  },
  startTestButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  startTestButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  mcqTestContainer: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 0,
  },
  mcqProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  mcqProgressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  mcqProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  mcqProgressText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  mcqQuestionScroll: {
    flex: 1,
  },
  mcqCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  mcqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  mcqBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  mcqBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.white,
  },
  mcqMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mcqDifficultyBadge: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  mcqDifficultyEasy: {
    backgroundColor: '#D1FAE5',
    color: '#059669',
  },
  mcqDifficultyMedium: {
    backgroundColor: '#FEF3C7',
    color: '#D97706',
  },
  mcqDifficultyHard: {
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
  },
  importantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  importantBadgeText: {
    fontSize: fontSize.xs,
    color: '#D97706',
    fontWeight: '500',
  },
  mcqMarks: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  mcqQuestion: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  mcqOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: '#F9FAFB',
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  mcqOptionSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.primary,
  },
  mcqOptionLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
    marginRight: spacing.sm,
    width: 24,
  },
  mcqOptionLabelSelected: {
    color: colors.primary,
  },
  mcqOptionText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  mcqOptionTextSelected: {
    color: colors.text,
  },
  mcqNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  mcqNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  mcqNavButtonDisabled: {
    opacity: 0.4,
  },
  mcqNavButtonText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  mcqNavButtonTextDisabled: {
    color: colors.gray300,
  },
  mcqNavButtonNext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
  },
  mcqNavButtonNextText: {
    fontSize: fontSize.sm,
    color: colors.white,
    fontWeight: '600',
  },
  mcqSubmitButton: {
    backgroundColor: '#22C55E',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  mcqSubmitButtonText: {
    fontSize: fontSize.sm,
    color: colors.white,
    fontWeight: '700',
  },
  resultsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  resultsCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  scorePercentage: {
    fontSize: 32,
    fontWeight: '800',
  },
  scoreLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  scoreDetails: {
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  resultsActions: {
    width: '100%',
    gap: spacing.sm,
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  reviewButtonText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '600',
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  retakeButtonText: {
    fontSize: fontSize.md,
    color: colors.white,
    fontWeight: '600',
  },
  reviewContainer: {
    flex: 1,
    padding: spacing.md,
  },
  backToResultsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  backToResultsText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  reviewCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
  },
  reviewCardCorrect: {
    borderLeftColor: '#22C55E',
  },
  reviewCardIncorrect: {
    borderLeftColor: '#EF4444',
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  reviewQuestionNumber: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  reviewStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  reviewStatusCorrect: {
    backgroundColor: '#22C55E',
  },
  reviewStatusIncorrect: {
    backgroundColor: '#EF4444',
  },
  reviewStatusText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: '600',
  },
  reviewQuestionText: {
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: spacing.md,
  },
  reviewOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: '#F9FAFB',
    marginBottom: spacing.xs,
  },
  reviewOptionCorrect: {
    backgroundColor: '#D1FAE5',
  },
  reviewOptionIncorrect: {
    backgroundColor: '#FEE2E2',
  },
  explanationBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
  },
  explanationLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#059669',
    marginBottom: spacing.xs,
  },
  explanationText: {
    fontSize: fontSize.sm,
    color: '#065F46',
    lineHeight: 20,
  },
  subjectiveInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.sm,
    color: colors.text,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  mcqCountsCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  mcqCountsTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  mcqCountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  mcqCountItem: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
  },
  mcqCountEasy: {
    backgroundColor: '#D1FAE5',
  },
  mcqCountMedium: {
    backgroundColor: '#FEF3C7',
  },
  mcqCountHard: {
    backgroundColor: '#FEE2E2',
  },
  mcqCountValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  mcqCountLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  mcqTestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  mcqTestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
  },
  timerBadgeWarning: {
    backgroundColor: '#FEE2E2',
  },
  timerText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  timerTextWarning: {
    color: '#EF4444',
  },
  paletteButton: {
    padding: spacing.xs,
  },
  flagButton: {
    marginLeft: 'auto',
    padding: spacing.xs,
  },
  paletteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  paletteContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  paletteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  paletteTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  paletteLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  paletteGrid: {
    maxHeight: 300,
  },
  paletteGridInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  paletteItem: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  paletteItemAnswered: {
    backgroundColor: '#22C55E',
  },
  paletteItemFlagged: {
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  paletteItemCurrent: {
    backgroundColor: colors.primary,
  },
  paletteItemText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  paletteItemTextLight: {
    color: colors.white,
  },
  paletteFlag: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  paletteSubmit: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  paletteSubmitText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  assignmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  assignmentIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  assignmentCardContent: {
    flex: 1,
  },
  assignmentTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  assignmentDescription: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  assignmentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  assignmentDueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  assignmentOverdueBadge: {
    backgroundColor: '#FEE2E2',
  },
  assignmentDueText: {
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  assignmentOverdueText: {
    color: '#EF4444',
  },
  assignmentMarks: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  resultScoreCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  resultScoreText: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  resultCardContent: {
    flex: 1,
  },
  resultTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  resultDate: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  resultTime: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

const aStyles = StyleSheet.create({
  backToListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  backToListText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  scoreCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  scoreCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  scoreCardTitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  scoreCardValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  feedbackSection: {
    marginBottom: spacing.md,
  },
  feedbackLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  feedbackText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  gradedQuestionCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  questionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  questionNumber: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
  },
  marksBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  marksBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  questionText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  gradedOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: '#F9FAFB',
  },
  gradedOptionCorrect: {
    backgroundColor: '#D1FAE5',
  },
  gradedOptionWrong: {
    backgroundColor: '#FEE2E2',
  },
  gradedOptionText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  subjectiveAnswerBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: '#F9FAFB',
    borderRadius: borderRadius.md,
  },
  answerLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  answerText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
  aFeedbackBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: '#EFF6FF',
    borderRadius: borderRadius.md,
  },
  aFeedbackLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: spacing.xs,
  },
  aFeedbackText: {
    fontSize: fontSize.sm,
    color: '#1E3A5F',
    lineHeight: 20,
  },
  tryAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginVertical: spacing.lg,
  },
  tryAgainButtonText: {
    fontSize: fontSize.md,
    color: colors.white,
    fontWeight: '600',
  },
  testHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timerText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
  paletteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
  },
  paletteButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  paletteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paletteModal: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '85%',
    maxHeight: '70%',
  },
  paletteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  paletteTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  paletteLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  paletteItem: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paletteItemAnswered: {
    backgroundColor: '#22C55E',
  },
  paletteItemFlagged: {
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  paletteItemCurrent: {
    backgroundColor: colors.primary,
  },
  paletteItemText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  questionCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  questionTypeBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  questionTypeText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '500',
  },
  questionMarks: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  flagBtn: {
    marginLeft: 'auto',
    padding: spacing.xs,
  },
  flagBtnActive: {},
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.primary,
  },
  optionCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  optionCircleSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  optionLetter: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  optionText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  trueFalseContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  trueFalseButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  trueFalseButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  trueFalseText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  answerInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.sm,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
    marginTop: spacing.sm,
  },
  testFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  navButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  submitTestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#22C55E',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  submitTestButtonText: {
    fontSize: fontSize.sm,
    color: colors.white,
    fontWeight: '700',
  },
  detailCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  detailIconRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  detailIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  detailDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  detailMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  detailMetaItem: {
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  detailMetaValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.xs,
  },
  detailMetaLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  instructionsBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  instructionsLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: spacing.xs,
  },
  instructionsText: {
    fontSize: fontSize.sm,
    color: '#78350F',
    lineHeight: 20,
  },
  pastAttemptBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  pastAttemptText: {
    fontSize: fontSize.sm,
    color: '#2BBD6E',
    fontWeight: '500',
  },
  solveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  solveButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  newPracticeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  newPracticeButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.white,
  },
  assignmentListCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  assignmentLeftBorder: {
    width: 4,
    backgroundColor: '#F59E0B',
  },
  assignmentListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statusBadgeText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: '600',
  },
  metaLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  metaValue: {
    fontWeight: '600',
    color: colors.text,
  },
  scoreTag: {
    marginTop: spacing.sm,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  scoreTagText: {
    fontSize: fontSize.xs,
    color: '#2BBD6E',
    fontWeight: '600',
  },
});
