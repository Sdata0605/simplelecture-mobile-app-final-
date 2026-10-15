import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { PreviousYearQuestion, supabase } from '../services/supabase';
import MathText from '../components/MathText';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TestMode = 'test' | 'result' | 'review';

export default function PreviousYearTestScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PreviousYearTest'>>();
  const { paperId, paperTitle, questionCount, timeLimitMinutes, testId, testTitle, testType, subjectId } = route.params;

  // Determine if this is a paper (PYQ) or a test (from tests table)
  const isTestFromTestsTable = !!testId && !paperId;
  const displayTitle = paperTitle || testTitle || 'Test';

  const [mode, setMode] = useState<TestMode>('test');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [timeRemaining, setTimeRemaining] = useState(timeLimitMinutes ? timeLimitMinutes * 60 : null);
  const [showPalette, setShowPalette] = useState(false);
  const [score, setScore] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const [allQuestions, setAllQuestions] = useState<PreviousYearQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [questionFilter, setQuestionFilter] = useState<'all' | 'important'>('all');
  const [testStartTime, setTestStartTime] = useState(Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [multiSelectAnswers, setMultiSelectAnswers] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    fetchQuestions();
  }, [paperId, testId]);

  const fetchQuestions = async () => {
    setIsLoading(true);
    setLoadError(null);
    
    if (isTestFromTestsTable && testId) {
      // Fetch questions from test_questions join table for tests from tests table
      console.log('[PreviousYearTest] Fetching questions for test:', testId);
      const result = await supabase.getTestQuestions(testId);
      
      if (result.success && result.questions) {
        console.log('[PreviousYearTest] Loaded', result.questions.length, 'test questions');
        const limitedQuestions = questionCount 
          ? result.questions.slice(0, questionCount) 
          : result.questions;
        setAllQuestions(limitedQuestions);
      } else {
        console.error('[PreviousYearTest] Error:', result.error);
        setLoadError(result.error || 'Failed to load questions');
      }
    } else if (paperId) {
      // Fetch questions from questions table for PYQ papers
      console.log('[PreviousYearTest] Fetching questions for paper:', paperId);
      const result = await supabase.getPreviousYearQuestions(paperId);
      
      if (result.success && result.questions) {
        console.log('[PreviousYearTest] Loaded', result.questions.length, 'paper questions');
        const limitedQuestions = questionCount 
          ? result.questions.slice(0, questionCount) 
          : result.questions;
        setAllQuestions(limitedQuestions);
      } else {
        console.error('[PreviousYearTest] Error:', result.error);
        setLoadError(result.error || 'Failed to load questions');
      }
    } else {
      setLoadError('No paper or test ID provided');
    }
    setIsLoading(false);
  };

  const importantQuestions = allQuestions.filter(q => q.is_important);
  const questions = questionFilter === 'important' ? importantQuestions : allQuestions;
  const currentQuestion = questions[currentIndex];
  const hasImportantQuestions = importantQuestions.length > 0;

  useEffect(() => {
    if (timeLimitMinutes && timeRemaining !== null && timeRemaining > 0 && mode === 'test') {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev !== null && prev <= 1) {
            handleSubmit();
            return 0;
          }
          return prev !== null ? prev - 1 : null;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode]);

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return 'Unlimited';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswer = (answer: string) => {
    setAnswers({ ...answers, [currentQuestion.id]: answer });
  };

  const handleMultiSelectAnswer = (questionId: string, option: string) => {
    setMultiSelectAnswers(prev => {
      const currentSelections = prev[questionId] || new Set();
      const newSelections = new Set(currentSelections);
      if (newSelections.has(option)) {
        newSelections.delete(option);
      } else {
        newSelections.add(option);
      }
      // Also update the main answers state with joined selections for submission
      const selectedArray = Array.from(newSelections).sort();
      setAnswers(a => ({ ...a, [questionId]: selectedArray.join(',') }));
      return { ...prev, [questionId]: newSelections };
    });
  };

  const handleFlag = () => {
    const newFlagged = new Set(flagged);
    if (newFlagged.has(currentQuestion.id)) {
      newFlagged.delete(currentQuestion.id);
    } else {
      newFlagged.add(currentQuestion.id);
    }
    setFlagged(newFlagged);
  };

  const handleSubmit = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsSubmitting(true);
    
    let correctCount = 0;
    // Always score ALL questions (not just filtered), only MCQ and numeric (not descriptive)
    allQuestions.forEach((q) => {
      if (!isDescriptiveQuestion(q) && answers[q.id]?.toLowerCase() === q.correct_answer?.toLowerCase()) {
        correctCount++;
      }
    });
    setScore(correctCount);

    // Calculate time taken
    const timeTakenSeconds = Math.floor((Date.now() - testStartTime) / 1000);
    const scorableCount = allQuestions.filter(q => !isDescriptiveQuestion(q)).length;
    const percentage = scorableCount > 0 ? Math.round((correctCount / scorableCount) * 100) : 0;

    // Submit to database
    try {
      const userResult = await supabase.getUserProfile();
      if (userResult.success && userResult.user) {
        if (isTestFromTestsTable && testId && subjectId) {
          // Submit to test_results table for tests from tests table
          await supabase.submitTestResult({
            testId,
            studentId: userResult.user.id,
            subjectId,
            testType: testType || 'practice',
            score: correctCount,
            totalQuestions: scorableCount,
            percentage,
            timeTakenSeconds,
            answers,
            gradingStatus: 'graded',
          });
          console.log('[PreviousYearTest] Test result submitted to test_results table');
        } else if (paperId) {
          // Submit to paper_test_results table for PYQ papers
          await supabase.submitPaperTestResult({
            student_id: userResult.user.id,
            paper_id: paperId,
            score: correctCount,
            total_questions: scorableCount,
            percentage,
            time_taken_seconds: timeTakenSeconds,
            answers,
            grading_status: 'graded',
          });
          console.log('[PreviousYearTest] Test result submitted to paper_test_results table');
        }
      }
    } catch (error) {
      console.error('[PreviousYearTest] Failed to submit test result:', error);
    }

    setIsSubmitting(false);
    setMode('result');
  };

  const handleRetake = () => {
    setAnswers({});
    setMultiSelectAnswers({});
    setFlagged(new Set());
    setCurrentIndex(0);
    setTimeRemaining(timeLimitMinutes ? timeLimitMinutes * 60 : null);
    setScore(0);
    setMode('test');
    setQuestionFilter('all');
    setTestStartTime(Date.now()); // Reset start time for accurate tracking
  };

  const handleFilterChange = (filter: 'all' | 'important') => {
    if (filter !== questionFilter) {
      setQuestionFilter(filter);
      setCurrentIndex(0);
    }
  };

  const getQuestionStatus = (qId: string) => {
    if (answers[qId]) return 'answered';
    if (flagged.has(qId)) return 'flagged';
    return 'unanswered';
  };

  // Helper to check if question is descriptive (no MCQ options, not numeric/integer)
  const isDescriptiveQuestion = (q: PreviousYearQuestion) => {
    if (q.question_type === 'subjective' || q.question_type === 'descriptive' || q.question_type === 'practical') {
      return true;
    }
    // If it's not mcq/numeric/integer/true_false and has no options, treat as descriptive
    if (q.question_type !== 'mcq' && q.question_type !== 'numeric' && q.question_type !== 'integer' && q.question_type !== 'true_false' && (!q.options || Object.keys(q.options).length === 0)) {
      return true;
    }
    return false;
  };

  // Count only MCQ/numeric questions for scoring (exclude descriptive) - always use allQuestions for consistent scoring
  const scorableQuestions = allQuestions.filter(q => !isDescriptiveQuestion(q));
  const descriptiveQuestions = allQuestions.filter(q => isDescriptiveQuestion(q));
  const scorePercentage = scorableQuestions.length > 0 ? Math.round((score / scorableQuestions.length) * 100) : 0;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading questions...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
        <Text style={styles.errorTitle}>Failed to Load Questions</Text>
        <Text style={styles.errorMessage}>{loadError}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchQuestions}>
          <Ionicons name="refresh-outline" size={20} color={colors.white} />
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButtonError} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonErrorText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="document-text-outline" size={64} color={colors.gray400} />
        <Text style={styles.emptyTitle}>No Questions Found</Text>
        <Text style={styles.emptyMessage}>This paper doesn't have any questions yet.</Text>
        <TouchableOpacity style={styles.backButtonError} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonErrorText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (mode === 'result') {
    return (
      <View style={styles.resultContainer}>
        <View style={styles.scoreCircle}>
          <Text style={styles.scorePercentage}>{scorePercentage}%</Text>
        </View>
        <Text style={styles.resultTitle}>Test Completed!</Text>
        <Text style={styles.resultSubtitle}>
          You scored {score} out of {scorableQuestions.length} questions
          {descriptiveQuestions.length > 0 && `\n(${descriptiveQuestions.length} descriptive questions pending review)`}
        </Text>
        <View style={styles.resultActions}>
          <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
            <Ionicons name="refresh-outline" size={20} color={colors.gray700} />
            <Text style={styles.retakeButtonText}>Retake Test</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reviewButton} onPress={() => setMode('review')}>
            <Ionicons name="eye-outline" size={20} color={colors.white} />
            <Text style={styles.reviewButtonText}>Review Answers</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.backToPapersButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back-outline" size={20} color={colors.primary} />
          <Text style={styles.backToPapersText}>Back to Papers</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (mode === 'review') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => setMode('result')}>
            <Ionicons name="chevron-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Answers</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={styles.reviewContent}>
          {allQuestions.map((q, idx) => {
            const userAnswer = answers[q.id];
            const isDescriptive = isDescriptiveQuestion(q);
            const isCorrect = !isDescriptive && userAnswer === q.correct_answer;
            return (
              <View key={q.id} style={styles.reviewCard}>
                <View style={styles.reviewCardHeader}>
                  <View style={styles.questionBadgeRow}>
                    <Text style={styles.reviewQuestionNum}>Question {idx + 1}</Text>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeBadgeText}>
                        {isDescriptive ? 'DESCRIPTIVE' : q.question_type.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  {isDescriptive ? (
                    <View style={styles.pendingBadge}>
                      <Ionicons name="time-outline" size={16} color="#F59E0B" />
                      <Text style={styles.pendingBadgeText}>Awaiting Review</Text>
                    </View>
                  ) : (
                    <View style={[styles.correctBadge, !isCorrect && styles.incorrectBadge]}>
                      <Ionicons name={isCorrect ? 'checkmark-circle' : 'close-circle'} size={16} color={isCorrect ? '#22C55E' : '#EF4444'} />
                      <Text style={[styles.correctBadgeText, !isCorrect && styles.incorrectBadgeText]}>
                        {isCorrect ? 'Correct' : 'Incorrect'}
                      </Text>
                    </View>
                  )}
                </View>
                <MathText 
                  content={q.question_text} 
                  style={styles.reviewQuestionTextContainer}
                  textStyle={styles.reviewQuestionText}
                />
                
                {/* MCQ options */}
                {q.question_type === 'mcq' && q.options && !isDescriptive && (
                  <View style={styles.reviewOptions}>
                    {Object.entries(q.options).map(([optLetter, optData]) => {
                      const optText = typeof optData === 'object' && optData.text ? optData.text : String(optData);
                      const isUserAnswer = userAnswer === optLetter;
                      const isCorrectAnswer = q.correct_answer === optLetter;
                      return (
                        <View
                          key={optLetter}
                          style={[
                            styles.reviewOption,
                            isCorrectAnswer && styles.reviewOptionCorrect,
                            isUserAnswer && !isCorrect && styles.reviewOptionWrong,
                          ]}
                        >
                          <View style={styles.reviewOptionContent}>
                            <Text style={[
                              styles.reviewOptionLetter,
                              isCorrectAnswer && styles.reviewOptionTextCorrect,
                              isUserAnswer && !isCorrect && styles.reviewOptionTextWrong,
                            ]}>
                              {optLetter}.
                            </Text>
                            <View style={styles.reviewOptionTextContainer}>
                              <MathText 
                                content={optText}
                                textStyle={[
                                  styles.reviewOptionText,
                                  isCorrectAnswer && styles.reviewOptionTextCorrect,
                                  isUserAnswer && !isCorrect && styles.reviewOptionTextWrong,
                                ]}
                                color={isCorrectAnswer ? '#22C55E' : (isUserAnswer && !isCorrect) ? '#EF4444' : colors.gray700}
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
                
                {/* Numeric answer review */}
                {q.question_type === 'numeric' && !isDescriptive && (
                  <View style={styles.numericReview}>
                    <Text style={styles.numericLabel}>Your answer: <Text style={isCorrect ? styles.correctText : styles.incorrectText}>{userAnswer || 'Not answered'}</Text></Text>
                    <Text style={styles.numericLabel}>Correct answer: <Text style={styles.correctText}>{q.correct_answer}</Text></Text>
                  </View>
                )}
                
                {/* Descriptive answer review */}
                {isDescriptive && (
                  <View style={styles.descriptiveReview}>
                    <Text style={styles.descriptiveLabel}>Your Answer:</Text>
                    <View style={styles.descriptiveAnswerBox}>
                      <Text style={styles.descriptiveAnswerText}>
                        {userAnswer || 'No answer provided'}
                      </Text>
                    </View>
                    <Text style={styles.descriptiveNote}>
                      This answer will be reviewed by your instructor.
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.testHeader}>
        <TouchableOpacity style={styles.submitButton} onPress={() => {
          Alert.alert('Submit Test', 'Are you sure you want to submit?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Submit', onPress: handleSubmit },
          ]);
        }}>
          <Text style={styles.submitButtonText}>Submit Test</Text>
        </TouchableOpacity>
        <Text style={styles.questionCounter}>Question {currentIndex + 1} of {questions.length}</Text>
        <View style={styles.timerContainer}>
          <Ionicons name="time-outline" size={18} color={colors.gray600} />
          <Text style={styles.timerText}>{formatTime(timeRemaining)}</Text>
        </View>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${((currentIndex + 1) / questions.length) * 100}%` }]} />
      </View>

      {hasImportantQuestions && (
        <View style={styles.filterTabs}>
          <TouchableOpacity
            style={[styles.filterTab, questionFilter === 'all' && styles.filterTabActive]}
            onPress={() => handleFilterChange('all')}
          >
            <Text style={[styles.filterTabText, questionFilter === 'all' && styles.filterTabTextActive]}>
              All Questions ({allQuestions.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, questionFilter === 'important' && styles.filterTabActive]}
            onPress={() => handleFilterChange('important')}
          >
            <Ionicons 
              name="star" 
              size={14} 
              color={questionFilter === 'important' ? colors.white : '#D97706'} 
              style={styles.filterTabIcon}
            />
            <Text style={[styles.filterTabText, questionFilter === 'important' && styles.filterTabTextActive]}>
              Important ({importantQuestions.length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.questionContent}>
        <View style={styles.questionCard}>
          <View style={styles.questionHeader}>
            <View style={styles.badgesRow}>
              <View style={styles.difficultyBadge}>
                <Text style={styles.difficultyText}>{currentQuestion.difficulty}</Text>
              </View>
              {currentQuestion.is_important && (
                <View style={styles.importantBadge}>
                  <Ionicons name="star" size={12} color="#D97706" />
                  <Text style={styles.importantBadgeText}>Important</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={handleFlag}>
              <Ionicons name={flagged.has(currentQuestion.id) ? 'flag' : 'flag-outline'} size={24} color={flagged.has(currentQuestion.id) ? '#F59E0B' : colors.gray400} />
            </TouchableOpacity>
          </View>

          <MathText 
            content={currentQuestion.question_text} 
            style={styles.questionTextContainer}
            textStyle={styles.questionText}
          />

          {/* MCQ single choice */}
          {currentQuestion.question_type === 'mcq' && currentQuestion.question_format !== 'multiple_choice' && currentQuestion.options && (
            <View style={styles.options}>
              {Object.entries(currentQuestion.options).map(([letter, optionData]) => {
                const isSelected = answers[currentQuestion.id] === letter;
                const optionText = typeof optionData === 'object' && optionData.text ? optionData.text : String(optionData);
                return (
                  <TouchableOpacity
                    key={letter}
                    style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                    onPress={() => handleAnswer(letter)}
                  >
                    <View style={[styles.optionLetter, isSelected && styles.optionLetterSelected]}>
                      <Text style={[styles.optionLetterText, isSelected && styles.optionLetterTextSelected]}>{letter}.</Text>
                    </View>
                    <View style={styles.optionTextContainer}>
                      <MathText 
                        content={optionText} 
                        textStyle={[styles.optionText, isSelected && styles.optionTextSelected]}
                        color={isSelected ? colors.primary : colors.gray700}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* MCQ multiple choice (checkboxes) */}
          {currentQuestion.question_type === 'mcq' && currentQuestion.question_format === 'multiple_choice' && currentQuestion.options && (
            <View style={styles.options}>
              <Text style={styles.multiSelectHint}>Select all that apply</Text>
              {Object.entries(currentQuestion.options).map(([letter, optionData]) => {
                const isSelected = multiSelectAnswers[currentQuestion.id]?.has(letter) || false;
                const optionText = typeof optionData === 'object' && optionData.text ? optionData.text : String(optionData);
                return (
                  <TouchableOpacity
                    key={letter}
                    style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                    onPress={() => handleMultiSelectAnswer(currentQuestion.id, letter)}
                  >
                    <View style={[styles.optionCheckbox, isSelected && styles.optionCheckboxSelected]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color={colors.white} />}
                    </View>
                    <View style={styles.optionTextContainer}>
                      <MathText 
                        content={optionText} 
                        textStyle={[styles.optionText, isSelected && styles.optionTextSelected]}
                        color={isSelected ? colors.primary : colors.gray700}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* True/False question type */}
          {currentQuestion.question_type === 'true_false' && (
            <View style={styles.options}>
              {['True', 'False'].map((option) => {
                const isSelected = answers[currentQuestion.id]?.toLowerCase() === option.toLowerCase();
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                    onPress={() => handleAnswer(option)}
                  >
                    <View style={[styles.optionLetter, isSelected && styles.optionLetterSelected]}>
                      <Ionicons 
                        name={option === 'True' ? 'checkmark-circle-outline' : 'close-circle-outline'} 
                        size={20} 
                        color={isSelected ? colors.white : colors.gray500} 
                      />
                    </View>
                    <View style={styles.optionTextContainer}>
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Integer type */}
          {currentQuestion.question_type === 'integer' && (
            <View style={styles.numericInput}>
              <Text style={styles.numericLabel}>Enter your integer answer:</Text>
              <TextInput
                style={styles.numericInputField}
                value={answers[currentQuestion.id] || ''}
                onChangeText={(text) => handleAnswer(text.replace(/[^0-9-]/g, ''))}
                keyboardType="numeric"
                placeholder="Enter a number"
                placeholderTextColor={colors.gray400}
              />
            </View>
          )}

          {currentQuestion.question_type === 'numeric' && !isDescriptiveQuestion(currentQuestion) && (
            <View style={styles.numericInput}>
              <Text style={styles.numericLabel}>Enter your numeric answer:</Text>
              <TextInput
                style={styles.numericInputField}
                value={answers[currentQuestion.id] || ''}
                onChangeText={(text) => handleAnswer(text)}
                keyboardType="default"
                placeholder="Type your answer"
                placeholderTextColor={colors.gray400}
              />
            </View>
          )}

          {/* Descriptive/Practical question input */}
          {isDescriptiveQuestion(currentQuestion) && (
            <View style={styles.descriptiveInput}>
              <Text style={styles.descriptiveInputLabel}>Write your explanation:</Text>
              <TextInput
                style={styles.descriptiveInputField}
                value={answers[currentQuestion.id] || ''}
                onChangeText={(text) => handleAnswer(text)}
                placeholder="Write your detailed answer here. Explain your reasoning, show your work, and provide a complete solution..."
                placeholderTextColor={colors.gray400}
                multiline
                numberOfLines={10}
                textAlignVertical="top"
              />
              <View style={styles.characterCount}>
                <Text style={styles.characterCountText}>
                  {(answers[currentQuestion.id] || '').length} characters
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.navigationBar}>
        <TouchableOpacity
          style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
          onPress={() => setCurrentIndex(currentIndex - 1)}
          disabled={currentIndex === 0}
        >
          <Ionicons name="chevron-back" size={20} color={currentIndex === 0 ? colors.gray400 : colors.gray700} />
          <Text style={[styles.navButtonText, currentIndex === 0 && styles.navButtonTextDisabled]}>Previous</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.paletteButton} onPress={() => setShowPalette(true)}>
          <Ionicons name="grid-outline" size={20} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, styles.navButtonNext, currentIndex === questions.length - 1 && styles.navButtonDisabled]}
          onPress={() => setCurrentIndex(currentIndex + 1)}
          disabled={currentIndex === questions.length - 1}
        >
          <Text style={[styles.navButtonTextNext, currentIndex === questions.length - 1 && styles.navButtonTextDisabled]}>Next</Text>
          <Ionicons name="chevron-forward" size={20} color={currentIndex === questions.length - 1 ? colors.gray400 : colors.white} />
        </TouchableOpacity>
      </View>

      <Modal visible={showPalette} transparent animationType="fade" onRequestClose={() => setShowPalette(false)}>
        <View style={styles.paletteOverlay}>
          <View style={styles.paletteModal}>
            <View style={styles.paletteHeader}>
              <Text style={styles.paletteTitle}>Question Palette</Text>
              <TouchableOpacity onPress={() => setShowPalette(false)}>
                <Ionicons name="close" size={24} color={colors.gray700} />
              </TouchableOpacity>
            </View>
            <View style={styles.paletteGrid}>
              {questions.map((q, idx) => {
                const status = getQuestionStatus(q.id);
                return (
                  <View key={q.id} style={styles.paletteItemWrapper}>
                    <TouchableOpacity
                      style={[
                        styles.paletteItem,
                        status === 'answered' && styles.paletteItemAnswered,
                        status === 'flagged' && styles.paletteItemFlagged,
                        idx === currentIndex && styles.paletteItemCurrent,
                      ]}
                      onPress={() => { setCurrentIndex(idx); setShowPalette(false); }}
                    >
                      <Text style={[
                        styles.paletteItemText,
                        status === 'answered' && styles.paletteItemTextAnswered,
                      ]}>{idx + 1}</Text>
                    </TouchableOpacity>
                    {q.is_important && (
                      <View style={styles.paletteStarBadge}>
                        <Ionicons name="star" size={10} color="#D97706" />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            <View style={styles.paletteLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={styles.legendText}>Answered</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={styles.legendText}>Flagged</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.gray200 }]} />
                <Text style={styles.legendText}>Not Answered</Text>
              </View>
              <View style={styles.legendItem}>
                <Ionicons name="star" size={12} color="#D97706" />
                <Text style={styles.legendText}>Important</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray50,
  },
  testHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: 50,
    paddingBottom: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  submitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: borderRadius.md,
  },
  submitButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray700,
  },
  questionCounter: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timerText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray700,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.gray200,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray100,
    gap: 4,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterTabText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray600,
  },
  filterTabTextActive: {
    color: colors.white,
  },
  filterTabIcon: {
    marginRight: 2,
  },
  questionContent: {
    flex: 1,
    padding: spacing.md,
  },
  questionCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  difficultyBadge: {
    backgroundColor: colors.gray100,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  difficultyText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.gray700,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  importantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    gap: 4,
  },
  importantBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: '#D97706',
  },
  questionTextContainer: {
    marginBottom: spacing.lg,
  },
  questionText: {
    fontSize: fontSize.md,
    color: colors.gray900,
    lineHeight: 24,
  },
  options: {
    gap: spacing.sm,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  optionCardSelected: {
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    borderColor: colors.primary,
  },
  optionLetter: {
    marginRight: spacing.sm,
  },
  optionLetterSelected: {},
  optionLetterText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray500,
  },
  optionLetterTextSelected: {
    color: colors.primary,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: '500',
  },
  multiSelectHint: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  optionCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.gray400,
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCheckboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  numericInput: {
    marginTop: spacing.md,
  },
  numericLabel: {
    fontSize: fontSize.sm,
    color: colors.gray600,
    marginBottom: spacing.sm,
  },
  numericInputField: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.gray900,
  },
  navigationBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
    paddingBottom: 32,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: borderRadius.lg,
    gap: 4,
  },
  navButtonNext: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
  },
  navButtonTextNext: {
    fontSize: fontSize.sm,
    color: colors.white,
    fontWeight: '600',
  },
  navButtonTextDisabled: {
    color: colors.gray400,
  },
  paletteButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
  },
  paletteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  paletteModal: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 350,
  },
  paletteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  paletteTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  paletteItemWrapper: {
    position: 'relative',
  },
  paletteItem: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paletteStarBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 2,
  },
  paletteItemAnswered: {
    backgroundColor: colors.primary,
  },
  paletteItemFlagged: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  paletteItemCurrent: {
    borderColor: colors.primary,
  },
  paletteItemText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray700,
  },
  paletteItemTextAnswered: {
    color: colors.white,
  },
  paletteLegend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: fontSize.xs,
    color: colors.gray600,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: 50,
    paddingBottom: spacing.md,
    backgroundColor: colors.primary,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.white,
  },
  resultContainer: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  scoreCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  scorePercentage: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  resultTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.sm,
  },
  resultSubtitle: {
    fontSize: fontSize.md,
    color: colors.gray500,
    marginBottom: spacing.xl,
  },
  resultActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: borderRadius.lg,
  },
  retakeButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray700,
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
  },
  reviewButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.white,
  },
  backToPapersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  backToPapersText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  reviewContent: {
    flex: 1,
    padding: spacing.md,
  },
  reviewCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  questionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewQuestionNum: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  typeBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  typeBadgeText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: '600',
  },
  correctBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#22C55E',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  incorrectBadge: {
    borderColor: '#EF4444',
  },
  correctBadgeText: {
    fontSize: fontSize.xs,
    color: '#22C55E',
    fontWeight: '600',
  },
  incorrectBadgeText: {
    color: '#EF4444',
  },
  reviewQuestionTextContainer: {
    marginBottom: spacing.md,
  },
  reviewQuestionText: {
    fontSize: fontSize.md,
    color: colors.gray900,
    lineHeight: 24,
  },
  reviewOptions: {
    gap: spacing.sm,
  },
  reviewOption: {
    padding: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.lg,
  },
  reviewOptionContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  reviewOptionLetter: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray700,
    marginRight: spacing.sm,
  },
  reviewOptionTextContainer: {
    flex: 1,
  },
  reviewOptionCorrect: {
    backgroundColor: '#DCFCE7',
  },
  reviewOptionWrong: {
    backgroundColor: '#FEE2E2',
  },
  reviewOptionText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
  },
  reviewOptionTextCorrect: {
    color: '#16A34A',
  },
  reviewOptionTextWrong: {
    color: '#DC2626',
  },
  numericReview: {
    gap: spacing.sm,
  },
  correctText: {
    color: '#16A34A',
    fontWeight: '600',
  },
  incorrectText: {
    color: '#DC2626',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.gray50,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.gray600,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.gray50,
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray900,
    marginTop: spacing.md,
  },
  errorMessage: {
    fontSize: fontSize.sm,
    color: colors.gray600,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  backButtonError: {
    paddingVertical: spacing.md,
  },
  backButtonErrorText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.gray50,
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray900,
    marginTop: spacing.md,
  },
  emptyMessage: {
    fontSize: fontSize.sm,
    color: colors.gray600,
    textAlign: 'center',
  },
  // Descriptive question styles
  descriptiveInput: {
    marginTop: spacing.md,
  },
  descriptiveInputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray700,
    marginBottom: spacing.sm,
  },
  descriptiveInputField: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.gray900,
    minHeight: 200,
    lineHeight: 24,
  },
  characterCount: {
    alignItems: 'flex-end',
    marginTop: spacing.xs,
  },
  characterCountText: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  pendingBadgeText: {
    fontSize: fontSize.xs,
    color: '#B45309',
    fontWeight: '600',
  },
  descriptiveReview: {
    marginTop: spacing.sm,
  },
  descriptiveLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray700,
    marginBottom: spacing.sm,
  },
  descriptiveAnswerBox: {
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    minHeight: 100,
  },
  descriptiveAnswerText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
    lineHeight: 22,
  },
  descriptiveNote: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
});
