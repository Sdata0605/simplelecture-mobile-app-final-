import { createRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, NavigationContainerRef, RouteProp, NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import CustomTabBar from '../components/CustomTabBar';
import AppSidebar from '../components/AppSidebar';
import { setCurrentRoute } from '../services/currentRoute';
import { useAuth } from '../context/AuthContext';
import { useDailyAttendance } from '../hooks/useDailyAttendance';

import OnboardingScreen from '../screens/OnboardingScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import HomeScreen from '../screens/HomeScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MyCoursesScreen from '../screens/MyCoursesScreen';
import CoursesScreen from '../screens/CoursesScreen';
import CourseDetailsScreen from '../screens/CourseDetailsScreen';
import CurriculumScreen from '../screens/CurriculumScreen';
import TopicDetailsScreen from '../screens/TopicDetailsScreen';
import DetailedProgressScreen from '../screens/DetailedProgressScreen';
import LearningPathScreen from '../screens/LearningPathScreen';
import CartScreen from '../screens/CartScreen';
import LiveClassesScreen from '../screens/LiveClassesScreen';
import PreviousYearTestScreen from '../screens/PreviousYearTestScreen';
import ChapterContentScreen from '../screens/ChapterContentScreen';
import RecordingsScreen from '../screens/RecordingsScreen';
import WatchRecordingScreen from '../screens/WatchRecordingScreen';
import ViewCourseScreen from '../screens/ViewCourseScreen';
import SupportScreen from '../screens/SupportScreen';
import PrivacySecurityScreen from '../screens/PrivacySecurityScreen';
import ForumScreen from '../screens/ForumScreen';
import ReelsScreen from '../screens/ReelsScreen';
import ForumCategoryScreen from '../screens/ForumCategoryScreen';
import ForumPostScreen from '../screens/ForumPostScreen';
import GroupChatScreen from '../screens/GroupChatScreen';
import GroupInfoScreen from '../screens/GroupInfoScreen';
import AILecturePlayerScreen from '../screens/AILecturePlayerScreen';
import LanguageTopupScreen from '../screens/LanguageTopupScreen';
import ChaptersListScreen from '../screens/ChaptersListScreen';
import OtpVerificationScreen from '../screens/OtpVerificationScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import InterestSelectionScreen from '../screens/InterestSelectionScreen';
import SubcategorySelectionScreen from '../screens/SubcategorySelectionScreen';
import BlogListScreen from '../screens/BlogListScreen';
import BlogDetailScreen from '../screens/BlogDetailScreen';
import V3PlayerScreen from '../screens/V3PlayerScreen';
import V4PlayerScreen from '../screens/V4PlayerScreen';
import MarketingLecturePlayerScreen from '../screens/MarketingLecturePlayerScreen';
import V5PlayerScreen from '../screens/V5PlayerScreen';
import MyRewardsScreen from '../screens/MyRewardsScreen';
import CoursePreviewScreen from '../screens/CoursePreviewScreen';
import StudyTimetableScreen from '../screens/StudyTimetableScreen';
import MyTestsScreen from '../screens/MyTestsScreen';
import MyTestTakeScreen from '../screens/MyTestTakeScreen';
import MyTestResultScreen from '../screens/MyTestResultScreen';
import MyNotesCoursesScreen from '../screens/MyNotesCoursesScreen';
import MyNotesSubjectsScreen from '../screens/MyNotesSubjectsScreen';
import MyNotesChapterScreen from '../screens/MyNotesChapterScreen';
import AITeacherScreen from '../screens/AITeacherScreen';
import AITeacherSettingsScreen from '../screens/AITeacherSettingsScreen';

export type MainTabParamList = {
  MyCourses: undefined;
  Dashboard: undefined;
  Home: undefined;
  Reels: undefined;
  Profile: undefined;
  MyNotes: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Signup: undefined;
  MainTabs: (NavigatorScreenParams<MainTabParamList> & { initialTab?: 'Dashboard' | 'Home' }) | undefined;
  /** The course catalogue ("Explore Courses"); `searchQuery` pre-fills its search box. */
  Courses: { searchQuery?: string } | undefined;
  CourseDetails: { courseId: string };
  Curriculum: { subjectId?: string; subjectName?: string };
  TopicDetails: { topicId?: string; subjectId?: string; subjectName?: string; openAITab?: boolean; openTab?: string; chapterNumber?: number; topicNumber?: number; topicTitle?: string; chapterId?: string; isPreview?: boolean; courseId?: string; courseName?: string; previewAiLimit?: number; previewDoubtsLimit?: number; };
  ChapterContent: { chapterId: string; chapterTitle: string; chapterNumber: number; subjectId: string; subjectName: string };
  DetailedProgress: undefined;
  LearningPath: { courseId: string; courseName?: string; isPreview?: boolean; previewAiLimit?: number; previewDoubtsLimit?: number; };
  Cart: undefined;
  LiveClasses: undefined;
  PreviousYearTest: { subjectId?: string; subjectName?: string };
  Recordings: undefined;
  WatchRecording: { recording: any };
  ViewCourse: { courseId: string };
  Support: undefined;
  PrivacySecurity: undefined;
  Forum: undefined;
  ForumCategory: { categoryId: string; categoryName: string };
  ForumPost: { postId: string };
  GroupChat: { groupId: string; groupName: string };
  GroupInfo: { groupId: string; groupName: string };
  AILecturePlayer: { 
    jobId?: string; 
    topicTitle: string; 
    presentationUrl?: string;
    presentationJson?: any;
    videoUrl?: string;
    startFullscreen?: boolean;
    subjectName?: string;
    topicId?: string;
    chapterId?: string;
    subjectId?: string;
    courseId?: string;
    initialLanguage?: string;
  };
  LanguageTopup: {
    courseId: string;
    courseName: string;
    availableLanguages: string[];
    purchasedLanguages: string[];
    price: number;
  };
  ChaptersList: { subjectId: string; subjectName: string; isPreview?: boolean; courseId?: string; courseName?: string; previewAiLimit?: number; previewDoubtsLimit?: number; };
  OtpVerification: {
    contactInfo: string;
    contactType: 'phone' | 'email';
    isLogin: boolean;
    fullName?: string;
    password?: string;
  };
  ForgotPassword: undefined;
  Notifications: undefined;
  InterestSelection: undefined;
  SubcategorySelection: { selectedCategoryIds: string[] };
  Blog: undefined;
  BlogDetail: { slug: string };
  V3Player: {
    jobId: string;
    topicId?: string;
    chapterId?: string;
    subjectId?: string;
    courseId?: string;
    topicTitle?: string;
  };
  /**
   * @deprecated Superseded by V5Player. The screen is still registered and
   * fully working — it is simply no longer navigated to. Keep both until V5
   * has been through a release.
   */
  MarketingLecturePlayer: {
    jobId: string;
    title: string;
    subtitle?: string;
    topicId?: string;
    chapterId?: string;
    subjectId?: string;
    courseId?: string;
    initialLanguage?: string;
  };
  /** Same params as MarketingLecturePlayer — V5 is a drop-in replacement. */
  V5Player: {
    jobId: string;
    title: string;
    subtitle?: string;
    topicId?: string;
    chapterId?: string;
    subjectId?: string;
    courseId?: string;
    initialLanguage?: string;
  };
  V4Player: {
    jobId: string;
    topicId?: string;
    chapterId?: string;
    subjectId?: string;
    courseId?: string;
    topicTitle?: string;
    isPreview?: boolean;
  };
  MyRewards: undefined;
  CoursePreview: { courseId: string; courseName: string; courseSlug: string };
  StudyTimetable: undefined;
  MyTests: undefined;
  MyTestTake: { testId: string };
  MyTestResult: { testId: string };
  MyNotesSubjects: { courseId: string; courseName?: string };
  MyNotesChapter: { courseId: string; courseName?: string; subjectId: string; subjectName?: string; initialChapterId?: string };
  AITeacher: { initialSubject?: string } | undefined;
  AITeacherSettings: undefined;
};

export const navigationRef = createRef<NavigationContainerRef<RootStackParamList>>();

// Tells whatever floats above the navigator (the AI button) which screen is in front.
const publishCurrentRoute = () => setCurrentRoute(navigationRef.current?.getCurrentRoute()?.name);

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function TabNavigator({ route }: { route: RouteProp<RootStackParamList, 'MainTabs'> }) {
  const initialTab: 'Dashboard' | 'Home' = route?.params?.initialTab ?? 'Home';
  console.log('[Nav] TabNavigator mount initialTab:', initialTab, 'param:', route?.params?.initialTab);
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      initialRouteName={initialTab}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="MyCourses" component={MyCoursesScreen} />
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Reels" component={ReelsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="MyNotes" component={MyNotesCoursesScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading, hasSelectedInterests, hasSeenOnboarding, isNewSignup, hasEnrolledCourses } = useAuth();
  useDailyAttendance(isAuthenticated);

  const needsEnrollmentCheck = isAuthenticated && !isNewSignup && hasSelectedInterests;
  if (isLoading || (needsEnrollmentCheck && hasEnrolledCourses === null)) {
    return (
      <View style={authLoadingStyles.container}>
        <ActivityIndicator size="large" color="#2BBD6E" />
      </View>
    );
  }

  const getInitialRoute = () => {
    if (!isAuthenticated) {
      return hasSeenOnboarding ? 'Login' : 'Onboarding';
    }
    if (isNewSignup || !hasSelectedInterests) return 'InterestSelection';
    return 'MainTabs';
  };

  const initialTab: 'Dashboard' | 'Home' = hasEnrolledCourses ? 'Dashboard' : 'Home';

  return (
    <NavigationContainer ref={navigationRef} onReady={publishCurrentRoute} onStateChange={publishCurrentRoute}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
        initialRouteName={getInitialRoute()}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="MainTabs" component={TabNavigator} initialParams={{ initialTab }} />
        <Stack.Screen name="Courses" component={CoursesScreen} />
        <Stack.Screen name="CourseDetails" component={CourseDetailsScreen} />
        <Stack.Screen name="Curriculum" component={CurriculumScreen} />
        <Stack.Screen name="TopicDetails" component={TopicDetailsScreen} />
        <Stack.Screen name="ChapterContent" component={ChapterContentScreen} />
        <Stack.Screen name="DetailedProgress" component={DetailedProgressScreen} />
        <Stack.Screen name="LearningPath" component={LearningPathScreen} />
        <Stack.Screen name="Cart" component={CartScreen} />
        <Stack.Screen name="LiveClasses" component={LiveClassesScreen} />
        <Stack.Screen name="PreviousYearTest" component={PreviousYearTestScreen} />
        <Stack.Screen name="Recordings" component={RecordingsScreen} />
        <Stack.Screen name="WatchRecording" component={WatchRecordingScreen} />
        <Stack.Screen name="ViewCourse" component={ViewCourseScreen} />
        <Stack.Screen name="Support" component={SupportScreen} />
        <Stack.Screen name="PrivacySecurity" component={PrivacySecurityScreen} />
        <Stack.Screen name="Forum" component={ForumScreen} />
        <Stack.Screen name="ForumCategory" component={ForumCategoryScreen} />
        <Stack.Screen name="ForumPost" component={ForumPostScreen} />
        <Stack.Screen name="GroupChat" component={GroupChatScreen} />
        <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
        <Stack.Screen name="AILecturePlayer" component={AILecturePlayerScreen} />
        <Stack.Screen name="LanguageTopup" component={LanguageTopupScreen} />
        <Stack.Screen name="ChaptersList" component={ChaptersListScreen} />
        <Stack.Screen name="OtpVerification" component={OtpVerificationScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="InterestSelection" component={InterestSelectionScreen} />
        <Stack.Screen name="SubcategorySelection" component={SubcategorySelectionScreen} />
        <Stack.Screen name="Blog" component={BlogListScreen} />
        <Stack.Screen name="BlogDetail" component={BlogDetailScreen} />
        <Stack.Screen name="V3Player" component={V3PlayerScreen} />
        <Stack.Screen name="V4Player" component={V4PlayerScreen} />
        <Stack.Screen name="MarketingLecturePlayer" component={MarketingLecturePlayerScreen} />
        <Stack.Screen name="V5Player" component={V5PlayerScreen} />
        <Stack.Screen name="MyRewards" component={MyRewardsScreen} />
        <Stack.Screen name="CoursePreview" component={CoursePreviewScreen} />
        <Stack.Screen name="StudyTimetable" component={StudyTimetableScreen} />
        <Stack.Screen name="MyTests" component={MyTestsScreen} />
        <Stack.Screen name="MyTestTake" component={MyTestTakeScreen} />
        <Stack.Screen name="MyTestResult" component={MyTestResultScreen} />
        <Stack.Screen name="MyNotesSubjects" component={MyNotesSubjectsScreen} />
        <Stack.Screen name="MyNotesChapter" component={MyNotesChapterScreen} />
        <Stack.Screen name="AITeacher" component={AITeacherScreen} />
        <Stack.Screen name="AITeacherSettings" component={AITeacherSettingsScreen} />
      </Stack.Navigator>
      <AppSidebar />
    </NavigationContainer>
  );
}

const authLoadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
});
