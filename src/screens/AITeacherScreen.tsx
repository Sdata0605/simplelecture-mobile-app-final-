import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  Alert,
  Keyboard,
  Platform,
} from 'react-native';
import { KeyboardShiftView } from '../components/keyboard/keyboardStick';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionResultEvent,
  type ExpoSpeechRecognitionErrorEvent,
} from 'expo-speech-recognition';
import { Audio } from 'expo-av';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import {
  useAITeacherSubscription,
  AI_TEACHER_PLANS,
  AITeacherPlanId,
  isPermanentTestingAccount,
} from '../services/aiTeacherSubscription';
import { useTeacherPrefs } from '../services/aiTeacherPrefs';
import {
  getSubjects,
  sendChatMessage,
  TeacherSubject,
  ChatResult,
  QuizData,
} from '../services/aiTeacherService';
import {
  LiveTeacherClient,
  LiveStatus,
  TranscriptItem,
  QuizItem,
} from '../services/aiTeacherLiveService';
import {
  LiveSlideCard,
  LiveQuizCard,
  LiveVisualCard,
  LiveUnderstandCard,
  LiveBigQuestionCard,
} from '../components/aiteacher/LiveCards';
import { AITeacherPlanModal } from '../components/aiteacher/AITeacherPlanModal';
import { AITeacherGuideModal } from '../components/aiteacher/AITeacherGuideModal';
import { MicStreamer } from '../components/aiteacher/MicStreamer';
import { TeacherVoicePlayer } from '../components/aiteacher/TeacherVoicePlayer';
import {
  detectOutOfSyllabusTopic,
  formatOutOfSyllabusRefusal,
  findMentionedSubject,
  isSubjectOnlyQuery,
} from '../services/aiTeacherScoping';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type AITeacherRouteProp = RouteProp<RootStackParamList, 'AITeacher'>;

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  quiz?: QuizData;
  timestamp: string;
}

const DEFAULT_FALLBACK_SUBJECTS: TeacherSubject[] = [
  { id: 'mathematics', name: 'Mathematics', topics: 15 },
  { id: 'science', name: 'Science', topics: 16 },
  { id: 'social_science', name: 'Social Science', topics: 20 },
  { id: 'english', name: 'English', topics: 12 },
  { id: 'kannada', name: 'Kannada', topics: 14 },
];

export default function AITeacherScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<AITeacherRouteProp>();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    hasActivePlan,
    isPlan500,
    isPlan1000,
    currentPlan,
    plans,
    isVerifying,
    refreshSubscription,
  } = useAITeacherSubscription();
  const [prefs, updatePrefs] = useTeacherPrefs();

  // Navigation & Modals
  const [mode, setMode] = useState<'voice' | 'chat'>('voice');
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [selectedPlanForModal, setSelectedPlanForModal] = useState<AITeacherPlanId>('admin_1000');
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [guideTab, setGuideTab] = useState<'how-to-use' | 'api-key'>('how-to-use');

  // Subjects & Enrolled courses scoping
  const [subjects, setSubjects] = useState<TeacherSubject[]>([]);
  const [enrolledSubjects, setEnrolledSubjects] = useState<TeacherSubject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<TeacherSubject | null>(null);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // Testing user bypass & active enrolled scoping
  const isTestingUser = isPermanentTestingAccount(user?.email);
  const activeEnrolledSubjects = isTestingUser
    ? subjects
    : (enrolledSubjects.length > 0 ? enrolledSubjects : subjects);
  const enrolledSubjectNames =
    activeEnrolledSubjects.length > 0
      ? activeEnrolledSubjects.map((s) => s.name).join(', ')
      : 'Mathematics, Science, Social Science, English, Kannada';

  // Pro Plan custom API key: Pro Plan users who switch "Active Key Mode" to "My Own Key"
  // (and have saved one) use BYOK for higher rate limits; otherwise they stay on the
  // admin-managed key even if a personal key is saved, respecting their chosen mode.
  const useByok = isPlan500 || (isPlan1000 && prefs.apiMode === 'own' && !!prefs.apiKey?.trim());

  // BYOK quick key state
  const [quickKeyInput, setQuickKeyInput] = useState('');
  const [quickKeySaved, setQuickKeySaved] = useState(false);

  // ==================== LIVE WEBSOCKET TEACHER STATE ====================
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const liveClientRef = useRef<LiveTeacherClient | null>(null);
  const voiceScrollRef = useRef<ScrollView>(null);
  const livePulseAnim = useRef(new Animated.Value(1)).current;

  // Speech Recognition State for Voice Input
  const [isListening, setIsListening] = useState(false);
  const [liveSpeechText, setLiveSpeechText] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  // Only the "> 0.08" threshold crossing is ever rendered (see usages below) — gate the
  // state update on that crossing so the raw ~10x/sec mic stream doesn't re-render the
  // whole screen during every live call, which was stealing JS-thread time right when
  // audio segment handoffs need it most.
  const lastMicAboveThresholdRef = useRef(false);
  const isListeningRef = useRef(false);
  const startListeningRef = useRef<() => Promise<void>>(async () => {});
  const stopListeningRef = useRef<() => void>(() => {});

  // Real keyboard height (0 when hidden). KeyboardShiftView already lifts the whole
  // screen by this exact amount, so the input bar's own bottom padding must drop the
  // safe-area/home-indicator allowance while the keyboard is up — otherwise the two
  // paddings stack and leave a large dead gap between the input and the keyboard.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Pre-configure device audio routing for simultaneous recording & loudspeaker playback with AEC
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch((err) => console.warn('[AITeacher] Audio mode init error:', err));
  }, []);

  // Bottom Input Text for Voice Mode
  const [voiceInputText, setVoiceInputText] = useState('');

  // ==================== 24/7 CHAT MODE STATE ====================
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Namaste! How can I help you today? Which subject would you like to study?',
      timestamp: 'Just now',
    },
  ]);
  const [chatInputText, setChatInputText] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [selectedQuizAnswer, setSelectedQuizAnswer] = useState<Record<string, number>>({});
  const chatScrollRef = useRef<ScrollView>(null);

  // Pulse animation for Teacher Avatar while speaking
  useEffect(() => {
    let animLoop: Animated.CompositeAnimation | null = null;
    if (isSpeaking) {
      animLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(livePulseAnim, {
            toValue: 1.25,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(livePulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      animLoop.start();
    } else {
      Animated.timing(livePulseAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
    return () => animLoop?.stop();
  }, [isSpeaking, livePulseAnim]);

  // Load Subjects and Enrolled Courses Scoping
  useEffect(() => {
    if (!hasActivePlan) return;

    let isMounted = true;
    setLoadingSubjects(true);

    const loadData = async () => {
      let catalogSubs: TeacherSubject[] = [];
      try {
        const res = await getSubjects();
        if (res?.subjects && res.subjects.length > 0) {
          catalogSubs = res.subjects;
        } else {
          catalogSubs = DEFAULT_FALLBACK_SUBJECTS;
        }
      } catch (err) {
        console.warn('[AITeacherScreen] Subject load fallback:', err);
        catalogSubs = DEFAULT_FALLBACK_SUBJECTS;
      }

      if (!isMounted) return;
      setSubjects(catalogSubs);

      // Testing accounts (pramod0605@gmail.com) bypass restrictions and have all subjects enabled
      if (isTestingUser) {
        setEnrolledSubjects(catalogSubs);
        const targetSub = route.params?.initialSubject?.trim().toLowerCase();
        const found = targetSub
          ? catalogSubs.find((s) => s.name.toLowerCase().includes(targetSub))
          : null;
        if (found) setSelectedSubject(found);
        setLoadingSubjects(false);
        return;
      }

      // Fetch enrolled courses for student
      try {
        if (user?.id) {
          const enrollRes = await supabase.getEnrolledCourses(user.id);
          if (enrollRes.success && enrollRes.enrollments && enrollRes.enrollments.length > 0) {
            const courseIds = enrollRes.enrollments.map((e) => e.course_id).filter(Boolean);
            const courseSubsResults = await Promise.all(
              courseIds.map((cid) => supabase.getCourseSubjects(cid).catch(() => null))
            );

            const enrolledMap = new Map<string, TeacherSubject>();
            courseSubsResults.forEach((subRes) => {
              if (subRes?.success && Array.isArray(subRes.subjects)) {
                subRes.subjects.forEach((cs: any) => {
                  const subObj = cs.subject || cs.popular_subjects || cs;
                  const name = subObj?.name?.trim();
                  if (name && !enrolledMap.has(name.toLowerCase())) {
                    enrolledMap.set(name.toLowerCase(), {
                      id: subObj.id || subObj.slug || name.toLowerCase().replace(/\s+/g, '_'),
                      name,
                      topics: 12,
                    });
                  }
                });
              }
            });

            if (enrolledMap.size > 0) {
              const enrolledList = Array.from(enrolledMap.values());
              if (isMounted) {
                setEnrolledSubjects(enrolledList);
                const targetSub = route.params?.initialSubject?.trim().toLowerCase();
                const found = targetSub
                  ? enrolledList.find((s) => s.name.toLowerCase().includes(targetSub))
                  : null;
                if (found) setSelectedSubject(found);
              }
              return;
            }
          }
        }
      } catch (e) {
        console.warn('[AITeacherScreen] Error loading enrolled subjects:', e);
      }

      // Default to catalog subjects if student has no custom course subject mapping
      if (isMounted) {
        setEnrolledSubjects(catalogSubs);
        const targetSub = route.params?.initialSubject?.trim().toLowerCase();
        const found = targetSub
          ? catalogSubs.find((s) => s.name.toLowerCase().includes(targetSub))
          : null;
        if (found) setSelectedSubject(found);
      }
    };

    loadData().finally(() => {
      if (isMounted) setLoadingSubjects(false);
    });

    return () => {
      isMounted = false;
    };
  }, [hasActivePlan, isTestingUser, user?.id, route.params?.initialSubject]);

  // Subjects ref to avoid recreating startLiveClass when subjects load
  const subjectsRef = useRef<TeacherSubject[]>(subjects);
  useEffect(() => {
    subjectsRef.current = subjects;
  }, [subjects]);
  const isConnectingRef = useRef(false);
  const hasAutoConnectedRef = useRef(false);

  // Auto-scroll transcript when new items arrive
  useEffect(() => {
    if (transcript.length > 0) {
      setTimeout(() => {
        voiceScrollRef.current?.scrollToEnd({ animated: true });
      }, 120);
    }
  }, [transcript]);

  // ==================== LIVE WEBSOCKET CONNECTION LIFECYCLE ====================
  const startLiveClass = useCallback(async (initialPrompt?: string) => {
    if (!hasActivePlan) return;
    if (isConnectingRef.current) return;

    if (isPlan500 && !prefs.apiKey.trim()) {
      Alert.alert(
        'Gemini API Key Required',
        'Your Plus Plan requires a Google Gemini API key. Please add it first to start your 1-to-1 voice class.',
        [
          { text: 'Set Key', onPress: () => { setGuideTab('api-key'); setGuideModalOpen(true); } },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    if (liveClientRef.current) {
      liveClientRef.current.disconnect();
    }

    setLiveError(null);
    isConnectingRef.current = true;

    try {
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            'Microphone Permission Required',
            'Please allow microphone permission so your AI Teacher can hear your doubts seamlessly.'
          );
        }
      } catch {}

      const client = new LiveTeacherClient({
        prefs,
        isByok: useByok,
        apiKey: prefs.apiKey,
        callbacks: {
          onStatusChange: (s) => setLiveStatus(s),
          onSpeakingChange: (spk) => {
            setIsSpeaking(spk);
          },
          onMicLevel: (lvl) => {
            const level = Math.min(1, lvl * 5);
            const above = level > 0.08;
            if (above !== lastMicAboveThresholdRef.current) {
              lastMicAboveThresholdRef.current = above;
              setMicLevel(level);
            }
          },
          onTranscriptUpdate: (updater) => setTranscript((prev) => updater(prev)),
          onError: (err) => setLiveError(err),
          onNotice: (notice) => setLiveNotice(notice),
          onSubjectChange: (subName) => {
            const matched = (subjectsRef.current || []).find(
              (s) => s.name.toLowerCase() === subName.toLowerCase()
            );
            if (matched) setSelectedSubject(matched);
          },
        },
      });

      liveClientRef.current = client;
      await client.connect(
        initialPrompt ||
          'Hello! I am your 1-to-1 Personal AI Teacher. Namaste! How can I help you today? Which subject would you like to study?'
      );
    } finally {
      isConnectingRef.current = false;
    }
  }, [hasActivePlan, isPlan500, useByok, prefs]);

  const handleAudioChunk = useCallback((pcmBase64: string, rms: number) => {
    if (liveClientRef.current) {
      liveClientRef.current.sendRealtimeAudio(pcmBase64, rms);
    }
  }, []);

  const endLiveClass = useCallback(() => {
    if (liveClientRef.current) {
      liveClientRef.current.disconnect();
    }
  }, []);

  const toggleLiveMute = useCallback(() => {
    if (liveClientRef.current) {
      const nowMuted = liveClientRef.current.toggleMute();
      setIsMuted(nowMuted);
    } else {
      setIsMuted((prev) => !prev);
    }
  }, []);

  // AUTO-CONNECT: When user enters the screen, start the live session once so AI teacher speaks immediately!
  useEffect(() => {
    if (hasActivePlan && mode === 'voice' && !hasAutoConnectedRef.current && liveStatus === 'idle') {
      hasAutoConnectedRef.current = true;
      const timer = setTimeout(() => {
        startLiveClass();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [hasActivePlan, mode, liveStatus, startLiveClass]);

  // Teardown on unmount
  useEffect(() => {
    return () => {
      if (liveClientRef.current) {
        liveClientRef.current.disconnect();
      }
    };
  }, []);

  // Send message in Live Voice Mode
  // Stable refs for message senders to prevent recreation of listener effect
  const handleSendVoiceMessageRef = useRef<(text?: string) => void>(() => {});
  const handleSendChatMessageRef = useRef<(text?: string) => void>(() => {});
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const handleSendVoiceMessage = (textToSend?: string) => {
    const text = (textToSend || voiceInputText).trim();
    if (!text) return;

    setVoiceInputText('');

    // Check conversational subject selection in voice mode
    const mentionedSubject = findMentionedSubject(text, activeEnrolledSubjects);
    if (mentionedSubject) {
      setSelectedSubject(mentionedSubject);
    }

    if (liveClientRef.current && (liveStatus === 'live' || liveStatus === 'connecting')) {
      liveClientRef.current.sendText(text);
    } else {
      startLiveClass(text);
    }
  };
  handleSendVoiceMessageRef.current = handleSendVoiceMessage;

  // ==================== SEAMLESS MIC INPUT (CLEAN LIFECYCLE) ====================
  const stopListening = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // ignore
    }
    isListeningRef.current = false;
    setIsListening(false);
  }, []);
  stopListeningRef.current = stopListening;

  const isStartingListeningRef = useRef(false);
  const startListening = useCallback(async () => {
    if (isStartingListeningRef.current || isListeningRef.current) return;
    isStartingListeningRef.current = true;

    // If teacher is currently speaking aloud, stop teacher speech first (user-initiated barge-in)
    if (liveClientRef.current) {
      void liveClientRef.current.stopSpeaking();
    }

    try {
      // Abort any lingering recognition session so Android starts fresh
      try {
        await ExpoSpeechRecognitionModule.abort();
      } catch {}

      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Microphone Permission Required',
          'Please allow microphone permission in device settings so your AI Teacher can hear your doubts aloud.'
        );
        return;
      }

      setLiveSpeechText('');
      const langCode =
        prefs.language === 'kn'
          ? 'kn-IN'
          : prefs.language === 'hi'
          ? 'hi-IN'
          : 'en-IN';

      await ExpoSpeechRecognitionModule.start({
        lang: langCode,
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
        addsPunctuation: true,
        volumeChangeEventOptions: {
          enabled: true,
          intervalMillis: 200,
        },
      });
    } catch (err: any) {
      console.warn('[AITeacher] Mic start error:', err);
      stopListening();
    } finally {
      isStartingListeningRef.current = false;
    }
  }, [prefs.language, stopListening]);
  startListeningRef.current = startListening;

  // Single stable event listeners for Speech Recognition (registered ONCE on mount)
  useEffect(() => {
    const subStart = ExpoSpeechRecognitionModule.addListener('start', () => {
      isListeningRef.current = true;
      setIsListening(true);
    });

    const subResult = ExpoSpeechRecognitionModule.addListener(
      'result',
      (event: ExpoSpeechRecognitionResultEvent) => {
        const text =
          event.results?.[(event as any).resultIndex || 0]?.transcript ||
          event.results?.[0]?.transcript ||
          '';
        if (text) {
          setLiveSpeechText(text);
        }

        if (event.isFinal && text.trim()) {
          const finalSpeech = text.trim();
          setLiveSpeechText('');
          stopListening();
          if (modeRef.current === 'voice') {
            handleSendVoiceMessageRef.current(finalSpeech);
          } else {
            handleSendChatMessageRef.current(finalSpeech);
          }
        }
      }
    );

    const subError = ExpoSpeechRecognitionModule.addListener(
      'error',
      (event: ExpoSpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          // Normal pause in student speech
          return;
        }
        console.warn('[AITeacher] Speech recognition note:', event.message || event.error);
        stopListening();
      }
    );

    const subEnd = ExpoSpeechRecognitionModule.addListener('end', () => {
      isListeningRef.current = false;
      setIsListening(false);
    });

    return () => {
      subStart.remove();
      subResult.remove();
      subError.remove();
      subEnd.remove();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}
    };
  }, [stopListening]);

  const handleToggleListening = useCallback(() => {
    if (isListening) {
      const text = liveSpeechText.trim();
      stopListening();
      if (text) {
        if (mode === 'voice') {
          handleSendVoiceMessage(text);
        } else {
          handleSendChatMessage(text);
        }
      }
    } else {
      if (liveClientRef.current) {
        void liveClientRef.current.stopSpeaking();
      }
      void startListening();
    }
  }, [isListening, liveSpeechText, mode, startListening, stopListening]);

  // ==================== 24/7 CHAT SENDING ====================
  const handleSendChatMessage = async (textToSend?: string) => {
    const question = (textToSend || chatInputText).trim();
    if (!question || isSendingChat) return;

    // Check 1: Greeting
    const isGreeting = /^(hi|hello|hey|namaste|namaskara|namaskar|good morning|good afternoon|good evening|vanakkam|hoi|hola)\b[!?.]*$/i.test(question);
    if (isGreeting) {
      const userMsg: ChatMessageItem = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: question,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const botMsg: ChatMessageItem = {
        id: `b-${Date.now()}`,
        role: 'assistant',
        text: 'Namaste! How can I help you today? Which subject would you like to study?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, userMsg, botMsg]);
      setChatInputText('');
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }

    // Check 2: Conversational Subject Selection
    const mentionedSubject = findMentionedSubject(question, activeEnrolledSubjects);
    if (mentionedSubject && isSubjectOnlyQuery(question)) {
      setSelectedSubject(mentionedSubject);
      const userMsg: ChatMessageItem = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: question,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const botMsg: ChatMessageItem = {
        id: `b-${Date.now()}`,
        role: 'assistant',
        text: `Great! Let's study ${mentionedSubject.name}. What topic or concept would you like to learn today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, userMsg, botMsg]);
      setChatInputText('');
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }

    // Check 3: Out-of-syllabus refusal
    if (!isTestingUser) {
      const outMatch = detectOutOfSyllabusTopic(question, activeEnrolledSubjects, subjects);
      if (outMatch) {
        const refusal = formatOutOfSyllabusRefusal(enrolledSubjectNames, outMatch.detectedSubject);
        const userMsg: ChatMessageItem = {
          id: `u-${Date.now()}`,
          role: 'user',
          text: question,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        const botMsg: ChatMessageItem = {
          id: `b-${Date.now()}`,
          role: 'assistant',
          text: refusal,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setChatMessages((prev) => [...prev, userMsg, botMsg]);
        setChatInputText('');
        setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
        return;
      }
    }

    // Resolve target subject
    const targetSubject = selectedSubject || mentionedSubject || activeEnrolledSubjects[0] || subjects[0];
    if (!selectedSubject && targetSubject) {
      setSelectedSubject(targetSubject);
    }

    const userMsg: ChatMessageItem = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInputText('');
    setIsSendingChat(true);

    try {
      const history = chatMessages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, text: m.text }));

      const result: ChatResult = await sendChatMessage({
        subjectId: targetSubject ? targetSubject.id : 'mathematics',
        question,
        messages: history,
        mode: 'chat',
        prefs,
        isByok: useByok,
        apiKey: prefs.apiKey,
      });

      const replyText =
        result.answer ||
        (result.quiz ? `Quiz: ${result.quiz.question}` : result.bigq?.model_answer) ||
        'I have analyzed your doubt.';

      const botMsg: ChatMessageItem = {
        id: `b-${Date.now()}`,
        role: 'assistant',
        text: replyText,
        quiz: result.quiz,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setChatMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errMsg: ChatMessageItem = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        text: err?.message || 'Sorry, I could not answer that right now. Please try again.',
        timestamp: 'Just now',
      };
      setChatMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsSendingChat(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };
  handleSendChatMessageRef.current = handleSendChatMessage;

  const handleSaveQuickKey = async () => {
    if (!quickKeyInput.trim()) return;
    await updatePrefs({ apiKey: quickKeyInput.trim() });
    setQuickKeyInput('');
    setQuickKeySaved(true);
    setTimeout(() => setQuickKeySaved(false), 3000);
  };

  // 1. Loading screen
  if (authLoading) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Personal AI Teacher...</Text>
      </View>
    );
  }

  // 2. Unauthenticated: Strict requirement - Login screen
  if (!isAuthenticated) {
    return (
      <View style={[styles.loginRequiredContainer, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.loginHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.loginHeaderTitle}>SimpleLecture</Text>
        </View>

        <View style={styles.loginCard}>
          <View style={styles.lockIconCircle}>
            <Ionicons name="lock-closed" size={36} color={colors.primary} />
          </View>

          <View style={styles.loginBadge}>
            <Ionicons name="sparkles" size={14} color="#047857" />
            <Text style={styles.loginBadgeText}>1-to-1 Personal AI Teacher</Text>
          </View>

          <Text style={styles.loginTitle}>Login Required</Text>
          <Text style={styles.loginDesc}>
            Personal 1-to-1 AI Tutoring is an exclusive feature for SimpleLecture students. Please sign in to access your personal AI teacher.
          </Text>

          <View style={styles.loginBenefits}>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              <Text style={styles.benefitText}>1-to-1 interactive voice and chat lessons</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              <Text style={styles.benefitText}>Instant doubt solving in English, Hindi & Kannada</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              <Text style={styles.benefitText}>Personalized tutoring mapped to your enrolled syllabus</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => navigation.navigate('Login' as any)}
          >
            <Ionicons name="log-in" size={18} color={colors.white} />
            <Text style={styles.loginBtnText}>Log In / Sign Up to Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.exploreBtn}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Home' } as any)}
          >
            <Text style={styles.exploreBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 3. Authenticated but no active plan: Strict requirement - Paywall screen
  if (!hasActivePlan) {
    return (
      <View style={[styles.paywallContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.paywallHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Ionicons name="school" size={20} color={colors.primary} />
            <Text style={styles.paywallHeaderTitle}>AI Teacher 1-to-1</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setGuideTab('how-to-use');
              setGuideModalOpen(true);
            }}
            style={styles.guideIconBtn}
          >
            <Ionicons name="help-circle-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.paywallScroll}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.paywallHero}>
            <View style={styles.paywallBadge}>
              <Ionicons name="sparkles" size={12} color="#047857" />
              <Text style={styles.paywallBadgeText}>PERSONAL 1-TO-1 AI TUTORING</Text>
            </View>
            <Text style={styles.paywallTitle}>Unlock Your Personal AI Teacher</Text>
            <Text style={styles.paywallSubtitle}>
              Experience interactive 1-to-1 voice and chat tutoring tailored for your enrolled syllabus. Practice concepts and ask unlimited doubts 24/7.
            </Text>
          </View>

          {/* Plan 1: Plus Plan (₹500) */}
          <View style={styles.planBox}>
            <View style={styles.planBoxHeader}>
              <View style={styles.planPill}>
                <Text style={styles.planPillText}>{plans.byok_500.badge || 'Budget Friendly'}</Text>
              </View>
              <View style={styles.planTag}>
                <Ionicons name="key" size={14} color="#D97706" />
                <Text style={styles.planTagText}>Personal API Key</Text>
              </View>
            </View>

            <Text style={styles.planBoxTitle}>{plans.byok_500.name}</Text>
            <Text style={styles.planBoxDesc}>{plans.byok_500.tagline}</Text>

            <View style={styles.priceRow}>
              <Text style={styles.priceAmount}>₹{plans.byok_500.price}</Text>
              <Text style={styles.priceLabel}>one-time access</Text>
            </View>

            <View style={styles.featureList}>
              {plans.byok_500.features.map((f, i) => (
                <View key={`feat-byok-${i}`} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                  <Text style={styles.featureRowText}>{f}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.selectPlanOutlineBtn}
              onPress={() => {
                setSelectedPlanForModal('byok_500');
                setPlanModalOpen(true);
              }}
            >
              <Text style={styles.selectPlanOutlineText}>Choose Plus Plan - ₹{plans.byok_500.price}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Plan 2: Pro Plan (₹1000) */}
          <View style={[styles.planBox, styles.proPlanBox]}>
            <View style={styles.proRibbon}>
              <Ionicons name="star" size={11} color="#FFFFFF" />
              <Text style={styles.proRibbonText}>POPULAR</Text>
            </View>

            <View style={styles.planBoxHeader}>
              <View style={[styles.planPill, styles.proPlanPill]}>
                <Text style={styles.proPlanPillText}>{plans.admin_1000.badge || 'Recommended'}</Text>
              </View>
              <View style={styles.planTag}>
                <Ionicons name="sparkles" size={14} color="#059669" />
                <Text style={[styles.planTagText, { color: '#059669' }]}>Zero Setup</Text>
              </View>
            </View>

            <Text style={styles.planBoxTitle}>{plans.admin_1000.name}</Text>
            <Text style={styles.planBoxDesc}>{plans.admin_1000.tagline}</Text>

            <View style={styles.priceRow}>
              <Text style={[styles.priceAmount, { color: '#047857' }]}>₹{plans.admin_1000.price}</Text>
              <Text style={styles.priceLabel}>one-time access</Text>
            </View>

            <View style={styles.featureList}>
              {plans.admin_1000.features.map((f, i) => (
                <View key={`feat-admin-${i}`} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#047857" />
                  <Text style={[styles.featureRowText, i === 4 && { fontWeight: '700' }]}>
                    {f}
                  </Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.selectPlanProBtn}
              onPress={() => {
                setSelectedPlanForModal('admin_1000');
                setPlanModalOpen(true);
              }}
            >
              <Text style={styles.selectPlanProText}>Unlock Pro Plan - ₹{plans.admin_1000.price}</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Refresh status */}
          <View style={styles.verifySection}>
            <TouchableOpacity
              style={styles.verifyBtn}
              onPress={refreshSubscription}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="refresh" size={16} color={colors.textSecondary} />
              )}
              <Text style={styles.verifyBtnText}>
                {isVerifying ? 'Verifying payment...' : 'Already purchased? Tap to verify subscription'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <AITeacherPlanModal
          visible={planModalOpen}
          onClose={() => setPlanModalOpen(false)}
          defaultPlanId={selectedPlanForModal}
        />
        <AITeacherGuideModal
          visible={guideModalOpen}
          onClose={() => setGuideModalOpen(false)}
          defaultTab={guideTab}
        />
      </View>
    );
  }

  // 4. Authenticated & Active Plan: Full 1-to-1 Interactive AI Teacher Class
  const inCall = liveStatus === 'live' || liveStatus === 'connecting';
  // Safe-area/home-indicator clearance is only needed while the keyboard is hidden —
  // KeyboardShiftView already accounts for the keyboard itself.
  const inputBottomPadding = keyboardHeight > 0 ? 8 : Math.max(insets.bottom, 12);

  return (
    <KeyboardShiftView
      style={[styles.container, { paddingTop: insets.top }]}
      iosKeyboardVerticalOffset={insets.top}
    >
      {/* Top App Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.topTitleCol}>
          <Text style={styles.screenTitle}>AI Teacher · 1-to-1</Text>
          <TouchableOpacity
            style={[
              styles.planBadge,
              isPlan1000 ? styles.planBadgePro : styles.planBadgeByok,
            ]}
            onPress={() => {
              setSelectedPlanForModal(isPlan1000 ? 'admin_1000' : 'byok_500');
              setPlanModalOpen(true);
            }}
          >
            <Ionicons
              name={isPlan1000 ? 'sparkles' : 'key'}
              size={12}
              color={isPlan1000 ? '#047857' : '#D97706'}
            />
            <Text
              style={[
                styles.planBadgeText,
                isPlan1000 ? styles.planBadgeTextPro : styles.planBadgeTextByok,
              ]}
            >
              {isPlan1000 ? 'Pro Plan' : 'Plus Plan'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              setGuideTab('how-to-use');
              setGuideModalOpen(true);
            }}
          >
            <Ionicons name="help-circle-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('AITeacherSettings')}
          >
            <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* BYOK Warning Banner */}
      {isPlan500 && !prefs.apiKey.trim() && (
        <View style={styles.byokBanner}>
          <View style={styles.byokBannerTop}>
            <Ionicons name="key" size={16} color="#D97706" />
            <Text style={styles.byokBannerTitle}>API Key Required for Plus Plan</Text>
          </View>
          <View style={styles.byokInputRow}>
            <TextInput
              style={styles.byokQuickInput}
              placeholder="Paste Gemini API key..."
              value={quickKeyInput}
              onChangeText={setQuickKeyInput}
              secureTextEntry
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.byokQuickSaveBtn}
              onPress={handleSaveQuickKey}
              disabled={!quickKeyInput.trim()}
            >
              <Text style={styles.byokQuickSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
          {quickKeySaved && (
            <Text style={styles.byokQuickSavedText}>Key saved! Ready to learn.</Text>
          )}
        </View>
      )}

      {/* Mode Switcher Tabs */}
      <View style={styles.modeTabs}>
        <TouchableOpacity
          style={[styles.modeTab, mode === 'voice' && styles.modeTabActive]}
          onPress={() => setMode('voice')}
        >
          <Ionicons
            name="mic"
            size={18}
            color={mode === 'voice' ? colors.primary : colors.textSecondary}
          />
          <Text style={[styles.modeTabText, mode === 'voice' && styles.modeTabTextActive]}>
            Live Voice Class
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeTab, mode === 'chat' && styles.modeTabActive]}
          onPress={() => {
            if (liveClientRef.current) {
              liveClientRef.current.stopSpeaking();
            }
            setMode('chat');
          }}
        >
          <Ionicons
            name="chatbubbles"
            size={18}
            color={mode === 'chat' ? colors.primary : colors.textSecondary}
          />
          <Text style={[styles.modeTabText, mode === 'chat' && styles.modeTabTextActive]}>
            24/7 Chat
          </Text>
        </TouchableOpacity>
      </View>

      {/* The teacher's voice plays in a hidden WebView, loaded before the first word arrives. */}
      {mode === 'voice' && inCall && <TeacherVoicePlayer />}

      {/* Continuous Raw Mic Streaming via Hardware-AEC WebView */}
      {mode === 'voice' && inCall && (
        <MicStreamer
          isStreaming={!isMuted}
          isMuted={isMuted}
          onAudioChunk={handleAudioChunk}
          onError={(err) => console.warn('[AITeacher] MicStreamer error:', err)}
        />
      )}

      {/* ========================================================================= */}
      {/* MODE 1: LIVE WEBSOCKET VOICE TEACHER (MATCHING WEBSITE EXPERIENCES)       */}
      {/* ========================================================================= */}
      {mode === 'voice' ? (
        <View style={styles.voiceSectionContainer}>
          {/* Live Teacher Call Header Bar */}
          <View style={styles.liveTeacherBar}>
            <View style={styles.liveAvatarContainer}>
              <Animated.View
                style={[
                  styles.liveAvatarAura,
                  isSpeaking && styles.liveAvatarAuraSpeaking,
                  { transform: [{ scale: livePulseAnim }] },
                ]}
              />
              <LinearGradient
                colors={['#059669', '#047857']}
                style={styles.liveAvatarCircle}
              >
                <Ionicons name="school" size={22} color="#FFFFFF" />
              </LinearGradient>
            </View>

            <View style={styles.liveTeacherInfo}>
              <Text style={styles.liveTeacherName} numberOfLines={1}>
                {prefs.teacherName || 'Personal AI Teacher'}
                {selectedSubject ? (
                  <Text style={styles.liveTeacherSubject}> · {selectedSubject.name}</Text>
                ) : null}
              </Text>
              <Text style={styles.liveStatusSubtitle} numberOfLines={1}>
                {liveStatus === 'connecting'
                  ? 'Connecting to your teacher…'
                  : liveStatus === 'live'
                  ? isSpeaking
                    ? `${prefs.teacherName || 'Teacher'} is speaking… (speak to interrupt)`
                    : isMuted
                    ? 'Microphone muted · Tap mic to unmute'
                    : micLevel > 0.08
                    ? 'Hearing your voice live…'
                    : 'Listening… speak freely anytime'
                  : liveStatus === 'ended'
                  ? 'Class ended'
                  : liveStatus === 'error'
                  ? 'Connection issue'
                  : 'Ready · Tap Start class'}
              </Text>
            </View>

            <View style={styles.liveCallActions}>
              {inCall ? (
                <>
                  <TouchableOpacity
                    style={[styles.liveControlBtn, isMuted && styles.liveControlBtnActive]}
                    onPress={toggleLiveMute}
                    accessibilityLabel={isMuted ? 'Unmute' : 'Mute'}
                  >
                    <Ionicons
                      name={isMuted ? 'volume-mute' : 'volume-high'}
                      size={18}
                      color={isMuted ? '#EF4444' : colors.textSecondary}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.endCallBtn}
                    onPress={endLiveClass}
                  >
                    <Ionicons name="call" size={16} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
                    <Text style={styles.endCallText}>End</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.startCallBtn}
                  onPress={() => startLiveClass()}
                >
                  <Ionicons name="call" size={16} color="#FFFFFF" />
                  <Text style={styles.startCallText}>Start class</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {liveNotice && (
            <View style={styles.noticeBar}>
              <Ionicons name="information-circle-outline" size={14} color="#92400E" />
              <Text style={styles.noticeBarText}>{liveNotice}</Text>
            </View>
          )}

          {liveError && (
            <View style={styles.errorContainer}>
              <View style={styles.errorBar}>
                <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
                <Text style={styles.errorBarText}>{liveError}</Text>
              </View>
              {liveError.toLowerCase().includes('too many') && (
                <View style={styles.rateLimitCard}>
                  <Text style={styles.rateLimitTitle}>
                    Voice Session Limit (6/hour on Admin Plan)
                  </Text>
                  <Text style={styles.rateLimitDesc}>
                    You can continue your lesson without interruption right now in 24/7 Chat Mode, or use your own Google Gemini API key for higher session limits.
                  </Text>
                  <View style={styles.rateLimitActions}>
                    <TouchableOpacity
                      style={styles.switchChatBtn}
                      onPress={() => setMode('chat')}
                    >
                      <Ionicons name="chatbubbles" size={14} color="#FFFFFF" />
                      <Text style={styles.switchChatBtnText}>Switch to Chat Teacher</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.retryVoiceBtn}
                      onPress={() => {
                        setLiveError(null);
                        startLiveClass();
                      }}
                    >
                      <Ionicons name="refresh" size={14} color="#374151" />
                      <Text style={styles.retryVoiceBtnText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Conversation Stream: User speech, Teacher speech, Slides, Quizzes, Visuals */}
          <ScrollView
            ref={voiceScrollRef}
            style={styles.voiceTranscriptScroll}
            contentContainerStyle={styles.voiceTranscriptContent}
            showsVerticalScrollIndicator={false}
          >
            {transcript.length === 0 ? (
              <View style={styles.emptyVoiceState}>
                <Ionicons name="headset-outline" size={40} color={colors.primary} />
                <Text style={styles.emptyVoiceTitle}>Your 1-to-1 Live Class</Text>
                <Text style={styles.emptyVoiceDesc}>
                  Your teacher will speak with you, explain concepts, show slides, and test you with interactive quizzes here.
                </Text>
                {!inCall && (
                  <TouchableOpacity
                    style={styles.emptyStartBtn}
                    onPress={() => startLiveClass()}
                  >
                    <Ionicons name="call" size={18} color="#FFFFFF" />
                    <Text style={styles.emptyStartBtnText}>Start Class Now</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              transcript.map((item, index) => {
                const itemKey = `${item.id}-${index}`;
                if (item.kind === 'slide') {
                  return (
                    <LiveSlideCard
                      key={itemKey}
                      title={item.title}
                      bullets={item.bullets}
                    />
                  );
                }

                if (item.kind === 'quiz') {
                  return (
                    <LiveQuizCard
                      key={itemKey}
                      quiz={item.quiz}
                      onAnswer={(idx) => {
                        if (liveClientRef.current) {
                          liveClientRef.current.reportQuizAnswer(item.quiz, idx);
                        }
                      }}
                    />
                  );
                }

                if (item.kind === 'visual') {
                  return <LiveVisualCard key={itemKey} visual={item.visual} />;
                }

                if (item.kind === 'understand') {
                  return (
                    <LiveUnderstandCard
                      key={itemKey}
                      topic={item.topic}
                      onChoose={(choice) => {
                        if (liveClientRef.current) {
                          liveClientRef.current.reportUnderstanding(item.topic, choice);
                        }
                      }}
                    />
                  );
                }

                if (item.kind === 'bigq') {
                  return (
                    <LiveBigQuestionCard
                      key={itemKey}
                      question={item.question}
                      hint={item.hint}
                      onSubmit={(ans) => {
                        if (liveClientRef.current) {
                          liveClientRef.current.answerBigQuestion(item.question, ans);
                        }
                      }}
                    />
                  );
                }

                // Spoken text turn
                const isUser = item.role === 'user';
                return (
                  <View
                    key={itemKey}
                    style={[
                      styles.transcriptRow,
                      isUser ? styles.transcriptRowUser : styles.transcriptRowTeacher,
                    ]}
                  >
                    {!isUser && (
                      <View style={styles.teacherMiniAvatar}>
                        <Ionicons name="school" size={13} color="#FFFFFF" />
                      </View>
                    )}
                    <View
                      style={[
                        styles.transcriptBubble,
                        isUser ? styles.transcriptBubbleUser : styles.transcriptBubbleTeacher,
                      ]}
                    >
                      <Text
                        style={[
                          styles.transcriptBubbleText,
                          isUser ? styles.transcriptBubbleTextUser : styles.transcriptBubbleTextTeacher,
                        ]}
                      >
                        {item.text}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Live speech feedback bar when student speaks */}
          {micLevel > 0.08 && !isSpeaking && !isMuted && (
            <View style={styles.liveListeningBar}>
              <View style={styles.recordingDot} />
              <Text style={styles.liveListeningText} numberOfLines={1}>
                Hearing your voice live… speak freely
              </Text>
            </View>
          )}

          {/* Seamless Bottom Input Bar (Continuous Mic + Optional Typing) */}
          <View style={[styles.bottomInputBar, { paddingBottom: inputBottomPadding }]}>
            <TouchableOpacity
              style={[
                styles.voiceMicBtn,
                isMuted
                  ? styles.voiceMicBtnMuted
                  : micLevel > 0.08 && !isSpeaking
                  ? styles.voiceMicBtnSpeaking
                  : styles.voiceMicBtnActive,
              ]}
              onPress={toggleLiveMute}
              activeOpacity={0.8}
              accessibilityLabel={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              <Ionicons
                name={isMuted ? 'mic-off' : 'mic'}
                size={22}
                color={isMuted ? '#EF4444' : '#FFFFFF'}
              />
            </TouchableOpacity>

            <TextInput
              style={styles.voiceTextInput}
              placeholder={
                selectedSubject
                  ? `Speak or type in ${selectedSubject.name}…`
                  : inCall
                  ? 'Speak or type a subject/doubt…'
                  : 'Type a question or subject to start…'
              }
              placeholderTextColor={colors.textMuted}
              value={voiceInputText}
              onChangeText={setVoiceInputText}
              multiline
              maxLength={500}
            />

            <TouchableOpacity
              style={[
                styles.voiceSendBtn,
                !voiceInputText.trim() && styles.voiceSendBtnDisabled,
              ]}
              onPress={() => handleSendVoiceMessage()}
              disabled={!voiceInputText.trim()}
            >
              <Ionicons name="send" size={17} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* ========================================================================= */
        /* MODE 2: 24/7 SYLLABUS CHAT TUTOR                                         */
        /* ========================================================================= */
        <View style={styles.chatContainer}>
          <ScrollView
            ref={chatScrollRef}
            style={styles.messagesScroll}
            contentContainerStyle={styles.messagesContent}
          >
            {chatMessages.map((m, mIdx) => {
              const isUser = m.role === 'user';
              return (
                <View
                  key={`${m.id || 'msg'}-${mIdx}`}
                  style={[
                    styles.messageRow,
                    isUser ? styles.messageRowUser : styles.messageRowBot,
                  ]}
                >
                  {!isUser && (
                    <View style={styles.botAvatar}>
                      <Ionicons name="school" size={14} color="#FFFFFF" />
                    </View>
                  )}
                  <View
                    style={[
                      styles.messageBubble,
                      isUser ? styles.messageBubbleUser : styles.messageBubbleBot,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        isUser ? styles.messageTextUser : styles.messageTextBot,
                      ]}
                    >
                      {m.text}
                    </Text>

                    {m.quiz && (
                      <View style={styles.quizBox}>
                        <Text style={styles.quizQuestionMini}>{m.quiz.question}</Text>
                        {m.quiz.options.map((opt, optIdx) => {
                          const isPicked = selectedQuizAnswer[m.id] === optIdx;
                          const hasAnswered = selectedQuizAnswer[m.id] !== undefined;
                          const isCorrect = optIdx === m.quiz?.correct_index;

                          return (
                            <TouchableOpacity
                              key={`opt-${m.id || mIdx}-${optIdx}`}
                              style={[
                                styles.quizOptionMini,
                                isPicked && styles.quizOptionPicked,
                                hasAnswered && isCorrect && styles.quizOptionCorrect,
                                hasAnswered && isPicked && !isCorrect && styles.quizOptionWrong,
                              ]}
                              onPress={() => {
                                if (!hasAnswered) {
                                  setSelectedQuizAnswer((prev) => ({ ...prev, [m.id]: optIdx }));
                                }
                              }}
                            >
                              <Text
                                style={[
                                  styles.quizOptionTextMini,
                                  isPicked && styles.quizOptionTextPicked,
                                ]}
                              >
                                {String.fromCharCode(65 + optIdx)}. {opt}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    <Text
                      style={[
                        styles.messageTime,
                        isUser ? styles.messageTimeUser : styles.messageTimeBot,
                      ]}
                    >
                      {m.timestamp}
                    </Text>
                  </View>
                </View>
              );
            })}
            {isSendingChat && (
              <View style={styles.typingIndicator}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.typingText}>Teacher is typing answer...</Text>
              </View>
            )}
          </ScrollView>

          {/* Quick Suggestions */}
          <View style={styles.suggestionChipsRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {!selectedSubject
                ? activeEnrolledSubjects.map((sub, sIdx) => (
                    <TouchableOpacity
                      key={`${sub.id || sub.name || 'sub'}-${sIdx}`}
                      style={styles.suggestionChip}
                      onPress={() => {
                        handleSendChatMessage(sub.name);
                      }}
                    >
                      <Ionicons name="book-outline" size={13} color={colors.primary} style={{ marginRight: 4 }} />
                      <Text style={styles.suggestionChipText}>{sub.name}</Text>
                    </TouchableOpacity>
                  ))
                : ['Explain concept', 'Quiz me', 'Formulas', 'Exam Tips'].map((chip, idx) => (
                    <TouchableOpacity
                      key={`chip-${idx}`}
                      style={styles.suggestionChip}
                      onPress={() => {
                        handleSendChatMessage(`Give me ${chip.toLowerCase()} for ${selectedSubject.name}`);
                      }}
                    >
                      <Text style={styles.suggestionChipText}>{chip}</Text>
                    </TouchableOpacity>
                  ))}
            </ScrollView>
          </View>

          {/* Input Bar */}
          <View style={[styles.bottomInputBar, { paddingBottom: inputBottomPadding }]}>
            <TouchableOpacity
              style={[styles.voiceMicBtn, isListening && styles.voiceMicBtnActive]}
              onPress={handleToggleListening}
            >
              <Ionicons
                name={isListening ? 'stop-circle' : 'mic'}
                size={22}
                color={isListening ? '#DC2626' : colors.primary}
              />
            </TouchableOpacity>

            <TextInput
              style={styles.voiceTextInput}
              placeholder={
                selectedSubject
                  ? `Ask doubt in ${selectedSubject.name}...`
                  : 'Ask a doubt or choose a subject…'
              }
              placeholderTextColor={colors.textMuted}
              value={chatInputText}
              onChangeText={setChatInputText}
              multiline
              maxLength={400}
            />

            <TouchableOpacity
              style={[styles.voiceSendBtn, (!chatInputText.trim() || isSendingChat) && styles.voiceSendBtnDisabled]}
              onPress={() => handleSendChatMessage()}
              disabled={!chatInputText.trim() || isSendingChat}
            >
              <Ionicons name="send" size={17} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modals */}
      <AITeacherPlanModal
        visible={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        defaultPlanId={selectedPlanForModal}
      />
      <AITeacherGuideModal
        visible={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
        defaultTab={guideTab}
      />
    </KeyboardShiftView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },
  topTitleCol: {
    flex: 1,
  },
  screenTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.text,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginTop: 2,
  },
  planBadgePro: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  planBadgeByok: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  planBadgeTextPro: {
    color: '#047857',
  },
  planBadgeTextByok: {
    color: '#B45309',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    padding: spacing.xs,
  },
  subjectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subjectPickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  subjectPillText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
  },
  boardBadgeText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
  },
  subjectDropdown: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  subjectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  subjectOptionSelected: {
    backgroundColor: '#F0FDF4',
  },
  subjectOptionText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  subjectOptionTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  byokBanner: {
    backgroundColor: '#FFFBEB',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    gap: 6,
  },
  byokBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  byokBannerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  byokInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  byokQuickInput: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    color: colors.text,
  },
  byokQuickSaveBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: borderRadius.sm,
  },
  byokQuickSaveText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  byokQuickSavedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    padding: 4,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
  },
  modeTabActive: {
    backgroundColor: '#ECFDF5',
  },
  modeTabText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modeTabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },

  // ==================== LIVE WEBSOCKET TEACHER BAR & TRANSCRIPT ====================
  voiceSectionContainer: {
    flex: 1,
  },
  liveTeacherBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  liveAvatarContainer: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  liveAvatarAura: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
  },
  liveAvatarAuraSpeaking: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  liveAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTeacherInfo: {
    flex: 1,
  },
  liveTeacherName: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.text,
  },
  liveTeacherSubject: {
    fontWeight: 'normal',
    color: colors.textMuted,
  },
  liveStatusSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  liveCallActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveControlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  liveControlBtnActive: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  startCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
  },
  startCallText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  endCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
  },
  endCallText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  noticeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  noticeBarText: {
    fontSize: 11,
    color: '#92400E',
    flex: 1,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5',
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  errorBarText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
    flex: 1,
  },
  rateLimitCard: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: 2,
  },
  rateLimitTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 2,
  },
  rateLimitDesc: {
    fontSize: 11,
    color: '#7F1D1D',
    lineHeight: 16,
    marginBottom: 8,
  },
  rateLimitActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  switchChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  switchChatBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  retryVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  retryVoiceBtnText: {
    color: '#374151',
    fontSize: 11,
    fontWeight: '600',
  },
  voiceTranscriptScroll: {
    flex: 1,
  },
  voiceTranscriptContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  emptyVoiceState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: spacing.xl,
    gap: 8,
  },
  emptyVoiceTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.text,
  },
  emptyVoiceDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    marginTop: 10,
  },
  emptyStartBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  transcriptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginVertical: 2,
  },
  transcriptRowUser: {
    justifyContent: 'flex-end',
  },
  transcriptRowTeacher: {
    justifyContent: 'flex-start',
  },
  teacherMiniAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  transcriptBubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: borderRadius.lg,
  },
  transcriptBubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 2,
  },
  transcriptBubbleTeacher: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 2,
  },
  transcriptBubbleText: {
    fontSize: fontSize.xs,
    lineHeight: 19,
  },
  transcriptBubbleTextUser: {
    color: colors.white,
  },
  transcriptBubbleTextTeacher: {
    color: colors.text,
  },
  liveListeningBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  liveListeningText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: '#DC2626',
    fontWeight: '600',
  },
  cancelListenBtn: {
    padding: 2,
  },
  bottomInputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: 8,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  voiceMicBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 2,
  },
  voiceMicBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  voiceMicBtnSpeaking: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  voiceMicBtnMuted: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  voiceTextInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: fontSize.xs,
    color: colors.text,
    maxHeight: 90,
  },
  voiceSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  voiceSendBtnDisabled: {
    opacity: 0.45,
  },

  // ==================== 24/7 CHAT STYLES ====================
  chatContainer: {
    flex: 1,
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowBot: {
    justifyContent: 'flex-start',
  },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  messageBubble: {
    maxWidth: '82%',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: borderRadius.lg,
  },
  messageBubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 2,
  },
  messageBubbleBot: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 2,
  },
  messageText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  messageTextUser: {
    color: colors.white,
  },
  messageTextBot: {
    color: colors.text,
  },
  messageTime: {
    fontSize: 9,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageTimeUser: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  messageTimeBot: {
    color: colors.textMuted,
  },
  quizBox: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  quizQuestionMini: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
  },
  quizOptionMini: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quizOptionPicked: {
    borderColor: colors.primary,
    backgroundColor: '#ECFDF5',
  },
  quizOptionCorrect: {
    borderColor: '#10B981',
    backgroundColor: '#D1FAE5',
  },
  quizOptionWrong: {
    borderColor: '#EF4444',
    backgroundColor: '#FEE2E2',
  },
  quizOptionTextMini: {
    fontSize: fontSize.xs,
    color: colors.text,
  },
  quizOptionTextPicked: {
    fontWeight: '700',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 34,
  },
  typingText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  suggestionChipsRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  suggestionChip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 5,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    marginRight: 6,
  },
  suggestionChipText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // ==================== PAYWALL & LOGIN STYLES ====================
  loginRequiredContainer: {
    flex: 1,
    backgroundColor: colors.white,
  },
  loginHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  loginHeaderTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.text,
  },
  loginCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  lockIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  loginBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  loginTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.text,
  },
  loginDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  loginBenefits: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  benefitText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  loginBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: '100%',
    paddingVertical: 14,
  },
  loginBtnText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  exploreBtn: {
    paddingVertical: spacing.sm,
  },
  exploreBtnText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  paywallContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  paywallHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paywallHeaderTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.text,
  },
  guideIconBtn: {
    padding: spacing.xs,
  },
  paywallScroll: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  paywallHero: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: 6,
  },
  paywallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  paywallBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  paywallTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  paywallSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginHorizontal: spacing.md,
  },
  planBox: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  proPlanBox: {
    borderColor: '#34D399',
    backgroundColor: '#F7FEFA',
    position: 'relative',
    overflow: 'hidden',
  },
  proRibbon: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderBottomLeftRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  proRibbonText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  planBoxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  planPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  proPlanPill: {
    backgroundColor: '#D1FAE5',
  },
  planPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  proPlanPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  planTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  planTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  planBoxTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  planBoxDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginVertical: spacing.sm,
  },
  priceAmount: {
    fontSize: fontSize.xxxl,
    fontWeight: '900',
    color: colors.text,
  },
  priceLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  featureList: {
    gap: 6,
    marginVertical: spacing.xs,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  featureRowText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  selectPlanOutlineBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    marginTop: spacing.sm,
  },
  selectPlanOutlineText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  selectPlanProBtn: {
    backgroundColor: '#059669',
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: spacing.sm,
  },
  selectPlanProText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  verifySection: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verifyBtnText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
});
