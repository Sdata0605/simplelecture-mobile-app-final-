import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAvailableLanguagesForLecture } from '../hooks/useAvailableLanguagesForLecture';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  Animated,
  Dimensions,
  Pressable,
  ActivityIndicator,
  Platform,
  Keyboard,
  Alert,
  AppState,
  useWindowDimensions,
  StatusBar,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { filterLecturesByVisibility, getTopicLectureVisibility } from '../services/aiLectureService';
import { openAskAI } from '../services/askAIStore';
import { NotesBookReader } from '../components/learning/notes/NotesBookReader';
import ImportantNotesTab from '../components/learning/notes/ImportantNotesTab';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Audio, Video, ResizeMode } from 'expo-av';
import * as Speech from 'expo-speech';
// SDK 54: downloadAsync/cacheDirectory from the root 'expo-file-system' import
// THROW a deprecation error at runtime, silently breaking all AI slide media
// downloads. The legacy entry point keeps the old behavior.
import * as FileSystem from 'expo-file-system/legacy';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as ImagePicker from 'expo-image-picker';
import { Buffer } from 'buffer';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { LayoutAnimation, UIManager } from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import HeaderMenuButton from '../components/HeaderMenuButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase, Topic, TopicVideo, CounselorAvatar, PresentationSlide, AITeachingAssistantResponse, PregenSuggestion, PreviousYearPaper, PreviousYearQuestion, TestConfig, DPPQuestion, Assignment, AssignmentQuestion, AssignmentSubmission, QuestionItem, SubjectiveGradeResult } from '../services/supabase';
import MathText, { containsLatex } from '../components/MathText';
import RichTipText from '../components/RichTipText';
import { KeyboardShiftView } from '../components/keyboard/keyboardStick';
import KeepScreenAwake from '../components/KeepScreenAwake';
import { stripEmbeddedOptions } from '../utils/questionText';
import PYQTab from '../components/PYQTab';
import DoubtsTab from '../components/DoubtsTab';
import ReelsTab from '../components/ReelsTab';
import { useAuth } from '../context/AuthContext';

// Function to properly combine multiple WAV audio chunks into a single WAV file
// Each chunk is a complete WAV file with its own header - we need to extract and combine audio data
function combineWavChunks(chunks: string[]): string {
  if (!chunks || chunks.length === 0) return '';
  if (chunks.length === 1) {
    return chunks[0].replace(/^data:audio\/\w+;base64,/, '');
  }
  
  console.log('[TTS] Combining', chunks.length, 'WAV chunks');
  
  // Decode all chunks to buffers
  const buffers: Buffer[] = chunks.map((chunk, i) => {
    const cleanChunk = chunk.replace(/^data:audio\/\w+;base64,/, '');
    return Buffer.from(cleanChunk, 'base64');
  });
  
  // WAV file structure: RIFF header (44 bytes) + audio data
  // We'll use the first chunk's header and combine all audio data
  const WAV_HEADER_SIZE = 44;
  
  // Extract audio data from each chunk (skip the WAV header)
  const audioDataChunks: Buffer[] = buffers.map((buffer, index) => {
    if (buffer.length <= WAV_HEADER_SIZE) {
      console.log('[TTS] Chunk', index + 1, 'too small:', buffer.length, 'bytes');
      return Buffer.alloc(0);
    }
    // Skip the 44-byte WAV header for each chunk
    return buffer.slice(WAV_HEADER_SIZE);
  });
  
  // Calculate total audio data size
  const totalAudioSize = audioDataChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  console.log('[TTS] Total audio data size:', totalAudioSize, 'bytes from', chunks.length, 'chunks');
  
  // Create new WAV file with combined data
  // Total file size = header (44 bytes) + all audio data
  const outputBuffer = Buffer.alloc(WAV_HEADER_SIZE + totalAudioSize);
  
  // Copy the first chunk's header
  buffers[0].copy(outputBuffer, 0, 0, WAV_HEADER_SIZE);
  
  // Update the file size in the RIFF header (bytes 4-7)
  // RIFF chunk size = file size - 8
  const riffSize = totalAudioSize + 36; // 44 - 8 = 36
  outputBuffer.writeUInt32LE(riffSize, 4);
  
  // Update the data chunk size (bytes 40-43)
  outputBuffer.writeUInt32LE(totalAudioSize, 40);
  
  // Copy all audio data chunks
  let offset = WAV_HEADER_SIZE;
  for (const audioData of audioDataChunks) {
    audioData.copy(outputBuffer, offset);
    offset += audioData.length;
  }
  
  console.log('[TTS] Combined WAV file size:', outputBuffer.length, 'bytes');
  
  return outputBuffer.toString('base64');
}

type SolutionQuestion = {
  id: string;
  question_text: string;
  options: Record<string, { text: string } | string> | null;
  correct_answer: string;
  marks: number;
  difficulty: string;
  question_image_url: string | null;
};

const TABS = [
  { id: 'videos', label: 'Classes', icon: 'play-circle-outline' },
  { id: 'ai', label: 'AI', icon: 'sparkles-outline' },
  { id: 'ai-teacher', label: 'AI Teacher', icon: 'school-outline' },
  { id: 'notes', label: 'Notes', icon: 'document-text-outline' },
  { id: 'important-notes', label: 'Important Notes', icon: 'bookmark-outline' },
  { id: 'questions', label: 'Questions', icon: 'list-outline' },
  { id: 'solutions', label: 'Solutions', icon: 'bulb-outline' },
  { id: 'assignments', label: 'Assignments', icon: 'clipboard-outline' },
  { id: 'dpp', label: 'DPP', icon: 'flame-outline' },
  { id: 'pyqs', label: "PYQ's", icon: 'document-text-outline' },
  { id: 'results', label: 'Results', icon: 'trophy-outline' },
  { id: 'doubts', label: 'Doubts', icon: 'help-circle-outline' },
];


// Helper function to enhance slides for longer narration (target: 10-15 minutes total)
// Each slide should have 150-250 words of narration
function enhanceSlidesForLongerNarration(slides: PresentationSlide[], topicTitle: string): PresentationSlide[] {
  if (!slides || slides.length === 0) return slides;
  
  const enhancedSlides: PresentationSlide[] = [];
  
  // Add comprehensive introduction slide
  enhancedSlides.push({
    title: `Welcome: ${topicTitle}`,
    content: `In this comprehensive lesson, we will explore ${topicTitle} in great detail. This is a fundamental concept that forms the basis of many important principles in science. Understanding this topic thoroughly will help you excel in your exams and develop a strong foundation for advanced studies. Let us begin our journey of discovery and learning together.`,
    narration: `Welcome, students! I am so excited to guide you through this comprehensive lesson on ${topicTitle}. This is one of the most fascinating topics in science, and by the end of this session, you will have a thorough understanding of all its key concepts. We will explore the fundamental principles, work through practical examples, and I will share some tips and tricks that will help you remember everything easily. Whether you are preparing for board exams, NEET, or JEE, this lesson will give you exactly what you need. So let us get started on this wonderful journey of learning. Please pay close attention to each slide, take notes if you can, and do not hesitate to replay any section you want to review. Remember, understanding is more important than memorizing. Let us begin!`,
    keyPoints: [
      `Introduction to ${topicTitle}`,
      'Why this topic is important',
      'What you will learn today',
      'How to apply this in exams'
    ],
    formula: null,
    infographic: '',
    infographicUrl: '',
    images: [],
    isStory: false,
    isTips: false,
  });
  
  // Process each original slide with enhanced narration
  slides.forEach((slide, index) => {
    // Calculate target word count (150-250 words per slide for comprehensive coverage)
    const currentWords = slide.narration?.split(' ').length || 0;
    const targetMinWords = 150;
    
    let enhancedNarration = slide.narration || slide.content;
    
    // If narration is too short, enhance it with additional explanatory content
    if (currentWords < targetMinWords) {
      const additionalContext = generateAdditionalContext(slide, index, topicTitle);
      enhancedNarration = `${enhancedNarration} ${additionalContext}`;
    }
    
    enhancedSlides.push({
      ...slide,
      narration: enhancedNarration,
      keyPoints: slide.keyPoints?.length > 0 ? slide.keyPoints : [
        'Key concept to understand',
        'Important relationship to note',
        'Application in problem solving',
        'Remember for exams'
      ],
    });
    
    // Add a "deeper understanding" slide after core concept slides (not for story/tips)
    if (!slide.isStory && !slide.isTips && index < slides.length - 2 && slide.content.length > 100) {
      enhancedSlides.push({
        title: `Understanding: ${slide.title}`,
        content: `Let us take a moment to deeply understand ${slide.title}. This concept is crucial because it connects to many other topics you will encounter. The key is to visualize what is happening and understand the underlying principles rather than just memorizing formulas. Think about how this applies to real-world situations you see every day.`,
        narration: `Now let us pause and make sure we deeply understand what we just learned about ${slide.title}. This is a crucial concept, and I want to make sure you have fully grasped it before we move on. The best way to understand this is to think about it conceptually. Ask yourself: why does this happen? What are the underlying principles? How does this connect to other things I have learned? When you understand the 'why' behind a concept, you will never forget it, even under exam pressure. Take a moment to think about what we discussed. Can you explain this concept in your own words? If you can, that means you truly understand it. If not, feel free to go back and review the previous slide. There is no rush. Understanding is what matters most.`,
        keyPoints: [
          'Visualize the concept',
          'Connect to prior knowledge',
          'Think about real-world applications',
          'Practice explaining in your own words'
        ],
        formula: slide.formula,
        infographic: '',
        infographicUrl: '',
        images: [],
        isStory: false,
        isTips: false,
      });
    }
  });
  
  // Add practice application slide
  enhancedSlides.push({
    title: `Practice: Applying ${topicTitle}`,
    content: `Now that we have covered the theory, let us discuss how to apply this knowledge effectively. When you encounter problems in your exams, start by identifying what information is given and what you need to find. Then recall the relevant concepts and formulas. Apply them step by step, and always verify your answer makes physical sense.`,
    narration: `Excellent work so far! Now let us talk about how to apply what you have learned in practice. This is where the real learning happens. When you see a problem in your exam related to ${topicTitle}, here is my recommended approach. First, read the problem carefully and identify all the given information. Write it down clearly. Second, think about what concept or principle applies to this situation. Third, recall the relevant formula or relationship. Fourth, substitute the values carefully, paying attention to units. Fifth, solve step by step, showing all your work. And finally, sixth, check your answer to make sure it makes physical sense. Does the magnitude seem reasonable? Are the units correct? This systematic approach will help you solve even the trickiest problems with confidence.`,
    keyPoints: [
      'Read problems carefully',
      'Identify given information',
      'Apply relevant formulas',
      'Check your answer makes sense'
    ],
    formula: null,
    infographic: '',
    infographicUrl: '',
    images: [],
    isStory: false,
    isTips: true,
  });
  
  // Add comprehensive summary slide
  enhancedSlides.push({
    title: `Summary: ${topicTitle}`,
    content: `In this comprehensive lesson, we covered all essential aspects of ${topicTitle}. You learned the fundamental concepts, explored practical examples, heard a memorable story, and received tips and tricks for remembering everything. Review these concepts regularly and practice solving problems to master this topic completely.`,
    narration: `Congratulations! You have completed this comprehensive lesson on ${topicTitle}. Let us quickly summarize what we learned today. We started with the basic introduction and understood why this topic is so important. Then we explored the core concepts in detail, making sure to understand not just the 'what' but also the 'why'. We worked through practical examples to see how these concepts apply in real problems. We heard a memorable story that will help you remember the key points. And finally, we learned some useful tips and tricks for exams. I am proud of you for completing this lesson! Remember, learning is a journey, not a destination. Keep practicing, keep asking questions, and keep exploring. With consistent effort, you will master this topic completely. Good luck with your studies, and I will see you in the next lesson!`,
    keyPoints: [
      'Review key concepts regularly',
      'Practice with problems',
      'Use memory techniques',
      'Stay curious and keep learning'
    ],
    formula: null,
    infographic: '',
    infographicUrl: '',
    images: [],
    isStory: false,
    isTips: true,
  });
  
  console.log('[Enhancement] Extended from', slides.length, 'to', enhancedSlides.length, 'slides');
  return enhancedSlides;
}

// Helper to generate additional context for short narrations
function generateAdditionalContext(slide: PresentationSlide, index: number, topicTitle: string): string {
  const slideNumber = index + 1;
  
  if (slide.isStory) {
    return `This story illustrates an important aspect of ${topicTitle}. Stories like this help us remember concepts better because our brains are wired to remember narratives. Try to visualize yourself in this situation. How would you apply what you have learned? These real-world connections make abstract concepts concrete and memorable. When you encounter this topic in your exam, recall this story and the insights will come naturally.`;
  }
  
  if (slide.isTips) {
    return `These tips and tricks are incredibly valuable for your exam preparation. Memory techniques like mnemonics, visualization, and association can dramatically improve your retention. Practice using these techniques regularly, and you will find that recalling information becomes much easier. Remember, it is not about studying harder, but studying smarter. Use these tips consistently, and you will see remarkable improvement in your understanding and recall of ${topicTitle}.`;
  }
  
  if (slide.formula) {
    return `This formula is fundamental to understanding ${topicTitle}. Let me explain each component in detail. Understanding the physical meaning behind each variable helps you remember the formula naturally, rather than through rote memorization. When solving problems, always start by writing this formula clearly. Then, identify which values you have and which you need to find. Substitute carefully, paying attention to units, and solve step by step. Practice applying this formula to different types of problems to build your confidence.`;
  }
  
  // Generic enhancement for concept slides
  return `This is a key concept in ${topicTitle} that you must understand thoroughly. It forms the foundation for many advanced topics you will encounter later. Take a moment to visualize what is happening. Think about how this connects to what you already know. Can you think of a real-world example? The more connections you make, the deeper your understanding will be. If you encounter this concept in your exam, you will be able to approach it confidently because you understand the underlying principles, not just the surface-level facts.`;
}

const VIDEOS_DATA = [
  {
    id: 1,
    title: 'Introduction to Physical Quantities',
    duration: '12:30',
    thumbnail: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400',
    desc: 'Understanding the basics of physical quantities and their importance.',
  },
  {
    id: 2,
    title: 'Fundamental vs Derived Quantities',
    duration: '15:45',
    thumbnail: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=400',
    desc: 'Deep dive into the differences between fundamental and derived quantities.',
  },
  {
    id: 3,
    title: 'Systems of Units (SI, CGS, FPS)',
    duration: '10:15',
    thumbnail: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?w=400',
    desc: 'Explaining different systems of units used in physics globally.',
  },
];

const MCQ_OPTIONS = {
  levels: ['Easy', 'Medium', 'Hard'],
  questions: ['5', '10', '15', '20', '25'],
  times: ['15 min', '30 min', '60 min', 'Unlimited'],
};

const NOTES_DATA = {
  title: 'Physical Quantities - Key Concepts',
  content: [
    {
      heading: 'Definition',
      text: 'A physical quantity is a property of a material or system that can be quantified by measurement.',
    },
    {
      heading: 'Types of Physical Quantities',
      text: '1. Fundamental Quantities: Mass, Length, Time, Electric Current, Temperature, Luminous Intensity, Amount of Substance\n2. Derived Quantities: Velocity, Acceleration, Force, Energy, etc.',
    },
    {
      heading: 'SI Units',
      text: 'The International System of Units (SI) is the modern form of the metric system and the most widely used system of measurement.',
    },
  ],
};

// Reusable scrubbable audio progress bar for the AI presentation player.
// Tap or drag anywhere on the track to seek the current slide's narration.
// While dragging, the fill/thumb follow the finger locally (dragFraction) and
// status-driven updates are suppressed by the parent (isScrubbingRef) so the
// thumb doesn't fight the playback callback. On release, onSeekEnd(fraction)
// performs the actual setPositionAsync seek.
function AudioScrubber({
  positionMillis,
  durationMillis,
  onSeekStart,
  onSeekMove,
  onSeekEnd,
  trackStyle,
  fillStyle,
  style,
}: {
  positionMillis: number;
  durationMillis: number;
  onSeekStart?: () => void;
  onSeekMove?: (fraction: number) => void;
  onSeekEnd: (fraction: number) => void;
  trackStyle: any;
  fillStyle: any;
  style?: any;
}) {
  const containerRef = useRef<View>(null);
  const layoutRef = useRef({ x: 0, width: 0 });
  const dragValueRef = useRef(0);
  const [dragFraction, setDragFraction] = useState<number | null>(null);

  const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const fractionFromPageX = (pageX: number) => {
    const { x, width } = layoutRef.current;
    return width > 0 ? clamp((pageX - x) / width) : 0;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const f = fractionFromPageX(g.x0);
        dragValueRef.current = f;
        setDragFraction(f);
        onSeekStart && onSeekStart();
        onSeekMove && onSeekMove(f);
      },
      onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const f = fractionFromPageX(g.moveX);
        dragValueRef.current = f;
        setDragFraction(f);
        onSeekMove && onSeekMove(f);
      },
      onPanResponderRelease: () => {
        const f = dragValueRef.current;
        setDragFraction(null);
        onSeekEnd(f);
      },
      onPanResponderTerminate: () => {
        const f = dragValueRef.current;
        setDragFraction(null);
        onSeekEnd(f);
      },
    })
  ).current;

  const measure = () => {
    containerRef.current?.measureInWindow((x, _y, width) => {
      layoutRef.current = { x, width };
    });
  };

  const baseFraction = durationMillis > 0 ? clamp(positionMillis / durationMillis) : 0;
  const fraction = dragFraction != null ? dragFraction : baseFraction;
  const isDragging = dragFraction != null;

  return (
    <View
      ref={containerRef}
      onLayout={measure}
      hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
      style={[styles.scrubberHitArea, style]}
      {...panResponder.panHandlers}
    >
      <View style={[trackStyle, styles.scrubberTrackInner]} pointerEvents="none">
        <View style={[fillStyle, { width: `${fraction * 100}%` }]} />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.scrubberThumb,
          { left: `${fraction * 100}%` },
          isDragging && styles.scrubberThumbActive,
        ]}
      />
    </View>
  );
}

// A native TextInput cannot typeset math, so when a LaTeX-laden question is
// placed into the chat field we convert the common LaTeX tokens to readable
// Unicode and strip the delimiters/wrappers. Rich math rendering stays on the
// non-editable surfaces (suggestion rows, presentation) via <MathText>.
const LATEX_UNICODE_MAP: Array<[RegExp, string]> = [
  [/\\rightarrow|\\to\b/g, '→'],
  [/\\leftarrow|\\gets\b/g, '←'],
  [/\\leftrightarrow/g, '↔'],
  [/\\Rightarrow/g, '⇒'],
  [/\\Leftarrow/g, '⇐'],
  [/\\times/g, '×'],
  [/\\div/g, '÷'],
  [/\\pm/g, '±'],
  [/\\cdot/g, '·'],
  [/\\leq/g, '≤'],
  [/\\geq/g, '≥'],
  [/\\neq/g, '≠'],
  [/\\approx/g, '≈'],
  [/\\infty/g, '∞'],
  [/\\degree|\\circ/g, '°'],
  [/\\sum/g, 'Σ'],
  [/\\prod/g, 'Π'],
  [/\\int/g, '∫'],
  [/\\partial/g, '∂'],
  [/\\nabla/g, '∇'],
  [/\\Delta/g, 'Δ'],
  [/\\delta/g, 'δ'],
  [/\\alpha/g, 'α'],
  [/\\beta/g, 'β'],
  [/\\gamma/g, 'γ'],
  [/\\theta/g, 'θ'],
  [/\\lambda/g, 'λ'],
  [/\\mu/g, 'μ'],
  [/\\pi/g, 'π'],
  [/\\sigma/g, 'σ'],
  [/\\omega/g, 'ω'],
];

const sanitizeLatexForInput = (raw: string): string => {
  if (!raw) return raw;
  let text = raw;
  // Environment wrappers (\begin{...}...\end{...}) -> drop the markers.
  text = text.replace(/\\(?:begin|end)\{[^}]*\}/g, ' ');
  // \ce{...} (mhchem chemistry) -> keep the inner equation text.
  text = text.replace(/\\ce\{([^}]*)\}/g, '$1');
  // \text{...}, \mathrm{...} etc -> keep the inner text.
  text = text.replace(/\\(?:text|mathrm|mathbf|mathit)\{([^}]*)\}/g, '$1');
  // \frac{a}{b} -> a/b and \sqrt{x} -> √(x). Run a couple of passes so lightly
  // nested fractions collapse too.
  for (let i = 0; i < 3; i++) {
    text = text.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
  }
  text = text.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
  // Convert named tokens (incl. \rightarrow / \leftarrow) BEFORE stripping the
  // \left / \right size commands, otherwise "\rightarrow" loses its "\right".
  for (const [pattern, replacement] of LATEX_UNICODE_MAP) {
    text = text.replace(pattern, replacement);
  }
  // \left( \right] etc -> keep the delimiter, drop the size command.
  text = text.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '');
  // Simple sub/superscripts: x^{2} -> x2, H_{2} -> H2.
  text = text.replace(/\^\{([^}]*)\}/g, '$1').replace(/_\{([^}]*)\}/g, '$1');
  text = text.replace(/\^([A-Za-z0-9])/g, '$1').replace(/_([A-Za-z0-9])/g, '$1');
  // Drop the inline/display math delimiters now that tokens are converted.
  text = text.replace(/\$\$?/g, '');
  // Tidy any leftover spacing.
  return text.replace(/[ \t]{2,}/g, ' ').trim();
};

export default function TopicDetailsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'TopicDetails'>>();
  const { topicId, subjectId, subjectName, openAITab, openTab, chapterNumber, topicNumber, topicTitle, chapterId: routeChapterId, isPreview, courseId: previewCourseId, courseName: previewCourseName, previewAiLimit = 3, previewDoubtsLimit = 3 } = route.params || {};
  const insets = useSafeAreaInsets();
  // Keyboard open/closed — drives the AI input bar's bottom padding: safe-area
  // inset when closed (clear the gesture bar), compact when open.
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const h = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));
    return () => { s.remove(); h.remove(); };
  }, []);
  const { user } = useAuth();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isActualLandscape = windowWidth > windowHeight;
  
  // Determine if we're in "chapter mode" (subject-level content without topicId)
  const isChapterMode = !topicId && !!subjectId;
  
  const [activeTab, setActiveTab] = useState(openTab || (openAITab ? 'ai' : 'videos'));
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [selectedLanguageFilter, setSelectedLanguageFilter] = useState<string>('all');
  const [aiMessage, setAiMessage] = useState('');
  
  // Topic state from API (includes subject_id and subject_name from chapter join)
  const [topic, setTopic] = useState<(Topic & { subject_id?: string; subject_name?: string }) | null>(null);
  const [topicLoading, setTopicLoading] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Topic videos state from API
  const [topicVideos, setTopicVideos] = useState<TopicVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState<string | null>(null);
  
  // Debug: Log when topicVideos state changes
  useEffect(() => {
    console.log('[TopicDetails] topicVideos state changed, count:', topicVideos.length, 'videosLoading:', videosLoading);
  }, [topicVideos, videosLoading]);
  
  // Questions state (MCQ + Subjective)
  const [questionAnswers, setQuestionAnswers] = useState<{ [key: string]: string }>({});
  const [questionsList, setQuestionsList] = useState<QuestionItem[]>([]);
  const [solutionsItems, setSolutionsItems] = useState<SolutionQuestion[]>([]);
  const [solutionsLoading, setSolutionsLoading] = useState(false);
  const [solutionsError, setSolutionsError] = useState<string | null>(null);
  const [solutionsCachedIds, setSolutionsCachedIds] = useState<Set<string>>(new Set());
  const [solutionsExpandedId, setSolutionsExpandedId] = useState<string | null>(null);
  const [solutionsPlayingId, setSolutionsPlayingId] = useState<string | null>(null);
  const solutionsFetchSeqRef = useRef(0);
  const solutionsPlaySeqRef = useRef(0);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [questionDifficulties, setQuestionDifficulties] = useState<string[]>(['All']);
  const [questionSubmitted, setQuestionSubmitted] = useState(false);
  const [questionCurrentIndex, setQuestionCurrentIndex] = useState(0);
  const [questionSubmitting, setQuestionSubmitting] = useState(false);
  const [questionGradeResults, setQuestionGradeResults] = useState<{ [questionId: string]: { marksAwarded: number; feedback: string; isCorrect: boolean; pending?: boolean } }>({});
  const [questionTotalScore, setQuestionTotalScore] = useState(0);
  const [questionTotalMarks, setQuestionTotalMarks] = useState(0);
  const [questionImages, setQuestionImages] = useState<{ [questionId: string]: { uri: string; mimeType: string } }>({});

  // DPP (Daily Practice Problems) state - dynamically generated from questions table
  const [dppView, setDppView] = useState<'landing' | 'testing' | 'submitting' | 'results'>('landing');
  const [dppPastAttempts, setDppPastAttempts] = useState<any[]>([]);
  const [dppPastLoading, setDppPastLoading] = useState(false);
  const [dppQuestions, setDppQuestions] = useState<any[]>([]);
  const [dppAnswers, setDppAnswers] = useState<{ [key: string]: string }>({});
  const [dppCurrentIndex, setDppCurrentIndex] = useState(0);
  const [dppStartTime, setDppStartTime] = useState<number>(0);
  const [dppScore, setDppScore] = useState(0);
  const [dppFlaggedQuestions, setDppFlaggedQuestions] = useState<Set<string>>(new Set());
  const [dppGradingResults, setDppGradingResults] = useState<{ [questionId: string]: { isCorrect: boolean; marksAwarded: number } }>({});
  
  // Submission status for PYQ papers and Tests (Proficiency/Test)
  const [submittedPapers, setSubmittedPapers] = useState<Map<string, { percentage: number; score: number; total: number }>>(new Map());
  const [submittedTests, setSubmittedTests] = useState<Map<string, { percentage: number; score: number; total: number }>>(new Map());
  
  // Assignment state
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);
  const [assignmentView, setAssignmentView] = useState<'list' | 'detail' | 'test' | 'results'>('list');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<{ [id: string]: AssignmentSubmission }>({});
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [currentAssignment, setCurrentAssignment] = useState<Assignment | null>(null);
  const [assignmentAnswers, setAssignmentAnswers] = useState<{ [questionId: string]: string }>({});
  const [assignmentCurrentIndex, setAssignmentCurrentIndex] = useState(0);
  const [assignmentTimeRemaining, setAssignmentTimeRemaining] = useState(0);
  const [assignmentStartTime, setAssignmentStartTime] = useState<number>(0);
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);
  const [assignmentResult, setAssignmentResult] = useState<AssignmentSubmission | null>(null);
  const [assignmentFlagged, setAssignmentFlagged] = useState<{ [questionId: string]: boolean }>({});
  const [showAssignmentPalette, setShowAssignmentPalette] = useState(false);
  const [selfPracticeLoading, setSelfPracticeLoading] = useState(false);
  
  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // AI Teaching Assistant state
  const [aiAvatar, setAiAvatar] = useState<CounselorAvatar | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<AITeachingAssistantResponse | null>(null);
  // Pre-generated, ready-to-play question suggestions for this subject/topic.
  // Tapping one loads its cached presentation instantly (see handleSelectSuggestion).
  const [aiSuggestions, setAiSuggestions] = useState<PregenSuggestion[]>([]);
  // Live server-side search results powering the real-time suggestion overlay.
  // Refreshed per keystroke (debounced) from the search-questions endpoint.
  const [aiSearchResults, setAiSearchResults] = useState<{ id: string; text: string }[]>([]);
  // Monotonic sequence so only the NEWEST in-flight search may render; fast
  // typing never shows out-of-order results.
  const aiSearchSeqRef = useRef(0);
  // Per-query result cache for instant back-typing (cleared on subject change).
  const aiSearchCacheRef = useRef<Map<string, { id: string; text: string }[]>>(new Map());
  // Short-lived guard against rapid double-taps on a suggestion (see handler).
  const aiSelectLockRef = useRef(false);
  const [aiInputFocused, setAiInputFocused] = useState(false);
  const [suppressAiSuggestions, setSuppressAiSuggestions] = useState(false);
  const [aiDebouncedQuery, setAiDebouncedQuery] = useState('');
  const [aiOverlayVisible, setAiOverlayVisible] = useState(false);
  const aiOverlayAnim = useRef(new Animated.Value(0)).current;
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [slideDurations, setSlideDurations] = useState<number[]>([]);
  const [totalPresentationDuration, setTotalPresentationDuration] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const aiResponseRef = useRef<AITeachingAssistantResponse | null>(null);
  // True while the user is actively dragging the scrubber; suppresses
  // status-driven audioProgress updates so the thumb doesn't fight the finger.
  const isScrubbingRef = useRef(false);
  // Whether audio was playing when the scrub started (restored on release).
  const wasPlayingBeforeScrubRef = useRef(false);
  // Throttles the live position-label updates during a drag.
  const lastScrubLabelTsRef = useRef(0);
  const preloadedAudioRef = useRef<string[]>([]); // Pre-loaded audio file URIs for all slides
  // Pre-downloaded slide images: maps the original remote image URL to a local
  // cached file URI so each slide's image renders instantly alongside its audio.
  const preloadedImagesRef = useRef<Record<string, string>>({});
  // Pre-downloaded Manim slide videos: remote URL -> local cached file URI.
  const preloadedVideosRef = useRef<Record<string, string>>({});
  // The single mounted Manim <Video> for the CURRENT slide. Only ONE Video may
  // ever be mounted at a time (Android allows one live decoder surface).
  const manimVideoRef = useRef<Video | null>(null);
  // Monotonic "playback generation". Bumped by stopPresentationPlayback() to
  // invalidate any in-flight narration chain (async createAsync + auto-advance
  // callbacks all re-check it) so no orphaned sound starts after the user leaves.
  const playbackGenerationRef = useRef(0);
  // Pending silent-slide auto-advance timer, tracked so teardown can clear it.
  const silentAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPreloadingAudio, setIsPreloadingAudio] = useState(false);
  // Index of the slide whose image is currently loading/decoding (or null);
  // drives a small spinner over that slide's image area only.
  const [imageLoadingSlide, setImageLoadingSlide] = useState<number | null>(null);
  const [preloadingSlideIndex, setPreloadingSlideIndex] = useState(0);
  const [totalSlidesToPreload, setTotalSlidesToPreload] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPresentationFullscreen, setIsPresentationFullscreen] = useState(false);
  const [slideTimings, setSlideTimings] = useState<number[]>([]);
  const [combinedNarration, setCombinedNarration] = useState('');
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [hasPlayedWelcomeAudio, setHasPlayedWelcomeAudio] = useState(false);

  // ── AI Navigation Gate (Task #243) ─────────────────────────────────────────
  // requiresConfirmation: a presentation became ready while the user was NOT on
  // the AI tab, so we suppressed autoplay and must ask before tearing it down on
  // leave. presentationStarted: slide 0 has actually been shown/started.
  const [aiRequiresConfirmation, setAiRequiresConfirmation] = useState(false);
  const [aiPresentationStarted, setAiPresentationStarted] = useState(false);
  const aiRequiresConfirmationRef = useRef(false);
  const aiPresentationStartedRef = useRef(false);
  const aiExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTabRef = useRef(activeTab);
  
  // Orientation state for landscape mode
  const [isLandscape, setIsLandscape] = useState(false);
  const [screenDimensions, setScreenDimensions] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });
  const [landscapeImageIndex, setLandscapeImageIndex] = useState(0);
  
  // Auto-hide controls state
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const orientationUnlockTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Fullscreen presentation controls state (separate from landscape mode in tab)
  const [fullscreenControlsVisible, setFullscreenControlsVisible] = useState(true);
  const fullscreenControlsOpacity = useRef(new Animated.Value(1)).current;
  const fullscreenControlsTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Animation values for loading orbit
  const orbitSlowAnim = useRef(new Animated.Value(0)).current;
  const orbitMediumAnim = useRef(new Animated.Value(0)).current;
  const orbitFastAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Previous Year Papers / Practice & Tests state
  const [previousYearPapers, setPreviousYearPapers] = useState<PreviousYearPaper[]>([]);
  const [previousYearLoading, setPreviousYearLoading] = useState(false);
  const [showTestConfigModal, setShowTestConfigModal] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<PreviousYearPaper | null>(null);
  const [testQuestionCount, setTestQuestionCount] = useState<number>(10);
  const [testTimeLimit, setTestTimeLimit] = useState<number | null>(30);
  const [activePaperCategory, setActivePaperCategory] = useState<string>('previous_year');
  const [pypTestHistory, setPypTestHistory] = useState<any[]>([]);
  const [pypTestHistoryLoading, setPypTestHistoryLoading] = useState(false);
  
  // Tests from tests table (Proficiency and Exam/Mock tests)
  const [proficiencyTests, setProficiencyTests] = useState<any[]>([]);
  const [examTests, setExamTests] = useState<any[]>([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [selectedTest, setSelectedTest] = useState<any | null>(null);

  // Chapter mode subject name (fetched separately when in chapter mode)
  const [chapterModeSubjectName, setChapterModeSubjectName] = useState<string | null>(null);
  
  // My Results tab state (chapter-level only)
  const [myResults, setMyResults] = useState<any[]>([]);
  const [myResultsLoading, setMyResultsLoading] = useState(false);
  const [myResultsError, setMyResultsError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<any | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewQuestions, setReviewQuestions] = useState<any[]>([]);
  const [reviewQuestionsLoading, setReviewQuestionsLoading] = useState(false);
  const [studentAnswers, setStudentAnswers] = useState<any[]>([]);

  const LANGUAGE_DATA: Record<string, { label: string; native: string; flag: string }> = {
    english:   { label: 'English',   native: 'English',  flag: 'GB' },
    hindi:     { label: 'Hindi',     native: '\u0939\u093F\u0928\u094D\u0926\u0940',    flag: 'IN' },
    kannada:   { label: 'Kannada',   native: '\u0C95\u0CA8\u0CCD\u0CA8\u0CA1',    flag: 'IN' },
    tamil:     { label: 'Tamil',     native: '\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD',    flag: 'IN' },
    telugu:    { label: 'Telugu',    native: '\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41',   flag: 'IN' },
    malayalam: { label: 'Malayalam', native: '\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02',  flag: 'IN' },
    marathi:   { label: 'Marathi',   native: '\u092E\u0930\u093E\u0920\u0940',    flag: 'IN' },
    bengali:   { label: 'Bengali',   native: '\u09AC\u09BE\u0982\u09B2\u09BE',    flag: 'IN' },
    gujarati:  { label: 'Gujarati',  native: '\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0',  flag: 'IN' },
    punjabi:   { label: 'Punjabi',   native: '\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40',   flag: 'IN' },
    odia:      { label: 'Odia',      native: '\u0B13\u0B21\u0B3C\u0B3F\u0B06',    flag: 'IN' },
    assamese:  { label: 'Assamese',  native: '\u0985\u09B8\u09AE\u09C0\u09AF\u09BC\u09BE',  flag: 'IN' },
    urdu:      { label: 'Urdu',      native: '\u0627\u0631\u062F\u0648',     flag: 'IN' },
  };

  const [purchasedLanguages, setPurchasedLanguages] = useState<string[]>([]);
  const [courseAvailableLanguages, setCourseAvailableLanguages] = useState<string[]>([]);
  const [languageCourseId, setLanguageCourseId] = useState<string | null>(null);
  const [selectedAILanguage, setSelectedAILanguage] = useState<string>('english');
  const [languageTopupPrice, setLanguageTopupPrice] = useState<number>(0);

  useEffect(() => {
    console.log('[TopicDetails] useEffect triggered with topicId:', topicId, 'subjectId:', subjectId, 'isChapterMode:', isChapterMode);
    
    // Reset language filter when topic changes
    setSelectedLanguageFilter('all');
    
    // Clear stale topic data when switching modes
    if (isChapterMode) {
      setTopic(null);
      setTopicVideos([]);
      setQuestionsList([]);
      setQuestionDifficulties(['All']);
      setPreviousYearPapers([]);
    }
    
    if (topicId) {
      console.log('[TopicDetails] Calling fetchTopicDetails and fetchTopicVideos...');
      fetchTopicDetails();
      fetchTopicVideos();
    } else if (isChapterMode && subjectId) {
      // Chapter mode: fetch subject-level content (videos, MCQs, Previous Year Papers)
      console.log('[TopicDetails] Chapter mode - fetching subject-level content for subjectId:', subjectId);
      fetchSubjectVideos();
      // Also fetch subject name if not provided in route params
      if (!subjectName) {
        fetchSubjectNameById(subjectId);
      }
    }
  }, [topicId, subjectId, isChapterMode]);

  // Load ready, pre-generated question suggestions for the AI tab. Polls while
  // any are still generating (capped) so freshly-finished questions appear, then
  // stops. Each tick replaces the list with whatever is currently ready.
  useEffect(() => {
    const effSubjectId = subjectId || topic?.subject_id;
    if (!effSubjectId && !topicId) {
      setAiSuggestions([]);
      return;
    }

    let cancelled = false;
    let polls = 0;
    const MAX_POLLS = 10;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      polls++;
      let again = false;
      try {
        const res = await supabase.getReadyPregenQuestions({ subjectId: effSubjectId, topicId });
        if (cancelled) return;
        if (res.success && Array.isArray(res.questions)) {
          setAiSuggestions(res.questions);
        }
        again = !!res.pending;
      } catch {
        again = true;
      }
      if (cancelled) return;
      // Schedule the next poll only once this one has finished. A setInterval started a new request every 3 s even
      // while earlier ones were still waiting, so a slow or dead server stacked up requests until Android's 5 per
      // host were all taken and the AI answer request queued behind them.
      if (again && polls < MAX_POLLS) timer = setTimeout(load, 3000);
    };

    load();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, [subjectId, topic?.subject_id, topicId]);

  // Debounce the typed query (~200ms) so we fire at most one search per pause
  // while still feeling instant.
  useEffect(() => {
    const t = setTimeout(() => setAiDebouncedQuery(aiMessage), 200);
    return () => clearTimeout(t);
  }, [aiMessage]);

  // New subject/topic: drop the previous one's cached search results so stale
  // suggestions never flash.
  const aiSearchSubjectId = subjectId || topic?.subject_id;
  useEffect(() => {
    aiSearchCacheRef.current = new Map();
    setAiSearchResults([]);
  }, [aiSearchSubjectId]);

  // Live server-side type-ahead: on each (debounced) keystroke, hit the
  // search-questions endpoint and show its qa_cache matches in the overlay.
  // A sequence counter guards against out-of-order responses, and results are
  // memoized per query for instant back-typing.
  useEffect(() => {
    if (activeTab !== 'ai') return;
    const q = aiDebouncedQuery.trim();
    if (!q || !aiSearchSubjectId) {
      setAiSearchResults([]);
      return;
    }
    const cacheKey = `${aiSearchSubjectId}:${q.toLowerCase()}`;
    const cached = aiSearchCacheRef.current.get(cacheKey);
    if (cached) {
      setAiSearchResults(cached);
      return;
    }
    const mySeq = ++aiSearchSeqRef.current;
    const controller = new AbortController();
    (async () => {
      const res = await supabase.searchQuestions({
        q,
        subjectId: aiSearchSubjectId,
        limit: 20,
        signal: controller.signal,
      });
      if (aiSearchSeqRef.current !== mySeq) return; // a newer keystroke won
      if (res.success && Array.isArray(res.results)) {
        const items = res.results.map((r) => ({ id: r.cacheId, text: r.question }));
        aiSearchCacheRef.current.set(cacheKey, items);
        // Bound the back-typing cache so a long session can't grow unbounded.
        if (aiSearchCacheRef.current.size > 200) {
          const firstKey = aiSearchCacheRef.current.keys().next().value;
          if (firstKey !== undefined) aiSearchCacheRef.current.delete(firstKey);
        }
        setAiSearchResults(items);
      }
      // On error keep whatever is showing — a transient network blip should
      // not flicker the overlay away mid-typing.
    })();
    return () => controller.abort();
  }, [activeTab, aiDebouncedQuery, aiSearchSubjectId]);

  const aiMatches = aiSearchResults;

  const showAiOverlay = aiInputFocused && !suppressAiSuggestions && aiMatches.length > 0;

  // Drive the overlay enter/exit (fade + slide). Keep it mounted during the exit
  // animation so the dismiss transition is visible.
  useEffect(() => {
    if (showAiOverlay) {
      setAiOverlayVisible(true);
      Animated.timing(aiOverlayAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(aiOverlayAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setAiOverlayVisible(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAiOverlay]);

  // Tapping a suggestion dismisses the overlay/keyboard and plays the question's
  // pre-generated presentation straight from the DB (cache hit = instant).
  // handleSelectSuggestion falls back to live generation on a cache miss.
  const handlePickAiSuggestion = (m: { id: string; text: string }) => {
    console.log('[AISuggest] tap received', { id: m.id, text: m.text, lock: aiSelectLockRef.current, aiLoading });
    // Synchronous lock: aiLoading is async state, so a rapid double-tap could
    // fire two selections before it flips. The ref blocks the second tap until
    // aiLoading has taken over (cleared shortly after).
    if (aiSelectLockRef.current || aiLoading) {
      console.log('[AISuggest] tap ignored (lock or aiLoading active) — clearing stuck state guard', { lock: aiSelectLockRef.current, aiLoading });
      return;
    }
    aiSelectLockRef.current = true;
    setTimeout(() => {
      aiSelectLockRef.current = false;
    }, 800);
    setSuppressAiSuggestions(true);
    setAiInputFocused(false);
    Keyboard.dismiss();
    handleSelectSuggestion({
      questionId: m.id,
      questionText: m.text,
      topicId: topicId ?? null,
    });
  };

  useEffect(() => {
    const effectiveSubjectId = subjectId || topic?.subject_id;
    if (!effectiveSubjectId) return;

    const fetchLanguageStatus = async () => {
      try {
        const courseResult = await supabase.getCourseFromSubject(effectiveSubjectId);
        if (!courseResult.success || !courseResult.course) return;

        const course = courseResult.course;
        setCourseAvailableLanguages(course.available_languages || []);
        setLanguageCourseId(course.id);
        setLanguageTopupPrice(course.language_topup_price || 0);
        console.log('[TopicDetails] Course languages:', course.available_languages, 'Price:', course.language_topup_price);

        if (course.available_languages && course.available_languages.length > 1) {
          console.log('[TopicDetails] Fetching purchases for courseId:', course.id);
          const purchaseResult = await supabase.getLanguageTopupPurchases(course.id);
          console.log('[TopicDetails] Purchase result:', JSON.stringify(purchaseResult));
          if (purchaseResult.success && purchaseResult.purchase) {
            const langs = purchaseResult.purchase.selected_languages || [];
            setPurchasedLanguages(langs);
            console.log('[TopicDetails] Purchased languages:', langs);
          } else {
            console.log('[TopicDetails] No purchases found, result:', purchaseResult.success, purchaseResult.error);
            setPurchasedLanguages([]);
          }
        }
      } catch (error) {
        console.error('[TopicDetails] Error fetching language status:', error);
      }
    };

    fetchLanguageStatus();
  }, [subjectId, topic?.subject_id]);

  // Ensure we always have a real subject name (not just in chapter mode).
  // In topic mode the chapter join sometimes omits subject_name; resolve it by
  // id so the AI request sends a specific subject and off-subject blocking can
  // trigger server-side.
  useEffect(() => {
    const effectiveSubjectId = subjectId || topic?.subject_id;
    if (!effectiveSubjectId) return;
    const haveName = (subjectName || topic?.subject_name)?.trim();
    if (!haveName && !chapterModeSubjectName) {
      fetchSubjectNameById(effectiveSubjectId);
    }
  }, [subjectId, topic?.subject_id, topic?.subject_name, chapterModeSubjectName]);
  
  // Fetch subject name by ID (for chapter mode when subjectName not in route params)
  const fetchSubjectNameById = async (subjectIdToFetch: string) => {
    try {
      const result = await supabase.getSubjectName(subjectIdToFetch);
      if (result.success && result.subjectName) {
        console.log('[TopicDetails] Fetched subject name for chapter mode:', result.subjectName);
        setChapterModeSubjectName(result.subjectName);
      }
    } catch (error) {
      console.error('[TopicDetails] Error fetching subject name:', error);
    }
  };

  useEffect(() => {
    if (openTab) {
      setActiveTab(openTab);
    } else if (openAITab) {
      setActiveTab('ai');
    }
  }, [openAITab, openTab]);

  // Fetch questions data when Questions tab is active
  useEffect(() => {
    if (activeTab === 'questions') {
      if (topicId) {
        fetchQuestions('All');
      } else if (isChapterMode && subjectId) {
        fetchSubjectMcqDifficulties();
        fetchSubjectMcqQuestions('All');
      }
    }
  }, [activeTab, topicId, subjectId, isChapterMode]);

  useEffect(() => {
    fetchAiAvatar();
    return () => {
      // On unmount, fully tear down playback so nothing survives the screen.
      stopPresentationPlayback();
    };
  }, []);

  // Stop presentation playback when the app is sent to the background, so audio
  // never keeps narrating while the user is in another app or on the home screen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        stopPresentationPlayback();
      }
    });
    return () => sub.remove();
  }, []);

  // Track screen dimensions for responsive layout (but don't auto-toggle layout mode)
  useEffect(() => {
    const { width, height } = Dimensions.get('window');
    setScreenDimensions({ width, height });
    
    const dimensionSubscription = Dimensions.addEventListener('change', ({ window }) => {
      console.log('[Dimensions] Changed:', window.width, 'x', window.height);
      setScreenDimensions({ width: window.width, height: window.height });
      // Note: We don't change isLandscape here - that's only toggled by the button
    });
    
    return () => {
      dimensionSubscription?.remove();
    };
  }, []);

  // Keep aiResponseRef in sync with aiResponse state
  useEffect(() => {
    aiResponseRef.current = aiResponse;
  }, [aiResponse]);

  // Keep AI-gate refs in sync so the beforeRemove / back handler reads live state
  useEffect(() => { aiRequiresConfirmationRef.current = aiRequiresConfirmation; }, [aiRequiresConfirmation]);
  useEffect(() => { aiPresentationStartedRef.current = aiPresentationStarted; }, [aiPresentationStarted]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // Clear the auto-expiry timer if the screen unmounts
  useEffect(() => {
    return () => {
      if (aiExpiryTimerRef.current) {
        clearTimeout(aiExpiryTimerRef.current);
        aiExpiryTimerRef.current = null;
      }
    };
  }, []);

  // Allow all orientations when fullscreen is opened, return to portrait-only on close
  useEffect(() => {
    const handleOrientationForFullscreen = async () => {
      // Clear any pending unlock timer when state changes
      if (orientationUnlockTimer.current) {
        clearTimeout(orientationUnlockTimer.current);
        orientationUnlockTimer.current = null;
      }
      
      if (isPresentationFullscreen) {
        try {
          // Unlock orientation to allow user to rotate freely while in fullscreen
          await ScreenOrientation.unlockAsync();
          console.log('[Orientation] Unlocked for fullscreen presentation - user can rotate freely');
        } catch (error) {
          console.error('[Orientation] Failed to unlock orientation:', error);
        }
      } else {
        try {
          // Lock back to portrait and KEEP it locked. The app is portrait-only
          // (app.json orientation: "portrait"), so there is no reason to unlock
          // here. The trailing unlockAsync() left the activity in a sensor/
          // unspecified state, which on Android resets the window's soft-input
          // mode — after returning from a presentation the keyboard then stopped
          // pushing the AI chat input up. Staying locked avoids that reset.
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
          console.log('[Orientation] Locked back to portrait (kept locked)');
        } catch (error) {
          console.error('[Orientation] Failed to restore portrait:', error);
        }
      }
    };
    handleOrientationForFullscreen();
    
    return () => {
      // Clear unlock timer on cleanup
      if (orientationUnlockTimer.current) {
        clearTimeout(orientationUnlockTimer.current);
        orientationUnlockTimer.current = null;
      }
      // Cleanup: restore portrait orientation when component unmounts
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        .then(() => ScreenOrientation.unlockAsync())
        .catch(() => {});
    };
  }, [isPresentationFullscreen]);

  // Helper function to split narration into sentences
  const splitIntoSentences = (text: string): string[] => {
    if (!text) return [];
    // Split by sentence endings (. ! ?) but keep the punctuation
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
  };

  // Get current slide's sentences
  const currentNarration = aiResponse?.presentationSlides?.[currentSlideIndex]?.narration || '';
  const narrationSentences = splitIntoSentences(currentNarration);

  // Track current line based on audio progress
  useEffect(() => {
    if (audioDuration > 0 && narrationSentences.length > 0) {
      // Estimate which line we're on based on audio progress
      const progressRatio = audioProgress / audioDuration;
      const estimatedLineIndex = Math.floor(progressRatio * narrationSentences.length);
      const clampedIndex = Math.min(estimatedLineIndex, narrationSentences.length - 1);
      setCurrentLineIndex(clampedIndex);
    }
  }, [audioProgress, audioDuration, narrationSentences.length]);

  // Reset line index when slide changes
  useEffect(() => {
    setCurrentLineIndex(0);
  }, [currentSlideIndex]);

  // Calculate cumulative progress across all slides
  const getCumulativeProgress = () => {
    let completed = 0;
    for (let i = 0; i < currentSlideIndex; i++) {
      completed += slideDurations[i] || 0;
    }
    return completed + audioProgress;
  };

  const fetchAiAvatar = async () => {
    const result = await supabase.getCounselorAvatar('male');
    if (result.success && result.avatar) {
      setAiAvatar(result.avatar);
    }
  };

  // Resolve the most specific subject name available. A generic 'General'
  // value disables the server's off-subject classifier (it matches anything),
  // so we only fall back to it when no real subject can be determined.
  const resolveSubjectName = (): string => {
    for (const candidate of [subjectName, topic?.subject_name, chapterModeSubjectName]) {
      const trimmed = candidate?.trim();
      if (trimmed && trimmed.toLowerCase() !== 'general') return trimmed;
    }
    return 'General';
  };

  // Takes a fully-formed AI teaching response (from either the live API or the
  // pregen cache), pre-downloads its per-slide audio, and opens the player.
  // Shared by handleAskAI (live) and handleSelectSuggestion (cached) so both
  // paths behave identically once a response is in hand.
  const presentAIResponse = async (response: AITeachingAssistantResponse) => {
    // Off-subject guard: the server short-circuits questions that belong to a
    // different subject and returns blocked=true with a redirect message.
    // Surface that as a chat bubble and stop BEFORE any audio prefetch/player.
    if (response.blocked === true) {
      console.log('[AI] Question blocked as off-subject. Detected:', response.detectedSubject);
      setAiResponse(response);
      return;
    }

    console.log('[AISuggest] presentAIResponse enter', {
      slides: response.presentationSlides?.length || 0,
      activeTab: activeTabRef.current,
      willAutoOpen: activeTabRef.current === 'ai',
    });
    console.log('[AI] Presentation slides received:', response.presentationSlides?.length || 0);

    // Use the original slides directly - backend already provides rich 150-250 word narrations
    const slides = response.presentationSlides || [];

    // Log narration lengths to verify we're getting full content
    slides.forEach((slide, i) => {
      const wordCount = slide.narration?.split(' ').length || 0;
      console.log(`[AI] Slide ${i + 1} narration: ${wordCount} words`);
    });

    setAiResponse(response);
    if (slides.length > 0) {
      // Pre-download the AI response's per-slide narration audio in parallel
      // batches. We no longer call Sarvam TTS — the audio comes straight from
      // the AI response (slide.audioUrl).
      setIsPreloadingAudio(true);
      setTotalSlidesToPreload(slides.length);
      setPreloadingSlideIndex(0);
      console.log('[AIAudio] Pre-downloading response audio for', slides.length, 'slides in parallel...');

      // Initialize arrays with placeholders to maintain slide order
      const audioFiles: string[] = new Array(slides.length).fill('');
      const durations: number[] = new Array(slides.length).fill(0);
      let completedCount = 0;

      // Helper: download a single slide's response audio to the local cache.
      const fetchSlideAudio = async (index: number): Promise<void> => {
        const slide = slides[index];
        try {
          const audioUrl = slide.audioUrl;
          if (audioUrl) {
            console.log('[AIAudio] Downloading response audio for slide', index + 1);
            const extMatch = audioUrl.split('?')[0].match(/\.(mp3|wav|m4a|aac|ogg)$/i);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'mp3';
            const audioFileUri = FileSystem.cacheDirectory + `ai_slide_${index}_${Date.now()}.${ext}`;
            const dl = await FileSystem.downloadAsync(audioUrl, audioFileUri);
            if (dl && dl.status === 200) {
              audioFiles[index] = audioFileUri;
              console.log('[AIAudio] Downloaded audio for slide', index + 1);
              // Probe the real duration for the progress bar.
              try {
                const { sound: tempSound, status } = await Audio.Sound.createAsync(
                  { uri: audioFileUri },
                  { shouldPlay: false }
                );
                if (status.isLoaded && status.durationMillis) {
                  durations[index] = status.durationMillis;
                }
                await tempSound.unloadAsync();
              } catch (durationError) {
                console.error('[AIAudio] Error probing duration for slide', index + 1, ':', durationError);
              }
            } else {
              console.warn('[AIAudio] Download failed for slide', index + 1, '- status', dl?.status);
            }
          } else {
            console.log('[AIAudio] No response audio for slide', index + 1, '- will show silently');
          }
          // If we have no probed duration (download failed or no audio), fall
          // back to the response's own duration (seconds) so the slide still
          // advances on a sensible timer.
          if (!durations[index] && slide.audioDuration) {
            durations[index] = Math.round(slide.audioDuration * 1000);
          }
        } catch (error) {
          console.error('[AIAudio] Pre-fetch error for slide', index + 1, ':', error);
        }

        // Update progress as each slide completes
        completedCount++;
        setPreloadingSlideIndex(completedCount);
      };

      // Pre-download slide images to the local cache, CONCURRENTLY with the
      // audio download below. preloadedImagesRef is updated incrementally as
      // each image lands (so background downloads become usable live). Playback
      // is gated only on the FIRST slide's image (bounded by a short timeout
      // further down), and every other slide's image keeps downloading in the
      // background so it is ready by the time the user reaches that slide.
      // Base64 / data-URI images have no network step and are skipped here
      // (rendered inline as before).
      const imageMap: Record<string, string> = {};
      preloadedImagesRef.current = imageMap;
      const isRemoteImg = (u: any): u is string =>
        typeof u === 'string' && /^https?:\/\//i.test(u);
      const slideRemoteImageUrls = (s: any): string[] => {
        const urls: string[] = [];
        if (isRemoteImg(s?.infographicUrl)) urls.push(s.infographicUrl);
        if (Array.isArray(s?.images)) s.images.forEach((u: any) => { if (isRemoteImg(u)) urls.push(u); });
        return urls;
      };
      const downloadSlideImage = async (url: string): Promise<void> => {
        if (!url || imageMap[url]) return;
        try {
          const clean = url.split('?')[0];
          const extMatch = clean.match(/\.(png|jpe?g|webp|gif|bmp)$/i);
          const ext = extMatch ? extMatch[1].toLowerCase() : 'img';
          const target = FileSystem.cacheDirectory + `ai_img_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const dl = await FileSystem.downloadAsync(url, target);
          if (dl && dl.status === 200) {
            imageMap[url] = target;
          } else {
            console.warn('[AIImage] Image download failed - status', dl?.status);
          }
        } catch (imgErr) {
          console.warn('[AIImage] Error downloading slide image:', imgErr);
        }
      };
      // Pre-download Manim slide videos concurrently, same pattern as images.
      // videoMap is updated incrementally so background downloads become
      // usable live; playback of the video falls back to the remote URL when
      // the local copy isn't ready yet.
      const videoMap: Record<string, string> = {};
      preloadedVideosRef.current = videoMap;
      const downloadSlideVideo = async (url: string): Promise<void> => {
        if (!url || videoMap[url] || !/^https?:\/\//i.test(url)) return;
        try {
          const clean = url.split('?')[0];
          const extMatch = clean.match(/\.(mp4|mov|m4v|webm)$/i);
          const ext = extMatch ? extMatch[1].toLowerCase() : 'mp4';
          const target = FileSystem.cacheDirectory + `ai_manim_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const dl = await FileSystem.downloadAsync(url, target);
          if (dl && dl.status === 200) {
            videoMap[url] = target;
          } else {
            console.warn('[AIVideo] Manim video download failed - status', dl?.status);
          }
        } catch (vidErr) {
          console.warn('[AIVideo] Error downloading Manim video:', vidErr);
        }
      };
      // Priority: the first slide's image(s)/video — playback waits on these (bounded).
      const firstSlideImageUrls = slides[0] ? slideRemoteImageUrls(slides[0]) : [];
      const firstSlideVideoUrl: string | undefined = (slides[0] as any)?.manimVideoUrl;
      const firstSlideImagesReady = Promise.all([
        ...firstSlideImageUrls.map(downloadSlideImage),
        ...(firstSlideVideoUrl ? [downloadSlideVideo(firstSlideVideoUrl)] : []),
      ]);
      // Background: every other slide's Manim video, sequentially (videos are
      // large; don't starve the audio downloads below).
      (async () => {
        for (let i = 1; i < slides.length; i++) {
          const u = (slides[i] as any)?.manimVideoUrl;
          if (u && u !== firstSlideVideoUrl) await downloadSlideVideo(u);
        }
        console.log('[AIVideo] Background Manim preload complete:', Object.keys(videoMap).length, 'cached');
      })();
      // Background: every other slide's images (deduped against the first slide).
      const backgroundImageUrls: string[] = [];
      slides.forEach((s: any, idx: number) => {
        if (idx === 0) return;
        slideRemoteImageUrls(s).forEach((u) => {
          if (!firstSlideImageUrls.includes(u) && !backgroundImageUrls.includes(u)) backgroundImageUrls.push(u);
        });
      });
      (async () => {
        const IMG_BATCH_SIZE = 3;
        for (let i = 0; i < backgroundImageUrls.length; i += IMG_BATCH_SIZE) {
          await Promise.all(backgroundImageUrls.slice(i, i + IMG_BATCH_SIZE).map(downloadSlideImage));
        }
        console.log('[AIImage] Background image preload complete:', Object.keys(imageMap).length, 'cached');
      })();

      // Process slides in parallel batches of 3 for optimal performance
      const BATCH_SIZE = 3;
      for (let i = 0; i < slides.length; i += BATCH_SIZE) {
        const batch = slides.slice(i, i + BATCH_SIZE).map((_, batchIndex) =>
          fetchSlideAudio(i + batchIndex)
        );
        await Promise.all(batch);
      }

      preloadedAudioRef.current = audioFiles;

      // Set all slide durations and calculate total ONCE before playback
      const totalDuration = durations.reduce((sum, d) => sum + d, 0);
      setSlideDurations(durations);
      setTotalPresentationDuration(totalDuration);
      console.log('[TTS] All audio pre-loaded:', preloadedAudioRef.current.length, 'files');
      console.log('[TTS] Total presentation duration:', totalDuration, 'ms (', Math.floor(totalDuration / 60000), ':', Math.floor((totalDuration % 60000) / 1000).toString().padStart(2, '0'), ')');

      // Gate playback on the FIRST slide's image only, bounded by a short
      // timeout so a slow/failed image never blocks the start. The remaining
      // slides' images keep downloading in the background (kicked off above).
      // When the first image isn't cached in time, the slide falls back to the
      // remote URL and its loading spinner shows until it appears.
      await Promise.race([
        firstSlideImagesReady,
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);

      setIsPreloadingAudio(false);

      setCurrentSlideIndex(0);
      if (activeTabRef.current === 'ai') {
        // User is still watching the AI tab: keep the existing behavior of
        // auto-opening the fullscreen player and starting narration.
        console.log('[AIGate] ready -> presentation started (auto, AI tab active)');
        setAiPresentationStarted(true);
        aiPresentationStartedRef.current = true;
        setAiRequiresConfirmation(false);
        aiRequiresConfirmationRef.current = false;
        setIsPresentationFullscreen(true);
        // Play first slide narration using pre-loaded audio
        playSlideNarration(slides[0].narration, 0, slides.length);
      } else {
        // The answer landed while the user is on a different tab. Do NOT
        // auto-open or auto-play; flag it as needing confirmation, surface a
        // "ready" banner on the AI tab, and arm the 15-minute auto-expiry.
        console.log('[AIGate] ready while AI tab inactive -> requiresConfirmation');
        setAiRequiresConfirmation(true);
        aiRequiresConfirmationRef.current = true;
        setAiPresentationStarted(false);
        aiPresentationStartedRef.current = false;
        startAiExpiryTimer();
      }
    }
  };

  // Resolve the URI to render for a slide image. Prefers the locally
  // pre-downloaded copy (instant), falling back to the original remote URL or
  // an inline base64/data URI when it was not preloaded.
  const resolveSlideImageUri = (url: string): string => {
    if (!url) return url;
    const local = preloadedImagesRef.current[url];
    if (local) return local;
    if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/9j/') || url.startsWith('/9j')) return `data:image/jpeg;base64,${url}`;
    return `data:image/png;base64,${url}`;
  };

  // Resolve the URI to play for a slide's Manim video: prefer the locally
  // pre-downloaded copy, falling back to the remote URL.
  const resolveSlideVideoUri = (url: string): string => {
    return preloadedVideosRef.current[url] || url;
  };

  // The single Manim <Video> for the current slide. CRITICAL: only ONE of the
  // player surfaces may mount this at a time (Android allows one live video
  // decoder). Keyed by slide index so changing slides reloads from 0:00. Muted:
  // the narration audio is the separate expo-av Sound; play/pause follows
  // isPlaying, and scrubbing seeks the video imperatively via manimVideoRef.
  const renderManimVideo = (videoUrl: string, videoStyle: any) => (
    <Video
      ref={manimVideoRef}
      key={`manim-${currentSlideIndex}`}
      source={{ uri: resolveSlideVideoUri(videoUrl) }}
      style={videoStyle}
      resizeMode={ResizeMode.CONTAIN}
      shouldPlay={isPlaying}
      isMuted
      rate={playbackSpeed}
      shouldCorrectPitch
      isLooping={false}
      useNativeControls={false}
    />
  );

  const handleAskAI = async (questionOverride?: string, skipQuotaGate?: boolean) => {
    // Allow callers (e.g. a tapped suggestion that missed the cache) to supply
    // the question directly, since setAiMessage state may not be flushed yet.
    const question = (questionOverride ?? aiMessage).trim();
    // Guard against concurrent invocations
    // In chapter mode, we don't need a topic - we use subjectId instead
    if (!question || aiLoading) return;
    if (!isChapterMode && !topic) return; // Topic required in normal mode
    if (isChapterMode && !subjectId) return; // SubjectId required in chapter mode

    // Free preview quota gate. Skipped when the caller already charged quota for
    // this action (e.g. a suggestion tap that fell back here after a cache miss).
    if (!skipQuotaGate && isPreview && previewCourseId) {
      const { getQuotaCount, incrementQuota } = require('../utils/previewQuota');
      const used = await getQuotaCount(previewCourseId, 'AI');
      if (used >= previewAiLimit) {
        setAiError(`You've used all ${previewAiLimit} free AI questions. Enroll to get unlimited access.`);
        return;
      }
      await incrementQuota(previewCourseId, 'AI');
    }
    
    // Reset all audio state when starting a new query
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setIsPlaying(false);
    setIsSpeaking(false);
    setAudioProgress(0);
    setAudioDuration(0);
    setSlideTimings([]);
    setCombinedNarration('');
    setSlideDurations([]);
    setTotalPresentationDuration(0);
    preloadedAudioRef.current = []; // Clear pre-loaded audio
    preloadedImagesRef.current = {}; // Clear pre-loaded slide images
    preloadedVideosRef.current = {}; // Clear pre-loaded Manim videos

    // Reset the navigation-gate state for the new question
    if (aiExpiryTimerRef.current) {
      clearTimeout(aiExpiryTimerRef.current);
      aiExpiryTimerRef.current = null;
    }
    setAiRequiresConfirmation(false);
    aiRequiresConfirmationRef.current = false;
    setAiPresentationStarted(false);
    aiPresentationStartedRef.current = false;
    console.log('[AIGate] start: new question submitted');

    setAiLoading(true);
    setAiError(null);
    stopPresentationPlayback();
    setAiResponse(null);
    setCurrentSlideIndex(0);

    // Wrapped so aiLoading is ALWAYS released — an uncaught failure from the AI
    // request would otherwise leave the flag stuck true and block every future
    // question/suggestion tap.
    try {
      console.log('[AI] Sending question to AI Teaching Assistant:', question, 'isChapterMode:', isChapterMode);

      // Use the standard AI teaching assistant API which generates 6 slides
      // with 150-250 words per slide narration (10-15 minutes total)
      // Determine subject name: route params > topic data > fallback to 'General'
      let effectiveSubjectName = resolveSubjectName();
      // Last-chance synchronous resolution: the background fetchSubjectNameById
      // runs in a useEffect, so a fast submit (or a prior fetch failure) can leave
      // us at 'General' even though a subjectId is available. A 'General' subject
      // makes the server classifier match anything and silently skips off-subject
      // blocking, so try one more time to resolve a real name before sending.
      if (effectiveSubjectName === 'General') {
        const resolvableSubjectId = isChapterMode ? subjectId : (subjectId || topic?.subject_id);
        if (resolvableSubjectId) {
          try {
            const nameResult = await supabase.getSubjectName(resolvableSubjectId);
            const fetched = nameResult.subjectName?.trim();
            if (nameResult.success && fetched && fetched.toLowerCase() !== 'general') {
              setChapterModeSubjectName(fetched);
              effectiveSubjectName = fetched;
            }
          } catch (e) {
            console.warn('[AI] Last-chance subject name resolution failed:', e);
          }
        }
      }
      console.log('[AI] Using subject name:', effectiveSubjectName, '(route:', subjectName, ', topic:', topic?.subject_name, ', chapterMode:', chapterModeSubjectName, ')');
      if (effectiveSubjectName === 'General') {
        console.warn('[AI] Subject could not be resolved to a specific value — sending "General". Server-side off-subject blocking may not trigger.');
      }

      const result = await supabase.askAITeachingAssistant({
        question,
        topicId: isChapterMode ? undefined : topic?.id,
        chapterId: isChapterMode ? undefined : topic?.chapter_id,
        subjectId: isChapterMode ? subjectId : (topic?.subject_id || undefined),
        subjectName: effectiveSubjectName,
        language: 'en-IN',
      });

      console.log('[AI] Response received:', result.success ? 'SUCCESS' : 'FAILED', result.error || '');

      if (result.success && result.response) {
        await presentAIResponse(result.response);
      } else {
        console.error('[AI] Error from AI Teaching Assistant:', result.error);
        setAiError(result.error || 'Failed to get AI response. Please try again.');
      }
    } catch (e) {
      console.error('[AI] Unexpected error in handleAskAI:', e);
      setAiError('Failed to get AI response. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  // Student tapped a pre-generated suggestion. Fast path: load the cached
  // presentation from pregen_question_cache and play it instantly. If there is
  // no cache hit (or the fetch fails), fall back to live generation so the
  // student still gets an answer.
  const handleSelectSuggestion = async (suggestion: PregenSuggestion) => {
    console.log('[AISuggest] handleSelectSuggestion enter', {
      questionId: suggestion.questionId,
      aiLoading,
      isChapterMode,
      hasTopic: !!topic,
      subjectId,
      activeTab: activeTabRef.current,
    });
    if (aiLoading) {
      console.log('[AISuggest] aborting: aiLoading already true');
      return;
    }
    // Guards that previously failed SILENTLY (the suggestion box would dismiss
    // but nothing else happened). Surface them as a visible error so the user —
    // and the logs — know exactly why no presentation played.
    if (!isChapterMode && !topic) {
      console.warn('[AISuggest] aborting: topic not loaded yet (normal mode)');
      setAiError('Still loading this lesson. Please wait a moment and tap again.');
      return;
    }
    if (isChapterMode && !subjectId) {
      console.warn('[AISuggest] aborting: subjectId missing (chapter mode)');
      setAiError('Still loading this subject. Please wait a moment and tap again.');
      return;
    }

    // Show the loading screen instantly so the tap always has visible feedback,
    // even before the cache fetch / audio preload begins.
    setAiLoading(true);
    setAiError(null);

    // Everything from here is wrapped so aiLoading can NEVER get stuck true. A
    // stuck flag re-blocks every future tap (handlePickAiSuggestion and the top
    // guard both bail when aiLoading is true) — the exact "tap does nothing"
    // deadlock we are fixing. The finally guarantees the flag is released.
    try {
      // Free preview quota gate — same as a typed question.
      if (isPreview && previewCourseId) {
        const { getQuotaCount, incrementQuota } = require('../utils/previewQuota');
        const used = await getQuotaCount(previewCourseId, 'AI');
        if (used >= previewAiLimit) {
          console.log('[AISuggest] aborting: preview quota exhausted');
          setAiError(`You've used all ${previewAiLimit} free AI questions. Enroll to get unlimited access.`);
          return;
        }
        await incrementQuota(previewCourseId, 'AI');
      }

      // Reflect the picked question in the input so it reads naturally. A native
      // TextInput can't typeset math, so convert any LaTeX to readable text first.
      setAiMessage(sanitizeLatexForInput(suggestion.questionText));

      // Reset audio/gate state (mirrors handleAskAI) before presenting.
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setIsPlaying(false);
      setIsSpeaking(false);
      setAudioProgress(0);
      setAudioDuration(0);
      setSlideTimings([]);
      setCombinedNarration('');
      setSlideDurations([]);
      setTotalPresentationDuration(0);
      preloadedAudioRef.current = [];
      preloadedImagesRef.current = {};
      preloadedVideosRef.current = {};
      if (aiExpiryTimerRef.current) {
        clearTimeout(aiExpiryTimerRef.current);
        aiExpiryTimerRef.current = null;
      }
      setAiRequiresConfirmation(false);
      aiRequiresConfirmationRef.current = false;
      setAiPresentationStarted(false);
      aiPresentationStartedRef.current = false;

      stopPresentationPlayback();
      setAiResponse(null);
      setCurrentSlideIndex(0);

      // Cache fetch is isolated so a network/parse failure falls through to the
      // live generation path rather than aborting the whole handler.
      let cached: Awaited<ReturnType<typeof supabase.getCachedPresentation>> | null = null;
      try {
        console.log('[AISuggest] trying cache for question', suggestion.questionId);
        cached = await supabase.getCachedPresentation(suggestion.questionId);
        const slideCount = cached.response?.presentationSlides?.length || 0;
        console.log('[AISuggest] cache result', {
          success: cached.success,
          slideCount,
          blocked: cached.response?.blocked === true,
          error: cached.error,
        });
      } catch (e) {
        console.warn('[AISuggest] cache lookup failed, falling back to live generation:', e);
        cached = null;
      }

      const slideCount = cached?.response?.presentationSlides?.length || 0;
      if (cached?.success && cached.response && slideCount > 0) {
        console.log('[AISuggest] cache HIT — presenting pregen response, slides:', slideCount);
        await presentAIResponse(cached.response);
        return;
      }

      // Cache miss / error: live fallback. handleAskAI owns its own loading
      // flag for the duration of the live request; the finally below still runs
      // afterward and harmlessly re-clears the flag. Quota was already charged
      // above, so skip the gate to avoid double-counting a single user action.
      console.log('[AISuggest] cache MISS (no usable slides) — falling back to live generation');
      setAiLoading(false);
      await handleAskAI(suggestion.questionText, true);
    } catch (e) {
      console.error('[AISuggest] unexpected error in handleSelectSuggestion:', e);
      setAiError('Something went wrong preparing this answer. Please try again.');
    } finally {
      // Guarantee the loading flag is released on EVERY exit path so a failure
      // never permanently locks out future suggestion taps.
      setAiLoading(false);
    }
  };

  // Play narration for a single slide, auto-advance to next slide when finished
  // Uses pre-loaded audio files when available for instant playback
  const playSlideNarration = async (text: string, slideIndex: number, totalSlides: number) => {
    try {
      console.log('[TTS] playSlideNarration called for slide', slideIndex + 1, 'of', totalSlides);
      markPresentationStarted();

      // Snapshot the playback generation for this chain. If the user leaves the
      // screen mid-playback, stopPresentationPlayback() bumps the generation and
      // every re-check below bails out — no orphaned sound, no auto-advance.
      const myGeneration = playbackGenerationRef.current;

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (playbackGenerationRef.current !== myGeneration) return;
      
      setIsPlaying(false);
      setAudioProgress(0);
      setAudioDuration(0);
      setIsSpeaking(true);
      
      // Use the response audio pre-downloaded for this slide. No TTS fallback:
      // if there is no audio, the slide is shown silently and auto-advances.
      const preloadedAudioUri = preloadedAudioRef.current[slideIndex];
      const audioFileUri: string | null = preloadedAudioUri || null;
      if (audioFileUri) {
        console.log('[AIAudio] Using response audio for slide', slideIndex + 1);
      }
      
      if (audioFileUri) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
        if (playbackGenerationRef.current !== myGeneration) return;

        const { sound } = await Audio.Sound.createAsync(
          { uri: audioFileUri },
          { shouldPlay: true, rate: playbackSpeed }
        );
        // The user may have left while createAsync was loading — discard the
        // freshly-created sound so it never plays in the background.
        if (playbackGenerationRef.current !== myGeneration) {
          sound.unloadAsync().catch(() => {});
          return;
        }
        console.log('[TTS] Audio playing for slide', slideIndex + 1);
        
        soundRef.current = sound;
        setIsPlaying(true);
        
        sound.setOnPlaybackStatusUpdate((status) => {
          if (playbackGenerationRef.current !== myGeneration) return;
          if (status.isLoaded) {
            if (status.didJustFinish) {
              setIsPlaying(false);
              // Auto-advance to next slide when audio finishes
              const nextSlideIndex = slideIndex + 1;
              // Use ref to get latest aiResponse value (avoids stale closure)
              const currentAiResponse = aiResponseRef.current;
              if (nextSlideIndex < totalSlides && currentAiResponse) {
                console.log('[TTS] Slide', slideIndex + 1, 'finished, advancing to slide', nextSlideIndex + 1);
                setCurrentSlideIndex(nextSlideIndex);
                const nextSlide = currentAiResponse.presentationSlides[nextSlideIndex];
                if (nextSlide) {
                  playSlideNarration(nextSlide.narration, nextSlideIndex, totalSlides);
                }
              } else {
                console.log('[TTS] All slides completed');
                setIsSpeaking(false);
              }
            } else {
              if (!isScrubbingRef.current) setAudioProgress(status.positionMillis || 0);
              setAudioDuration(status.durationMillis || 0);
            }
          }
        });
      } else {
        console.log('[AIAudio] No audio for slide', slideIndex + 1, '- showing silently then advancing');
        setIsSpeaking(false);
        // No audio for this slide: show it silently for its response-provided
        // duration (seconds -> ms), then auto-advance. Fall back to 5s if the
        // response gave no duration.
        const nextSlideIndex = slideIndex + 1;
        const currentAiResponse = aiResponseRef.current;
        const thisSlide = currentAiResponse?.presentationSlides?.[slideIndex];
        const silentMs = videoSlideTotalMs(thisSlide);
        // A silent slide can still carry a Manim video — let it play while the
        // silent-advance timer runs (shouldPlay follows isPlaying).
        if (thisSlide?.manimVideoUrl) setIsPlaying(true);
        if (nextSlideIndex < totalSlides && currentAiResponse) {
          if (silentAdvanceTimerRef.current) clearTimeout(silentAdvanceTimerRef.current);
          silentAdvanceTimerRef.current = setTimeout(() => {
            silentAdvanceTimerRef.current = null;
            if (playbackGenerationRef.current !== myGeneration) return;
            setCurrentSlideIndex(nextSlideIndex);
            const nextSlide = currentAiResponse.presentationSlides[nextSlideIndex];
            if (nextSlide) {
              playSlideNarration(nextSlide.narration, nextSlideIndex, totalSlides);
            }
          }, silentMs);
        }
      }
    } catch (error) {
      console.error('[AIAudio] Slide narration error:', error);
      setIsSpeaking(false);
    }
  };

  const playNarration = async (text: string) => {
    try {
      // Clean up previous audio and reset state
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      
      // Reset playback state before loading new audio
      setIsPlaying(false);
      setAudioProgress(0);
      setAudioDuration(0);
      setIsSpeaking(true);
      
      const ttsResult = await supabase.getTextToSpeech(text, 'male', 'en-IN');
      
      if (ttsResult.success && ttsResult.ttsResponse?.audioContent) {
        // Handle chunked WAV audio - each chunk is a complete WAV file
        let combinedBase64: string;
        
        if (Array.isArray(ttsResult.ttsResponse.audioContent) && ttsResult.ttsResponse.audioContent.length > 1) {
          console.log('[TTS] Combining', ttsResult.ttsResponse.audioContent.length, 'audio chunks');
          combinedBase64 = combineWavChunks(ttsResult.ttsResponse.audioContent);
        } else {
          let rawBase64 = Array.isArray(ttsResult.ttsResponse.audioContent) 
            ? ttsResult.ttsResponse.audioContent[0] 
            : ttsResult.ttsResponse.audioContent;
          rawBase64 = rawBase64.replace(/^data:audio\/\w+;base64,/, '');
          combinedBase64 = rawBase64;
        }
        
        const binaryBuffer = Buffer.from(combinedBase64, 'base64');
        const cleanBase64 = binaryBuffer.toString('base64');
        
        const audioFileUri = FileSystem.cacheDirectory + `tts_audio_${Date.now()}.wav`;
        await FileSystem.writeAsStringAsync(audioFileUri, cleanBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
        
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioFileUri },
          { shouldPlay: true, rate: playbackSpeed }
        );
        
        soundRef.current = sound;
        setIsPlaying(true);
        
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded) {
            if (status.didJustFinish) {
              // Reset all playback state when audio finishes
              setIsPlaying(false);
              setIsSpeaking(false);
              setAudioProgress(0);
              setAudioDuration(0);
            } else {
              if (!isScrubbingRef.current) setAudioProgress(status.positionMillis || 0);
              setAudioDuration(status.durationMillis || 0);
            }
          }
        });
      } else {
        setIsSpeaking(false);
      }
    } catch (error) {
      console.error('TTS error:', error);
      setIsSpeaking(false);
    }
  };

  // (Re)arm the silent-slide auto-advance timer for `delayMs` from now. Used by
  // the video-only (no narration audio) pause/resume/scrub paths so the slide
  // still advances after its remaining duration.
  const armSilentAdvanceTimer = (slideIndex: number, delayMs: number) => {
    const myGeneration = playbackGenerationRef.current;
    if (silentAdvanceTimerRef.current) clearTimeout(silentAdvanceTimerRef.current);
    silentAdvanceTimerRef.current = setTimeout(() => {
      silentAdvanceTimerRef.current = null;
      if (playbackGenerationRef.current !== myGeneration) return;
      const resp = aiResponseRef.current;
      const totalSlides = resp?.presentationSlides?.length || 0;
      const nextSlideIndex = slideIndex + 1;
      if (nextSlideIndex < totalSlides && resp) {
        setCurrentSlideIndex(nextSlideIndex);
        const nextSlide = resp.presentationSlides[nextSlideIndex];
        if (nextSlide) playSlideNarration(nextSlide.narration, nextSlideIndex, totalSlides);
      } else {
        setIsPlaying(false);
        setIsSpeaking(false);
      }
    }, Math.max(250, delayMs));
  };

  // Total intended duration (ms) of a video-only slide: narration duration if
  // provided, else the Manim video's own duration, else 5s.
  const videoSlideTotalMs = (slide: PresentationSlide | undefined): number => {
    if (slide?.audioDuration) return Math.round(slide.audioDuration * 1000);
    if (slide?.manimDurationSeconds) return Math.round(slide.manimDurationSeconds * 1000);
    return 5000;
  };

  const togglePlayPause = async () => {
    // Video-only slide (Manim video, no loaded narration sound): pause/resume
    // the video directly and manage the silent-advance timer, instead of
    // restarting the slide from scratch.
    if (!soundRef.current) {
      const resp = aiResponseRef.current;
      const slide = resp?.presentationSlides?.[currentSlideIndex];
      if (slide?.manimVideoUrl) {
        if (isPlaying) {
          if (silentAdvanceTimerRef.current) {
            clearTimeout(silentAdvanceTimerRef.current);
            silentAdvanceTimerRef.current = null;
          }
          manimVideoRef.current?.pauseAsync().catch(() => {});
          setIsPlaying(false);
        } else {
          markPresentationStarted();
          let posMs = 0;
          try {
            const st = await manimVideoRef.current?.getStatusAsync();
            if (st?.isLoaded) posMs = st.positionMillis || 0;
          } catch {}
          const totalMs = videoSlideTotalMs(slide);
          if (posMs >= totalMs - 100) {
            manimVideoRef.current?.setPositionAsync(0).catch(() => {});
            posMs = 0;
          }
          manimVideoRef.current?.playAsync().catch(() => {});
          setIsPlaying(true);
          armSilentAdvanceTimer(currentSlideIndex, totalMs - posMs);
        }
        return;
      }
    }

    if (soundRef.current) {
      const status = await soundRef.current.getStatusAsync();
      if (status.isLoaded) {
        if (status.isPlaying) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
        } else {
          markPresentationStarted();
          // Always seek to beginning when resuming after completion (audioDuration is 0)
          // or when near the end of the track
          if (audioDuration === 0 || status.positionMillis >= (status.durationMillis || 1) - 100) {
            await soundRef.current.setPositionAsync(0);
            manimVideoRef.current?.setPositionAsync(0).catch(() => {});
          }
          await soundRef.current.playAsync();
          setIsPlaying(true);
          setIsSpeaking(true);
        }
      }
      return;
    }

    // Fallback: no sound is loaded yet (e.g. entered via the navigation gate's
    // "Watch presentation"). Start the current slide so the first Play tap
    // always begins playback (plays response audio, or silently advances).
    const resp = aiResponseRef.current;
    const slide = resp?.presentationSlides?.[currentSlideIndex];
    if (slide) {
      console.log('[AIGate] play with no loaded sound — starting slide', currentSlideIndex + 1);
      playSlideNarration(slide.narration, currentSlideIndex, resp.presentationSlides.length);
    }
  };

  // ── AI Navigation Gate helpers (Task #243) ─────────────────────────────────
  const clearAiExpiryTimer = () => {
    if (aiExpiryTimerRef.current) {
      clearTimeout(aiExpiryTimerRef.current);
      aiExpiryTimerRef.current = null;
    }
  };

  // Drop a ready-but-unacknowledged presentation after 15 minutes.
  const startAiExpiryTimer = () => {
    clearAiExpiryTimer();
    aiExpiryTimerRef.current = setTimeout(() => {
      console.log('[AIGate] ready presentation expired after 15 min — clearing');
      clearAiJob();
    }, 15 * 60 * 1000);
  };

  // Single source of truth for stopping ALL presentation playback. Bumping the
  // generation invalidates any in-flight playSlideNarration chain so a queued
  // slide can't start a new sound after the user has left. Also clears the
  // silent-slide advance timer, stops/unloads the active sound, and halts speech.
  const stopPresentationPlayback = () => {
    playbackGenerationRef.current += 1;
    if (silentAdvanceTimerRef.current) {
      clearTimeout(silentAdvanceTimerRef.current);
      silentAdvanceTimerRef.current = null;
    }
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => {});
      soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    Speech.stop();
    setIsPlaying(false);
    setIsSpeaking(false);
  };

  // Tear down the current AI presentation + audio and reset all gate state.
  const clearAiJob = () => {
    console.log('[AIGate] clear: discarding presentation');
    clearAiExpiryTimer();
    stopPresentationPlayback();
    setAiResponse(null);
    aiResponseRef.current = null;
    setAiRequiresConfirmation(false);
    aiRequiresConfirmationRef.current = false;
    setAiPresentationStarted(false);
    aiPresentationStartedRef.current = false;
    setIsPresentationFullscreen(false);
    setIsPlaying(false);
    setIsSpeaking(false);
    setCurrentSlideIndex(0);
    setAudioProgress(0);
    setAudioDuration(0);
    preloadedAudioRef.current = [];
    preloadedImagesRef.current = {};
      preloadedVideosRef.current = {};
  };

  // Load a slide's pre-fetched audio WITHOUT playing it, so the player opens in a
  // paused state (Play icon showing) and the first tap on Play starts narration.
  const loadSlideAudioPaused = async (slideIndex: number) => {
    try {
      const myGeneration = playbackGenerationRef.current;
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setIsPlaying(false);
      setIsSpeaking(false);
      setAudioProgress(0);
      setAudioDuration(0);

      const totalSlides = aiResponseRef.current?.presentationSlides?.length || 0;
      const preloadedAudioUri = preloadedAudioRef.current[slideIndex];
      if (!preloadedAudioUri) {
        console.log('[AIGate] no pre-loaded audio to load paused for slide', slideIndex + 1);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      if (playbackGenerationRef.current !== myGeneration) return;

      const { sound, status } = await Audio.Sound.createAsync(
        { uri: preloadedAudioUri },
        { shouldPlay: false, rate: playbackSpeed }
      );
      if (playbackGenerationRef.current !== myGeneration) {
        sound.unloadAsync().catch(() => {});
        return;
      }
      soundRef.current = sound;
      if (status.isLoaded) {
        setAudioDuration(status.durationMillis || 0);
      }

      sound.setOnPlaybackStatusUpdate((s) => {
        if (playbackGenerationRef.current !== myGeneration) return;
        if (s.isLoaded) {
          if (s.didJustFinish) {
            setIsPlaying(false);
            const nextSlideIndex = slideIndex + 1;
            const currentAiResponse = aiResponseRef.current;
            if (nextSlideIndex < totalSlides && currentAiResponse) {
              setCurrentSlideIndex(nextSlideIndex);
              const nextSlide = currentAiResponse.presentationSlides[nextSlideIndex];
              if (nextSlide) {
                playSlideNarration(nextSlide.narration, nextSlideIndex, totalSlides);
              }
            } else {
              setIsSpeaking(false);
            }
          } else {
            if (!isScrubbingRef.current) setAudioProgress(s.positionMillis || 0);
            setAudioDuration(s.durationMillis || 0);
          }
        }
      });
      console.log('[AIGate] slide', slideIndex + 1, 'loaded paused (Play icon shown)');
    } catch (error) {
      console.error('[AIGate] loadSlideAudioPaused error:', error);
    }
  };

  // "Watch presentation": switch to the AI tab and open the player paused on
  // slide 0 (matches the manual-start paused state, so the Play icon shows).
  const acknowledgeAndWatch = () => {
    console.log('[AIGate] acknowledge & watch — opening paused on slide 0');
    clearAiExpiryTimer();
    setAiRequiresConfirmation(false);
    aiRequiresConfirmationRef.current = false;
    setAiPresentationStarted(true);
    aiPresentationStartedRef.current = true;
    setActiveTab('ai');
    setCurrentSlideIndex(0);
    setIsPlaying(false);
    setIsSpeaking(false);
    setIsPresentationFullscreen(true);
    loadSlideAudioPaused(0);
  };

  // Flip the gate to "started" the moment the user genuinely engages with the
  // presentation (opens fullscreen, presses Play, or narration begins) via the
  // normal AI-tab controls — not just the banner's "Watch" CTA. Once started,
  // leaving no longer prompts and the 15-min expiry timer is cancelled. Idempotent.
  const markPresentationStarted = () => {
    if (aiPresentationStartedRef.current) return;
    console.log('[AIGate] presentation started via normal controls — clearing gate');
    clearAiExpiryTimer();
    setAiPresentationStarted(true);
    aiPresentationStartedRef.current = true;
    if (aiRequiresConfirmationRef.current) {
      setAiRequiresConfirmation(false);
      aiRequiresConfirmationRef.current = false;
    }
  };

  const goToPrevSlide = () => {
    if (currentSlideIndex > 0 && aiResponse) {
      const newIndex = currentSlideIndex - 1;
      setCurrentSlideIndex(newIndex);
      setLandscapeImageIndex(0); // Reset image carousel when changing slides
      const totalSlides = aiResponse.presentationSlides.length;
      // Use playSlideNarration for proper auto-advance behavior
      playSlideNarration(aiResponse.presentationSlides[newIndex].narration, newIndex, totalSlides);
    }
  };

  const goToNextSlide = () => {
    if (aiResponse && currentSlideIndex < aiResponse.presentationSlides.length - 1) {
      const newIndex = currentSlideIndex + 1;
      setCurrentSlideIndex(newIndex);
      setLandscapeImageIndex(0); // Reset image carousel when changing slides
      const totalSlides = aiResponse.presentationSlides.length;
      // Use playSlideNarration for proper auto-advance behavior
      playSlideNarration(aiResponse.presentationSlides[newIndex].narration, newIndex, totalSlides);
    }
  };

  // Seek to a specific slide position in the combined audio
  const seekToSlide = async (slideIndex: number) => {
    if (!soundRef.current || audioDuration === 0 || slideTimings.length === 0) return;
    
    try {
      const totalEstimatedTime = slideTimings[slideTimings.length - 1];
      // Get the start time for this slide (end of previous slide, or 0 for first)
      const slideStartTime = slideIndex === 0 ? 0 : slideTimings[slideIndex - 1];
      // Convert estimated time to actual audio position
      const seekPosition = (slideStartTime / totalEstimatedTime) * audioDuration;
      
      await soundRef.current.setPositionAsync(Math.floor(seekPosition));
    } catch (error) {
      console.error('Seek error:', error);
    }
  };

  // ── Scrubbable progress bar (Task #250) ────────────────────────────────────
  // Called the moment the user touches the scrubber. Freezes status-driven fill
  // updates (isScrubbingRef) and PAUSES playback for the duration of the drag.
  // Pausing is what keeps the seek on the CURRENT slide: while paused the audio
  // can't reach didJustFinish and auto-advance to the next slide mid-drag. The
  // prior play state is captured so it can be restored on release.
  const handleScrubStart = () => {
    isScrubbingRef.current = true;
    wasPlayingBeforeScrubRef.current = isPlaying;
    lastScrubLabelTsRef.current = 0;
    if (soundRef.current && isPlaying) {
      soundRef.current.pauseAsync().catch(() => {});
    }
    // Freeze the Manim video too so it can't drift ahead during the drag, and
    // hold the silent-advance timer so a video-only slide can't flip mid-drag.
    manimVideoRef.current?.pauseAsync().catch(() => {});
    if (silentAdvanceTimerRef.current) {
      clearTimeout(silentAdvanceTimerRef.current);
      silentAdvanceTimerRef.current = null;
    }
  };

  // Live-update the visible position label/fill while the finger moves. Safe
  // because isScrubbingRef suppresses the status callback from overwriting it.
  // Throttled (~12fps) so the big screen doesn't re-render on every pan sample;
  // the fill/thumb stay smooth because they're driven locally in AudioScrubber.
  const handleScrubMove = (fraction: number) => {
    const now = Date.now();
    if (now - lastScrubLabelTsRef.current < 80) return;
    lastScrubLabelTsRef.current = now;
    const clamped = Math.max(0, Math.min(1, fraction));
    setAudioProgress(Math.floor(clamped * (audioDuration || 0)));
  };

  // Called when the user releases the scrubber. `fraction` (0..1) maps to a
  // position within the CURRENT slide's narration audio. Seeks the loaded sound
  // and resumes playback only if it was playing when the drag began (stays
  // paused otherwise). Does not touch preloadedAudioRef / slide preloading, so
  // the navigation gate (Task #243) and auto-advance are unaffected.
  const handleScrubEnd = async (fraction: number) => {
    const clamped = Math.max(0, Math.min(1, fraction));
    const shouldResume = wasPlayingBeforeScrubRef.current;
    try {
      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          const dur = status.durationMillis || audioDuration || 0;
          const pos = Math.floor(clamped * dur);
          markPresentationStarted();
          await soundRef.current.setPositionAsync(pos);
          // Keep the Manim video locked to the same timeline: seek it to the
          // same millisecond as the narration audio.
          manimVideoRef.current?.setPositionAsync(pos).catch(() => {});
          setAudioProgress(pos);
          if (shouldResume) {
            await soundRef.current.playAsync();
            manimVideoRef.current?.playAsync().catch(() => {});
            setIsPlaying(true);
            setIsSpeaking(true);
          } else {
            setIsPlaying(false);
          }
        }
      } else {
        // Video-only slide (no narration sound loaded): seek the Manim video
        // itself and re-arm the silent-advance timer for the remaining time.
        const slide = aiResponseRef.current?.presentationSlides?.[currentSlideIndex];
        if (slide?.manimVideoUrl) {
          let dur = videoSlideTotalMs(slide);
          try {
            const st = await manimVideoRef.current?.getStatusAsync();
            if (st?.isLoaded && st.durationMillis) dur = st.durationMillis;
          } catch {}
          const pos = Math.floor(clamped * dur);
          markPresentationStarted();
          await manimVideoRef.current?.setPositionAsync(pos).catch(() => {});
          setAudioProgress(pos);
          if (shouldResume) {
            manimVideoRef.current?.playAsync().catch(() => {});
            setIsPlaying(true);
            armSilentAdvanceTimer(currentSlideIndex, videoSlideTotalMs(slide) - pos);
          } else {
            setIsPlaying(false);
          }
        }
      }
    } catch (error) {
      console.error('[Scrub] seek error:', error);
    } finally {
      isScrubbingRef.current = false;
    }
  };

  const cyclePlaybackSpeed = async () => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    setPlaybackSpeed(nextSpeed);
    if (soundRef.current) {
      await soundRef.current.setRateAsync(nextSpeed, true);
    }
  };

  const toggleOrientation = () => {
    // Toggle layout mode without rotating the screen
    // This just rearranges UI elements - phone stays in portrait
    console.log('[LAYOUT] Toggle orientation called, current isLandscape:', isLandscape, '-> new:', !isLandscape);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsLandscape(!isLandscape);
  };

  // Auto-hide controls after 5 seconds of inactivity
  const showControls = () => {
    // Clear any existing timer
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
      hideControlsTimer.current = null;
    }
    
    // Show controls immediately
    setControlsVisible(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    
    // Set timer to hide controls after 5 seconds (only in landscape)
    if (isLandscape) {
      hideControlsTimer.current = setTimeout(() => {
        hideControls();
      }, 5000);
    }
  };
  
  const hideControls = () => {
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Only set controlsVisible to false if the animation completed
      // (wasn't interrupted by showControls)
      if (finished) {
        setControlsVisible(false);
      }
    });
  };
  
  const handleLandscapeTap = () => {
    if (controlsVisible) {
      // If controls are visible, reset the hide timer
      showControls();
    } else {
      // If controls are hidden, show them
      showControls();
    }
  };

  // Reset controls visibility when orientation changes
  useEffect(() => {
    if (isLandscape) {
      showControls(); // Start the hide timer in landscape
    } else {
      // Always show controls in portrait
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
        hideControlsTimer.current = null;
      }
      setControlsVisible(true);
      controlsOpacity.setValue(1);
    }
    
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, [isLandscape]);

  // Fullscreen presentation controls - auto-hide after 4 seconds in landscape
  const showFullscreenControls = () => {
    if (fullscreenControlsTimer.current) {
      clearTimeout(fullscreenControlsTimer.current);
      fullscreenControlsTimer.current = null;
    }
    
    setFullscreenControlsVisible(true);
    Animated.timing(fullscreenControlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    
    // Only auto-hide in landscape mode
    if (isActualLandscape && isPresentationFullscreen) {
      fullscreenControlsTimer.current = setTimeout(() => {
        hideFullscreenControls();
      }, 4000);
    }
  };
  
  const hideFullscreenControls = () => {
    Animated.timing(fullscreenControlsOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setFullscreenControlsVisible(false);
      }
    });
  };
  
  const handleFullscreenTap = () => {
    if (fullscreenControlsVisible) {
      showFullscreenControls(); // Reset timer
    } else {
      showFullscreenControls();
    }
  };
  
  // Reset fullscreen controls when entering/exiting fullscreen or orientation changes
  useEffect(() => {
    if (isPresentationFullscreen) {
      // Always hide StatusBar in fullscreen mode (both portrait and landscape)
      StatusBar.setHidden(true);
      showFullscreenControls();
    } else {
      StatusBar.setHidden(false);
      if (fullscreenControlsTimer.current) {
        clearTimeout(fullscreenControlsTimer.current);
        fullscreenControlsTimer.current = null;
      }
      setFullscreenControlsVisible(true);
      fullscreenControlsOpacity.setValue(1);
    }
    
    return () => {
      if (fullscreenControlsTimer.current) {
        clearTimeout(fullscreenControlsTimer.current);
      }
      StatusBar.setHidden(false);
    };
  }, [isPresentationFullscreen, isActualLandscape]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const fetchTopicDetails = async () => {
    console.log('[TopicDetails] fetchTopicDetails called with topicId:', topicId);
    if (!topicId) {
      console.log('[TopicDetails] No topicId, returning early');
      return;
    }
    setTopicLoading(true);
    try {
      console.log('[TopicDetails] About to call supabase.getTopicDetails...');
      const result = await supabase.getTopicDetails(topicId);
      console.log('[TopicDetails] Topic fetch success:', result.success);
      if (result.success && result.topic) {
        console.log('[TopicDetails] Setting topic with video_id:', result.topic.video_id, 'video_platform:', result.topic.video_platform);
        setTopic(result.topic);
      } else {
        console.log('[TopicDetails] Topic fetch failed or no topic:', result.error);
      }
    } catch (error) {
      console.error('[TopicDetails] Error in fetchTopicDetails:', error);
    }
    setTopicLoading(false);
  };

  const [topicVisibilityMode, setTopicVisibilityMode] = useState<string | null>(null);

  const fetchTopicVideos = async () => {
    if (!topicId) return;
    setVideosLoading(true);
    setVideosError(null);
    console.log('[TopicDetails] Fetching videos for topicId:', topicId);
    const [result, visMode] = await Promise.all([
      supabase.getTopicVideos(topicId),
      getTopicLectureVisibility(topicId),
    ]);
    setTopicVisibilityMode(visMode);
    console.log('[TopicDetails] Video fetch success:', result.success, 'count:', result.videos?.length || 0, 'visMode:', visMode);
    if (result.success && result.videos) {
      console.log('[TopicDetails] Videos found:', result.videos.length);
      setTopicVideos(result.videos);
    } else {
      console.log('[TopicDetails] Video fetch error:', result.error);
      setVideosError(result.error || 'Failed to load videos');
    }
    setVideosLoading(false);
  };

  // Fetch subject-level videos (chapter content mode)
  const fetchSubjectVideos = async () => {
    if (!subjectId) return;
    setVideosLoading(true);
    setVideosError(null);
    console.log('[TopicDetails] Fetching subject-level videos for subjectId:', subjectId);
    const result = await supabase.getSubjectVideos(subjectId);
    console.log('[TopicDetails] Subject video fetch result:', result.success, 'count:', result.videos?.length || 0);
    if (result.success && result.videos) {
      setTopicVideos(result.videos);
    } else {
      setVideosError(result.error || 'Failed to load videos');
    }
    setVideosLoading(false);
  };

  const isMCQ = (question: QuestionItem): boolean => {
    const mcqTypes = ['mcq', 'single_choice', 'multiple_choice'];
    if (question.question_format && mcqTypes.includes(question.question_format.toLowerCase())) return true;
    if (question.question_type && mcqTypes.includes(question.question_type.toLowerCase())) return true;
    if (question.options && Object.keys(question.options).length > 0) return true;
    return false;
  };

  const getOptionText = (value: any): string => {
    if (value && typeof value === 'object' && 'text' in value) return value.text;
    return String(value);
  };

  const fetchQuestions = async (difficulty?: string) => {
    if (!topicId) return;
    setQuestionsLoading(true);
    setQuestionsError(null);
    console.log('[TopicDetails] Fetching questions for topicId:', topicId, 'difficulty:', difficulty);
    const result = await supabase.getTopicQuestions(topicId, difficulty);
    console.log('[TopicDetails] Questions fetch result:', result.success, 'count:', result.questions?.length || 0);
    if (result.success && result.questions) {
      setQuestionsList(result.questions);
      const diffSet = new Set(result.questions.map(q => q.difficulty).filter(Boolean));
      const diffs = Array.from(diffSet);
      setQuestionDifficulties(['All', ...diffs]);
    } else {
      setQuestionsError(result.error || 'Failed to load questions');
    }
    setQuestionsLoading(false);
  };

  // Subject-level MCQs: aggregates chapter-level questions for all chapters in the subject
  const fetchSubjectMcqQuestions = async (difficulty?: string) => {
    if (!subjectId) return;
    setQuestionsLoading(true);
    setQuestionsError(null);
    console.log('[TopicDetails] Fetching subject-level MCQs for subjectId:', subjectId, 'difficulty:', difficulty);
    const result = await supabase.getSubjectMCQs(subjectId, difficulty);
    console.log('[TopicDetails] Subject MCQ fetch result:', result.success, 'count:', result.questions?.length || 0);
    if (result.success && result.questions) {
      const mapped: QuestionItem[] = result.questions.map((q: PreviousYearQuestion) => ({
        id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        question_format: q.question_format,
        options: q.options as any,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        marks: q.marks,
        difficulty: q.difficulty,
        question_image_url: q.question_image_url,
        is_important: q.is_important,
        topic_id: q.topic_id,
        chapter_id: null,
        created_at: q.created_at,
      }));
      setQuestionsList(mapped);
    } else {
      setQuestionsError(result.error || 'Failed to load questions');
    }
    setQuestionsLoading(false);
  };

  const fetchSubjectMcqDifficulties = async () => {
    if (!subjectId) return;
    console.log('[TopicDetails] Fetching subject-level MCQ difficulties for subjectId:', subjectId);
    const result = await supabase.getSubjectMCQDifficulties(subjectId);
    if (result.success && result.difficulties) {
      setQuestionDifficulties(['All', ...result.difficulties]);
    }
  };

  // Fetch assignments for subject/chapter/topic
  const fetchAssignments = async () => {
    // Use subjectId from route params, or fall back to topic's subject_id
    const effectiveSubjectId = subjectId || topic?.subject_id;
    
    if (!effectiveSubjectId) {
      console.log('[Assignments] No subjectId available (route or topic)');
      return;
    }
    if (!user) {
      console.log('[Assignments] User not authenticated');
      setAssignmentsError('Please log in to view assignments');
      return;
    }
    
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    
    // Use chapterId from route params, or fall back to topic's chapter_id
    const chapterId = routeChapterId || topic?.chapter_id;
    
    console.log('[Assignments] Fetching assignments for:', { subjectId: effectiveSubjectId, chapterId, topicId });
    
    const result = await supabase.getAssignments(effectiveSubjectId, chapterId, topicId || undefined);
    
    if (result.success && result.assignments) {
      console.log('[Assignments] Found:', result.assignments.length, 'assignments');
      setAssignments(result.assignments);
      
      // Fetch submission status for each assignment
      if (result.assignments.length > 0) {
        const assignmentIds = result.assignments.map(a => a.id);
        const submissionsResult = await supabase.getSubmissionStatus(user.id, assignmentIds);
        
        if (submissionsResult.success && submissionsResult.submissions) {
          const submissionMap: { [id: string]: AssignmentSubmission } = {};
          for (const sub of submissionsResult.submissions) {
            submissionMap[sub.assignment_id] = sub;
          }
          setAssignmentSubmissions(submissionMap);
        }
      }
    } else {
      console.log('[Assignments] Fetch error:', result.error);
      setAssignmentsError(result.error || 'Failed to load assignments');
    }
    
    setAssignmentsLoading(false);
  };

  // Open assignment detail view (landing card)
  const openAssignmentDetail = async (assignmentId: string) => {
    console.log('[Assignments] Opening assignment detail:', assignmentId);
    setResultsLoading(true);
    setSelectedAssignment(assignmentId);
    
    const result = await supabase.getAssignmentDetails(assignmentId);
    
    if (result.success && result.assignment) {
      setCurrentAssignment(result.assignment);
      setAssignmentView('detail');
    } else {
      Alert.alert('Error', result.error || 'Failed to load assignment');
      setSelectedAssignment(null);
    }
    setResultsLoading(false);
  };

  // Start assignment from detail view (begin test)
  const startAssignmentFromDetail = () => {
    if (!currentAssignment) return;
    setAssignmentAnswers({});
    setAssignmentFlagged({});
    setAssignmentCurrentIndex(0);
    setAssignmentStartTime(Date.now());
    setAssignmentTimeRemaining(currentAssignment.duration_minutes * 60);
    setAssignmentView('test');
  };

  // Create self-practice assignment
  const createSelfPractice = async () => {
    const effectiveSId = subjectId || topic?.subject_id;
    if (!effectiveSId || !user) {
      Alert.alert('Error', 'Unable to create practice assignment. Please ensure you are logged in.');
      return;
    }
    setSelfPracticeLoading(true);
    const chId = routeChapterId || topic?.chapter_id;
    const result = await supabase.createSelfPracticeAssignment({
      subjectId: effectiveSId,
      chapterId: chId || undefined,
      topicId: topicId || undefined,
    });
    if (result.success && result.assignmentId) {
      await fetchAssignments();
      openAssignmentDetail(result.assignmentId);
    } else {
      Alert.alert('Error', result.error || 'Failed to create practice assignment');
    }
    setSelfPracticeLoading(false);
  };

  // Submit assignment
  const submitAssignment = async () => {
    if (!currentAssignment || !user) return;
    
    setAssignmentSubmitting(true);
    
    const timeTaken = Math.floor((Date.now() - assignmentStartTime) / 1000);
    
    console.log('[Assignments] Submitting assignment:', currentAssignment.id);
    
    const result = await supabase.submitAssignment(
      user.id,
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

  // Reset assignment view
  const resetAssignmentView = () => {
    setAssignmentView('list');
    setSelectedAssignment(null);
    setCurrentAssignment(null);
    setAssignmentAnswers({});
    setAssignmentFlagged({});
    setAssignmentResult(null);
    setAssignmentCurrentIndex(0);
  };

  // View graded assignment results - fetches full assignment details with questions
  const viewGradedResults = async (assignmentId: string, submission: AssignmentSubmission) => {
    console.log('[Assignments] Viewing graded results for:', assignmentId);
    setResultsLoading(true);
    setSelectedAssignment(assignmentId);
    
    try {
      const result = await supabase.getAssignmentDetails(assignmentId);
      
      if (result.success && result.assignment) {
        setCurrentAssignment(result.assignment);
        setAssignmentResult(submission);
        setAssignmentView('results');
        console.log('[Assignments] Loaded assignment with', result.assignment.questions?.length || 0, 'questions');
      } else {
        Alert.alert('Error', result.error || 'Failed to load assignment details');
        setSelectedAssignment(null);
      }
    } catch (error) {
      console.error('[Assignments] Error loading graded results:', error);
      Alert.alert('Error', 'Failed to load assignment details');
      setSelectedAssignment(null);
    }
    
    setResultsLoading(false);
  };

  // Assignment timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (assignmentView === 'test' && assignmentTimeRemaining > 0) {
      timer = setInterval(() => {
        setAssignmentTimeRemaining(prev => {
          if (prev <= 1) {
            submitAssignment();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [assignmentView, assignmentTimeRemaining]);

  // Fetch assignments when tab becomes active or when topic loads (for topic?.subject_id fallback)
  useEffect(() => {
    if (activeTab === 'assignments' && assignments.length === 0 && !assignmentsLoading) {
      fetchAssignments();
    }
  }, [activeTab, subjectId, topicId, topic?.subject_id]);

  const handleTabSelect = (tabId: string) => {
    setSidebarOpen(false);
    // "AI Teacher" is a button for the Ask AI screen (the one the lecture player has), not a tab of its own. The "AI"
    // tab is a normal tab again: it is where a question is answered as a slide presentation.
    if (tabId === 'ai-teacher') {
      openAskAI({ subjectId: subjectId ?? topic?.subject_id, subjectName, topicTitle: topic?.title ?? topicTitle });
      return;
    }
    setActiveTab(tabId);
  };

  // Load the Solutions list: fetch this topic/chapter's questions, then batch
  // check which of them already have a cached AI presentation (for the badge).
  // The cache check needs the question ids, so it runs after the fetch.
  const fetchSolutions = async () => {
    const seq = ++solutionsFetchSeqRef.current;
    const isStale = () => seq !== solutionsFetchSeqRef.current;
    setSolutionsLoading(true);
    setSolutionsError(null);
    try {
      let items: SolutionQuestion[] = [];
      if (topicId) {
        const res = await supabase.getTopicQuestions(topicId, 'All');
        if (isStale()) return;
        if (!res.success || !res.questions) {
          setSolutionsItems([]);
          setSolutionsCachedIds(new Set());
          setSolutionsError(res.error || 'Failed to load solutions.');
          return;
        }
        items = res.questions.map((q) => ({
          id: q.id,
          question_text: q.question_text,
          options: q.options,
          correct_answer: q.correct_answer,
          marks: q.marks,
          difficulty: q.difficulty,
          question_image_url: q.question_image_url,
        }));
      } else if (isChapterMode && subjectId) {
        const res = await supabase.getSubjectMCQs(subjectId);
        if (isStale()) return;
        if (!res.success || !res.questions) {
          setSolutionsItems([]);
          setSolutionsCachedIds(new Set());
          setSolutionsError(res.error || 'Failed to load solutions.');
          return;
        }
        items = res.questions.map((q) => ({
          id: q.id,
          question_text: q.question_text,
          options: (q.options as Record<string, { text: string } | string> | null) ?? null,
          correct_answer: q.correct_answer,
          marks: q.marks,
          difficulty: q.difficulty ? String(q.difficulty) : '',
          question_image_url: null,
        }));
      }

      setSolutionsItems(items);

      const ids = items.map((i) => i.id).filter(Boolean);
      if (ids.length > 0) {
        const cached = await supabase.getCachedQuestionIds(ids);
        if (isStale()) return;
        setSolutionsCachedIds(cached);
      } else {
        setSolutionsCachedIds(new Set());
      }
    } catch (e) {
      if (isStale()) return;
      console.warn('[Solutions] fetch failed:', e);
      setSolutionsError('Network error. Please try again.');
    } finally {
      if (!isStale()) setSolutionsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'solutions' && (topicId || (isChapterMode && subjectId))) {
      fetchSolutions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, topicId, subjectId, isChapterMode]);

  // Lazily fetch a single cached presentation and play it in the existing
  // fullscreen player. presentAIResponse only auto-opens when the AI tab is
  // active, so on the Solutions tab we open the modal + start narration here.
  const handlePlaySolution = async (q: SolutionQuestion) => {
    if (solutionsPlayingId) return;
    const playSeq = ++solutionsPlaySeqRef.current;
    setSolutionsPlayingId(q.id);
    try {
      // Reset audio/player state (mirrors handleSelectSuggestion).
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setIsPlaying(false);
      setIsSpeaking(false);
      setAudioProgress(0);
      setAudioDuration(0);
      setSlideTimings([]);
      setCombinedNarration('');
      setSlideDurations([]);
      setTotalPresentationDuration(0);
      preloadedAudioRef.current = [];
      preloadedImagesRef.current = {};
      preloadedVideosRef.current = {};
      clearAiExpiryTimer();
      stopPresentationPlayback();
      setAiResponse(null);
      setCurrentSlideIndex(0);

      const cached = await supabase.getCachedPresentation(q.id);
      // A newer play tap superseded this one — abandon to avoid double-open.
      if (playSeq !== solutionsPlaySeqRef.current) return;
      const slides = cached.response?.presentationSlides || [];
      if (cached.success && cached.response && slides.length > 0) {
        await presentAIResponse(cached.response);
        if (playSeq !== solutionsPlaySeqRef.current) return;
        // If the user switched to the AI tab mid-load, presentAIResponse already
        // auto-opened + started playback — don't start a second time.
        if (activeTabRef.current === 'ai') return;
        // We're on the Solutions tab, so presentAIResponse won't auto-open the
        // player — open it and start narration explicitly here.
        clearAiExpiryTimer();
        setAiRequiresConfirmation(false);
        aiRequiresConfirmationRef.current = false;
        setAiPresentationStarted(true);
        aiPresentationStartedRef.current = true;
        setCurrentSlideIndex(0);
        setIsPresentationFullscreen(true);
        playSlideNarration(slides[0].narration, 0, slides.length);
      } else {
        Alert.alert(
          'Presentation unavailable',
          "This solution's AI presentation isn't ready yet. Please try again later.",
        );
      }
    } catch (e) {
      console.warn('[Solutions] play failed:', e);
      Alert.alert('Error', 'Could not load the presentation. Please try again.');
    } finally {
      setSolutionsPlayingId(null);
    }
  };

  const renderVideosTab = () => {
    if (topicLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading video...</Text>
        </View>
      );
    }

    if (isVideoPlaying && topic?.video_id && topic?.video_platform === 'vimeo') {
      const vimeoEmbedHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              html, body { 
                width: 100%; 
                height: 100%; 
                background: #000; 
                overflow: hidden;
              }
              .video-container { 
                position: absolute;
                top: 0;
                left: 0;
                width: 100%; 
                height: 100%;
              }
              iframe { 
                width: 100%; 
                height: 100%; 
                border: 0;
              }
            </style>
          </head>
          <body>
            <div class="video-container">
              <iframe 
                src="https://player.vimeo.com/video/${topic.video_id}?autoplay=1&quality=auto&playsinline=0" 
                allow="autoplay; fullscreen; picture-in-picture"
                allowfullscreen>
              </iframe>
            </div>
          </body>
        </html>
      `;

      if (isFullscreen) {
        return (
          <Modal
            visible={true}
            animationType="fade"
            supportedOrientations={['portrait', 'landscape']}
            onRequestClose={() => setIsFullscreen(false)}
          >
            <View style={styles.fullscreenContainer}>
              <WebView
                source={{ html: vimeoEmbedHtml }}
                style={styles.fullscreenWebView}
                allowsFullscreenVideo
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback={false}
              />
              <TouchableOpacity
                style={styles.exitFullscreenButton}
                onPress={() => setIsFullscreen(false)}
              >
                <Ionicons name="close" size={28} color={colors.white} />
              </TouchableOpacity>
            </View>
          </Modal>
        );
      }

      return (
        <View style={styles.tabContent}>
          <TouchableOpacity
            style={styles.backToListButton}
            onPress={() => setIsVideoPlaying(false)}
          >
            <Ionicons name="chevron-back" size={16} color={colors.primary} />
            <Text style={styles.backToListText}>Back to Videos</Text>
          </TouchableOpacity>
          
          <View style={styles.videoPlayerWebView}>
            <WebView
              source={{ html: vimeoEmbedHtml }}
              style={styles.webView}
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
            />
            <TouchableOpacity
              style={styles.fullscreenButton}
              onPress={() => setIsFullscreen(true)}
            >
              <Ionicons name="expand" size={24} color={colors.white} />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.videoTitle}>{topic?.title}</Text>
          <Text style={styles.videoDescription}>
            {topic?.content_markdown || 'Watch this video to learn about the topic.'}
          </Text>
        </View>
      );
    }

    // NOTE: Removed early return for topic?.video_id check here
    // The topicVideos array now includes the direct video from topic, so we let
    // the code flow through to the video list rendering below

    if (selectedVideo) {
      const video = topicVideos.find((v) => v.video_id === selectedVideo);
      const vimeoEmbedHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              html, body { 
                width: 100%; 
                height: 100%; 
                background: #000; 
                overflow: hidden;
              }
              .video-container { 
                position: absolute;
                top: 0;
                left: 0;
                width: 100%; 
                height: 100%;
              }
              iframe { 
                width: 100%; 
                height: 100%; 
                border: 0;
              }
            </style>
          </head>
          <body>
            <div class="video-container">
              <iframe 
                src="https://player.vimeo.com/video/${selectedVideo}?autoplay=1&quality=auto&playsinline=0" 
                allow="autoplay; fullscreen; picture-in-picture"
                allowfullscreen>
              </iframe>
            </div>
          </body>
        </html>
      `;

      if (isFullscreen) {
        return (
          <Modal
            visible={true}
            animationType="fade"
            supportedOrientations={['portrait', 'landscape']}
            onRequestClose={() => setIsFullscreen(false)}
          >
            <View style={styles.fullscreenContainer}>
              <WebView
                source={{ html: vimeoEmbedHtml }}
                style={styles.fullscreenWebView}
                allowsFullscreenVideo
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback={false}
              />
              <TouchableOpacity
                style={styles.exitFullscreenButton}
                onPress={() => setIsFullscreen(false)}
              >
                <Ionicons name="close" size={28} color={colors.white} />
              </TouchableOpacity>
            </View>
          </Modal>
        );
      }

      return (
        <View style={styles.tabContent}>
          <TouchableOpacity
            style={styles.backToListButton}
            onPress={() => setSelectedVideo(null)}
          >
            <Ionicons name="chevron-back" size={16} color={colors.primary} />
            <Text style={styles.backToListText}>Back to Videos</Text>
          </TouchableOpacity>
          
          <View style={styles.videoPlayerWebView}>
            <WebView
              source={{ html: vimeoEmbedHtml }}
              style={styles.webView}
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
            />
            <TouchableOpacity
              style={styles.fullscreenButton}
              onPress={() => setIsFullscreen(true)}
            >
              <Ionicons name="expand" size={24} color={colors.white} />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.videoTitle}>{video?.title || topic?.title}</Text>
          <Text style={styles.videoDescription}>
            {video?.description || topic?.content_markdown || 'Watch this video to learn about the topic.'}
          </Text>
        </View>
      );
    }

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
        <View style={styles.tabContent}>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.gray400} />
            <Text style={styles.errorText}>{videosError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchTopicVideos}>
              <Ionicons name="refresh" size={16} color={colors.white} />
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Apply topic_lecture_visibility to AI lectures; keep non-AI videos unchanged
    const aiFiltered = filterLecturesByVisibility(
      topicVideos.filter(v => v.video_platform === 'ai_generated'),
      topicVisibilityMode,
    );
    const aiFilteredIds = new Set(aiFiltered.map((v: any) => v.id));

    // Filter: include videos with video_id OR video_url (for AI-generated)
    const allActiveVideos = topicVideos.filter(v => {
      if (!v.is_active) return false;
      if (v.video_platform === 'ai_generated') return aiFilteredIds.has(v.id);
      return !!(v.video_id || v.video_url);
    });
    
    // Get unique languages from videos
    const availableLanguages = ['all', ...Array.from(new Set(
      allActiveVideos
        .map(v => v.language?.toLowerCase() || 'english')
        .filter(Boolean)
    ))];
    
    // Filter by selected language
    const filteredVideos = selectedLanguageFilter === 'all' 
      ? allActiveVideos 
      : allActiveVideos.filter(v => (v.language?.toLowerCase() || 'english') === selectedLanguageFilter);
    // In free preview, limit to first 2 videos
    const activeVideos = isPreview ? filteredVideos.slice(0, 2) : filteredVideos;
    
    console.log('[renderVideosTab] topicVideos:', topicVideos.length, 'activeVideos:', activeVideos.length);
    console.log('[renderVideosTab] Videos detail:', topicVideos.map(v => ({ id: v.id, platform: v.video_platform, hasVideoId: !!v.video_id, hasVideoUrl: !!v.video_url })));
    
    // Language filter labels
    const getLanguageLabel = (lang: string) => {
      const labels: { [key: string]: string } = {
        'all': `All (${allActiveVideos.length})`,
        'english': 'English',
        'hindi': 'Hindi',
        'tamil': 'Tamil',
        'telugu': 'Telugu',
        'kannada': 'Kannada',
        'malayalam': 'Malayalam',
        'marathi': 'Marathi',
        'bengali': 'Bengali',
        'gujarati': 'Gujarati',
        'punjabi': 'Punjabi',
      };
      return labels[lang] || lang.charAt(0).toUpperCase() + lang.slice(1);
    };
    
    const formatDuration = (seconds: number | null) => {
      if (!seconds) return 'Video';
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Handle video click — marketing AI lectures use the V5 player,
    // normal (non-marketing) AI lectures use the AI Lecture Player.
    const handleVideoPress = (video: TopicVideo) => {
      if (video.video_platform === 'ai_generated') {
        // external_job_id is the stable identifier for both players.
        const jobId = video.external_job_id;
        if (jobId) {
          if (video.is_marketing === true) {
            console.log('[TopicDetails] Marketing lecture — routing to V5 player, jobId:', jobId);
            navigation.navigate('V5Player', {
              jobId,
              title: video.title || topic?.title || 'Lecture',
              topicId: topicId || undefined,
              chapterId: routeChapterId || topic?.chapter_id || undefined,
              subjectId: subjectId || undefined,
              courseId: languageCourseId || undefined,
              initialLanguage: selectedAILanguage || 'english',
            });
            return;
          }
          console.log('[TopicDetails] Normal lecture — routing to AI Lecture Player, jobId:', jobId);
          navigation.navigate('AILecturePlayer', {
            jobId,
            topicId: topicId || undefined,
            chapterId: routeChapterId || topic?.chapter_id || undefined,
            subjectId: subjectId || undefined,
            subjectName: resolveSubjectName(),
            courseId: languageCourseId || undefined,
            topicTitle: video.title || topic?.title || 'AI Lecture',
            initialLanguage: selectedAILanguage || 'english',
          });
          return;
        }

        // No external_job_id — content is not available
        console.warn('[TopicDetails] AI lecture has no external_job_id — content unavailable');
        Alert.alert(
          'Content Unavailable',
          'This AI lecture is not yet available. Please try again later.',
          [{ text: 'OK' }],
        );
        return;
      }

      if (video.video_id) {
        setSelectedVideo(video.video_id);
      }
    };

    // If no topic_videos but topic itself has a video_id, show that video
    if (activeVideos.length === 0 && topic?.video_id) {
      return (
        <View style={styles.tabContent}>
          <TouchableOpacity
            style={styles.videoCard}
            onPress={() => setSelectedVideo(topic.video_id!)}
          >
            <View style={styles.videoThumbnailContainer}>
              <View style={[styles.videoThumbnail, styles.vimeoThumbnailPlaceholder]}>
                <Ionicons name="videocam" size={40} color={colors.white} />
              </View>
              <View style={styles.videoOverlay}>
                <Ionicons name="play-circle" size={32} color={colors.white} />
              </View>
              <View style={styles.videoDurationBadge}>
                <Text style={styles.videoDurationText}>
                  {topic.estimated_duration_minutes ? `${topic.estimated_duration_minutes} min` : 'Video'}
                </Text>
              </View>
            </View>
            <View style={styles.videoInfo}>
              <Text style={styles.videoCardTitle} numberOfLines={2}>{topic.title}</Text>
              <Text style={styles.videoDesc} numberOfLines={2}>
                Tap to watch the video lesson
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      );
    }
    
    // No videos at all
    if (activeVideos.length === 0) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.emptyStateContainer}>
            <Ionicons name="videocam-outline" size={48} color={colors.gray400} />
            <Text style={styles.emptyStateText}>No videos available for this topic</Text>
          </View>
        </View>
      );
    }

    // Render AI Lecture Card (SimpleLectures style)
    const renderAILectureCard = (video: TopicVideo) => (
      <AILectureCard
        video={video}
        topic={topic}
        purchasedLanguages={purchasedLanguages}
        courseAvailableLanguages={courseAvailableLanguages}
        languageCourseId={languageCourseId}
        languageTopupPrice={languageTopupPrice}
        selectedAILanguage={selectedAILanguage}
        onSelectLanguage={setSelectedAILanguage}
        onPress={() => handleVideoPress(video)}
        onPressUnlock={() => navigation.navigate('LanguageTopup', { subjectId: subjectId || topic?.subject_id || '' })}
      />
    );

    // Render Regular Video Card (YouTube/Vimeo)
    const renderRegularVideoCard = (video: TopicVideo) => (
      <TouchableOpacity
        key={video.id}
        style={styles.videoCard}
        onPress={() => handleVideoPress(video)}
      >
        <View style={styles.videoThumbnailContainer}>
          {video.thumbnail_url ? (
            <Image source={{ uri: video.thumbnail_url }} style={styles.videoThumbnail} />
          ) : (
            <View style={[styles.videoThumbnail, styles.vimeoThumbnailPlaceholder]}>
              <Ionicons name="videocam" size={40} color={colors.white} />
            </View>
          )}
          <View style={styles.videoOverlay}>
            <Ionicons name="play-circle" size={32} color={colors.white} />
          </View>
          <View style={styles.videoDurationBadge}>
            <Text style={styles.videoDurationText}>{formatDuration(video.duration_seconds)}</Text>
          </View>
          {video.language && video.language.trim() !== '' && (
            <View style={styles.languageBadge}>
              <Text style={styles.languageBadgeText}>{video.language.toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={styles.videoInfo}>
          <Text style={styles.videoCardTitle} numberOfLines={2}>{video.title || topic?.title}</Text>
          <Text style={styles.videoDesc} numberOfLines={2}>
            {video.description || 'Tap to watch the video lesson'}
          </Text>
        </View>
      </TouchableOpacity>
    );

    return (
      <View style={styles.tabContent}>
        {/* Language Filter Tabs */}
        {availableLanguages.length > 1 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            style={styles.languageFilterContainer}
            contentContainerStyle={styles.languageFilterContent}
          >
            {availableLanguages.map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[
                  styles.languageFilterTab,
                  selectedLanguageFilter === lang && styles.languageFilterTabActive
                ]}
                onPress={() => setSelectedLanguageFilter(lang)}
              >
                <Text style={[
                  styles.languageFilterTabText,
                  selectedLanguageFilter === lang && styles.languageFilterTabTextActive
                ]}>
                  {getLanguageLabel(lang)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        
        {/* Video Cards */}
        {activeVideos.map((video) => (
          video.video_platform === 'ai_generated' 
            ? renderAILectureCard(video)
            : renderRegularVideoCard(video)
        ))}
      </View>
    );
  };

  const renderAiTab = () => {
    const currentSlide = aiResponse?.presentationSlides?.[currentSlideIndex];
    const totalSlides = aiResponse?.presentationSlides?.length || 0;

    if (aiLoading || isPreloadingAudio) {
      // Loading phases: thinking -> preparing -> audio -> ready
      let progress = 0;
      let loadingState: 'thinking' | 'preparing' | 'audio' = 'thinking';
      let statusText = 'Analyzing your question...';
      let subtitleText = 'Understanding what you want to learn';
      
      if (aiLoading && !isPreloadingAudio) {
        // Phase 1: Thinking - AI is generating response (5-45% range)
        loadingState = 'thinking';
        progress = 5 + Math.random() * 40; // 5-45% during thinking
        statusText = 'Understanding Your Question';
        subtitleText = 'Analyzing and creating personalized content...';
      } else if (isPreloadingAudio && preloadingSlideIndex === 0 && totalSlidesToPreload > 0) {
        // Phase 2: Preparing slides - API returned, about to start audio
        loadingState = 'preparing';
        progress = 50;
        statusText = 'Preparing Presentation';
        subtitleText = `Creating ${totalSlidesToPreload} slides for you...`;
      } else if (isPreloadingAudio && totalSlidesToPreload > 0) {
        // Phase 3: Audio preparation - clamp to valid range
        loadingState = 'audio';
        const currentSlideNum = Math.min(preloadingSlideIndex + 1, totalSlidesToPreload);
        const audioProgress = Math.min(1, currentSlideNum / totalSlidesToPreload);
        progress = Math.min(100, 50 + audioProgress * 50);
        statusText = 'Preparing Voice Narration';
        subtitleText = `Generating audio for slide ${currentSlideNum} of ${totalSlidesToPreload}`;
      }
      
      const effectiveSubjectName = resolveSubjectName();
      
      return (
        <View style={[styles.tabContent, { flex: 1 }]}>
          <View style={styles.aiLoadingContainerEnhanced}>
            <LinearGradient
              colors={['rgba(43, 189, 110, 0.05)', 'rgba(74, 222, 128, 0.1)']}
              style={styles.aiLoadingGradient}
            >
              <View style={styles.aiOrbitContainer}>
                <Animated.View style={[
                  styles.aiOrbitRing, 
                  styles.aiOrbitRingSlow,
                  { transform: [{ rotate: orbitSlowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg']
                  }) }] }
                ]}>
                  <View style={styles.aiOrbitIcon}>
                    <Ionicons name="bulb-outline" size={20} color={colors.primaryLight} />
                  </View>
                </Animated.View>
                <Animated.View style={[
                  styles.aiOrbitRing, 
                  styles.aiOrbitRingMedium,
                  { transform: [{ rotate: orbitMediumAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '-360deg']
                  }) }] }
                ]}>
                  <View style={[styles.aiOrbitIcon, { top: -12, right: 20 }]}>
                    <Ionicons name="sparkles-outline" size={18} color="#4ADE80" />
                  </View>
                </Animated.View>
                <Animated.View style={[
                  styles.aiOrbitRing, 
                  styles.aiOrbitRingFast,
                  { transform: [{ rotate: orbitFastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg']
                  }) }] }
                ]}>
                  <View style={[styles.aiOrbitIcon, { bottom: 10, left: -10 }]}>
                    <Ionicons name="flash-outline" size={16} color={colors.primary} />
                  </View>
                </Animated.View>
                
                <Animated.View style={[styles.aiBrainContainer, { transform: [{ scale: pulseAnim }] }]}>
                  <LinearGradient
                    colors={[colors.primary, '#4ADE80']}
                    style={styles.aiBrainGradient}
                  >
                    <Ionicons 
                      name={loadingState === 'audio' ? 'volume-high' : loadingState === 'preparing' ? 'documents' : 'sparkles'} 
                      size={32} 
                      color={colors.white} 
                    />
                  </LinearGradient>
                </Animated.View>
              </View>
              
              <Text style={styles.aiLoadingTextEnhanced}>{statusText}</Text>
              <Text style={styles.aiLoadingSubtextEnhanced}>{subtitleText}</Text>
              
              <View style={styles.aiLoadingSteps}>
                <View style={[styles.aiLoadingStep, loadingState !== 'thinking' && styles.aiLoadingStepCompleted]}>
                  <View style={[styles.aiLoadingStepDot, loadingState === 'thinking' ? styles.aiLoadingStepDotActive : styles.aiLoadingStepDotCompleted]} />
                  <Text style={[styles.aiLoadingStepText, loadingState === 'thinking' && styles.aiLoadingStepTextActive]}>
                    Analyzing
                  </Text>
                </View>
                <View style={[styles.aiLoadingStepLine, loadingState !== 'thinking' && styles.aiLoadingStepLineCompleted]} />
                <View style={[styles.aiLoadingStep, loadingState === 'preparing' && styles.aiLoadingStepActive]}>
                  <View style={[styles.aiLoadingStepDot, loadingState === 'preparing' ? styles.aiLoadingStepDotActive : (loadingState === 'audio' ? styles.aiLoadingStepDotCompleted : {})]} />
                  <Text style={[styles.aiLoadingStepText, loadingState === 'preparing' && styles.aiLoadingStepTextActive]}>
                    Creating slides
                  </Text>
                </View>
                <View style={[styles.aiLoadingStepLine, loadingState === 'audio' && styles.aiLoadingStepLineCompleted]} />
                <View style={[styles.aiLoadingStep, loadingState === 'audio' && styles.aiLoadingStepActive]}>
                  <View style={[styles.aiLoadingStepDot, loadingState === 'audio' && styles.aiLoadingStepDotActive]} />
                  <Text style={[styles.aiLoadingStepText, loadingState === 'audio' && styles.aiLoadingStepTextActive]}>
                    Audio
                  </Text>
                </View>
              </View>
              
              <View style={styles.preloadProgressContainerEnhanced}>
                <View style={styles.preloadProgressBarEnhanced}>
                  <LinearGradient
                    colors={[colors.primary, '#4ADE80']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.preloadProgressFillEnhanced, { width: `${progress}%` }]}
                  />
                </View>
                <Text style={styles.preloadProgressTextEnhanced}>
                  {Math.round(progress)}%
                </Text>
              </View>
            </LinearGradient>
          </View>
        </View>
      );
    }

    if (aiError) {
      return (
        <View style={[styles.tabContent, { flex: 1 }]}>
          <View style={styles.aiLoadingContainer}>
            <Ionicons name="alert-circle" size={48} color={colors.error} />
            <Text style={[styles.aiLoadingText, { color: colors.error, marginTop: spacing.md }]}>
              Error
            </Text>
            <Text style={[styles.aiLoadingSubtext, { textAlign: 'center', marginTop: spacing.sm }]}>
              {aiError}
            </Text>
            <TouchableOpacity 
              style={[styles.aiActionButton, { marginTop: spacing.lg }]}
              onPress={() => {
                // Back to the question box with what was typed still in it, so one tap on send tries again.
                setAiError(null);
              }}
              data-testid="button-try-again"
            >
              <Text style={styles.submitButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (aiResponse?.blocked) {
      const detected = aiResponse.detectedSubject;
      const current = aiResponse.currentSubject || subjectName || topic?.subject_name || chapterModeSubjectName;
      const blockedMessage =
        aiResponse.message ||
        (detected
          ? `This looks like a ${detected} question. Please ask it in the ${detected} section.`
          : `This question doesn't seem to be about ${current || 'this subject'}. Please ask a question related to ${current || 'this subject'}.`);
      return (
        <View style={styles.tabContent}>
          <View style={styles.aiLoadingContainer}>
            <Ionicons name="school-outline" size={48} color={colors.primary} />
            <Text style={[styles.aiLoadingText, { marginTop: spacing.md }]}>
              Off-topic question
            </Text>
            <Text
              style={[styles.aiLoadingSubtext, { textAlign: 'center', marginTop: spacing.sm }]}
              data-testid="text-ai-blocked-message"
            >
              {blockedMessage}
            </Text>
            {!!detected && (
              <View style={[styles.aiSubjectBadge, { backgroundColor: 'rgba(43, 189, 110, 0.12)', marginTop: spacing.md }]}>
                <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
                <Text style={[styles.aiSubjectBadgeText, { color: colors.primary }]}>
                  Detected subject: {detected}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.aiActionButton, { marginTop: spacing.lg }]}
              onPress={() => {
                stopPresentationPlayback();
                setAiResponse(null);
                setAiMessage('');
              }}
              data-testid="button-ask-different-question"
            >
              <Text style={styles.submitButtonText}>
                {current ? `Ask a ${current} question` : 'Ask another question'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (aiResponse && currentSlide) {
      // Get images for current slide
      const slideImages: string[] = [];
      if (currentSlide.infographicUrl) slideImages.push(currentSlide.infographicUrl);
      if (currentSlide.images && Array.isArray(currentSlide.images)) slideImages.push(...currentSlide.images);
      
      const getImageUri = (url: string) => {
        if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
          return url;
        }
        return `data:image/png;base64,${url}`;
      };

      // Simulated Landscape layout - 3-column design displayed in portrait screen
      // Layout: Topic name at top, then 3 columns (Key Points | Main Image | Subtitles)
      if (isLandscape) {
        return (
          <View style={[styles.tabContent, styles.landscapeContainer]}>
            {/* Tap overlay to show controls - positioned behind content */}
            <TouchableOpacity 
              style={styles.landscapeTapOverlay}
              activeOpacity={1}
              onPress={handleLandscapeTap}
            />
            
            {/* Header bar with title and slide counter */}
            <View style={styles.landscapeHeader}>
              <Text style={styles.landscapeHeaderTitle} numberOfLines={1}>{currentSlide.title}</Text>
              <Text style={styles.landscapeHeaderCounter}>{currentSlideIndex + 1}/{totalSlides}</Text>
            </View>
            
            <View style={styles.landscapeThreeColumnContainer}>
              {/* Left column - Key Points (25%) */}
              <View style={styles.landscapeLeftColumn}>
                <Text style={styles.landscapeColumnTitle}>KEY POINTS</Text>
                <View style={styles.landscapeKeyPointsList}>
                  {currentSlide.keyPoints.slice(0, 4).map((point, index) => (
                    <View key={index} style={styles.landscapeKeyPointCompact}>
                      <View style={styles.landscapeKeyPointBulletSmall}>
                        <Text style={styles.landscapeKeyPointNumberSmall}>{index + 1}</Text>
                      </View>
                      {containsLatex(point) ? (
                        <MathText content={point} style={{ flex: 1 }} textStyle={styles.landscapeKeyPointTextCompact} color={colors.text} />
                      ) : (
                        <Text style={styles.landscapeKeyPointTextCompact} numberOfLines={2}>{point}</Text>
                      )}
                    </View>
                  ))}
                  {currentSlide.keyPoints.length > 4 && (
                    <Text style={styles.landscapeMorePoints}>+{currentSlide.keyPoints.length - 4} more</Text>
                  )}
                  {currentSlide.keyPoints.length === 0 && (
                    <Text style={styles.landscapeNoContent}>No key points</Text>
                  )}
                </View>
                
                {/* Formula (if exists) */}
                {currentSlide.formula && currentSlide.formula.trim().length > 0 && (
                  <View style={styles.landscapeFormulaCompact}>
                    <Text style={styles.landscapeColumnTitleSmall}>FORMULA</Text>
                    <MathText content={currentSlide.formula} mathOnly color={colors.primary} />
                  </View>
                )}
              </View>
              
              {/* Center column - Manim video or Image (50%) */}
              <View style={styles.landscapeCenterColumn}>
                {currentSlide.manimVideoUrl && !isPresentationFullscreen ? (
                  <View style={styles.landscapeImageWrapper}>
                    {renderManimVideo(currentSlide.manimVideoUrl, styles.landscapeDiagramImageCenter)}
                  </View>
                ) : slideImages.length > 0 ? (
                  <View style={styles.landscapeImageWrapper}>
                    <ScrollView 
                      horizontal 
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.landscapeImageCarouselCenter}
                      onMomentumScrollEnd={(e) => {
                        const slideWidth = e.nativeEvent.layoutMeasurement.width;
                        const index = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
                        setLandscapeImageIndex(Math.max(0, Math.min(index, slideImages.length - 1)));
                      }}
                    >
                      {slideImages.map((imageUrl, imgIndex) => (
                        <TouchableOpacity 
                          key={imgIndex}
                          onPress={() => setFullscreenImage(imageUrl)}
                          activeOpacity={0.9}
                          style={styles.landscapeImageSlideCenter}
                        >
                          <Image 
                            source={{ uri: getImageUri(imageUrl) }} 
                            style={styles.landscapeDiagramImageCenter}
                            resizeMode="contain"
                          />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    {slideImages.length > 1 && (
                      <View style={styles.landscapeImageDotsCenter}>
                        {slideImages.map((_, dotIndex) => (
                          <View key={dotIndex} style={[styles.landscapeImageDotCenter, dotIndex === landscapeImageIndex && styles.landscapeImageDotActiveCenter]} />
                        ))}
                      </View>
                    )}
                    {slideImages.length > 1 && (
                      <View style={styles.landscapeImageCounterCenter}>
                        <Text style={styles.landscapeImageCounterTextCenter}>{landscapeImageIndex + 1}/{slideImages.length}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.landscapeNoImageCenter}>
                    <LinearGradient
                      colors={['rgba(43, 189, 110, 0.1)', 'rgba(74, 222, 128, 0.15)']}
                      style={styles.landscapeNoImageGradientCenter}
                    >
                      <Ionicons name="sparkles" size={56} color={colors.primary} />
                      <Text style={styles.landscapeNoImageTextCenter}>AI Presentation</Text>
                    </LinearGradient>
                  </View>
                )}
                
                {/* Avatar overlay on center */}
                {aiAvatar?.image_url && (
                  <View style={styles.landscapeAvatarOverlay}>
                    <Animated.View style={[
                      styles.landscapeAvatarContainerOverlay,
                      isSpeaking && { transform: [{ scale: 1.08 }] }
                    ]}>
                      <Image 
                        source={{ uri: aiAvatar.image_url }} 
                        style={styles.landscapeAvatarImageOverlay}
                      />
                      {isSpeaking && (
                        <View style={styles.landscapeSpeakingDotOverlay} />
                      )}
                    </Animated.View>
                  </View>
                )}
              </View>
              
              {/* Right column - Subtitles/Narration (25%) */}
              <View style={styles.landscapeRightColumn}>
                <View style={styles.landscapeSubtitleHeader}>
                  <Ionicons name="chatbubble-ellipses" size={14} color={colors.primary} />
                  <Text style={styles.landscapeColumnTitle}>NARRATION</Text>
                </View>
                <View style={styles.landscapeSubtitleContent}>
                  {currentSlide.narration ? (
                    <Text style={styles.landscapeSubtitleTextFull} numberOfLines={8}>
                      {currentSlide.narration}
                    </Text>
                  ) : (
                    <Text style={styles.landscapeNoContent}>No narration available</Text>
                  )}
                </View>
                
                {/* Speaking indicator */}
                {isSpeaking && (
                  <View style={styles.landscapeSpeakingIndicator}>
                    <View style={styles.landscapeSpeakingWave}>
                      <View style={[styles.landscapeSpeakingBar, { height: 8 }]} />
                      <View style={[styles.landscapeSpeakingBar, { height: 14 }]} />
                      <View style={[styles.landscapeSpeakingBar, { height: 10 }]} />
                      <View style={[styles.landscapeSpeakingBar, { height: 16 }]} />
                      <View style={[styles.landscapeSpeakingBar, { height: 12 }]} />
                    </View>
                    <Text style={styles.landscapeSpeakingText}>Speaking...</Text>
                  </View>
                )}
              </View>
            </View>
            
            {/* Auto-hide controls at bottom */}
            <Animated.View style={[
              styles.landscapeControlsOverlay,
              { opacity: controlsOpacity }
            ]} pointerEvents={controlsVisible ? 'auto' : 'none'}>
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.85)']}
                style={styles.landscapeControlsGradient}
              >
                <AudioScrubber
                  positionMillis={audioProgress}
                  durationMillis={audioDuration}
                  onSeekStart={handleScrubStart}
                  onSeekMove={handleScrubMove}
                  onSeekEnd={handleScrubEnd}
                  trackStyle={styles.landscapeProgressBarOverlay}
                  fillStyle={styles.landscapeProgressFillOverlay}
                />
                <View style={styles.landscapeControlButtonsOverlay}>
                  <TouchableOpacity 
                    style={styles.landscapeControlBtnOverlay} 
                    onPress={() => { goToPrevSlide(); showControls(); }} 
                    disabled={currentSlideIndex === 0}
                  >
                    <Ionicons name="play-skip-back" size={22} color={currentSlideIndex === 0 ? 'rgba(255,255,255,0.3)' : colors.white} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.landscapePlayBtnOverlay} 
                    onPress={() => { togglePlayPause(); showControls(); }}
                  >
                    <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color={colors.white} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.landscapeControlBtnOverlay} 
                    onPress={() => { goToNextSlide(); showControls(); }} 
                    disabled={currentSlideIndex >= totalSlides - 1}
                  >
                    <Ionicons name="play-skip-forward" size={22} color={currentSlideIndex >= totalSlides - 1 ? 'rgba(255,255,255,0.3)' : colors.white} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.landscapeSpeedBtnOverlay} 
                    onPress={() => { cyclePlaybackSpeed(); showControls(); }}
                  >
                    <Text style={styles.landscapeSpeedTextOverlay}>{playbackSpeed}x</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.landscapeRotateBtnOverlay} 
                    onPress={() => { toggleOrientation(); showControls(); }}
                    testID="button-rotate-screen"
                  >
                    <Ionicons name="phone-portrait-outline" size={20} color={colors.white} />
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </Animated.View>
          </View>
        );
      }

      // Portrait layout - compact lecture-player style
      const pSlideImages: string[] = [];
      if (currentSlide.infographicUrl) pSlideImages.push(currentSlide.infographicUrl);
      if (currentSlide.images && Array.isArray(currentSlide.images)) pSlideImages.push(...currentSlide.images);

      return (
        <View style={styles.tabContent}>
          <View style={styles.aiPortraitPlayer}>
            <View style={styles.aiPortraitHeader}>
              <Text style={styles.aiPortraitHeaderTitle} numberOfLines={1}>{currentSlide.title}</Text>
              <View style={styles.aiPortraitHeaderBadge}>
                <Text style={styles.aiPortraitHeaderBadgeText}>{currentSlideIndex + 1} / {totalSlides}</Text>
              </View>
            </View>

            <View style={styles.aiPortraitStage}>
              {currentSlide.manimVideoUrl && !isPresentationFullscreen ? (
                <View style={styles.aiPortraitStageImage}>
                  {renderManimVideo(currentSlide.manimVideoUrl, styles.aiPortraitDiagramImg)}
                </View>
              ) : pSlideImages.length > 0 ? (
                <TouchableOpacity
                  style={styles.aiPortraitStageImage}
                  onPress={() => setFullscreenImage(pSlideImages[0])}
                  activeOpacity={0.9}
                >
                  <Image
                    source={{ uri: getImageUri(pSlideImages[0]) }}
                    style={styles.aiPortraitDiagramImg}
                    resizeMode="contain"
                  />
                  {pSlideImages.length > 1 && (
                    <View style={styles.aiPortraitImageCount}>
                      <Text style={styles.aiPortraitImageCountText}>1/{pSlideImages.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={styles.aiPortraitStagePlaceholder}>
                  <Ionicons name="sparkles" size={40} color="rgba(43, 189, 110, 0.6)" />
                </View>
              )}

              {currentSlide.keyPoints.length > 0 && (
                <View style={styles.aiPortraitStageKeyPoints}>
                  {currentSlide.keyPoints.slice(0, 3).map((point, index) => (
                    <View key={index} style={styles.aiPortraitStageKPItem}>
                      <View style={styles.aiPortraitStageKPBullet}>
                        <Text style={styles.aiPortraitStageKPNum}>{index + 1}</Text>
                      </View>
                      <Text style={styles.aiPortraitStageKPText} numberOfLines={2}>{point}</Text>
                    </View>
                  ))}
                  {currentSlide.keyPoints.length > 3 && (
                    <Text style={styles.aiPortraitStageKPMore}>+{currentSlide.keyPoints.length - 3} more</Text>
                  )}
                </View>
              )}

              {aiAvatar?.image_url && (
                <View style={styles.aiPortraitStageAvatar}>
                  <Image source={{ uri: aiAvatar.image_url }} style={styles.aiPortraitAvatarImg} />
                  {isSpeaking && <View style={styles.aiPortraitAvatarDot} />}
                </View>
              )}

              {isSpeaking && currentSlide.narration && (
                <View style={styles.aiPortraitStageSubtitle}>
                  <Text style={styles.aiPortraitSubtitleText} numberOfLines={2}>
                    {currentSlide.narration.substring(0, 120)}...
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.aiPortraitControls}>
              <Text style={styles.aiPortraitTimeText}>{formatTime(audioProgress)}</Text>
              <AudioScrubber
                positionMillis={audioProgress}
                durationMillis={audioDuration}
                onSeekStart={handleScrubStart}
                onSeekMove={handleScrubMove}
                onSeekEnd={handleScrubEnd}
                trackStyle={styles.aiPortraitSliderTrack}
                fillStyle={styles.aiPortraitSliderFill}
                style={styles.scrubberRowFlex}
              />
              <Text style={styles.aiPortraitTimeText}>{formatTime(audioDuration)}</Text>
              <TouchableOpacity style={styles.aiPortraitCtrlBtn} onPress={goToPrevSlide} disabled={currentSlideIndex === 0}>
                <Ionicons name="play-skip-back" size={16} color={currentSlideIndex === 0 ? 'rgba(255,255,255,0.3)' : '#fff'} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.aiPortraitPlayBtn} onPress={togglePlayPause}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.aiPortraitCtrlBtn} onPress={goToNextSlide} disabled={currentSlideIndex >= totalSlides - 1}>
                <Ionicons name="play-skip-forward" size={16} color={currentSlideIndex >= totalSlides - 1 ? 'rgba(255,255,255,0.3)' : '#fff'} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.aiPortraitCtrlBtn} onPress={cyclePlaybackSpeed}>
                <Text style={styles.aiPortraitSpeedText}>{playbackSpeed}x</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.aiPortraitCtrlBtn} onPress={() => { markPresentationStarted(); setIsPresentationFullscreen(true); }} testID="button-fullscreen-presentation">
                <Ionicons name="expand-outline" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.aiPortraitContent}>
            {currentSlide.content && currentSlide.content.trim().length > 0 && (
              <View style={styles.aiPortraitCard}>
                <Text style={styles.aiPortraitCardTitle}>EXPLANATION</Text>
                {containsLatex(currentSlide.content) ? (
                  <MathText content={currentSlide.content} textStyle={styles.aiPortraitCardText} color={colors.gray700} />
                ) : (
                  <Text style={styles.aiPortraitCardText}>{currentSlide.content}</Text>
                )}
              </View>
            )}

            {currentSlide.keyPoints.length > 0 && (
              <View style={styles.aiPortraitCard}>
                <Text style={styles.aiPortraitCardTitle}>KEY TAKEAWAYS</Text>
                {currentSlide.keyPoints.map((point, index) => (
                  <View key={index} style={styles.aiPortraitKPItem}>
                    <View style={styles.aiPortraitKPBullet}>
                      <Text style={styles.aiPortraitKPNum}>{index + 1}</Text>
                    </View>
                    {containsLatex(point) ? (
                      <MathText content={point} style={{ flex: 1 }} textStyle={styles.aiPortraitKPText} color={colors.gray700} />
                    ) : (
                      <Text style={styles.aiPortraitKPText}>{point}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {currentSlide.formula && currentSlide.formula.trim().length > 0 && (
              <View style={styles.aiPortraitCard}>
                <Text style={styles.aiPortraitCardTitle}>FORMULA</Text>
                <View style={styles.aiPortraitFormulaBox}>
                  <MathText content={currentSlide.formula} mathOnly color={colors.gray800} />
                </View>
              </View>
            )}

            {currentSlide.narration && (
              <View style={styles.aiPortraitCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="volume-high" size={14} color={colors.primary} />
                  <Text style={styles.aiPortraitCardTitle}>NARRATION</Text>
                </View>
                <Text style={styles.aiPortraitCardText}>{currentSlide.narration}</Text>
              </View>
            )}

            {pSlideImages.length > 1 && (
              <View style={styles.aiPortraitCard}>
                <Text style={styles.aiPortraitCardTitle}>VISUAL DIAGRAMS ({pSlideImages.length})</Text>
                <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {pSlideImages.map((imageUrl, imgIndex) => (
                    <TouchableOpacity key={imgIndex} onPress={() => setFullscreenImage(imageUrl)} activeOpacity={0.9} style={{ marginRight: 8 }}>
                      <Image source={{ uri: getImageUri(imageUrl) }} style={{ width: 200, height: 140, borderRadius: 8 }} resizeMode="contain" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {!!aiResponse.examTip?.trim() && (
              <View style={styles.aiPortraitCard} data-testid="card-exam-tip">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="school" size={14} color={colors.primary} />
                  <Text style={styles.aiPortraitCardTitle}>EXAM TIP</Text>
                </View>
                <RichTipText content={aiResponse.examTip} color={colors.gray700} fontSize={14} lineHeight={21} />
              </View>
            )}

            {!!aiResponse.realLifeExample?.trim() && (
              <View style={styles.aiPortraitCard} data-testid="card-real-life-example">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="earth" size={14} color={colors.primary} />
                  <Text style={styles.aiPortraitCardTitle}>REAL-LIFE EXAMPLE</Text>
                </View>
                <RichTipText content={aiResponse.realLifeExample} color={colors.gray700} fontSize={14} lineHeight={21} />
              </View>
            )}

            {aiResponse.followUpQuestions && aiResponse.followUpQuestions.length > 0 && (
              <View style={styles.aiPortraitCard}>
                <Text style={styles.aiPortraitCardTitle}>SUGGESTED QUESTIONS</Text>
                {aiResponse.followUpQuestions.slice(0, 3).map((question, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.aiFollowUpChip}
                    onPress={() => { stopPresentationPlayback(); setAiResponse(null); setAiMessage(sanitizeLatexForInput(question)); }}
                    data-testid={`button-followup-${index}`}
                  >
                    {containsLatex(question) ? (
                      <MathText content={question} style={{ flex: 1 }} textStyle={styles.aiFollowUpText} color={colors.primary} />
                    ) : (
                      <Text style={styles.aiFollowUpText} numberOfLines={2}>{question}</Text>
                    )}
                    <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {aiResponse.related_concepts && aiResponse.related_concepts.length > 0 && (
              <View style={styles.aiPortraitCard}>
                <Text style={styles.aiPortraitCardTitle}>RELATED CONCEPTS</Text>
                <View style={styles.aiRelatedTags}>
                  {aiResponse.related_concepts.slice(0, 5).map((concept, index) => (
                    <View key={index} style={styles.aiRelatedTag}>
                      <Text style={styles.aiRelatedTagText}>{concept}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.aiNewQuestionButton}
              onPress={() => { stopPresentationPlayback(); setAiResponse(null); setAiMessage(''); }}
            >
              <Ionicons name="chatbubble-outline" size={18} color={colors.primary} />
              <Text style={styles.aiNewQuestionText}>Ask another question</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    const effectiveSubjectName = resolveSubjectName();
    
    const quickPrompts = [
      { icon: 'bulb-outline', label: 'Explain concept', prompt: `Explain the key concepts of ${effectiveSubjectName}` },
      { icon: 'calculator-outline', label: 'Formula help', prompt: `What are the important formulas in this topic?` },
      { icon: 'help-circle-outline', label: 'Solve doubt', prompt: `I have a doubt about ` },
    ];
    
    // This tab is rendered in a bounded flex:1 View (NOT inside the outer
    // ScrollView in renderContent) so this keyboard container gets a real
    // bounded height. A keyboard-avoiding container nested in a parent
    // ScrollView gets unbounded height, making flex/onLayout meaningless and
    // compounding the input's offset on each keyboard show/hide — the "input
    // drifts downward on repeated taps" bug.
    // KeyboardShiftView tracks the real keyboard height on every device (EAS
    // builds); in Expo Go it falls back to the old KAV behavior.
    return (
      <KeyboardShiftView
        style={[styles.tabContent, { flex: 1 }]}
        iosKeyboardVerticalOffset={120}
      >
        <ScrollView 
          style={styles.aiChatEnhanced}
          contentContainerStyle={styles.aiChatScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={[colors.primary, '#4ADE80']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.aiWelcomeCard}
          >
            <View style={styles.aiAvatarContainer}>
              <View style={styles.aiAvatarGlow} />
              {aiAvatar?.image_url ? (
                <Image source={{ uri: aiAvatar.image_url }} style={styles.aiWelcomeAvatarEnhanced} />
              ) : (
                <View style={styles.aiIconEnhanced}>
                  <Ionicons name="sparkles" size={48} color={colors.white} />
                </View>
              )}
            </View>
            <Text style={styles.aiWelcomeTitleEnhanced}>
              Hello! I am your {effectiveSubjectName} AI Teacher.
            </Text>
            <Text style={styles.aiWelcomeDescEnhanced}>
              How may I help you today?
            </Text>
            <View style={styles.aiSubjectBadge}>
              <Ionicons name="school-outline" size={14} color="rgba(255,255,255,0.9)" />
              <Text style={styles.aiSubjectBadgeText}>
                I can answer questions about {effectiveSubjectName}
              </Text>
            </View>
          </LinearGradient>
          
          <Text style={styles.aiQuickPromptsLabel}>Quick Actions</Text>
          <View style={styles.aiQuickPrompts}>
            {quickPrompts.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.aiQuickPromptChip}
                onPress={() => setAiMessage(item.prompt)}
                data-testid={`button-quick-prompt-${index}`}
              >
                <View style={styles.aiQuickPromptIcon}>
                  <Ionicons name={item.icon as any} size={16} color={colors.primary} />
                </View>
                <Text style={styles.aiQuickPromptText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

        </ScrollView>
        
        {aiRequiresConfirmation && !isPresentationFullscreen && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginHorizontal: 16,
              marginBottom: 8,
              padding: 12,
              borderRadius: 12,
              backgroundColor: '#E7F9EF',
              borderWidth: 1,
              borderColor: colors.primary,
            }}
            data-testid="banner-ai-ready"
          >
            <Ionicons name="sparkles" size={20} color={colors.primary} />
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text style={{ fontWeight: '700', color: colors.text, fontSize: 13 }}>
                Your presentation is ready
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Tap watch to start, or discard it.
              </Text>
            </View>
            <TouchableOpacity
              onPress={acknowledgeAndWatch}
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                marginRight: 6,
              }}
              data-testid="button-ai-ready-watch"
            >
              <Text style={{ color: colors.white, fontWeight: '700', fontSize: 12 }}>Watch</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={clearAiJob}
              style={{ padding: 6 }}
              data-testid="button-ai-ready-discard"
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {aiOverlayVisible && (
          <Pressable
            style={styles.aiSuggestOverlayBackdrop}
            onPress={() => {
              Keyboard.dismiss();
              setAiInputFocused(false);
            }}
            data-testid="overlay-ai-suggestions-backdrop"
          >
            <Animated.View style={{ flex: 1, opacity: aiOverlayAnim }}>
              <BlurView
                intensity={40}
                tint="light"
                experimentalBlurMethod="dimezisBlurView"
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </Pressable>
        )}

        {aiOverlayVisible && (
          <Animated.View
            style={[
              styles.aiSuggestOverlayCard,
              {
                opacity: aiOverlayAnim,
                transform: [
                  {
                    translateY: aiOverlayAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {/* Blur is a non-interactive background layer ONLY. On Android the
                dimezisBlurView swallows child touches, so the interactive list
                must be a sibling rendered above it — never a descendant. */}
            <BlurView
              intensity={70}
              tint="light"
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.aiSuggestOverlayContent}>
              <View style={styles.aiSuggestHeaderRow}>
                <Ionicons name="sparkles" size={14} color={colors.primary} />
                <Text style={styles.aiSuggestHeaderText}>SUGGESTED QUESTIONS</Text>
              </View>
              <ScrollView
                style={{ maxHeight: SCREEN_HEIGHT * 0.4 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {aiMatches.map((m, idx) => (
                  <View key={m.id}>
                    {idx > 0 && <View style={styles.aiSuggestDivider} />}
                    <TouchableOpacity
                      style={styles.aiSuggestRow}
                      onPress={() => handlePickAiSuggestion(m)}
                      activeOpacity={0.6}
                      data-testid={`button-ai-suggestion-${m.id}`}
                    >
                      {containsLatex(m.text) ? (
                        <MathText
                          content={m.text}
                          style={{ flex: 1 }}
                          textStyle={styles.aiSuggestRowText}
                          color={colors.text}
                        />
                      ) : (
                        <Text style={styles.aiSuggestRowText} numberOfLines={2}>
                          {m.text}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        )}

        <View
          style={[
            styles.aiInputContainerEnhanced,
            { paddingBottom: isKeyboardVisible ? spacing.sm : Math.max(insets.bottom, spacing.md) },
          ]}
        >
          <View style={styles.aiInputWrapper}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.textMuted} style={styles.aiInputIcon} />
            <TextInput
              style={styles.aiInputEnhanced}
              placeholder="Type your question here..."
              placeholderTextColor={colors.textMuted}
              value={aiMessage}
              onChangeText={(t) => {
                setAiMessage(t);
                if (suppressAiSuggestions) setSuppressAiSuggestions(false);
              }}
              onFocus={() => setAiInputFocused(true)}
              onBlur={() => setAiInputFocused(false)}
              multiline
            />
          </View>
          <TouchableOpacity 
            style={[styles.aiSendButtonEnhanced, !aiMessage.trim() && styles.aiSendButtonDisabledEnhanced]}
            onPress={() => {
              Keyboard.dismiss();
              setAiInputFocused(false);
              handleAskAI();
            }}
            disabled={!aiMessage.trim()}
          >
            <LinearGradient
              colors={aiMessage.trim() ? [colors.primary, '#4ADE80'] : [colors.gray300, colors.gray400]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.aiSendButtonGradient}
            >
              <Ionicons name="send" size={20} color={colors.white} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardShiftView>
    );
  };

  const renderPodcastTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.podcastCard}>
        <View style={styles.podcastIcon}>
          <Ionicons name="mic" size={32} color="#22C55E" />
        </View>
        <View style={styles.podcastInfo}>
          <Text style={styles.podcastTitle}>Audio Summary</Text>
          <Text style={styles.podcastDesc}>Listen to the key concepts on the go.</Text>
          <View style={styles.podcastProgress}>
            <View style={styles.podcastProgressFill} />
          </View>
        </View>
        <TouchableOpacity style={styles.podcastPlayButton}>
          <Ionicons name="play-circle" size={40} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const getDifficultyStyle = (difficulty: string) => {
    const d = difficulty?.toLowerCase();
    if (d === 'easy' || d === 'low') return styles.mcqDifficultyEasy;
    if (d === 'medium') return styles.mcqDifficultyMedium;
    if (d === 'intermediate') return styles.difficultyIntermediate;
    if (d === 'hard' || d === 'advanced') return styles.mcqDifficultyHard;
    return styles.mcqDifficultyMedium;
  };

  const renderQuestionsTab = () => {
    const activeQuestions = questionsList;
    const currentQuestion = activeQuestions[questionCurrentIndex];

    const handleSelectAnswer = (questionId: string, optionKey: string) => {
      if (questionSubmitted) return;
      setQuestionAnswers({ ...questionAnswers, [questionId]: optionKey });
    };

    const handleSubjectiveAnswer = (questionId: string, text: string) => {
      if (questionSubmitted) return;
      setQuestionAnswers({ ...questionAnswers, [questionId]: text });
    };

    const handlePickImage = async (questionId: string) => {
      if (questionSubmitted) return;

      const launchSource = (source: 'camera' | 'library') => async () => {
        if (source === 'camera') {
          const camPerm = await ImagePicker.requestCameraPermissionsAsync();
          if (!camPerm.granted) {
            Alert.alert('Permission Required', 'Please allow camera access to capture an answer image.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.8,
          });
          if (!result.canceled && result.assets?.[0]) {
            const asset = result.assets[0];
            setQuestionImages(prev => ({
              ...prev,
              [questionId]: { uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' },
            }));
          }
        } else {
          const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!libPerm.granted) {
            Alert.alert('Permission Required', 'Please allow access to your photos to upload an answer image.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.8,
          });
          if (!result.canceled && result.assets?.[0]) {
            const asset = result.assets[0];
            setQuestionImages(prev => ({
              ...prev,
              [questionId]: { uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' },
            }));
          }
        }
      };

      Alert.alert('Upload Answer Image', 'Choose source', [
        { text: 'Camera', onPress: launchSource('camera') },
        { text: 'Photo Library', onPress: launchSource('library') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    };

    const handleRemoveImage = (questionId: string) => {
      setQuestionImages(prev => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
    };

    const handleSubmitQuestions = async () => {
      if (questionSubmitting) return;
      setQuestionSubmitting(true);

      try {
        if (!user?.id) {
          Alert.alert('Authentication Required', 'Please log in to submit your answers.');
          setQuestionSubmitting(false);
          return;
        }

        const gradeResults: { [questionId: string]: { marksAwarded: number; feedback: string; isCorrect: boolean; pending?: boolean } } = {};
        const finalAnswers: { [questionId: string]: string } = {};
        let totalScored = 0;
        let totalMaxMarks = 0;
        let correctCount = 0;
        let hasSubjectivePending = false;

        for (const q of activeQuestions) {
          const qMarks = q.marks || 1;
          totalMaxMarks += qMarks;
          const userAnswer = questionAnswers[q.id];

          if (isMCQ(q)) {
            const correctKey = (q.correct_answer || '').trim().toLowerCase();
            const studentKey = (userAnswer || '').trim().toLowerCase();
            const isCorrect = studentKey === correctKey;
            const awarded = isCorrect ? qMarks : 0;
            if (isCorrect) correctCount++;
            totalScored += awarded;
            finalAnswers[q.id] = userAnswer || '';
            gradeResults[q.id] = {
              marksAwarded: awarded,
              feedback: isCorrect ? 'Correct!' : `Incorrect. The correct answer is ${q.correct_answer}.`,
              isCorrect,
            };
          } else {
            let effectiveAnswer = userAnswer || '';

            const imgData = questionImages[q.id];
            if (imgData && user) {
              const uploadResult = await supabase.uploadAnswerImage({
                userId: user.id,
                questionId: q.id,
                imageUri: imgData.uri,
                mimeType: imgData.mimeType,
              });
              if (uploadResult.success && uploadResult.publicUrl) {
                const ocrResult = await supabase.extractAnswerFromImage({
                  imageUrl: uploadResult.publicUrl,
                  questionContext: q.question_text,
                });
                const ocrText = (ocrResult.extractedText || '').trim();
                if (effectiveAnswer.trim()) {
                  effectiveAnswer = ocrText
                    ? `${effectiveAnswer.trim()}\n[Image: ${ocrText}]`
                    : effectiveAnswer.trim();
                } else {
                  effectiveAnswer = ocrText || '[Image answer uploaded - AI extraction failed]';
                }
              } else {
                if (!effectiveAnswer.trim()) {
                  effectiveAnswer = '[Image answer uploaded - upload failed]';
                }
              }
              setQuestionAnswers(prev => ({ ...prev, [q.id]: effectiveAnswer }));
            }

            if (!effectiveAnswer || effectiveAnswer.trim() === '') {
              finalAnswers[q.id] = '';
              gradeResults[q.id] = {
                marksAwarded: 0,
                feedback: 'No answer provided.',
                isCorrect: false,
              };
              continue;
            }

            const gradeResult = await supabase.gradeSubjectiveAnswer({
              questionId: q.id,
              questionText: q.question_text,
              questionType: q.question_type,
              correctAnswer: q.correct_answer,
              studentAnswer: effectiveAnswer,
              maxMarks: qMarks,
            });

            finalAnswers[q.id] = effectiveAnswer;

            if (gradeResult.success && gradeResult.result) {
              const r = gradeResult.result;
              totalScored += r.marks_awarded;
              if (r.is_correct) correctCount++;
              gradeResults[q.id] = {
                marksAwarded: r.marks_awarded,
                feedback: r.feedback,
                isCorrect: r.is_correct,
              };
            } else {
              hasSubjectivePending = true;
              gradeResults[q.id] = {
                marksAwarded: 0,
                feedback: 'Pending AI review - grading could not be completed at this time.',
                isCorrect: false,
                pending: true,
              };
            }
          }
        }

        setQuestionGradeResults(gradeResults);
        setQuestionTotalScore(totalScored);
        setQuestionTotalMarks(totalMaxMarks);

        const percentage = totalMaxMarks > 0 ? Math.round((totalScored / totalMaxMarks) * 100) : 0;

        const testRecord = await supabase.createPracticeTestRecord({
          subjectId: subjectId || topic?.subject_id,
          chapterId: routeChapterId || topic?.chapter_id,
          topicId: topicId || undefined,
          totalMarks: totalMaxMarks,
          createdBy: user.id,
        });

        await supabase.savePracticeTestResult({
          testId: testRecord.testId,
          studentId: user.id,
          subjectId: subjectId || topic?.subject_id,
          score: totalScored,
          totalQuestions: activeQuestions.length,
          percentage,
          answers: finalAnswers,
          gradingStatus: hasSubjectivePending ? 'pending' : 'graded',
        });

        setQuestionSubmitted(true);
      } catch (error) {
        console.error('[Questions] Submission error:', error);
        Alert.alert('Error', 'Failed to submit test. Please try again.');
      } finally {
        setQuestionSubmitting(false);
      }
    };

    const handleResetQuestions = () => {
      setQuestionSubmitted(false);
      setQuestionAnswers({});
      setQuestionCurrentIndex(0);
      setQuestionGradeResults({});
      setQuestionTotalScore(0);
      setQuestionTotalMarks(0);
      setQuestionImages({});
    };

    if (questionsLoading) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading questions...</Text>
          </View>
        </View>
      );
    }

    if (questionsError) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.gray400} />
            <Text style={styles.errorText}>{questionsError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => fetchQuestions('All')}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (activeQuestions.length === 0) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.emptyContainer}>
            <Ionicons name="help-circle-outline" size={48} color={colors.gray400} />
            <Text style={styles.emptyText}>No questions available for this topic yet.</Text>
          </View>
        </View>
      );
    }

    if (questionSubmitting) {
      return (
        <View style={[styles.tabContent, { justifyContent: 'center', alignItems: 'center', flex: 1 }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { marginTop: spacing.md }]}>Grading your answers...</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.gray400, marginTop: spacing.sm }}>
            Subjective answers are being reviewed by AI
          </Text>
        </View>
      );
    }

    if (questionSubmitted) {
      const percentage = questionTotalMarks > 0 ? Math.round((questionTotalScore / questionTotalMarks) * 100) : 0;
      const correctCount = Object.values(questionGradeResults).filter(r => r.isCorrect).length;
      const hasPending = Object.values(questionGradeResults).some(r => r.pending);
      
      return (
        <View style={styles.tabContent}>
          <View style={styles.resultCard}>
            <View style={[styles.resultCircle, percentage >= 70 ? styles.resultCircleGood : percentage >= 40 ? styles.resultCircleOk : styles.resultCirclePoor]}>
              <Text style={styles.resultPercentage}>{percentage}%</Text>
              <Text style={styles.resultLabel}>Score</Text>
            </View>
            <Text style={styles.resultSummary}>
              {questionTotalScore}/{questionTotalMarks} marks | {correctCount}/{activeQuestions.length} correct
            </Text>
            {hasPending && (
              <View style={styles.pendingBadge}>
                <Ionicons name="time-outline" size={14} color="#D97706" />
                <Text style={styles.pendingBadgeText}>Some answers are pending AI review</Text>
              </View>
            )}
            
            <View style={styles.resultActions}>
              <TouchableOpacity style={styles.resultActionButton} onPress={handleResetQuestions}>
                <Ionicons name="refresh" size={18} color={colors.primary} />
                <Text style={styles.resultActionText}>Retake Test</Text>
              </TouchableOpacity>
            </View>
          </View>

          {activeQuestions.map((q, idx) => {
            const userAnswer = questionAnswers[q.id];
            const grade = questionGradeResults[q.id];
            const isCorrect = grade?.isCorrect || false;
            const isPending = grade?.pending || false;
            const options = q.options || {};
            const qMarks = q.marks || 1;
            
            return (
              <View key={q.id} style={[styles.mcqCard, isCorrect ? styles.mcqCardCorrect : isPending ? styles.questionCardPending : (userAnswer ? styles.mcqCardIncorrect : null)]}>
                <View style={styles.mcqHeader}>
                  <View style={styles.mcqBadge}>
                    <Text style={styles.mcqBadgeText}>Q{idx + 1}</Text>
                  </View>
                  <View style={styles.mcqMetaRow}>
                    <Text style={[styles.mcqDifficultyBadge, getDifficultyStyle(q.difficulty)]}>{q.difficulty}</Text>
                    {!isMCQ(q) && (
                      <View style={styles.subjectiveTypeBadge}>
                        <Text style={styles.subjectiveTypeBadgeText}>Subjective</Text>
                      </View>
                    )}
                    {q.is_important && (
                      <View style={styles.importantBadge}>
                        <Ionicons name="star" size={10} color="#D97706" />
                      </View>
                    )}
                    <Text style={styles.mcqMarks}>{grade?.marksAwarded ?? 0}/{qMarks}</Text>
                    {isPending ? (
                      <Ionicons name="time-outline" size={20} color="#D97706" />
                    ) : isCorrect ? (
                      <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                    ) : userAnswer ? (
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    ) : (
                      <Ionicons name="remove-circle-outline" size={20} color={colors.gray400} />
                    )}
                  </View>
                </View>
                {q.question_image_url && (
                  <Image source={{ uri: q.question_image_url }} style={styles.questionImage} resizeMode="contain" />
                )}
                <MathText 
                  content={stripEmbeddedOptions(q.question_text, q.options)} 
                  style={styles.mcqQuestion}
                />
                {isMCQ(q) ? (
                  Object.entries(options).map(([key, value]) => {
                    const isSelected = userAnswer === key;
                    const isCorrectOption = q.correct_answer === key;
                    let optionStyle = styles.mcqOption;
                    if (isCorrectOption) {
                      optionStyle = { ...styles.mcqOption, ...styles.mcqOptionCorrect };
                    } else if (isSelected && !isCorrectOption) {
                      optionStyle = { ...styles.mcqOption, ...styles.mcqOptionIncorrect };
                    }
                    return (
                      <View key={key} style={optionStyle}>
                        <Text style={styles.mcqOptionLabel}>{key.toUpperCase()}.</Text>
                        <MathText 
                          content={getOptionText(value)} 
                          style={styles.mcqOptionText}
                        />
                        {isCorrectOption && <Ionicons name="checkmark" size={16} color="#22C55E" style={{ marginLeft: 'auto' }} />}
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.subjectiveAnswerReview}>
                    <Text style={styles.subjectiveAnswerLabel}>Your Answer:</Text>
                    <Text style={styles.subjectiveAnswerText}>{userAnswer || '(No answer provided)'}</Text>
                    {grade?.feedback && (
                      <View style={styles.aiFeedbackBox}>
                        <Ionicons name={isPending ? "time-outline" : "sparkles-outline"} size={14} color={isPending ? "#D97706" : colors.primary} />
                        <Text style={styles.aiFeedbackText}>{grade.feedback}</Text>
                      </View>
                    )}
                  </View>
                )}
                {!isCorrect && !isPending && q.correct_answer && (
                  <View style={styles.correctAnswerBox}>
                    <Text style={styles.correctAnswerLabel}>Correct Answer:</Text>
                    <MathText content={q.correct_answer} style={styles.correctAnswerText} />
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
        </View>
      );
    }

    if (!currentQuestion) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>No questions available.</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleResetQuestions}>
              <Text style={styles.retryButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    const options = currentQuestion.options || {};
    const isCurrentMCQ = isMCQ(currentQuestion);

    return (
      <View style={styles.mcqTestWrapper}>
        <View style={styles.testHeader}>
          <TouchableOpacity onPress={handleResetQuestions} style={styles.testBackButton}>
            <Ionicons name="chevron-back" size={18} color={colors.gray500} />
            <Text style={styles.testBackText}>Exit Test</Text>
          </TouchableOpacity>
          <View style={styles.timerBadge}>
            <Ionicons name="time-outline" size={14} color={colors.gray500} />
            <Text style={styles.timerText}>Unlimited</Text>
          </View>
        </View>

        <View style={styles.mcqProgressContainer}>
          <View style={styles.mcqProgressBar}>
            <View style={[styles.mcqProgressFill, { width: `${((questionCurrentIndex + 1) / activeQuestions.length) * 100}%` }]} />
          </View>
          <Text style={styles.mcqProgressText}>{questionCurrentIndex + 1} / {activeQuestions.length}</Text>
        </View>

        <ScrollView style={styles.mcqQuestionScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.mcqQuestionScrollContent}>
          <View style={styles.mcqCard}>
            <View style={styles.mcqHeader}>
              <View style={styles.mcqBadge}>
                <Text style={styles.mcqBadgeText}>Q{questionCurrentIndex + 1}</Text>
              </View>
              <View style={styles.mcqMetaRow}>
                <Text style={[styles.mcqDifficultyBadge, getDifficultyStyle(currentQuestion.difficulty)]}>{currentQuestion.difficulty}</Text>
                {!isCurrentMCQ && (
                  <View style={styles.subjectiveTypeBadge}>
                    <Text style={styles.subjectiveTypeBadgeText}>Subjective</Text>
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
            </View>
            {currentQuestion.question_image_url && (
              <Image source={{ uri: currentQuestion.question_image_url }} style={styles.questionImage} resizeMode="contain" />
            )}
            <MathText 
              content={stripEmbeddedOptions(currentQuestion.question_text, currentQuestion.options)} 
              style={styles.mcqQuestion}
            />
            {isCurrentMCQ ? (
              Object.entries(options).map(([key, value]) => {
                const isSelected = questionAnswers[currentQuestion.id] === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.mcqOption, isSelected && styles.mcqOptionSelected]}
                    onPress={() => handleSelectAnswer(currentQuestion.id, key)}
                  >
                    <Text style={[styles.mcqOptionLabel, isSelected && styles.mcqOptionLabelSelected]}>{key.toUpperCase()}.</Text>
                    <MathText 
                      content={getOptionText(value)} 
                      style={[styles.mcqOptionText, isSelected && styles.mcqOptionTextSelected]}
                    />
                  </TouchableOpacity>
                );
              })
            ) : (
              <View>
                <TextInput
                  style={styles.subjectiveInput}
                  placeholder="Type your answer here..."
                  placeholderTextColor={colors.gray400}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  value={questionAnswers[currentQuestion.id] || ''}
                  onChangeText={(text) => handleSubjectiveAnswer(currentQuestion.id, text)}
                />
                {questionImages[currentQuestion.id] ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image
                      source={{ uri: questionImages[currentQuestion.id].uri }}
                      style={styles.imagePreviewThumb}
                      resizeMode="cover"
                    />
                    <TouchableOpacity onPress={() => handleRemoveImage(currentQuestion.id)} style={styles.imageRemoveBtn}>
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                      <Text style={styles.imageRemoveBtnText}>Remove Image</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.uploadImageButton}
                    onPress={() => handlePickImage(currentQuestion.id)}
                  >
                    <Ionicons name="image-outline" size={18} color={colors.primary} />
                    <Text style={styles.uploadImageButtonText}>Upload Answer Image</Text>
                  </TouchableOpacity>
                )}
              </View>
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
            >
              <Text style={styles.mcqSubmitButtonText}>Submit Test</Text>
              <Ionicons name="checkmark-circle" size={18} color={colors.white} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // DPP Functions - Dynamic quiz from questions table
  const loadDppPastAttempts = async () => {
    if (!user?.id) return;
    setDppPastLoading(true);
    try {
      const result = await supabase.getDppPastAttempts(user.id, topicId);
      if (result.success && result.attempts) {
        setDppPastAttempts(result.attempts);
      }
    } catch (error) {
      console.error('[DPP] Error loading past attempts:', error);
    } finally {
      setDppPastLoading(false);
    }
  };

  const getQuestionType = (q: any): 'mcq' | 'true_false' | 'integer' | 'subjective' => {
    const qt = (q.question_type || '').toLowerCase();
    if (qt === 'true_false') return 'true_false';
    if (qt === 'integer' || qt === 'numerical') return 'integer';
    if (qt === 'mcq' || qt === 'single_choice' || qt === 'multiple_choice') return 'mcq';
    const opts = q.options;
    if (opts && typeof opts === 'object' && Object.keys(opts).length > 0) return 'mcq';
    if (q.question_format === 'subjective') return 'subjective';
    return 'subjective';
  };

  const getQuestionTypeBadge = (type: string) => {
    switch (type) {
      case 'mcq': return { label: 'MCQ', color: '#2BBD6E', bg: '#FFFFFF' };
      case 'true_false': return { label: 'True/False', color: '#0891B2', bg: '#E0F2FE' };
      case 'integer': return { label: 'Numerical', color: '#D97706', bg: '#FEF3C7' };
      case 'subjective': return { label: 'Subjective', color: '#059669', bg: '#D1FAE5' };
      default: return { label: 'Question', color: '#6B7280', bg: '#F3F4F6' };
    }
  };

  const handleStartDpp = async () => {
    setDppView('testing');
    try {
      const result = await supabase.getDPPQuestionsForTopic(topicId);
      if (result.success && result.questions && result.questions.length > 0) {
        const shuffled = [...result.questions].sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, 5);
        setDppQuestions(picked);
        setDppAnswers({});
        setDppFlaggedQuestions(new Set());
        setDppCurrentIndex(0);
        setDppStartTime(Date.now());
        setDppGradingResults({});
        setDppScore(0);
      } else {
        Alert.alert('No Questions', 'No questions available for this topic yet.');
        setDppView('landing');
      }
    } catch (error) {
      console.error('[DPP] Error fetching questions:', error);
      Alert.alert('Error', 'Could not load questions. Please try again.');
      setDppView('landing');
    }
  };

  const handleDppAnswerSelect = (questionId: string, answer: string) => {
    setDppAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const toggleDppFlag = (questionId: string) => {
    setDppFlaggedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  const handleDppSubmit = async () => {
    if (!user?.id || dppQuestions.length === 0) return;
    
    setDppView('submitting');
    const timeTakenSeconds = Math.floor((Date.now() - dppStartTime) / 1000);
    
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;
    const gradingMap: { [id: string]: { isCorrect: boolean; marksAwarded: number } } = {};
    
    for (const q of dppQuestions) {
      const userAnswer = dppAnswers[q.id]?.trim();
      if (!userAnswer) {
        unansweredCount++;
        gradingMap[q.id] = { isCorrect: false, marksAwarded: 0 };
        continue;
      }
      
      const correctAnswer = (q.correct_answer || '').trim();
      const qType = getQuestionType(q);
      
      if (qType === 'mcq' || qType === 'true_false') {
        const isCorrect = userAnswer.toLowerCase() === correctAnswer.toLowerCase();
        gradingMap[q.id] = { isCorrect, marksAwarded: isCorrect ? 1 : 0 };
        if (isCorrect) correctCount++;
        else incorrectCount++;
      } else if (qType === 'integer') {
        const studentNum = parseFloat(userAnswer);
        const correctNum = parseFloat(correctAnswer);
        const isCorrect = !isNaN(studentNum) && !isNaN(correctNum) && Math.abs(studentNum - correctNum) < 0.001;
        gradingMap[q.id] = { isCorrect, marksAwarded: isCorrect ? 1 : 0 };
        if (isCorrect) correctCount++;
        else incorrectCount++;
      } else {
        try {
          const aiResult = await supabase.gradeSubjectiveAnswer({
            questionId: q.id,
            questionText: q.question_text || '',
            questionType: q.question_type || 'subjective',
            correctAnswer: correctAnswer,
            studentAnswer: userAnswer,
            maxMarks: 1,
          });
          if (aiResult.success && aiResult.result) {
            const isCorrect = aiResult.result.is_correct;
            gradingMap[q.id] = { isCorrect, marksAwarded: aiResult.result.marks_awarded };
            if (isCorrect) correctCount++;
            else incorrectCount++;
          } else {
            const isCorrect = userAnswer.toLowerCase() === correctAnswer.toLowerCase();
            gradingMap[q.id] = { isCorrect, marksAwarded: isCorrect ? 1 : 0 };
            if (isCorrect) correctCount++;
            else incorrectCount++;
          }
        } catch {
          const isCorrect = userAnswer.toLowerCase() === correctAnswer.toLowerCase();
          gradingMap[q.id] = { isCorrect, marksAwarded: isCorrect ? 1 : 0 };
          if (isCorrect) correctCount++;
          else incorrectCount++;
        }
      }
    }
    
    setDppGradingResults(gradingMap);
    setDppScore(correctCount);
    
    const percentage = Math.round((correctCount / dppQuestions.length) * 100);
    const dppSubjectId = subjectId || topic?.subject_id || '';
    
    try {
      await supabase.submitTestResult({
        testId: null,
        studentId: user.id,
        subjectId: dppSubjectId,
        topicId: topicId,
        testType: 'dpp',
        score: correctCount,
        totalQuestions: dppQuestions.length,
        percentage,
        timeTakenSeconds,
        answers: dppAnswers,
        gradingStatus: 'graded',
      });
      console.log('[DPP] Result submitted successfully');
    } catch (error) {
      console.error('[DPP] Error submitting result:', error);
    }
    
    setDppView('results');
    loadDppPastAttempts();
  };

  const handleBackToDppLanding = () => {
    setDppView('landing');
    setDppQuestions([]);
    setDppAnswers({});
    setDppFlaggedQuestions(new Set());
    setDppGradingResults({});
  };

  useEffect(() => {
    if (activeTab === 'dpp' && user?.id) {
      loadDppPastAttempts();
    }
  }, [activeTab, user?.id, topicId]);

  const renderDppTab = () => {
    if (!user?.id) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.emptyStateContainer}>
            <Ionicons name="lock-closed-outline" size={48} color={colors.gray300} />
            <Text style={styles.emptyStateTitle}>Login Required</Text>
            <Text style={styles.emptyStateText}>Please log in to access Daily Practice Problems.</Text>
          </View>
        </View>
      );
    }

    if (dppView === 'submitting') {
      return (
        <View style={styles.tabContent}>
          <View style={styles.dppLoadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.dppLoadingTitle}>Grading your answers...</Text>
            <Text style={styles.dppLoadingSubtitle}>This may take a moment for subjective questions</Text>
          </View>
        </View>
      );
    }

    if (dppView === 'testing' && dppQuestions.length > 0) {
      const currentQuestion = dppQuestions[dppCurrentIndex];
      const qType = getQuestionType(currentQuestion);
      const typeBadge = getQuestionTypeBadge(qType);
      const options = currentQuestion?.options || {};
      const answeredCount = Object.keys(dppAnswers).length;
      const isFlagged = dppFlaggedQuestions.has(currentQuestion.id);
      
      return (
        <View style={styles.mcqTestWrapper}>
          <View style={styles.dppTestHeader}>
            <TouchableOpacity onPress={handleBackToDppLanding} style={styles.dppExitButton}>
              <Ionicons name="close" size={20} color={colors.gray500} />
            </TouchableOpacity>
            <Text style={styles.dppQuestionCounter}>Q {dppCurrentIndex + 1} of {dppQuestions.length}</Text>
            <View style={{ backgroundColor: typeBadge.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: typeBadge.color }}>{typeBadge.label}</Text>
            </View>
            <Text style={styles.dppAnsweredCounter}>Answered: {answeredCount}/{dppQuestions.length}</Text>
          </View>

          <View style={styles.dppProgressBar}>
            <View style={[styles.dppProgressFill, { width: `${((dppCurrentIndex + 1) / dppQuestions.length) * 100}%` }]} />
          </View>

          <ScrollView style={styles.mcqQuestionScroll} contentContainerStyle={styles.mcqQuestionScrollContent}>
            <View style={styles.dppQuestionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                {currentQuestion?.difficulty && (
                  <View style={[styles.dppDifficultyBadge, 
                    currentQuestion.difficulty?.toLowerCase() === 'easy' && { backgroundColor: '#D1FAE5' },
                    currentQuestion.difficulty?.toLowerCase() === 'low' && { backgroundColor: '#D1FAE5' },
                    currentQuestion.difficulty?.toLowerCase() === 'medium' && { backgroundColor: '#FEF3C7' },
                    currentQuestion.difficulty?.toLowerCase() === 'intermediate' && { backgroundColor: '#FEF3C7' },
                    currentQuestion.difficulty?.toLowerCase() === 'hard' && { backgroundColor: '#FEE2E2' },
                    currentQuestion.difficulty?.toLowerCase() === 'advanced' && { backgroundColor: '#FEE2E2' }
                  ]}>
                    <Text style={[styles.dppDifficultyText,
                      (currentQuestion.difficulty?.toLowerCase() === 'easy' || currentQuestion.difficulty?.toLowerCase() === 'low') && { color: '#059669' },
                      (currentQuestion.difficulty?.toLowerCase() === 'medium' || currentQuestion.difficulty?.toLowerCase() === 'intermediate') && { color: '#D97706' },
                      (currentQuestion.difficulty?.toLowerCase() === 'hard' || currentQuestion.difficulty?.toLowerCase() === 'advanced') && { color: '#DC2626' }
                    ]}>
                      {currentQuestion.difficulty}
                    </Text>
                  </View>
                )}
                <TouchableOpacity onPress={() => toggleDppFlag(currentQuestion.id)} style={{ padding: 4 }}>
                  <Ionicons name={isFlagged ? 'flag' : 'flag-outline'} size={20} color={isFlagged ? '#F59E0B' : colors.gray400} />
                </TouchableOpacity>
              </View>
              
              <MathText content={stripEmbeddedOptions(currentQuestion?.question_text || '', currentQuestion?.options)} style={styles.mcqQuestion} />
              
              {qType === 'mcq' && Object.entries(options).map(([key, value]) => {
                const isSelected = dppAnswers[currentQuestion.id]?.toLowerCase() === key.toLowerCase();
                const optText = getOptionText(value);
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.mcqOption, isSelected && styles.mcqOptionSelected]}
                    onPress={() => handleDppAnswerSelect(currentQuestion.id, key.toLowerCase())}
                  >
                    <Text style={[styles.mcqOptionLabel, isSelected && styles.mcqOptionLabelSelected]}>{key.toUpperCase()}.</Text>
                    <MathText content={optText} style={[styles.mcqOptionText, isSelected && styles.mcqOptionTextSelected]} />
                  </TouchableOpacity>
                );
              })}

              {qType === 'true_false' && ['true', 'false'].map((val) => {
                const isSelected = dppAnswers[currentQuestion.id]?.toLowerCase() === val;
                return (
                  <TouchableOpacity
                    key={val}
                    style={[styles.mcqOption, isSelected && styles.mcqOptionSelected]}
                    onPress={() => handleDppAnswerSelect(currentQuestion.id, val)}
                  >
                    <Text style={[styles.mcqOptionLabel, isSelected && styles.mcqOptionLabelSelected]}>
                      {val === 'true' ? 'T' : 'F'}.
                    </Text>
                    <Text style={[styles.mcqOptionText, isSelected && styles.mcqOptionTextSelected]}>
                      {val.charAt(0).toUpperCase() + val.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {qType === 'integer' && (
                <TextInput
                  style={styles.dppIntegerInput}
                  placeholder="Enter your numerical answer"
                  placeholderTextColor={colors.gray400}
                  keyboardType="numeric"
                  value={dppAnswers[currentQuestion.id] || ''}
                  onChangeText={(text) => handleDppAnswerSelect(currentQuestion.id, text)}
                />
              )}

              {qType === 'subjective' && (
                <TextInput
                  style={styles.dppSubjectiveInput}
                  placeholder="Type your answer here..."
                  placeholderTextColor={colors.gray400}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  value={dppAnswers[currentQuestion.id] || ''}
                  onChangeText={(text) => handleDppAnswerSelect(currentQuestion.id, text)}
                />
              )}
            </View>

            <View style={styles.dppQuestionPalette}>
              {dppQuestions.map((q, idx) => (
                <TouchableOpacity
                  key={q.id}
                  style={[
                    styles.dppDot,
                    dppAnswers[q.id] && styles.dppDotAnswered,
                    dppFlaggedQuestions.has(q.id) && { borderColor: '#F59E0B', borderWidth: 2 },
                    idx === dppCurrentIndex && styles.dppDotCurrent
                  ]}
                  onPress={() => setDppCurrentIndex(idx)}
                >
                  <Text style={[styles.dppDotText, dppAnswers[q.id] && styles.dppDotTextAnswered]}>{idx + 1}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={[styles.mcqNavigation, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <TouchableOpacity 
              style={[styles.mcqNavButton, dppCurrentIndex === 0 && styles.mcqNavButtonDisabled]}
              onPress={() => setDppCurrentIndex(Math.max(0, dppCurrentIndex - 1))}
              disabled={dppCurrentIndex === 0}
            >
              <Ionicons name="chevron-back" size={18} color={dppCurrentIndex === 0 ? colors.gray300 : colors.primary} />
              <Text style={[styles.mcqNavButtonText, dppCurrentIndex === 0 && styles.mcqNavButtonTextDisabled]}>Previous</Text>
            </TouchableOpacity>

            {dppCurrentIndex < dppQuestions.length - 1 ? (
              <TouchableOpacity style={styles.mcqNavButtonNext} onPress={() => setDppCurrentIndex(dppCurrentIndex + 1)}>
                <Text style={styles.mcqNavButtonNextText}>Next</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.white} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.mcqSubmitButton} onPress={handleDppSubmit}>
                <Text style={styles.mcqSubmitButtonText}>Submit DPP</Text>
                <Ionicons name="checkmark-circle" size={18} color={colors.white} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    if (dppView === 'testing' && dppQuestions.length === 0) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.dppLoadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.dppLoadingTitle}>Loading questions...</Text>
          </View>
        </View>
      );
    }

    if (dppView === 'results') {
      const percentage = dppQuestions.length > 0 ? Math.round((dppScore / dppQuestions.length) * 100) : 0;
      const correctCount = dppScore;
      const unansweredCount = dppQuestions.filter(q => !dppAnswers[q.id]?.trim()).length;
      const incorrectCount = dppQuestions.length - correctCount - unansweredCount;
      
      return (
        <ScrollView style={styles.tabContent}>
          <View style={styles.dppResultsCard}>
            <View style={styles.dppResultsHeader}>
              <Ionicons name="trophy" size={40} color="#F59E0B" />
              <Text style={styles.dppResultsTitle}>DPP Completed!</Text>
            </View>
            
            <View style={styles.dppScoreCircle}>
              <Text style={[styles.dppScorePercent, { fontSize: 36 }]}>{percentage}%</Text>
              <Text style={styles.dppScoreValue}>{correctCount} out of {dppQuestions.length} correct</Text>
            </View>
            
            <View style={styles.dppResultsStats}>
              <View style={styles.dppResultsStat}>
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                <Text style={styles.dppResultsStatValue}>{correctCount}</Text>
                <Text style={styles.dppResultsStatLabel}>Correct</Text>
              </View>
              <View style={styles.dppResultsStat}>
                <Ionicons name="close-circle" size={20} color="#EF4444" />
                <Text style={styles.dppResultsStatValue}>{incorrectCount}</Text>
                <Text style={styles.dppResultsStatLabel}>Incorrect</Text>
              </View>
              <View style={styles.dppResultsStat}>
                <Ionicons name="remove-circle-outline" size={20} color="#6B7280" />
                <Text style={styles.dppResultsStatValue}>{unansweredCount}</Text>
                <Text style={styles.dppResultsStatLabel}>Unanswered</Text>
              </View>
            </View>
            
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity 
                style={[styles.startButtonPurple, { flex: 1, backgroundColor: '#F3F4F6' }]} 
                onPress={handleBackToDppLanding}
              >
                <Ionicons name="arrow-back" size={18} color={colors.gray700} />
                <Text style={[styles.startButtonText, { color: colors.gray700 }]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.startButtonPurple, { flex: 1 }]} 
                onPress={handleStartDpp}
              >
                <Ionicons name="refresh" size={18} color={colors.white} />
                <Text style={styles.startButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Review Your Answers</Text>
          {dppQuestions.map((q, idx) => {
            const userAnswer = dppAnswers[q.id]?.trim() || '';
            const correctAnswer = (q.correct_answer || '').trim();
            const grading = dppGradingResults[q.id];
            const isCorrect = grading?.isCorrect ?? false;
            const isUnanswered = !userAnswer;
            const qType = getQuestionType(q);
            const typeBadge = getQuestionTypeBadge(qType);
            
            return (
              <View key={q.id} style={[styles.dppReviewCard, { borderLeftWidth: 4, borderLeftColor: isUnanswered ? '#9CA3AF' : isCorrect ? '#22C55E' : '#EF4444' }]}>
                <View style={styles.dppReviewHeader}>
                  <Text style={styles.dppReviewQNum}>Q{idx + 1}</Text>
                  <View style={{ backgroundColor: typeBadge.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: typeBadge.color }}>{typeBadge.label}</Text>
                  </View>
                  <Ionicons 
                    name={isUnanswered ? 'remove-circle-outline' : isCorrect ? 'checkmark-circle' : 'close-circle'} 
                    size={20} 
                    color={isUnanswered ? '#9CA3AF' : isCorrect ? '#22C55E' : '#EF4444'} 
                  />
                </View>
                <MathText content={stripEmbeddedOptions(q.question_text, q.options)} style={styles.dppReviewQuestion} />
                
                {(qType === 'mcq' || qType === 'true_false') && (() => {
                  const opts = qType === 'true_false' 
                    ? { true: 'True', false: 'False' } 
                    : (q.options || {});
                  return Object.entries(opts).map(([key, value]) => {
                    const optText = getOptionText(value);
                    const isUserAnswer = key.toLowerCase() === userAnswer.toLowerCase();
                    const isCorrectOption = key.toLowerCase() === correctAnswer.toLowerCase();
                    return (
                      <View key={key} style={[
                        styles.dppReviewOption,
                        isCorrectOption && styles.dppReviewOptionCorrect,
                        isUserAnswer && !isCorrect && styles.dppReviewOptionWrong
                      ]}>
                        <Text style={styles.dppReviewOptionLabel}>{key.toUpperCase()}.</Text>
                        <MathText content={optText} style={styles.dppReviewOptionText} />
                        {isCorrectOption && <Ionicons name="checkmark" size={16} color="#22C55E" />}
                        {isUserAnswer && !isCorrect && <Ionicons name="close" size={16} color="#EF4444" />}
                      </View>
                    );
                  });
                })()}

                {(qType === 'integer' || qType === 'subjective') && (
                  <View style={{ marginTop: 8, gap: 6 }}>
                    <View style={{ backgroundColor: isUnanswered ? '#F9FAFB' : isCorrect ? '#FFFFFF' : '#FEF2F2', padding: 10, borderRadius: 8 }}>
                      <Text style={{ fontSize: 12, color: colors.gray500, marginBottom: 2 }}>Your Answer:</Text>
                      <Text style={{ fontSize: 14, color: isUnanswered ? colors.gray400 : colors.gray800 }}>
                        {userAnswer || '(Not answered)'}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#FFFFFF', padding: 10, borderRadius: 8 }}>
                      <Text style={{ fontSize: 12, color: colors.gray500, marginBottom: 2 }}>Correct Answer:</Text>
                      <MathText content={correctAnswer} style={{ fontSize: 14, color: '#059669' }} />
                    </View>
                  </View>
                )}
                
                {(q.explanation || q.solution) && (
                  <View style={[styles.dppExplanation, { backgroundColor: '#EFF6FF', borderLeftWidth: 3, borderLeftColor: '#3B82F6' }]}>
                    <Text style={[styles.dppExplanationLabel, { color: '#1D4ED8' }]}>Solution:</Text>
                    <MathText content={q.explanation || q.solution || ''} style={styles.dppExplanationText} />
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      );
    }

    return (
      <ScrollView style={styles.tabContent}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Ionicons name="flame" size={28} color={colors.primary} />
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.gray800 }}>Daily Practice Problems</Text>
          </View>
          <Text style={{ fontSize: 14, color: colors.gray600, marginBottom: 16 }}>
            5 random questions from this topic -- mixed types (MCQ, True/False, Numerical, Subjective)
          </Text>
          <TouchableOpacity style={styles.startButtonPurple} onPress={handleStartDpp}>
            <Ionicons name="play" size={18} color={colors.white} />
            <Text style={styles.startButtonText}>Start DPP</Text>
          </TouchableOpacity>
        </View>

        {dppPastLoading ? (
          <View style={{ alignItems: 'center', padding: 20 }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ fontSize: 13, color: colors.gray500, marginTop: 8 }}>Loading past attempts...</Text>
          </View>
        ) : dppPastAttempts.length > 0 ? (
          <View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.gray800, marginBottom: 12 }}>Past Attempts</Text>
            {dppPastAttempts.map((attempt, idx) => {
              const pct = attempt.percentage || 0;
              const pctColor = pct >= 60 ? '#059669' : '#DC2626';
              const pctBg = pct >= 60 ? '#D1FAE5' : '#FEE2E2';
              const dateStr = attempt.submitted_at 
                ? new Date(attempt.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                : '';
              return (
                <View key={attempt.id || idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F3F4F6' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: pctBg, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: pctColor }}>{pct}%</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray800 }}>
                      {attempt.score}/{attempt.total_questions} correct
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.gray500, marginTop: 2 }}>{dateStr}</Text>
                  </View>
                  <View style={{ backgroundColor: attempt.grading_status === 'graded' ? '#D1FAE5' : '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: attempt.grading_status === 'graded' ? '#059669' : '#D97706' }}>
                      {attempt.grading_status === 'graded' ? 'Graded' : 'Pending'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={{ alignItems: 'center', padding: 20 }}>
            <Ionicons name="document-text-outline" size={32} color={colors.gray300} />
            <Text style={{ fontSize: 14, color: colors.gray500, marginTop: 8 }}>No past attempts yet</Text>
          </View>
        )}
      </ScrollView>
    );
  };

  const renderNotesTab = () => (
    <NotesBookReader
      topicId={topicId}
      chapterId={routeChapterId}
      subjectId={subjectId}
      topicTitle={topicTitle || topic?.title}
    />
  );

  // Generated revision notes for this topic, served by the same notes API the
  // web app's Important Notes tab uses.
  const renderImportantNotesTab = () => (
    <ImportantNotesTab
      chapterId={routeChapterId || topic?.chapter_id}
      topicId={topicId}
      topicTitle={topicTitle || topic?.title}
    />
  );

  const renderAssignmentsTab = () => {
    // Helper function to format time
    const formatTimer = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Helper function to get assignment status
    const getAssignmentStatus = (assignment: Assignment) => {
      const submission = assignmentSubmissions[assignment.id];
      if (submission) {
        return submission.graded_at ? 'graded' : 'submitted';
      }
      // Only check overdue if there's a valid valid_until date (actual deadline field)
      if (assignment.valid_until) {
        const now = new Date();
        const validUntil = new Date(assignment.valid_until);
        // Check for valid date and not epoch date
        if (!isNaN(validUntil.getTime()) && validUntil.getFullYear() >= 2000) {
          if (now > validUntil) return 'overdue';
        }
      }
      return 'pending';
    };

    // Helper function to format date - handles ISO 8601 timestamps with timezone offsets
    const formatDueDate = (dateStr: string | null | undefined) => {
      if (!dateStr) return 'No due date';
      
      // Parse using Date.parse which handles ISO 8601 with timezone offsets
      const timestamp = Date.parse(dateStr);
      if (isNaN(timestamp)) {
        console.log('[formatDueDate] Failed to parse:', dateStr);
        return 'No due date';
      }
      
      const date = new Date(timestamp);
      // Check for epoch date (Jan 1, 1970)
      if (date.getFullYear() < 2000) {
        return 'No due date';
      }
      
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // Loading state
    if (assignmentsLoading) {
      return (
        <View style={styles.tabContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { marginTop: spacing.md }]}>Loading assignments...</Text>
        </View>
      );
    }

    // Error state
    if (assignmentsError) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.gray400} />
            <Text style={styles.emptyTitle}>{assignmentsError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchAssignments}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Loading state for viewing graded results
    if (resultsLoading) {
      return (
        <View style={styles.tabContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { marginTop: spacing.md }]}>Loading results...</Text>
        </View>
      );
    }

    // Results view
    if (assignmentView === 'results' && assignmentResult && currentAssignment) {
      const isPassed = assignmentResult.percentage >= (currentAssignment.passing_marks / currentAssignment.total_marks * 100);
      const questions = currentAssignment.questions || [];
      const correctCount = questions.filter(q => assignmentResult.answers[q.id]?.is_correct).length;
      const incorrectCount = questions.filter(q => assignmentResult.answers[q.id] && !assignmentResult.answers[q.id]?.is_correct).length;
      const unansweredCount = questions.filter(q => !assignmentResult.answers[q.id] || !assignmentResult.answers[q.id]?.text_answer).length;
      const feedbackMessage = assignmentResult.percentage >= 60 ? 'Good job!' : 'Keep practicing!';
      
      return (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backToListButton} onPress={resetAssignmentView}>
            <Ionicons name="chevron-back" size={16} color={colors.primary} />
            <Text style={styles.backToListText}>Back to Assignments</Text>
          </TouchableOpacity>

          <View style={styles.scoreCard}>
            <View style={styles.scoreCardHeader}>
              <View>
                <Text style={styles.scoreCardTitle}>Your Score</Text>
                <Text style={styles.assignmentScoreValue}>{assignmentResult.score}/{currentAssignment.total_marks}</Text>
              </View>
              <View style={[styles.scoreCircle, isPassed ? { borderColor: '#22C55E' } : { borderColor: '#EF4444' }]}>
                <Text style={[styles.scoreCircleText, isPassed ? { color: '#22C55E' } : { color: '#EF4444' }]}>
                  {assignmentResult.percentage}%
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: '#22C55E' }}>{correctCount}</Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.gray500 }}>Correct</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: '#EF4444' }}>{incorrectCount}</Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.gray500 }}>Incorrect</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: colors.gray400 }}>{unansweredCount}</Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.gray500 }}>Unanswered</Text>
              </View>
            </View>
            <View style={styles.feedbackSection}>
              <Text style={styles.feedbackLabel}>Feedback:</Text>
              <Text style={styles.feedbackText}>{assignmentResult.feedback || feedbackMessage}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm }}>
            <Text style={styles.sectionTitle}>Question Review</Text>
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full }}
              onPress={() => {
                if (currentAssignment) {
                  setAssignmentAnswers({});
                  setAssignmentFlagged({});
                  setAssignmentCurrentIndex(0);
                  setAssignmentStartTime(Date.now());
                  setAssignmentTimeRemaining(currentAssignment.duration_minutes * 60);
                  setAssignmentResult(null);
                  setAssignmentView('test');
                }
              }}
            >
              <Ionicons name="refresh" size={16} color={colors.white} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: colors.white }}>Try Again</Text>
            </TouchableOpacity>
          </View>
          
          {questions.map((q, index) => {
            const answer = assignmentResult.answers[q.id];
            const isCorrect = answer?.is_correct;
            const qType = q.type?.toLowerCase().trim() || '';
            
            return (
              <View key={q.id} style={[styles.gradedQuestionCard, { marginBottom: spacing.md }]}>
                <View style={styles.questionHeaderRow}>
                  <Text style={styles.questionNumber}>Question {index + 1}</Text>
                  <View style={[styles.marksBadge, isCorrect ? { backgroundColor: '#D1FAE5' } : { backgroundColor: '#FEE2E2' }]}>
                    <Text style={[styles.marksBadgeText, isCorrect ? { color: '#059669' } : { color: '#DC2626' }]}>
                      {answer?.marks_awarded || 0}/{q.marks} marks
                    </Text>
                  </View>
                </View>
                <MathText content={stripEmbeddedOptions(q.question || '', q.options)} style={styles.questionText} />
                
                {(qType === 'mcq' || qType === 'multiple_choice' || qType === 'single_choice' || (q.options && q.options.length > 0 && qType !== 'true_false')) && q.options && q.options.length > 0 && (
                  <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                    {q.options.map((option, optIndex) => {
                      const optionLetter = String.fromCharCode(65 + optIndex);
                      const correctAnswerText = (q.correct_answer || '').trim();
                      let isCorrectOption = correctAnswerText.toUpperCase() === optionLetter;
                      if (!isCorrectOption && /^[A-Da-d]$/.test(correctAnswerText)) {
                        const resolvedIdx = correctAnswerText.toUpperCase().charCodeAt(0) - 65;
                        isCorrectOption = resolvedIdx === optIndex;
                      }
                      const studentAnswerText = (answer?.text_answer || '').trim();
                      let isSelectedOption = studentAnswerText.toUpperCase() === optionLetter;
                      if (!isSelectedOption && /^[A-Da-d]$/.test(studentAnswerText)) {
                        const resolvedIdx = studentAnswerText.toUpperCase().charCodeAt(0) - 65;
                        isSelectedOption = resolvedIdx === optIndex;
                      }
                      
                      return (
                        <View 
                          key={optIndex}
                          style={[
                            styles.gradedOption,
                            isCorrectOption && styles.gradedOptionCorrect,
                            isSelectedOption && !isCorrectOption && styles.gradedOptionWrong,
                          ]}
                        >
                          <Text style={[
                            styles.gradedOptionText,
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
                  <View style={styles.subjectiveAnswerBox}>
                    <Text style={styles.answerLabel}>Your Answer:</Text>
                    <Text style={styles.answerText}>{answer?.text_answer || 'No answer provided'}</Text>
                    {qType === 'fill_blank' && q.correct_answer && (
                      <View style={{ marginTop: spacing.sm }}>
                        <Text style={styles.answerLabel}>Correct Answer:</Text>
                        <Text style={[styles.answerText, { color: '#22C55E' }]}>{q.correct_answer}</Text>
                      </View>
                    )}
                  </View>
                )}

                {answer?.feedback && (
                  <View style={styles.explanationBox}>
                    <Text style={styles.explanationLabel}>Feedback:</Text>
                    <Text style={styles.explanationText}>{answer.feedback}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      );
    }

    // Detail view (landing card)
    if (assignmentView === 'detail' && currentAssignment) {
      const submission = assignmentSubmissions[currentAssignment.id];
      const passingPercentage = currentAssignment.total_marks > 0 
        ? Math.round((currentAssignment.passing_marks / currentAssignment.total_marks) * 100) 
        : 40;
      
      return (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backToListButton} onPress={resetAssignmentView}>
            <Ionicons name="chevron-back" size={16} color={colors.primary} />
            <Text style={styles.backToListText}>Back to Assignments</Text>
          </TouchableOpacity>

          <View style={styles.assignmentDetailCard}>
            <Text style={styles.assignmentDetailTitle}>{currentAssignment.title}</Text>
            {currentAssignment.description ? (
              <Text style={styles.assignmentDetailDesc}>{currentAssignment.description}</Text>
            ) : null}
            
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="help-circle-outline" size={18} color={colors.gray500} />
                <Text style={styles.assignmentMetaLabel}>
                  Questions: <Text style={styles.assignmentMetaValue}>{currentAssignment.questions?.length || 0}</Text>
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="star-outline" size={18} color={colors.gray500} />
                <Text style={styles.assignmentMetaLabel}>
                  Total Marks: <Text style={styles.assignmentMetaValue}>{currentAssignment.total_marks}</Text>
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="time-outline" size={18} color={colors.gray500} />
                <Text style={styles.assignmentMetaLabel}>
                  Duration: <Text style={styles.assignmentMetaValue}>{currentAssignment.duration_minutes} minutes</Text>
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="checkmark-done-outline" size={18} color={colors.gray500} />
                <Text style={styles.assignmentMetaLabel}>
                  Passing: <Text style={styles.assignmentMetaValue}>{passingPercentage}%</Text>
                </Text>
              </View>
              {currentAssignment.valid_until && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Ionicons name="calendar-outline" size={18} color={colors.gray500} />
                  <Text style={styles.assignmentMetaLabel}>
                    Due: <Text style={styles.assignmentMetaValue}>{formatDueDate(currentAssignment.valid_until)}</Text>
                  </Text>
                </View>
              )}
            </View>

            {currentAssignment.instructions ? (
              <View style={{ marginTop: spacing.md, backgroundColor: 'rgba(43, 189, 110, 0.05)', borderRadius: borderRadius.md, padding: spacing.md }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: colors.gray700, marginBottom: spacing.xs }}>Instructions</Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.gray600, lineHeight: 20 }}>{currentAssignment.instructions}</Text>
              </View>
            ) : null}

            {submission && (
              <View style={{ marginTop: spacing.md, backgroundColor: '#FFFFFF', borderRadius: borderRadius.md, padding: spacing.md }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: '#2BBD6E', marginBottom: spacing.xs }}>Previous Attempt</Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.gray600 }}>
                  Score: {submission.score}/{currentAssignment.total_marks} ({submission.percentage}%)
                </Text>
                {submission.submitted_at && (
                  <Text style={{ fontSize: fontSize.xs, color: colors.gray400, marginTop: 2 }}>
                    Submitted: {new Date(submission.submitted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                )}
              </View>
            )}

            <TouchableOpacity 
              style={[styles.assignmentButton, { marginTop: spacing.lg }]}
              onPress={startAssignmentFromDetail}
            >
              <Text style={styles.assignmentButtonText}>
                {submission ? 'Retake Assignment' : 'Solve Assignment'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      );
    }

    // Test view
    if (assignmentView === 'test' && currentAssignment) {
      const questions = currentAssignment.questions || [];
      if (questions.length === 0) {
        return (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={colors.gray400} />
            <Text style={styles.emptyTitle}>No questions available</Text>
            <Text style={styles.emptySubtitle}>This assignment has no questions yet</Text>
            <TouchableOpacity style={styles.retryButton} onPress={resetAssignmentView}>
              <Text style={styles.retryButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        );
      }
      const currentQuestion = questions[assignmentCurrentIndex];
      // Normalize question type to lowercase for case-insensitive comparison
      const normalizedType = currentQuestion.type?.toLowerCase().trim() || '';
      const answeredCount = Object.keys(assignmentAnswers).filter(k => assignmentAnswers[k]).length;
      
      return (
        <View style={styles.tabContent}>
          {/* Timer Header */}
          <View style={styles.testHeader}>
            <View style={styles.timerContainer}>
              <Ionicons name="time-outline" size={20} color={assignmentTimeRemaining < 60 ? '#EF4444' : colors.primary} />
              <Text style={[styles.timerText, assignmentTimeRemaining < 60 && { color: '#EF4444' }]}>
                {formatTimer(assignmentTimeRemaining)}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.paletteButton}
              onPress={() => setShowAssignmentPalette(!showAssignmentPalette)}
            >
              <Ionicons name="grid-outline" size={20} color={colors.primary} />
              <Text style={styles.paletteButtonText}>{answeredCount}/{questions.length}</Text>
            </TouchableOpacity>
          </View>

          {/* Question Palette Modal */}
          {showAssignmentPalette && (
            <View style={styles.paletteOverlay}>
              <View style={styles.paletteModal}>
                <View style={styles.paletteHeader}>
                  <Text style={styles.paletteTitle}>Question Palette</Text>
                  <TouchableOpacity onPress={() => setShowAssignmentPalette(false)}>
                    <Ionicons name="close" size={24} color={colors.gray600} />
                  </TouchableOpacity>
                </View>
                <View style={styles.paletteLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
                    <Text style={styles.legendText}>Answered</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.legendText}>Flagged</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.gray300 }]} />
                    <Text style={styles.legendText}>Not Answered</Text>
                  </View>
                </View>
                <View style={styles.paletteGrid}>
                  {questions.map((q, idx) => {
                    const isAnswered = !!assignmentAnswers[q.id];
                    const isFlagged = !!assignmentFlagged[q.id];
                    const isCurrent = idx === assignmentCurrentIndex;
                    
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
                          setAssignmentCurrentIndex(idx);
                          setShowAssignmentPalette(false);
                        }}
                      >
                        <Text style={[
                          styles.paletteItemText,
                          (isAnswered || isFlagged || isCurrent) && { color: colors.white }
                        ]}>{idx + 1}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {/* Question Content */}
          <ScrollView style={styles.questionScrollView} showsVerticalScrollIndicator={false}>
            <View style={styles.questionCard}>
              <View style={styles.questionHeaderRow}>
                <Text style={styles.questionNumber}>Question {assignmentCurrentIndex + 1} of {questions.length}</Text>
                <View style={styles.questionTypeBadge}>
                  <Text style={styles.questionTypeText}>
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
                  style={[styles.flagButton, assignmentFlagged[currentQuestion.id] && styles.flagButtonActive]}
                  onPress={() => setAssignmentFlagged(prev => ({
                    ...prev,
                    [currentQuestion.id]: !prev[currentQuestion.id]
                  }))}
                >
                  <Ionicons 
                    name={assignmentFlagged[currentQuestion.id] ? 'flag' : 'flag-outline'} 
                    size={20} 
                    color={assignmentFlagged[currentQuestion.id] ? '#EF4444' : colors.gray500} 
                  />
                </TouchableOpacity>
              </View>
              
              <Text style={styles.questionMarks}>{currentQuestion.marks} mark{currentQuestion.marks > 1 ? 's' : ''}</Text>
              <MathText content={stripEmbeddedOptions(currentQuestion.question || '', currentQuestion.options)} style={styles.questionText} />
              
              {currentQuestion.image_url && (
                <Image source={{ uri: currentQuestion.image_url }} style={styles.questionImage} resizeMode="contain" />
              )}

              {/* MCQ Options — show when type is mcq/multiple_choice/single_choice OR question has options */}
              {(normalizedType === 'mcq' || normalizedType === 'multiple_choice' || normalizedType === 'single_choice' || (currentQuestion.options && currentQuestion.options.length > 0 && normalizedType !== 'true_false')) && currentQuestion.options && currentQuestion.options.length > 0 && (
                <View style={styles.optionsContainer}>
                  {currentQuestion.options.map((option, idx) => {
                    const optionLetter = String.fromCharCode(65 + idx);
                    const optText = typeof option === 'string' ? option : (option as any)?.text || String(option);
                    const isSelected = assignmentAnswers[currentQuestion.id] === optionLetter;
                    
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.assignmentOptionButton, isSelected && styles.assignmentOptionButtonSelected]}
                        onPress={() => setAssignmentAnswers(prev => ({ ...prev, [currentQuestion.id]: optionLetter }))}
                      >
                        <View style={[styles.optionCircle, isSelected && styles.optionCircleSelected]}>
                          <Text style={[styles.optionLetter, isSelected && { color: colors.white }]}>{optionLetter}</Text>
                        </View>
                        <MathText content={optText} style={{ flex: 1 }} textStyle={[styles.optionText, isSelected && { color: colors.primary, fontWeight: '600' }]} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* True/False Options */}
              {normalizedType === 'true_false' && (
                <View style={styles.trueFalseContainer}>
                  {['True', 'False'].map((option) => {
                    const isSelected = assignmentAnswers[currentQuestion.id]?.toLowerCase() === option.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[styles.trueFalseButton, isSelected && styles.trueFalseButtonSelected]}
                        onPress={() => setAssignmentAnswers(prev => ({ ...prev, [currentQuestion.id]: option }))}
                      >
                        <Text style={[styles.trueFalseText, isSelected && { color: colors.white }]}>{option}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Text Input for subjective — show when no options and type is recognized subjective */}
              {(!currentQuestion.options || currentQuestion.options.length === 0) && (normalizedType === 'short_answer' || normalizedType === 'long_answer' || normalizedType === 'application' || normalizedType === 'fill_blank' || normalizedType === 'case_study' || normalizedType === 'real_world_application' || normalizedType === 'subjective' || normalizedType === 'descriptive' || normalizedType === 'numeric' || normalizedType === 'practical') && (
                <TextInput
                  style={[
                    styles.answerInput, 
                    (normalizedType === 'long_answer' || normalizedType === 'case_study' || normalizedType === 'real_world_application' || normalizedType === 'descriptive' || normalizedType === 'subjective') && { minHeight: 150 },
                    (normalizedType === 'fill_blank' || normalizedType === 'numeric') && { minHeight: 50 }
                  ]}
                  placeholder={
                    normalizedType === 'fill_blank' ? 'Type the missing word or phrase...' :
                    normalizedType === 'short_answer' || normalizedType === 'numeric' ? 'Type your answer...' : 
                    'Type your detailed answer here...'
                  }
                  placeholderTextColor={colors.gray400}
                  multiline={normalizedType !== 'fill_blank' && normalizedType !== 'numeric'}
                  numberOfLines={normalizedType === 'long_answer' || normalizedType === 'case_study' || normalizedType === 'real_world_application' || normalizedType === 'descriptive' || normalizedType === 'subjective' ? 8 : normalizedType === 'fill_blank' || normalizedType === 'numeric' ? 1 : 4}
                  textAlignVertical={(normalizedType === 'fill_blank' || normalizedType === 'numeric') ? 'center' : 'top'}
                  value={assignmentAnswers[currentQuestion.id] || ''}
                  onChangeText={(text) => setAssignmentAnswers(prev => ({ ...prev, [currentQuestion.id]: text }))}
                />
              )}

              {/* Catch-all: if no options AND type not recognized, show generic text input */}
              {(!currentQuestion.options || currentQuestion.options.length === 0) && normalizedType !== 'true_false' && normalizedType !== 'short_answer' && normalizedType !== 'long_answer' && normalizedType !== 'application' && normalizedType !== 'fill_blank' && normalizedType !== 'case_study' && normalizedType !== 'real_world_application' && normalizedType !== 'subjective' && normalizedType !== 'descriptive' && normalizedType !== 'numeric' && normalizedType !== 'practical' && normalizedType !== 'diagram' && normalizedType !== 'mcq' && normalizedType !== 'multiple_choice' && normalizedType !== 'single_choice' && (
                <TextInput
                  style={[styles.answerInput, { minHeight: 100 }]}
                  placeholder="Type your answer here..."
                  placeholderTextColor={colors.gray400}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  value={assignmentAnswers[currentQuestion.id] || ''}
                  onChangeText={(text) => setAssignmentAnswers(prev => ({ ...prev, [currentQuestion.id]: text }))}
                />
              )}

              {/* Diagram questions - image upload placeholder */}
              {normalizedType === 'diagram' && (
                <View style={[styles.answerInput, { minHeight: 120, justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="image-outline" size={40} color={colors.gray400} />
                  <Text style={{ color: colors.gray500, marginTop: spacing.sm, textAlign: 'center' }}>
                    Diagram upload will be available soon.{'\n'}Please describe your diagram in text for now.
                  </Text>
                  <TextInput
                    style={[styles.answerInput, { marginTop: spacing.md, width: '100%' }]}
                    placeholder="Describe your diagram here..."
                    placeholderTextColor={colors.gray400}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    value={assignmentAnswers[currentQuestion.id] || ''}
                    onChangeText={(text) => setAssignmentAnswers(prev => ({ ...prev, [currentQuestion.id]: text }))}
                  />
                </View>
              )}
            </View>
          </ScrollView>

          {/* Navigation Footer */}
          <View style={[styles.testFooter, { paddingBottom: insets.bottom + spacing.sm }]}>
            <TouchableOpacity 
              style={[styles.navButton, assignmentCurrentIndex === 0 && styles.navButtonDisabled]}
              onPress={() => assignmentCurrentIndex > 0 && setAssignmentCurrentIndex(prev => prev - 1)}
              disabled={assignmentCurrentIndex === 0}
            >
              <Ionicons name="chevron-back" size={20} color={assignmentCurrentIndex === 0 ? colors.gray400 : colors.primary} />
              <Text style={[styles.navButtonText, assignmentCurrentIndex === 0 && { color: colors.gray400 }]}>Previous</Text>
            </TouchableOpacity>

            {assignmentCurrentIndex === questions.length - 1 ? (
              <TouchableOpacity 
                style={styles.submitTestButton}
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
                    <Text style={styles.submitTestButtonText}>Submit</Text>
                    <Ionicons name="checkmark-circle" size={20} color={colors.white} />
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={styles.navButton}
                onPress={() => setAssignmentCurrentIndex(prev => prev + 1)}
              >
                <Text style={styles.navButtonText}>Next</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    // Empty state
    if (assignments.length === 0) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.emptyState}>
            <Ionicons name="clipboard-outline" size={48} color={colors.gray400} />
            <Text style={styles.emptyTitle}>No Assignments Yet</Text>
            <Text style={styles.emptySubtitle}>Assignments for this {topicId ? 'topic' : 'subject'} will appear here.</Text>
            <TouchableOpacity 
              style={[styles.assignmentButton, { marginTop: spacing.md, paddingHorizontal: spacing.lg }]}
              onPress={createSelfPractice}
              disabled={selfPracticeLoading}
            >
              {selfPracticeLoading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.assignmentButtonText}>New Practice</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // List view
    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: colors.gray900 }}>Assignments</Text>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full }}
            onPress={createSelfPractice}
            disabled={selfPracticeLoading}
          >
            {selfPracticeLoading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Ionicons name="add" size={16} color={colors.white} />
                <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: colors.white }}>New Practice</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        {assignments.map((assignment) => {
          const status = getAssignmentStatus(assignment);
          const submission = assignmentSubmissions[assignment.id];
          
          return (
            <TouchableOpacity 
              key={assignment.id} 
              style={styles.assignmentCard}
              onPress={() => {
                if (status === 'graded' && submission) {
                  viewGradedResults(assignment.id, submission);
                } else {
                  openAssignmentDetail(assignment.id);
                }
              }}
            >
              <View style={[
                styles.assignmentLeftBorder,
                status === 'pending' && { backgroundColor: '#F59E0B' },
                status === 'overdue' && { backgroundColor: '#EF4444' },
                status === 'submitted' && { backgroundColor: '#3B82F6' },
                status === 'graded' && { backgroundColor: '#2BBD6E' },
              ]} />
              <View style={styles.assignmentHeader}>
                <Text style={styles.assignmentTitle}>{assignment.title}</Text>
                <View style={[
                  styles.assignmentStatusBadge,
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
                  <Text style={styles.assignmentStatusText}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Text>
                </View>
              </View>
              <Text style={styles.assignmentDesc}>{assignment.description}</Text>
              <View style={styles.assignmentMeta}>
                <Text style={styles.assignmentMetaLabel}>
                  Due: <Text style={styles.assignmentMetaValue}>{formatDueDate(assignment.valid_until)}</Text>
                </Text>
                <Text style={styles.assignmentMetaLabel}>
                  Marks: <Text style={styles.assignmentMetaValue}>{assignment.total_marks}</Text>
                </Text>
                <Text style={styles.assignmentMetaLabel}>
                  Duration: <Text style={styles.assignmentMetaValue}>{assignment.duration_minutes} min</Text>
                </Text>
              </View>
              {submission && status === 'graded' && (
                <View style={styles.scoreTag}>
                  <Text style={styles.scoreTagText}>Score: {submission.score}/{assignment.total_marks} ({submission.percentage}%)</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  // Fetch Previous Year Papers from API
  const [isPapersLoading, setIsPapersLoading] = useState(false);
  const [papersError, setPapersError] = useState<string | null>(null);
  
  // Use subjectId from route params, or fallback to topic's subject_id from API
  const effectiveSubjectId = subjectId || topic?.subject_id;
  console.log('[PYP] subjectId from route:', subjectId, 'topic?.subject_id:', topic?.subject_id, 'effectiveSubjectId:', effectiveSubjectId);
  
  useEffect(() => {
    if (activeTab === 'results') {
      console.log('[MyResults] Fetching chapter test results for chapterId:', routeChapterId);
      fetchMyResults();
    }
  }, [activeTab, isChapterMode, routeChapterId]);

  const fetchMyResults = async () => {
    if (!routeChapterId) {
      console.log('[MyResults] No chapterId available');
      return;
    }
    
    if (!user) {
      setMyResultsError('Not authenticated');
      return;
    }
    
    setMyResultsLoading(true);
    setMyResultsError(null);
    
    console.log('[MyResults] Fetching results for user:', user.id, 'chapter:', routeChapterId, 'subject:', subjectId);
    const result = await supabase.getChapterTestResults(user.id, routeChapterId, subjectId);
    
    if (result.success && result.results) {
      console.log('[MyResults] Results found:', result.results.length);
      setMyResults(result.results);
    } else {
      console.log('[MyResults] Error:', result.error);
      setMyResultsError(result.error || 'Failed to load results');
    }
    setMyResultsLoading(false);
  };

  const fetchReviewData = async (result: any) => {
    if (!user) {
      return;
    }
    
    setReviewQuestionsLoading(true);
    setReviewQuestions([]);
    setStudentAnswers([]);
    
    try {
      const paperId = result.paper_id;
      const source = result.source;
      
      console.log('[fetchReviewData] Fetching for source:', source, 'paperId:', paperId);
      
      if (source === 'paper_test_results') {
        // Fetch PYQ questions and student answers
        const [questionsResult, answersResult] = await Promise.all([
          supabase.getPreviousYearQuestions(paperId),
          supabase.getStudentAnswers(paperId, user.id),
        ]);
        
        if (questionsResult.success && questionsResult.questions) {
          setReviewQuestions(questionsResult.questions);
        }
        if (answersResult.success && answersResult.answers) {
          setStudentAnswers(answersResult.answers);
        }
      } else if (source === 'test_results') {
        // Fetch test questions via test_questions join (works for all test types including DPP)
        console.log('[fetchReviewData] Fetching test questions for test_id:', paperId);
        const questionsResult = await supabase.getTestQuestions(paperId);
        if (questionsResult.success && questionsResult.questions) {
          // Map test_questions format to our review format
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
          console.log('[fetchReviewData] Loaded', mappedQuestions.length, 'questions for review');
        } else {
          console.log('[fetchReviewData] No questions found for test_id:', paperId);
        }
      }
      // Note: DPP results come from test_results (detected by test_type='dpp' or title contains 'dpp')
      // They use the same getTestQuestions API for review
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

  const getScoreColor = (percentage: number | null) => {
    if (percentage === null) return colors.textMuted;
    if (percentage >= 70) return '#22C55E'; // Green
    if (percentage >= 40) return '#EAB308'; // Yellow
    return '#EF4444'; // Red
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
        return { label: 'Unknown', color: colors.textMuted, icon: 'help-outline' };
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  // Screen dimension listener only (no auto-toggling based on physical orientation)
  // The isLandscape state is controlled only by the rotate button
  useEffect(() => {
    const dimensionListener = Dimensions.addEventListener('change', ({ window }) => {
      setScreenDimensions({ width: window.width, height: window.height });
    });
    
    return () => {
      dimensionListener.remove();
    };
  }, []);

  // Reset simulated landscape mode when leaving AI tab
  useEffect(() => {
    if (activeTab !== 'ai' && isLandscape) {
      // Reset to normal portrait layout when leaving AI tab
      setIsLandscape(false);
    }
  }, [activeTab, isLandscape]);

  // Animate orbit rings when loading
  useEffect(() => {
    if (aiLoading || isPreloadingAudio) {
      // Reset animation values
      orbitSlowAnim.setValue(0);
      orbitMediumAnim.setValue(0);
      orbitFastAnim.setValue(0);
      
      // Start orbit animations
      const slowOrbit = Animated.loop(
        Animated.timing(orbitSlowAnim, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: true,
        })
      );
      
      const mediumOrbit = Animated.loop(
        Animated.timing(orbitMediumAnim, {
          toValue: 1,
          duration: 5000,
          useNativeDriver: true,
        })
      );
      
      const fastOrbit = Animated.loop(
        Animated.timing(orbitFastAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        })
      );
      
      // Start pulse animation for center icon
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      
      slowOrbit.start();
      mediumOrbit.start();
      fastOrbit.start();
      pulse.start();
      
      return () => {
        slowOrbit.stop();
        mediumOrbit.stop();
        fastOrbit.stop();
        pulse.stop();
      };
    }
  }, [aiLoading, isPreloadingAudio]);

  // Play welcome audio when AI tab is opened
  useEffect(() => {
    const effectiveSubjectName = resolveSubjectName();
    
    if (activeTab === 'ai' && !hasPlayedWelcomeAudio && !aiResponse && !aiLoading) {
      const welcomeMessage = `Hello! I am your ${effectiveSubjectName} AI Teacher. How may I help you today? I can answer questions about ${effectiveSubjectName}. For other subjects, please consult the respective teacher.`;
      
      // Play welcome audio with male deep voice
      Speech.speak(welcomeMessage, {
        language: 'en-IN',
        pitch: 0.85, // Lower pitch for deeper voice
        rate: 0.9, // Slightly slower for clarity
        onDone: () => {
          console.log('[AI Welcome] Welcome audio finished');
        },
        onError: (error) => {
          console.error('[AI Welcome] TTS error:', error);
        },
      });
      
      setHasPlayedWelcomeAudio(true);
    }
  }, [activeTab, hasPlayedWelcomeAudio, aiResponse, aiLoading, subjectName]);

  // Stop ALL AI audio the moment the active tab moves away from the AI tab.
  // This fires on in-screen tab switches (e.g. AI -> DPP via the sidebar), which
  // do NOT trigger the screen blur/unmount handlers because the screen stays
  // mounted and focused. We read the live `activeTab` value (via a ref of the
  // previous tab) so it works on every switch from every code path, avoiding the
  // stale-closure bug that a return-cleanup with a captured `activeTab` had.
  const prevActiveTabRef = useRef(activeTab);
  useEffect(() => {
    const previousTab = prevActiveTabRef.current;
    if (previousTab === 'ai' && activeTab !== 'ai') {
      // Stop the whole presentation chain (audio + speech + auto-advance).
      stopPresentationPlayback();
    }
    prevActiveTabRef.current = activeTab;
  }, [activeTab]);

  // Stop all AI audio when this screen loses focus (e.g. navigating to Home/Courses).
  // Navigating to a bottom-tab screen leaves this screen mounted underneath, so the
  // unmount-based cleanup never runs. A blur handler covers that gap.
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Stop the whole presentation chain (audio + speech + auto-advance) so
        // nothing keeps playing once this screen loses focus.
        stopPresentationPlayback();
      };
    }, [])
  );

  // ── Navigation gate (Task #243) ────────────────────────────────────────────
  // Intercept leaving the screen (header back, swipe back, and Android hardware
  // back all dispatch GO_BACK on a native-stack screen) when a presentation is
  // ready but the user has not started watching it. Off-topic/blocked answers and
  // still-loading questions never gate.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      const resp = aiResponseRef.current;
      const shouldGate =
        !!resp &&
        resp.blocked !== true &&
        aiRequiresConfirmationRef.current &&
        !aiPresentationStartedRef.current;

      if (!shouldGate) return; // allow navigation

      e.preventDefault();
      console.log('[AIGate] back intercepted — prompting Watch vs Discard');
      Alert.alert(
        'Your presentation is ready',
        'Your AI teacher has prepared a presentation for you. Watch it now or discard it and leave?',
        [
          {
            text: 'Discard & leave',
            style: 'destructive',
            onPress: () => {
              clearAiJob();
              navigation.dispatch(e.data.action);
            },
          },
          {
            text: 'Watch presentation',
            style: 'default',
            onPress: () => {
              acknowledgeAndWatch();
            },
          },
        ],
        { cancelable: true }
      );
    });
    return unsub;
  }, [navigation]);
  
  // Clear papers when effectiveSubjectId or topicId changes
  useEffect(() => {
    setPreviousYearPapers([]);
    setPapersError(null);
  }, [effectiveSubjectId, topicId]);
  
  const fetchPreviousYearPapers = async () => {
    console.log('[PYP] fetchPreviousYearPapers called, effectiveSubjectId:', effectiveSubjectId);
    if (!effectiveSubjectId) {
      console.log('[PYP] No effectiveSubjectId, returning early');
      return;
    }
    
    setIsPapersLoading(true);
    setPapersError(null);
    setPreviousYearPapers([]);
    
    // Determine if we're in chapter mode (no topicId) or topic mode (has topicId)
    const effectiveChapterId = routeChapterId || topic?.chapter_id;
    const isChapterLevel = !topicId && effectiveChapterId;
    
    let result;
    if (isChapterLevel) {
      // CHAPTER-LEVEL: Fetch papers where topic_id IS NULL
      console.log('[PYP] CHAPTER MODE - Calling supabase.getChapterLevelPapers with subjectId:', effectiveSubjectId, 'chapterId:', effectiveChapterId);
      result = await supabase.getChapterLevelPapers(effectiveSubjectId, effectiveChapterId);
    } else if (topicId) {
      // TOPIC-LEVEL: Fetch papers for this specific topic
      console.log('[PYP] TOPIC MODE - Calling supabase.getPreviousYearPapers with subjectId:', effectiveSubjectId, 'topicId:', topicId);
      result = await supabase.getPreviousYearPapers(effectiveSubjectId, topicId);
    } else {
      console.log('[PYP] No topicId or chapterId available, returning empty');
      setIsPapersLoading(false);
      return;
    }
    
    console.log('[PYP] API result success:', result.success, 'papers:', result.papers?.length || 0);
    
    if (result.success && result.papers) {
      console.log('[PYP] Papers found:', result.papers.length);
      setPreviousYearPapers(result.papers);
    } else {
      console.log('[PYP] Error:', result.error);
      setPapersError(result.error || 'Failed to load papers');
    }
    setIsPapersLoading(false);
  };

  // Fetch tests from tests table for Proficiency and Exam/Mock tabs
  const fetchTestsFromTestsTable = async () => {
    console.log('[Tests] fetchTestsFromTestsTable called, effectiveSubjectId:', effectiveSubjectId);
    if (!effectiveSubjectId) {
      console.log('[Tests] No effectiveSubjectId, returning early');
      return;
    }
    
    setTestsLoading(true);
    
    const effectiveChapterId = routeChapterId || topic?.chapter_id;
    
    try {
      // Fetch proficiency tests
      const proficiencyResult = await supabase.getTestsForSubject(
        effectiveSubjectId,
        ['proficiency'],
        topicId || null,
        !topicId ? effectiveChapterId : null
      );
      
      if (proficiencyResult.success && proficiencyResult.tests) {
        console.log('[Tests] Proficiency tests found:', proficiencyResult.tests.length);
        setProficiencyTests(proficiencyResult.tests);
      }
      
      // Fetch exam/mock tests
      const examResult = await supabase.getTestsForSubject(
        effectiveSubjectId,
        ['practice', 'mock', 'exam'],
        topicId || null,
        !topicId ? effectiveChapterId : null
      );
      
      if (examResult.success && examResult.tests) {
        // Filter out DPP tests - they have "DPP" in title/description and should appear in DPP tab
        const nonDppTests = examResult.tests.filter(test => {
          const searchText = `${test.title || ''} ${test.description || ''}`.toLowerCase();
          return !searchText.includes('dpp');
        });
        console.log('[Tests] Exam/Mock tests found:', examResult.tests.length, '(excluding', examResult.tests.length - nonDppTests.length, 'DPPs)');
        setExamTests(nonDppTests);
      }
    } catch (error) {
      console.error('[Tests] Error fetching tests:', error);
    }
    
    setTestsLoading(false);
  };

  const questionCountOptions = [5, 10, 15, 20, 25];
  const timeLimitOptions = [
    { label: '15 min', value: 15 },
    { label: '30 min', value: 30 },
    { label: '45 min', value: 45 },
    { label: '60 min', value: 60 },
    { label: '2 hours', value: 120 },
    { label: '3 hours', value: 180 },
    { label: 'Unlimited', value: null },
  ];

  // Load submission status for PYQ papers and tests
  const loadSubmissionStatus = async () => {
    if (!user?.id) return;
    
    try {
      // Fetch PYQ paper results
      const paperResults = await supabase.getPaperTestResults(user.id);
      if (paperResults.success && paperResults.results) {
        const papersMap = new Map<string, { percentage: number; score: number; total: number }>();
        paperResults.results.forEach((result: any) => {
          const score = result.score ?? 0;
          const total = result.total_questions ?? 1;
          const percentage = result.percentage ?? (total > 0 ? Math.round((score / total) * 100) : 0);
          papersMap.set(result.paper_id, {
            percentage: isNaN(percentage) ? 0 : percentage,
            score,
            total,
          });
        });
        setSubmittedPapers(papersMap);
        console.log('[Submission] Loaded', papersMap.size, 'PYQ paper submissions');
      }
      
      // Fetch test results (Proficiency/Test)
      const testResults = await supabase.getTestResults(user.id);
      if (testResults.success && testResults.results) {
        const testsMap = new Map<string, { percentage: number; score: number; total: number }>();
        testResults.results.forEach((result: any) => {
          const score = result.score ?? 0;
          const total = result.total_questions ?? 1;
          const percentage = result.percentage ?? (total > 0 ? Math.round((score / total) * 100) : 0);
          testsMap.set(result.test_id, {
            percentage: isNaN(percentage) ? 0 : percentage,
            score,
            total,
          });
        });
        setSubmittedTests(testsMap);
        console.log('[Submission] Loaded', testsMap.size, 'test submissions');
      }
    } catch (error) {
      console.error('[Submission] Error loading submission status:', error);
    }
  };


  const handleStartTest = () => {
    if (!selectedPaper) return;
    setShowTestConfigModal(false);
    navigation.navigate('PreviousYearTest', {
      paperId: selectedPaper.id,
      paperTitle: selectedPaper.exam_name,
      questionCount: testQuestionCount === selectedPaper.total_questions ? undefined : testQuestionCount,
      timeLimitMinutes: testTimeLimit,
    });
  };

  // Start PYQ test directly without config modal - use paper's total_questions and default time
  const handleOpenTestConfig = (paper: PreviousYearPaper) => {
    // PYQ papers: use total_questions and calculate time based on questions (1.5 min per question, min 30 min)
    const calculatedTime = Math.max(30, Math.round(paper.total_questions * 1.5));
    navigation.navigate('PreviousYearTest', {
      paperId: paper.id,
      paperTitle: paper.exam_name,
      questionCount: paper.total_questions,
      timeLimitMinutes: calculatedTime,
    });
  };

  // Start Proficiency/Test directly without config modal - use test's question_count and duration
  const handleOpenTestConfigForTest = (test: any) => {
    navigation.navigate('PreviousYearTest', {
      testId: test.id,
      testTitle: test.title,
      testType: test.test_type,
      timeLimitMinutes: test.duration_minutes || 30,
      subjectId: subjectId || topic?.subject_id,
      questionCount: test.question_count,
    });
  };

  const handleStartTestFromTestsTable = () => {
    if (!selectedTest) return;
    setShowTestConfigModal(false);
    navigation.navigate('PreviousYearTest', {
      testId: selectedTest.id,
      testTitle: selectedTest.title,
      testType: selectedTest.test_type,
      timeLimitMinutes: testTimeLimit,
      subjectId: effectiveSubjectId,
      questionCount: testQuestionCount,
    });
  };

  const renderPreviousYearTab = () => {
    if (isPapersLoading) {
      return (
        <View style={styles.previousYearContainer}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading papers...</Text>
          </View>
        </View>
      );
    }

    if (papersError) {
      return (
        <View style={styles.previousYearContainer}>
          <View style={styles.emptyPapersContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.error || '#EF4444'} />
            <Text style={styles.emptyPapersText}>{papersError}</Text>
            <TouchableOpacity 
              style={[styles.startSolveButton, { marginTop: spacing.md }]}
              onPress={fetchPreviousYearPapers}
            >
              <Ionicons name="refresh" size={16} color={colors.white} />
              <Text style={styles.startSolveButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Get data based on active category
    // PYQ: Papers from subject_previous_year_papers with paper_category = 'previous_year'
    // Proficiency: Tests from tests table with test_type = 'proficiency'
    // Test: Tests from tests table with test_type in ['practice', 'mock', 'exam']
    const filteredPapers = activePaperCategory === 'previous_year' 
      ? previousYearPapers.filter(paper => (paper.paper_category || 'previous_year') === 'previous_year')
      : [];
    
    const currentTests = activePaperCategory === 'proficiency' 
      ? proficiencyTests 
      : activePaperCategory === 'exam' 
        ? examTests 
        : [];
    
    // Get counts for each category
    const getCategoryCount = (catId: string) => {
      if (catId === 'previous_year') {
        return previousYearPapers.filter(p => (p.paper_category || 'previous_year') === 'previous_year').length;
      } else if (catId === 'proficiency') {
        return proficiencyTests.length;
      } else if (catId === 'exam') {
        return examTests.length;
      }
      return 0;
    };
    
    const currentItemCount = activePaperCategory === 'previous_year' ? filteredPapers.length : currentTests.length;
    const isShowingPapers = activePaperCategory === 'previous_year';

    return (
      <View style={styles.previousYearContainer}>
        <View style={styles.previousYearHeader}>
          <Text style={styles.previousYearTitle}>Practice & Tests</Text>
          <View style={styles.paperCountBadge}>
            <Text style={styles.paperCountText}>{currentItemCount} {isShowingPapers ? 'Papers' : 'Tests'}</Text>
          </View>
        </View>

        {/* Category Sub-Tabs */}
        <View style={styles.paperCategoryTabs}>
          {PAPER_CATEGORIES.map((cat) => {
            const count = getCategoryCount(cat.id);
            const isActive = activePaperCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.paperCategoryTab, isActive && styles.paperCategoryTabActive]}
                onPress={() => setActivePaperCategory(cat.id)}
              >
                <Ionicons 
                  name={cat.icon as any} 
                  size={16} 
                  color={isActive ? colors.primary : colors.gray500} 
                />
                <Text style={[styles.paperCategoryTabText, isActive && styles.paperCategoryTabTextActive]}>
                  {cat.label}
                </Text>
                {count > 0 && (
                  <View style={[styles.paperCategoryBadge, isActive && styles.paperCategoryBadgeActive]}>
                    <Text style={[styles.paperCategoryBadgeText, isActive && styles.paperCategoryBadgeTextActive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Loading state for tests */}
        {testsLoading && !isShowingPapers && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading tests...</Text>
          </View>
        )}

        {/* Show PYQ Papers */}
        {isShowingPapers && filteredPapers.length === 0 ? (
          <View style={styles.emptyPapersContainer}>
            <Ionicons name="document-text-outline" size={48} color={colors.gray400} />
            <Text style={styles.emptyPapersText}>
              No {PAPER_CATEGORIES.find(c => c.id === activePaperCategory)?.label || 'papers'} available
            </Text>
          </View>
        ) : isShowingPapers ? (
          <View style={styles.papersGrid}>
            {filteredPapers.map((paper) => {
              const paperSubmission = submittedPapers.get(paper.id);
              const isPaperSubmitted = !!paperSubmission;
              
              return (
                <View key={paper.id} style={{
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
                  {/* Header with icon and title */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
                    <View style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: '#FEF3C7',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}>
                      <Ionicons name="school" size={22} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.gray800, marginBottom: 2 }}>
                        {paper.exam_name}
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.gray500 }} numberOfLines={1}>
                        {paper.paper_type}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Stats row with badges */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    {isPaperSubmitted && (
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#D1FAE5',
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 20,
                      }}>
                        <Ionicons name="checkmark-circle" size={14} color="#059669" />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669', marginLeft: 4 }}>
                          {paperSubmission.percentage}%
                        </Text>
                      </View>
                    )}
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#FFFFFF',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 20,
                    }}>
                      <Ionicons name="help-circle-outline" size={14} color={colors.primary} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary, marginLeft: 4 }}>
                        {paper.total_questions} Questions
                      </Text>
                    </View>
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#DBEAFE',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 20,
                    }}>
                      <Ionicons name="calendar" size={14} color="#2563EB" />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563EB', marginLeft: 4 }}>
                        {paper.year}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Action buttons */}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {paper.pdf_url && (
                      <TouchableOpacity style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#F3F4F6',
                        paddingVertical: 12,
                        borderRadius: 12,
                        gap: 6,
                      }}>
                        <Ionicons name="download-outline" size={18} color={colors.gray700} />
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray700 }}>PDF</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity 
                      style={{
                        flex: paper.pdf_url ? 2 : 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.primary,
                        paddingVertical: 12,
                        borderRadius: 12,
                        gap: 8,
                      }}
                      onPress={() => handleOpenTestConfig(paper)}
                    >
                      <Ionicons name={isPaperSubmitted ? 'refresh' : 'play'} size={18} color={colors.white} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.white }}>
                        {isPaperSubmitted ? 'Re-attempt' : 'Start to Solve'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Show Tests from tests table (Proficiency / Test tabs) */}
        {!isShowingPapers && !testsLoading && currentTests.length === 0 ? (
          <View style={styles.emptyPapersContainer}>
            <Ionicons name="clipboard-outline" size={48} color={colors.gray400} />
            <Text style={styles.emptyPapersText}>
              No {PAPER_CATEGORIES.find(c => c.id === activePaperCategory)?.label || 'tests'} available
            </Text>
          </View>
        ) : !isShowingPapers && !testsLoading ? (
          <View style={styles.papersGrid}>
            {currentTests.map((test) => {
              const testSubmission = submittedTests.get(test.id);
              const isTestSubmitted = !!testSubmission;
              const questionCount = test.question_count || test.total_marks || 0;
              
              return (
                <View key={test.id} style={{
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
                  {/* Header with icon and title */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
                    <View style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: '#FFFFFF',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}>
                      <Ionicons 
                        name={test.test_type === 'proficiency' ? 'trophy' : 'clipboard'} 
                        size={22} 
                        color={colors.primary} 
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.gray800, marginBottom: 2 }}>
                        {test.title}
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.gray500 }} numberOfLines={1}>
                        {test.description || (test.test_type === 'proficiency' ? 'Proficiency Test' : 'Practice Test')}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Stats row with badges */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    {isTestSubmitted && (
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#D1FAE5',
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 20,
                      }}>
                        <Ionicons name="checkmark-circle" size={14} color="#059669" />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669', marginLeft: 4 }}>
                          {testSubmission.percentage}%
                        </Text>
                      </View>
                    )}
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#FFFFFF',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 20,
                    }}>
                      <Ionicons name="help-circle-outline" size={14} color={colors.primary} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary, marginLeft: 4 }}>
                        {questionCount} Questions
                      </Text>
                    </View>
                    {test.duration_minutes && (
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#FEF3C7',
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 20,
                      }}>
                        <Ionicons name="time-outline" size={14} color="#D97706" />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#D97706', marginLeft: 4 }}>
                          {test.duration_minutes} min
                        </Text>
                      </View>
                    )}
                    {test.total_marks && (
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#DBEAFE',
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 20,
                      }}>
                        <Ionicons name="star" size={14} color="#2563EB" />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563EB', marginLeft: 4 }}>
                          {test.total_marks} Marks
                        </Text>
                      </View>
                    )}
                  </View>
                  
                  {/* Action button */}
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
                    onPress={() => handleOpenTestConfigForTest(test)}
                  >
                    <Ionicons name={isTestSubmitted ? 'refresh' : 'play'} size={18} color={colors.white} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.white }}>
                      {isTestSubmitted ? 'Re-attempt' : 'Start Test'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : null}

        <Modal
          visible={showTestConfigModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowTestConfigModal(false)}
        >
          <View style={styles.testConfigModalOverlay}>
            <View style={styles.testConfigModal}>
              <View style={styles.testConfigHeader}>
                <Text style={styles.testConfigTitle}>
                  {selectedPaper ? selectedPaper.exam_name : selectedTest?.title}
                </Text>
                <TouchableOpacity onPress={() => setShowTestConfigModal(false)} style={styles.closeModalButton}>
                  <Ionicons name="close-circle-outline" size={28} color={colors.gray400} />
                </TouchableOpacity>
              </View>

              <View style={styles.testConfigSection}>
                <Text style={styles.testConfigLabel}>Number of Questions</Text>
                <Text style={styles.testConfigSubLabel}>
                  {selectedPaper ? selectedPaper.total_questions : selectedTest?.question_count || '?'} questions available
                </Text>
                <View style={styles.optionsRow}>
                  {questionCountOptions.map((count) => (
                    <TouchableOpacity
                      key={count}
                      style={[
                        styles.optionButton,
                        testQuestionCount === count && styles.optionButtonActive,
                      ]}
                      onPress={() => setTestQuestionCount(count)}
                    >
                      <Text style={[
                        styles.optionButtonText,
                        testQuestionCount === count && styles.optionButtonTextActive,
                      ]}>{count}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[
                      styles.optionButton,
                      styles.optionButtonWide,
                      testQuestionCount === (selectedPaper?.total_questions || selectedTest?.question_count || 0) && styles.optionButtonActive,
                    ]}
                    onPress={() => setTestQuestionCount(selectedPaper?.total_questions || selectedTest?.question_count || 10)}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      testQuestionCount === (selectedPaper?.total_questions || selectedTest?.question_count || 0) && styles.optionButtonTextActive,
                    ]}>All ({selectedPaper?.total_questions || selectedTest?.question_count})</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.testConfigSection}>
                <Text style={styles.testConfigLabel}>Time Limit</Text>
                <View style={styles.optionsRow}>
                  {timeLimitOptions.map((option) => (
                    <TouchableOpacity
                      key={option.label}
                      style={[
                        styles.optionButton,
                        testTimeLimit === option.value && styles.optionButtonActive,
                      ]}
                      onPress={() => setTestTimeLimit(option.value)}
                    >
                      <Text style={[
                        styles.optionButtonText,
                        testTimeLimit === option.value && styles.optionButtonTextActive,
                      ]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity 
                style={styles.startTestButton} 
                onPress={selectedPaper ? handleStartTest : handleStartTestFromTestsTable}
              >
                <Ionicons name="play" size={20} color={colors.white} />
                <Text style={styles.startTestButtonText}>Start Test</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  // MY RESULTS TAB (chapter-level only)
  const renderMyResultsTab = () => {
    if (myResultsLoading) {
      return (
        <View style={styles.previousYearContainer}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading your results...</Text>
          </View>
        </View>
      );
    }

    if (myResultsError) {
      return (
        <View style={styles.previousYearContainer}>
          <View style={styles.emptyPapersContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.error || '#EF4444'} />
            <Text style={styles.emptyPapersText}>{myResultsError}</Text>
            <TouchableOpacity 
              style={[styles.startSolveButton, { marginTop: spacing.md }]}
              onPress={fetchMyResults}
            >
              <Ionicons name="refresh" size={16} color={colors.white} />
              <Text style={styles.startSolveButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.previousYearContainer}>
        <View style={styles.previousYearHeader}>
          <Text style={styles.previousYearTitle}>My Results</Text>
          <View style={styles.paperCountBadge}>
            <Text style={styles.paperCountText}>{myResults.length} Tests</Text>
          </View>
        </View>

        {myResults.length === 0 ? (
          <View style={styles.emptyPapersContainer}>
            <Ionicons name="trophy-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyPapersText}>No test results yet</Text>
            <Text style={[styles.emptyPapersText, { fontSize: 14, marginTop: 4 }]}>
              Complete some tests in Practice & Tests to see your results here
            </Text>
          </View>
        ) : (
          <View style={styles.papersList}>
            {myResults.map((result) => {
              const statusBadge = getGradingStatusBadge(result.grading_status);
              const scoreColor = getScoreColor(result.percentage);
              const categoryLabel = result.paper_category?.replace('_', ' ').toUpperCase() || 'TEST';
              
              // Get icon and color based on category
              const getCategoryStyle = () => {
                switch(result.paper_category) {
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
              const catStyle = getCategoryStyle();
              
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
                  {/* Header with icon, title, and score */}
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
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.gray800, marginBottom: 4 }} numberOfLines={2}>
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
                    {/* Score display */}
                    <View style={{
                      alignItems: 'center',
                      backgroundColor: scoreColor === '#22C55E' ? '#D1FAE5' : scoreColor === '#F59E0B' ? '#FEF3C7' : '#FEE2E2',
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

                  {/* Stats row with pill badges */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 14, marginBottom: 14 }}>
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#F3F4F6',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 20,
                    }}>
                      <Ionicons name="calendar-outline" size={14} color={colors.gray500} />
                      <Text style={{ fontSize: 12, fontWeight: '500', color: colors.gray600, marginLeft: 4 }}>
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
                      <Ionicons name="time-outline" size={14} color={colors.gray500} />
                      <Text style={{ fontSize: 12, fontWeight: '500', color: colors.gray600, marginLeft: 4 }}>
                        {formatDuration(result.time_taken_seconds)}
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
                      <Ionicons name="help-circle-outline" size={14} color={colors.gray500} />
                      <Text style={{ fontSize: 12, fontWeight: '500', color: colors.gray600, marginLeft: 4 }}>
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

                  {/* Review button */}
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

        {/* Review Modal */}
        <Modal visible={showReviewModal} animationType="slide" transparent>
          <View style={styles.testConfigModalOverlay}>
            <View style={[styles.testConfigModal, { maxHeight: '90%' }]}>
              <View style={styles.testConfigHeader}>
                <Text style={styles.testConfigTitle}>Test Review</Text>
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
                  {/* Score Summary */}
                  <View style={[styles.paperCard, { marginBottom: spacing.md }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <Text style={styles.paperTitle}>{selectedResult.paper?.exam_name || 'Test'}</Text>
                        <Text style={styles.paperSubtitle}>
                          Submitted {selectedResult.submitted_at ? new Date(selectedResult.submitted_at).toLocaleDateString() : 'N/A'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={[styles.paperTitle, { fontSize: 32, color: getScoreColor(selectedResult.percentage) }]}>
                          {selectedResult.percentage !== null ? `${Math.round(selectedResult.percentage)}%` : 'N/A'}
                        </Text>
                        <Text style={styles.paperSubtitle}>
                          {selectedResult.score}/{selectedResult.total_questions} correct
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.paperStats, { marginTop: spacing.md }]}>
                      <View style={styles.paperStatItem}>
                        <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                        <Text style={styles.paperStatText}>
                          Time: {formatDuration(selectedResult.time_taken_seconds)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Questions Review */}
                  {reviewQuestionsLoading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={styles.loadingText}>Loading questions...</Text>
                    </View>
                  ) : (
                    <View>
                      <Text style={[styles.paperTitle, { marginBottom: spacing.sm }]}>Questions Review</Text>
                      {reviewQuestions.map((question, index) => {
                        const userAnswer = selectedResult.answers?.[question.id];
                        const studentAnswer = studentAnswers.find(a => a.question_id === question.id);
                        const isCorrect = userAnswer && question.correct_answer && 
                          userAnswer.toString().toLowerCase().trim() === question.correct_answer.toString().toLowerCase().trim();
                        const hasImageAnswer = !!studentAnswer?.answer_image_url;
                        const showClearDoubt = !isCorrect && selectedResult.percentage !== null && selectedResult.percentage <= 50;
                        
                        let borderColor = colors.border;
                        let statusText = 'Not Answered';
                        let statusColor = colors.textMuted;
                        let statusIcon = 'remove-circle-outline';
                        
                        if (!userAnswer && !hasImageAnswer) {
                          borderColor = colors.border;
                          statusText = 'Not Answered';
                          statusColor = colors.textMuted;
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

                        // Handle Clear Doubt navigation
                        const handleClearDoubt = () => {
                          setShowReviewModal(false);
                          setActiveTab('ai');
                          // The AI assistant will receive context about this question
                          setTimeout(() => {
                            // Auto-populate the AI chat with the question context
                            const doubtContext = `I need help understanding this question:\n\n"${question.question_text}"\n\nMy answer was: ${userAnswer || 'Not answered'}\nCorrect answer: ${question.correct_answer}\n\nPlease explain why my answer was wrong and help me understand the correct solution.`;
                            setAiMessage(doubtContext);
                          }, 300);
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
                            borderColor: colors.border,
                          }}>
                            {/* Question header with number and status */}
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
                                    backgroundColor: question.difficulty === 'easy' ? '#D1FAE5' : question.difficulty === 'hard' ? '#FEE2E2' : '#FEF3C7',
                                    paddingHorizontal: 8,
                                    paddingVertical: 2,
                                    borderRadius: 10,
                                  }}>
                                    <Text style={{
                                      fontSize: 10,
                                      fontWeight: '600',
                                      color: question.difficulty === 'easy' ? '#059669' : question.difficulty === 'hard' ? '#DC2626' : '#D97706',
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
                            
                            {/* Question text with MathText support */}
                            <View style={{ marginBottom: spacing.sm }}>
                              <MathText 
                                content={question.question_text || ''} 
                                style={{ }} 
                                textStyle={{ fontSize: 14, lineHeight: 22 }}
                                color={colors.text}
                              />
                            </View>
                            
                            {/* Image answer if present */}
                            {hasImageAnswer && studentAnswer?.answer_image_url && (
                              <View style={{ marginBottom: spacing.sm }}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray500, marginBottom: 4 }}>Your Image Answer:</Text>
                                <Image 
                                  source={{ uri: studentAnswer.answer_image_url }} 
                                  style={{ width: '100%', height: 150, borderRadius: 8 }}
                                  resizeMode="contain"
                                />
                              </View>
                            )}
                            
                            {/* Answer comparison */}
                            <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: spacing.sm }}>
                              {userAnswer && (
                                <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray500, width: 100 }}>Your Answer:</Text>
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
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray500, width: 100 }}>Correct:</Text>
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
                            
                            {/* Explanation */}
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
                            
                            {/* Clear Doubt Button - shows for incorrect answers when score <= 50% */}
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
      </View>
    );
  };

  const renderDoubtsTab = () => {
    const effectiveSubjectId = subjectId || topic?.subject_id;
    if (!effectiveSubjectId) {
      return (
        <View style={styles.tabContent}>
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.textLight} />
            <Text style={{ fontSize: fontSize.sm, color: colors.textLight, marginTop: 8, textAlign: 'center' }}>
              No subject selected.
            </Text>
          </View>
        </View>
      );
    }
    const doubtsOnBeforeSend = isPreview && previewCourseId
      ? async () => {
          const { getQuotaCount, incrementQuota } = require('../utils/previewQuota');
          const used = await getQuotaCount(previewCourseId, 'Doubts');
          if (used >= previewDoubtsLimit) {
            const { Alert } = require('react-native');
            Alert.alert(
              'Preview Limit Reached',
              `You've used all ${previewDoubtsLimit} free doubt questions. Enroll in the course to ask unlimited questions.`,
              [
                { text: 'Dismiss', style: 'cancel' },
                { text: 'Buy Course', onPress: () => navigation.navigate('ViewCourse', { courseId: previewCourseId }) },
              ]
            );
            return false;
          }
          await incrementQuota(previewCourseId, 'Doubts');
          return true;
        }
      : undefined;

    return (
      <DoubtsTab
        subjectId={effectiveSubjectId}
        subjectName={subjectName}
        studentId={user?.id}
        onBeforeSend={doubtsOnBeforeSend}
      />
    );
  };

  const renderPyqsTab = () => {
    const effectiveSubjectId = subjectId || topic?.subject_id;
    return <PYQTab subjectId={effectiveSubjectId} />;
  };

  const renderReelsTab = () => {
    const effectiveChapterId = routeChapterId || topic?.chapter_id;
    return <ReelsTab topicId={topicId} chapterId={effectiveChapterId} />;
  };

  const renderSolutionsTab = () => {
    if (solutionsLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading solutions...</Text>
        </View>
      );
    }

    if (solutionsError) {
      return (
        <View style={styles.solutionsEmpty}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.gray400} />
          <Text style={styles.solutionsEmptyText}>{solutionsError}</Text>
          <TouchableOpacity style={styles.solutionsRetryBtn} onPress={fetchSolutions} testID="button-solutions-retry">
            <Text style={styles.solutionsRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!solutionsItems.length) {
      return (
        <View style={styles.solutionsEmpty}>
          <Ionicons name="bulb-outline" size={48} color={colors.gray400} />
          <Text style={styles.solutionsEmptyText}>No questions available for this topic yet.</Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.solutionsContainer} contentContainerStyle={styles.solutionsContentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.solutionsHeader}>
          <Text style={styles.solutionsTitle}>Solutions</Text>
          <Text style={styles.solutionsSubtitle}>Browse questions and watch AI presentations</Text>
        </View>
        {solutionsItems.map((q, idx) => {
          const expanded = solutionsExpandedId === q.id;
          const hasCache = solutionsCachedIds.has(q.id);
          const isLoadingThis = solutionsPlayingId === q.id;
          const options = q.options || {};
          const diff = (q.difficulty || '').toString();
          return (
            <View key={q.id} style={styles.solutionCard} testID={`card-solution-${q.id}`}>
              <TouchableOpacity
                style={styles.solutionCardHeader}
                activeOpacity={0.7}
                onPress={() => setSolutionsExpandedId(expanded ? null : q.id)}
                testID={`button-solution-toggle-${q.id}`}
              >
                <View style={styles.solutionQNumBadge}>
                  <Text style={styles.solutionQNumText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <MathText content={stripEmbeddedOptions(q.question_text, q.options)} style={styles.solutionQuestionText} />
                  <View style={styles.solutionChipsRow}>
                    {!!diff && (
                      <View style={styles.solutionChip}>
                        <Text style={styles.solutionChipText}>{diff}</Text>
                      </View>
                    )}
                    <View style={styles.solutionChip}>
                      <Text style={styles.solutionChipText}>{q.marks ?? 0} marks</Text>
                    </View>
                    {hasCache && (
                      <TouchableOpacity
                        style={styles.solutionReadyPill}
                        onPress={() => handlePlaySolution(q)}
                        disabled={isLoadingThis}
                        testID={`button-solution-ready-${q.id}`}
                      >
                        {isLoadingThis ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="sparkles" size={11} color="#fff" />
                            <Text style={styles.solutionReadyPillText}>Watch Answer</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.gray400} />
              </TouchableOpacity>

              {expanded && (
                <View style={styles.solutionCardBody}>
                  {q.question_image_url && (
                    <Image source={{ uri: q.question_image_url }} style={styles.questionImage} resizeMode="contain" />
                  )}
                  {Object.keys(options).length > 0 ? (
                    Object.entries(options).map(([key, value]) => {
                      const isCorrect = (q.correct_answer || '').toLowerCase() === key.toLowerCase();
                      return (
                        <View key={key} style={[styles.mcqOption, isCorrect && styles.mcqOptionCorrect]}>
                          <Text style={styles.mcqOptionLabel}>{key.toUpperCase()}.</Text>
                          <MathText content={getOptionText(value)} style={styles.mcqOptionText} />
                          {isCorrect && <Ionicons name="checkmark" size={16} color="#22C55E" style={{ marginLeft: 'auto' }} />}
                        </View>
                      );
                    })
                  ) : (
                    <View style={styles.correctAnswerBox}>
                      <Text style={styles.correctAnswerLabel}>Correct Answer:</Text>
                      <MathText content={q.correct_answer || ''} style={styles.correctAnswerText} />
                    </View>
                  )}

                  {hasCache && (
                    <TouchableOpacity
                      style={styles.solutionPlayBtn}
                      onPress={() => handlePlaySolution(q)}
                      disabled={isLoadingThis}
                      testID={`button-solution-play-${q.id}`}
                    >
                      {isLoadingThis ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="play-circle" size={18} color="#fff" />
                          <Text style={styles.solutionPlayBtnText}>Watch AI Presentation</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'videos': return renderVideosTab();
      case 'ai': return renderAiTab();
      case 'notes': return renderNotesTab();
      case 'important-notes': return renderImportantNotesTab();
      case 'questions': return renderQuestionsTab();
      case 'solutions': return renderSolutionsTab();
      case 'dpp': return renderDppTab();
      case 'assignments': return renderAssignmentsTab();
      case 'pyqs': return renderPyqsTab();
      case 'results': return renderMyResultsTab();
      case 'doubts': return renderDoubtsTab();
      case 'reels': return renderReelsTab();
      default: return null;
    }
  };

  return (
    <View style={styles.container}>
      {isPlaying && <KeepScreenAwake />}
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
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {topicTitle || topic?.title || (isChapterMode ? 'Chapter Content' : 'Topic Details')}
          </Text>
          {isPreview ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Free Preview</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.headerSubtitle}>
              {isChapterMode 
                ? (subjectName ? `${subjectName} - Chapter ${chapterNumber || 1}` : `Chapter ${chapterNumber || 1}`)
                : `Chapter ${chapterNumber || 1}.${topicNumber || topic?.topic_number || 1}`
              }
            </Text>
          )}
        </View>
        {isPreview && (
          <TouchableOpacity
            onPress={() => navigation.navigate('ViewCourse', { courseId: previewCourseId! })}
            style={{ backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginLeft: 8 }}
          >
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Buy Course</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      {activeTab === 'doubts' || activeTab === 'reels' || activeTab === 'ai' || activeTab === 'notes' || activeTab === 'important-notes' ? (
        <View style={[styles.content, { flex: 1 }]}>
          {renderContent()}
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {renderContent()}
        </ScrollView>
      )}

      <Modal visible={sidebarOpen} transparent animationType="fade">
        <View style={styles.sidebarOverlay}>
          <LinearGradient
            colors={[colors.primary, '#4ADE80', '#34D07B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.sidebar}
          >
            <View style={styles.sidebarHeader}>
              <View style={styles.sidebarHeaderContent}>
                <View style={styles.sidebarIconContainer}>
                  <Ionicons name="library" size={16} color={colors.primary} />
                </View>
                <View style={styles.sidebarHeaderText}>
                  <Text style={styles.sidebarTitle}>Learning Sections</Text>
                  <Text style={styles.sidebarSubtitle}>Tap to jump to a section</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.sidebarCloseButton} onPress={() => setSidebarOpen(false)}>
                <Ionicons name="close" size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.sidebarScroll}
              contentContainerStyle={styles.sidebarContent}
              showsVerticalScrollIndicator={false}
            >
              {TABS.filter((tab) => {
                if (tab.id === 'dpp' && isChapterMode) return false;
                return true;
              }).map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
                    activeOpacity={0.7}
                    onPress={() => handleTabSelect(tab.id)}
                  >
                    <View style={[styles.sidebarItemIcon, isActive && styles.sidebarItemIconActive]}>
                      <Ionicons
                        name={tab.icon as any}
                        size={16}
                        color={isActive ? colors.primary : colors.white}
                      />
                    </View>
                    <Text style={[styles.sidebarItemText, isActive && styles.sidebarItemTextActive]}>
                      {tab.label}
                    </Text>
                    {isActive ? (
                      <Ionicons name="checkmark-circle" size={16} color={colors.white} style={{ marginLeft: 'auto' }} />
                    ) : (
                      <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.45)" style={{ marginLeft: 'auto' }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </LinearGradient>
          <Pressable style={styles.sidebarBackdrop} onPress={() => setSidebarOpen(false)} />
        </View>
      </Modal>

      <Modal
        visible={isPresentationFullscreen && aiResponse !== null}
        animationType="slide"
        supportedOrientations={['portrait', 'landscape']}
        statusBarTranslucent={true}
        presentationStyle="fullScreen"
        onRequestClose={() => {
          stopPresentationPlayback();
          setIsPresentationFullscreen(false);
          setAiResponse(null);
          setCurrentSlideIndex(0);
          setAudioProgress(0);
          setAudioDuration(0);
        }}
      >
        <Pressable 
          style={styles.fullscreenPresentationContainer}
          onPress={handleFullscreenTap}
        >
          {aiResponse && aiResponse.presentationSlides[currentSlideIndex] && (
            isActualLandscape ? (
              // Landscape layout - 3-column design
              <View style={styles.fullscreenLandscapeLayout}>
                {/* Left column - Formula & Key Points */}
                <View style={styles.fullscreenLandscapeLeft}>
                  {/* Formula at top - rendered with LaTeX */}
                  {aiResponse.presentationSlides[currentSlideIndex].formula && (
                    <View style={styles.fullscreenLandscapeFormulaTop}>
                      <Text style={styles.fullscreenLandscapeFormulaLabel}>FORMULA</Text>
                      <MathText 
                        content={aiResponse.presentationSlides[currentSlideIndex].formula}
                        mathOnly
                        color={colors.white}
                      />
                    </View>
                  )}
                  
                  <Text style={styles.fullscreenLandscapeColumnTitle}>KEY POINTS</Text>
                  <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                    {aiResponse.presentationSlides[currentSlideIndex].keyPoints.slice(0, 5).map((point, index) => (
                      <View key={index} style={styles.fullscreenLandscapeKeyPoint}>
                        <View style={styles.fullscreenLandscapeKeyPointBullet}>
                          <Text style={styles.fullscreenLandscapeKeyPointNumber}>{index + 1}</Text>
                        </View>
                        <Text style={styles.fullscreenLandscapeKeyPointText} numberOfLines={3}>{point}</Text>
                      </View>
                    ))}
                    {aiResponse.presentationSlides[currentSlideIndex].keyPoints.length > 5 && (
                      <Text style={styles.fullscreenLandscapeMorePoints}>
                        +{aiResponse.presentationSlides[currentSlideIndex].keyPoints.length - 5} more
                      </Text>
                    )}
                  </ScrollView>
                </View>
                
                {/* Center column - Manim video or Image/Content */}
                <View style={styles.fullscreenLandscapeCenter}>
                  {aiResponse.presentationSlides[currentSlideIndex].manimVideoUrl ? (
                    <View style={styles.fullscreenLandscapeImageWrapper}>
                      {renderManimVideo(aiResponse.presentationSlides[currentSlideIndex].manimVideoUrl!, {
                        width: Math.max(windowWidth - 400 - 16, 200),
                        height: Math.max(windowHeight - 40, 200),
                        borderRadius: 12,
                      })}
                    </View>
                  ) : aiResponse.presentationSlides[currentSlideIndex].infographicUrl ? (
                    <TouchableOpacity 
                      onPress={() => setFullscreenImage(aiResponse.presentationSlides[currentSlideIndex].infographicUrl)}
                      activeOpacity={0.9}
                      style={styles.fullscreenLandscapeImageWrapper}
                    >
                      <Image 
                        source={{ uri: resolveSlideImageUri(aiResponse.presentationSlides[currentSlideIndex].infographicUrl) }}
                        style={{
                          width: Math.max(windowWidth - 400 - 16, 200),
                          height: Math.max(windowHeight - 40, 200),
                          borderRadius: 12,
                        }}
                        resizeMode="contain"
                        onLoadStart={() => setImageLoadingSlide(currentSlideIndex)}
                        onError={(e) => { setImageLoadingSlide((prev) => (prev === currentSlideIndex ? null : prev)); console.log('[Landscape Image] Error:', e.nativeEvent.error); }}
                        onLoad={() => { setImageLoadingSlide((prev) => (prev === currentSlideIndex ? null : prev)); console.log('[Landscape Image] Loaded successfully'); }}
                      />
                      {imageLoadingSlide === currentSlideIndex && (
                        <View style={styles.slideImageLoadingOverlay} pointerEvents="none">
                          <ActivityIndicator size="large" color={colors.primary} />
                        </View>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.fullscreenLandscapeNoImage}>
                      <LinearGradient
                        colors={['rgba(43, 189, 110, 0.1)', 'rgba(74, 222, 128, 0.15)']}
                        style={styles.fullscreenLandscapeNoImageGradient}
                      >
                        <Ionicons name="sparkles" size={48} color={colors.primary} />
                        <Text style={styles.fullscreenLandscapeNoImageText}>AI Presentation</Text>
                      </LinearGradient>
                    </View>
                  )}
                  
                </View>
                
                {/* Right column - Narration */}
                <View style={styles.fullscreenLandscapeRight}>
                  <View style={styles.fullscreenLandscapeNarrationHeader}>
                    <Ionicons name="chatbubble-ellipses" size={14} color={colors.primary} />
                    <Text style={styles.fullscreenLandscapeColumnTitle}>NARRATION</Text>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false} style={styles.fullscreenLandscapeNarrationScroll}>
                    {narrationSentences[currentLineIndex] ? (
                      <Text style={styles.fullscreenLandscapeNarrationText}>
                        {narrationSentences[currentLineIndex]}
                      </Text>
                    ) : (
                      <Text style={styles.fullscreenLandscapeNoNarration}>No narration available</Text>
                    )}
                  </ScrollView>
                  
                  {/* Avatar and Speaking indicator */}
                  <View style={styles.fullscreenLandscapeAvatarSpeakingRow}>
                    {aiAvatar?.image_url && (
                      <Animated.View style={[
                        styles.fullscreenLandscapeAvatarContainer,
                        isSpeaking && { transform: [{ scale: 1.05 }] }
                      ]}>
                        <Image 
                          source={{ uri: aiAvatar.image_url }} 
                          style={styles.fullscreenLandscapeAvatarImage}
                        />
                        {isSpeaking && <View style={styles.fullscreenLandscapeSpeakingDot} />}
                      </Animated.View>
                    )}
                    {isSpeaking && (
                      <View style={styles.fullscreenLandscapeSpeakingIndicator}>
                        <View style={styles.fullscreenLandscapeSpeakingWave}>
                          <View style={[styles.fullscreenLandscapeSpeakingBar, { height: 8 }]} />
                          <View style={[styles.fullscreenLandscapeSpeakingBar, { height: 14 }]} />
                          <View style={[styles.fullscreenLandscapeSpeakingBar, { height: 10 }]} />
                          <View style={[styles.fullscreenLandscapeSpeakingBar, { height: 16 }]} />
                          <View style={[styles.fullscreenLandscapeSpeakingBar, { height: 12 }]} />
                        </View>
                        <Text style={styles.fullscreenLandscapeSpeakingText}>Speaking...</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ) : (
              // Portrait layout - compact lecture-player style
              <View style={{ flex: 1, backgroundColor: '#fff' }}>
                <View style={styles.aiPortraitPlayer}>
                  <View style={styles.aiPortraitHeader}>
                    <TouchableOpacity
                      onPress={() => {
                        stopPresentationPlayback();
                        setIsPresentationFullscreen(false);
                        setAiResponse(null);
                        setCurrentSlideIndex(0);
                        setAudioProgress(0);
                        setAudioDuration(0);
                      }}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="close" size={18} color="#e5e7eb" />
                    </TouchableOpacity>
                    <Text style={[styles.aiPortraitHeaderTitle, { marginLeft: 8 }]} numberOfLines={1}>
                      {aiResponse.presentationSlides[currentSlideIndex].title}
                    </Text>
                    <View style={styles.aiPortraitHeaderBadge}>
                      <Text style={styles.aiPortraitHeaderBadgeText}>{currentSlideIndex + 1} / {aiResponse.presentationSlides.length}</Text>
                    </View>
                  </View>

                  <View style={styles.aiPortraitStage}>
                    {(() => {
                      const fsSlide = aiResponse.presentationSlides[currentSlideIndex];
                      const fsImages: string[] = [];
                      if (fsSlide.infographicUrl) fsImages.push(fsSlide.infographicUrl);
                      if (fsSlide.images && Array.isArray(fsSlide.images)) fsImages.push(...fsSlide.images);
                      const fsGetUri = (url: string) => resolveSlideImageUri(url);

                      return (
                        <>
                          {fsSlide.manimVideoUrl ? (
                            <View style={styles.aiPortraitStageImage}>
                              {renderManimVideo(fsSlide.manimVideoUrl, styles.aiPortraitDiagramImg)}
                            </View>
                          ) : fsImages.length > 0 ? (
                            <TouchableOpacity style={styles.aiPortraitStageImage} onPress={() => setFullscreenImage(fsImages[0])} activeOpacity={0.9}>
                              <Image
                                source={{ uri: fsGetUri(fsImages[0]) }}
                                style={styles.aiPortraitDiagramImg}
                                resizeMode="contain"
                                onLoadStart={() => setImageLoadingSlide(currentSlideIndex)}
                                onLoad={() => setImageLoadingSlide((prev) => (prev === currentSlideIndex ? null : prev))}
                                onError={() => setImageLoadingSlide((prev) => (prev === currentSlideIndex ? null : prev))}
                              />
                              {imageLoadingSlide === currentSlideIndex && (
                                <View style={styles.slideImageLoadingOverlay} pointerEvents="none">
                                  <ActivityIndicator size="large" color={colors.primary} />
                                </View>
                              )}
                              {fsImages.length > 1 && (
                                <View style={styles.aiPortraitImageCount}>
                                  <Text style={styles.aiPortraitImageCountText}>1/{fsImages.length}</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.aiPortraitStagePlaceholder}>
                              <Ionicons name="sparkles" size={40} color="rgba(43, 189, 110, 0.6)" />
                            </View>
                          )}

                          {aiAvatar?.image_url && (
                            <View style={styles.aiPortraitStageAvatar}>
                              <Image source={{ uri: aiAvatar.image_url }} style={styles.aiPortraitAvatarImg} />
                              {isSpeaking && <View style={styles.aiPortraitAvatarDot} />}
                            </View>
                          )}

                          {isSpeaking && narrationSentences[currentLineIndex] && (
                            <View style={styles.aiPortraitStageSubtitle}>
                              <Text style={styles.aiPortraitSubtitleText} numberOfLines={2}>
                                {narrationSentences[currentLineIndex]}
                              </Text>
                            </View>
                          )}
                        </>
                      );
                    })()}
                  </View>

                  <View style={styles.aiPortraitControls}>
                    <Text style={styles.aiPortraitTimeText}>{formatTime(audioProgress)}</Text>
                    <AudioScrubber
                      positionMillis={audioProgress}
                      durationMillis={audioDuration}
                      onSeekStart={handleScrubStart}
                      onSeekMove={handleScrubMove}
                      onSeekEnd={handleScrubEnd}
                      trackStyle={styles.aiPortraitSliderTrack}
                      fillStyle={styles.aiPortraitSliderFill}
                      style={styles.scrubberRowFlex}
                    />
                    <Text style={styles.aiPortraitTimeText}>{formatTime(audioDuration)}</Text>
                    <TouchableOpacity style={styles.aiPortraitCtrlBtn} onPress={goToPrevSlide} disabled={currentSlideIndex === 0}>
                      <Ionicons name="play-skip-back" size={16} color={currentSlideIndex === 0 ? 'rgba(255,255,255,0.3)' : '#fff'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.aiPortraitPlayBtn} onPress={togglePlayPause}>
                      <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.aiPortraitCtrlBtn} onPress={goToNextSlide} disabled={!!(aiResponse && currentSlideIndex >= aiResponse.presentationSlides.length - 1)}>
                      <Ionicons name="play-skip-forward" size={16} color={aiResponse && currentSlideIndex >= aiResponse.presentationSlides.length - 1 ? 'rgba(255,255,255,0.3)' : '#fff'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.aiPortraitCtrlBtn} onPress={cyclePlaybackSpeed}>
                      <Text style={styles.aiPortraitSpeedText}>{playbackSpeed}x</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.aiPortraitCtrlBtn} onPress={async () => {
                      try {
                        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
                      } catch (e) { console.log('[Fullscreen] Orientation toggle error:', e); }
                    }}>
                      <Ionicons name="phone-landscape-outline" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.aiPortraitContent} showsVerticalScrollIndicator={false}>
                  {(() => {
                    const fsSlide = aiResponse.presentationSlides[currentSlideIndex];
                    return (
                      <>
                        {fsSlide.keyPoints.length > 0 && (
                          <View style={styles.aiPortraitCard}>
                            <Text style={styles.aiPortraitCardTitle}>KEY TAKEAWAYS</Text>
                            {fsSlide.keyPoints.map((point, index) => (
                              <View key={index} style={styles.aiPortraitKPItem}>
                                <View style={styles.aiPortraitKPBullet}>
                                  <Text style={styles.aiPortraitKPNum}>{index + 1}</Text>
                                </View>
                                <Text style={styles.aiPortraitKPText}>{point}</Text>
                              </View>
                            ))}
                          </View>
                        )}

                        {fsSlide.formula && fsSlide.formula.trim().length > 0 && (
                          <View style={styles.aiPortraitCard}>
                            <Text style={styles.aiPortraitCardTitle}>FORMULA</Text>
                            <View style={styles.aiPortraitFormulaBox}>
                              <MathText content={fsSlide.formula} mathOnly color={colors.gray800} />
                            </View>
                          </View>
                        )}

                      </>
                    );
                  })()}
                </ScrollView>
              </View>
            )
          )}

          {/* Auto-hiding controls overlay - landscape only */}
          {isActualLandscape && (
          <Animated.View 
            style={[
              styles.fullscreenControlsOverlay,
              { opacity: fullscreenControlsOpacity }
            ]} 
            pointerEvents={fullscreenControlsVisible ? 'auto' : 'none'}
          >
            {/* Header with close and counter */}
            <View style={[styles.fullscreenPresentationHeader, styles.fullscreenLandscapeHeader]}>
              <TouchableOpacity
                style={styles.fullscreenCloseButton}
                onPress={() => {
                  stopPresentationPlayback();
                  setIsPresentationFullscreen(false);
                  setAiResponse(null);
                  setCurrentSlideIndex(0);
                  setAudioProgress(0);
                  setAudioDuration(0);
                }}
              >
                <Ionicons name="close" size={18} color={colors.white} />
              </TouchableOpacity>
              <Text style={styles.fullscreenSlideCounter}>
                {currentSlideIndex + 1} / {aiResponse?.presentationSlides?.length || 0}
              </Text>
              <Text style={styles.fullscreenLandscapeTitle} numberOfLines={1}>
                {aiResponse?.presentationSlides[currentSlideIndex]?.title || ''}
              </Text>
            </View>
            
            {/* Bottom controls */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.8)']}
              style={styles.fullscreenControlsGradient}
            >
              <View style={styles.fullscreenProgressContainer}>
                <AudioScrubber
                  positionMillis={audioProgress}
                  durationMillis={audioDuration}
                  onSeekStart={handleScrubStart}
                  onSeekMove={handleScrubMove}
                  onSeekEnd={handleScrubEnd}
                  trackStyle={styles.fullscreenProgressBar}
                  fillStyle={styles.fullscreenProgressFill}
                />
                <View style={styles.fullscreenTimeRow}>
                  <Text style={styles.fullscreenTimeText}>{formatTime(audioProgress)}</Text>
                  <Text style={styles.fullscreenTimeText}>{formatTime(audioDuration)}</Text>
                </View>
              </View>

              <View style={styles.fullscreenControlButtons}>
                <TouchableOpacity 
                  style={styles.fullscreenSpeedButton} 
                  onPress={() => { cyclePlaybackSpeed(); showFullscreenControls(); }}
                >
                  <Text style={styles.fullscreenSpeedText}>{playbackSpeed}x</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.fullscreenNavButton, currentSlideIndex === 0 && styles.fullscreenNavButtonDisabled]} 
                  onPress={() => { goToPrevSlide(); showFullscreenControls(); }}
                  disabled={currentSlideIndex === 0}
                >
                  <Ionicons name="play-skip-back" size={18} color={currentSlideIndex === 0 ? 'rgba(255,255,255,0.3)' : colors.white} />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.fullscreenPlayButton} 
                  onPress={() => { togglePlayPause(); showFullscreenControls(); }}
                >
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={colors.white} />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.fullscreenNavButton, aiResponse && currentSlideIndex >= aiResponse.presentationSlides.length - 1 && styles.fullscreenNavButtonDisabled]} 
                  onPress={() => { goToNextSlide(); showFullscreenControls(); }}
                  disabled={!!(aiResponse && currentSlideIndex >= aiResponse.presentationSlides.length - 1)}
                >
                  <Ionicons name="play-skip-forward" size={18} color={aiResponse && currentSlideIndex >= aiResponse.presentationSlides.length - 1 ? 'rgba(255,255,255,0.3)' : colors.white} />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.fullscreenRotateButton} 
                  onPress={async () => {
                    showFullscreenControls();
                    try {
                      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
                    } catch (e) {
                      console.log('[Fullscreen] Orientation toggle error:', e);
                    }
                  }}
                  testID="button-fullscreen-rotate"
                >
                  <Ionicons 
                    name="phone-portrait-outline"
                    size={18} 
                    color={colors.white} 
                  />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </Animated.View>
          )}
        </Pressable>
      </Modal>

      <Modal
        visible={fullscreenImage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenImage(null)}
      >
        <View style={styles.fullscreenImageContainer}>
          <TouchableOpacity 
            style={styles.fullscreenImageClose} 
            onPress={() => setFullscreenImage(null)}
          >
            <Ionicons name="close" size={24} color={colors.white} />
          </TouchableOpacity>
          {fullscreenImage && (() => {
            const getImageUri = (url: string) => {
              if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
                return url;
              }
              return `data:image/png;base64,${url}`;
            };
            return (
              <Image 
                source={{ uri: getImageUri(fullscreenImage) }} 
                style={styles.fullscreenImageView}
                resizeMode="contain"
              />
            );
          })()}
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
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    paddingTop: 44,
    flexDirection: 'row',
    alignItems: 'center',
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
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.8)',
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sidebar: {
    width: '74%',
    height: '100%',
    paddingTop: 46,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm + 2,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.18)',
  },
  sidebarHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  sidebarHeaderText: {
    flex: 1,
  },
  sidebarIconContainer: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  sidebarSubtitle: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },
  sidebarScroll: {
    flex: 1,
  },
  sidebarContent: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.xs + 4,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sidebarItemActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  sidebarItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarItemIconActive: {
    backgroundColor: colors.white,
  },
  sidebarItemText: {
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  sidebarItemTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  sidebarBackdrop: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: spacing.md,
  },
  mcqTestWrapper: {
    flex: 1,
    padding: spacing.md,
    paddingBottom: 0,
    backgroundColor: '#FFFFFF',
  },
  mcqQuestionScroll: {
    flex: 1,
  },
  mcqQuestionScrollContent: {
    paddingBottom: spacing.md,
  },
  // Video styles
  videoCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.md,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.06)',
  },
  // SimpleLectures Card Styles
  simpleLecturesCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  simpleLecturesHeader: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  simpleLecturesBranding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  simpleLecturesLogo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 24,
    height: 24,
    gap: 2,
  },
  simpleLecturesLogoSquare: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  simpleLecturesBrandName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  simpleLecturesPlayContainer: {
    marginBottom: spacing.md,
  },
  simpleLecturesPlayButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  simpleLecturesAIBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  simpleLecturesAIBadgeText: {
    fontSize: fontSize.sm,
    color: '#A78BFA',
    fontWeight: '500',
  },
  simpleLecturesContent: {
    padding: spacing.md,
  },
  simpleLecturesTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.gray900,
    marginBottom: spacing.xs,
  },
  simpleLecturesDescription: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    marginBottom: spacing.md,
  },
  simpleLecturesLanguages: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  simpleLecturesWatchIn: {
    fontSize: fontSize.sm,
    color: colors.gray600,
  },
  simpleLecturesLanguageBadges: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  simpleLecturesLangBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  simpleLecturesLangIcon: {
    width: 20,
    height: 14,
    backgroundColor: colors.gray300,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simpleLecturesLangIconText: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.gray700,
  },
  simpleLecturesLangText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.gray700,
  },
  simpleLecturesUnlockContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  simpleLecturesUnlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  simpleLecturesUnlockText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.white,
  },
  // Language Filter Tabs Styles
  languageFilterContainer: {
    marginBottom: spacing.md,
    maxHeight: 44,
  },
  languageFilterContent: {
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
  },
  languageFilterTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.gray100,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  languageFilterTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  languageFilterTabText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray600,
  },
  languageFilterTabTextActive: {
    color: colors.white,
  },
  videoThumbnailContainer: {
    width: 120,
    height: 80,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoDurationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoDurationText: {
    fontSize: 10,
    color: colors.white,
    fontWeight: '500',
  },
  languageBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  languageBadgeText: {
    fontSize: 9,
    color: colors.white,
    fontWeight: '600',
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray700,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.gray500,
    marginTop: 12,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  errorText: {
    fontSize: 14,
    color: colors.gray500,
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  videoInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  videoCardTitle: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 4,
  },
  videoDesc: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    lineHeight: 16,
  },
  videoPlayer: {
    marginBottom: spacing.md,
  },
  videoPlayerWebView: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.gray900,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  webView: {
    flex: 1,
    backgroundColor: colors.gray900,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    minHeight: 200,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.gray500,
    fontSize: fontSize.sm,
  },
  vimeoThumbnailPlaceholder: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiVideoThumbnail: {
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenWebView: {
    flex: 1,
  },
  exitFullscreenButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  videoPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.gray900,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoProgress: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
  videoProgressFill: {
    width: '33%',
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  videoControls: {
    position: 'absolute',
    bottom: 12,
    left: 16,
  },
  videoTime: {
    color: colors.white,
    fontSize: fontSize.xs,
  },
  videoTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.xs,
  },
  videoDescription: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    lineHeight: 22,
  },
  backToListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.md,
  },
  backToListText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  // AI styles
  aiChat: {
    flex: 1,
    minHeight: 300,
  },
  aiWelcome: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  aiIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  aiWelcomeTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  aiWelcomeDesc: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  aiInputContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  aiInput: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: fontSize.sm,
    color: colors.gray900,
  },
  aiSendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiMicButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiMicButtonRecording: {
    backgroundColor: '#EF4444',
  },
  aiMicButtonDisabled: {
    opacity: 0.5,
  },
  aiSendButtonDisabled: {
    opacity: 0.5,
  },
  aiWelcomeAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: spacing.md,
  },
  aiChatEnhanced: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  aiChatScrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.md,
  },
  aiWelcomeCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  aiAvatarContainer: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  aiAvatarGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    top: -4,
    left: -4,
  },
  aiWelcomeAvatarEnhanced: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  aiIconEnhanced: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  aiWelcomeTitleEnhanced: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  aiWelcomeDescEnhanced: {
    fontSize: fontSize.lg,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  aiSubjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  aiSubjectBadgeText: {
    fontSize: fontSize.sm,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  aiQuickPromptsLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  aiQuickPrompts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  aiQuickPromptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.15)',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  aiQuickPromptIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiQuickPromptText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
  },
  aiInputContainerEnhanced: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  aiInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.12)',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  aiInputIcon: {
    marginRight: spacing.sm,
  },
  aiInputEnhanced: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    paddingVertical: spacing.md,
    maxHeight: 100,
  },
  aiSendButtonEnhanced: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  aiSendButtonDisabledEnhanced: {
    opacity: 0.6,
  },
  aiSendButtonGradient: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    minHeight: 300,
  },
  aiLoadingText: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginTop: spacing.md,
  },
  aiLoadingSubtext: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    marginTop: spacing.xs,
  },
  preloadProgressContainer: {
    width: '80%',
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  preloadProgressBar: {
    width: '100%',
    height: 8,
    backgroundColor: colors.gray200,
    borderRadius: 4,
    overflow: 'hidden',
  },
  preloadProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  preloadProgressText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  aiLoadingContainerEnhanced: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  aiLoadingGradient: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    borderRadius: borderRadius.xl,
  },
  aiOrbitContainer: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  aiOrbitRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.2)',
    borderStyle: 'dashed',
  },
  aiOrbitRingSlow: {
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  aiOrbitRingMedium: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  aiOrbitRingFast: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  aiOrbitIcon: {
    position: 'absolute',
    top: -10,
    left: '50%',
    marginLeft: -10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  aiBrainContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  aiBrainGradient: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiLoadingTextEnhanced: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.gray900,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  aiLoadingSubtextEnhanced: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  aiLoadingSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  aiLoadingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  aiLoadingStepCompleted: {
    opacity: 0.5,
  },
  aiLoadingStepActive: {
    opacity: 1,
  },
  aiLoadingStepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gray300,
  },
  aiLoadingStepDotActive: {
    backgroundColor: colors.primary,
  },
  aiLoadingStepText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  aiLoadingStepTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  aiLoadingStepLine: {
    width: 30,
    height: 2,
    backgroundColor: colors.gray200,
    marginHorizontal: spacing.xs,
  },
  aiLoadingStepLineCompleted: {
    backgroundColor: colors.primary,
  },
  aiLoadingStepDotCompleted: {
    backgroundColor: colors.success,
  },
  preloadProgressContainerEnhanced: {
    width: '100%',
    marginTop: spacing.md,
    alignItems: 'center',
  },
  preloadProgressBarEnhanced: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(43, 189, 110, 0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  preloadProgressFillEnhanced: {
    height: '100%',
    borderRadius: 3,
  },
  preloadProgressTextEnhanced: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  aiFollowUpSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  aiFollowUpTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  aiFollowUpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(43, 189, 110, 0.05)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.1)',
  },
  aiFollowUpText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    marginRight: spacing.sm,
  },
  aiSuggestOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  aiSuggestOverlayCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.2)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  aiSuggestOverlayContent: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  aiSuggestHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  aiSuggestHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.gray500,
  },
  aiSuggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  aiSuggestRowText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 20,
  },
  aiSuggestReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(43, 189, 110, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
  },
  aiSuggestReadyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  aiSuggestDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginHorizontal: spacing.sm,
  },
  aiRelatedSection: {
    marginTop: spacing.md,
  },
  aiRelatedTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  aiRelatedTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  aiRelatedTag: {
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  aiRelatedTagText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '500',
  },
  aiSubtitleBar: {
    marginVertical: spacing.sm,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  aiSubtitleGradient: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  aiSubtitleText: {
    fontSize: fontSize.sm,
    color: colors.white,
    textAlign: 'center',
    lineHeight: 20,
  },
  aiPresentationContainer: {
    flex: 1,
  },
  aiSlideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  aiSlideTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    flex: 1,
  },
  aiSlideCounter: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  aiSlideContent: {
    flex: 1,
  },
  aiSlideContentContainer: {
    paddingBottom: spacing.md,
  },
  aiContentSection: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
  },
  aiContentText: {
    fontSize: fontSize.xl,
    color: colors.gray900,
    lineHeight: 32,
    fontWeight: '500',
  },
  aiKeyPointsSection: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  aiSectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  aiKeyPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(43, 189, 110, 0.05)',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  aiKeyPointBullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiKeyPointNumber: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.white,
  },
  aiKeyPointText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.gray800,
    lineHeight: 22,
  },
  aiDiagramSection: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  aiDiagramHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  aiSwipeHint: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    fontStyle: 'italic',
  },
  aiImagesCarousel: {
    marginHorizontal: -spacing.md,
  },
  aiImagesCarouselContent: {
    paddingHorizontal: spacing.md,
  },
  aiCarouselImageWrapper: {
    width: SCREEN_WIDTH - spacing.md * 4,
    marginRight: spacing.sm,
    position: 'relative',
  },
  aiDiagramImage: {
    width: '100%',
    height: 260,
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray100,
  },
  aiImageCounter: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  aiImageCounterText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: '600',
  },
  aiImageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  aiImageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gray300,
  },
  aiImageDotActive: {
    backgroundColor: colors.primary,
    width: 20,
  },
  aiFormulaSection: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  aiFormulaBox: {
    backgroundColor: 'rgba(43, 189, 110, 0.08)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  aiFormulaText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  aiNarrationSection: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  aiNarrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  aiNarrationText: {
    fontSize: fontSize.sm,
    color: colors.gray600,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  fullscreenImageContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 40,
  },
  fullscreenImageClose: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  fullscreenImageView: {
    width: SCREEN_WIDTH - 40,
    height: SCREEN_WIDTH,
    borderRadius: borderRadius.lg,
    marginTop: 20,
  },
  aiAvatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  aiAvatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  aiAvatarInfo: {
    flex: 1,
  },
  aiAvatarName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray900,
  },
  aiSpeakingIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    marginTop: 4,
  },
  aiSpeakingBar: {
    width: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  aiAudioControls: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  aiProgressBar: {
    height: 4,
    backgroundColor: colors.gray200,
    borderRadius: 2,
    marginBottom: spacing.sm,
  },
  aiProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  aiTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  aiTimeText: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  aiControlButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  aiControlButton: {
    padding: spacing.sm,
  },
  aiPlayButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSpeedButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.sm,
  },
  aiSpeedText: {
    fontSize: fontSize.sm,
    fontWeight: '600' as const,
    color: colors.gray700,
  },
  aiRotateButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginLeft: spacing.sm,
  },
  aiNewQuestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  aiNewQuestionText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  aiPortraitPlayer: {
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  aiPortraitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 15, 26, 0.98)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(99, 102, 241, 0.25)',
  },
  aiPortraitHeaderTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#e5e7eb',
    marginRight: 8,
  },
  aiPortraitHeaderBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  aiPortraitHeaderBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#86EFAC',
  },
  aiPortraitStage: {
    aspectRatio: 16 / 9,
    width: '100%',
    backgroundColor: '#0f0f1a',
    position: 'relative',
  },
  aiPortraitStageImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiPortraitDiagramImg: {
    width: '90%',
    height: '90%',
  },
  slideImageLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiPortraitImageCount: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  aiPortraitImageCountText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  aiPortraitStagePlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(43, 189, 110, 0.08)',
  },
  aiPortraitStageKeyPoints: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: '55%',
    backgroundColor: 'rgba(15, 15, 26, 0.85)',
    borderRadius: 8,
    padding: 6,
    zIndex: 10,
  },
  aiPortraitStageKPItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 3,
  },
  aiPortraitStageKPBullet: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(43, 189, 110, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  aiPortraitStageKPNum: {
    fontSize: 8,
    fontWeight: '700',
    color: '#fff',
  },
  aiPortraitStageKPText: {
    flex: 1,
    fontSize: 9,
    color: '#d1d5db',
    lineHeight: 12,
  },
  aiPortraitStageKPMore: {
    fontSize: 8,
    color: '#9ca3af',
    marginTop: 2,
  },
  aiPortraitStageAvatar: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    zIndex: 20,
  },
  aiPortraitAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(43, 189, 110, 0.6)',
  },
  aiPortraitAvatarDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#0f0f1a',
  },
  aiPortraitStageSubtitle: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 60,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 15,
  },
  aiPortraitSubtitleText: {
    fontSize: 10,
    color: '#e5e7eb',
    lineHeight: 14,
  },
  aiPortraitControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 15, 26, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 4,
  },
  aiPortraitTimeText: {
    fontSize: 9,
    color: '#9ca3af',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 28,
    textAlign: 'center',
  },
  scrubberHitArea: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingVertical: 10,
    position: 'relative',
  },
  scrubberRowFlex: {
    flex: 1,
  },
  scrubberTrackInner: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    alignSelf: 'stretch',
    width: '100%',
  },
  scrubberThumb: {
    position: 'absolute',
    top: '50%',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    marginTop: -6,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: '#fff',
  },
  scrubberThumbActive: {
    transform: [{ scale: 1.35 }],
  },
  aiPortraitSliderTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  aiPortraitSliderFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 1.5,
  },
  aiPortraitCtrlBtn: {
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiPortraitPlayBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiPortraitSpeedText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#86EFAC',
  },
  aiPortraitContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  aiPortraitCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  aiPortraitCardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  aiPortraitCardText: {
    fontSize: 14,
    color: colors.gray700,
    lineHeight: 22,
  },
  aiPortraitKPItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(43, 189, 110, 0.04)',
    padding: 8,
    borderRadius: 8,
  },
  aiPortraitKPBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  aiPortraitKPNum: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  aiPortraitKPText: {
    flex: 1,
    fontSize: 14,
    color: colors.gray700,
    lineHeight: 20,
  },
  aiPortraitFormulaBox: {
    backgroundColor: 'rgba(43, 189, 110, 0.06)',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  aiPortraitFormulaText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.gray800,
    fontFamily: 'monospace',
  },
  aiBottomButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  aiFullscreenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  aiVideoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  aiVideoButtonText: {
    fontSize: fontSize.sm,
    color: colors.white,
    fontWeight: '500',
  },
  aiButtonDisabled: {
    opacity: 0.6,
  },
  // Podcast styles
  podcastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  podcastIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  podcastInfo: {
    flex: 1,
  },
  podcastTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 4,
  },
  podcastDesc: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    marginBottom: spacing.sm,
  },
  podcastProgress: {
    height: 4,
    backgroundColor: colors.gray100,
    borderRadius: 2,
  },
  podcastProgressFill: {
    width: '33%',
    height: '100%',
    backgroundColor: '#22C55E',
    borderRadius: 2,
  },
  podcastPlayButton: {
    padding: spacing.xs,
  },
  // Config styles
  configCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  configTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.xs,
  },
  configDesc: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    marginBottom: spacing.lg,
  },
  configSection: {
    marginBottom: spacing.lg,
  },
  configLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray900,
    marginBottom: spacing.sm,
  },
  configOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  configOptionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  configOptionButtonActive: {
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    borderColor: colors.primary,
  },
  configOptionButtonActivePurple: {
    backgroundColor: '#FFFFFF',
    borderColor: '#22C55E',
  },
  configOptionText: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  configOptionTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 16,
    marginTop: spacing.md,
  },
  startButtonPurple: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#22C55E',
    borderRadius: borderRadius.lg,
    paddingVertical: 16,
    marginTop: spacing.md,
  },
  startButtonText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.lg,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  cancelButtonText: {
    color: colors.gray500,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  // MCQ test styles
  testHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  testBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  testBackText: {
    color: colors.gray500,
    fontSize: fontSize.sm,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  timerText: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    fontWeight: '500',
  },
  mcqCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  mcqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  mcqBadge: {
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  mcqBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: colors.primary,
  },
  mcqMarks: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  mcqQuestion: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray900,
    marginBottom: spacing.md,
  },
  mcqOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  mcqOptionSelected: {
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    borderColor: colors.primary,
  },
  mcqOptionPurple: {
    borderColor: colors.gray100,
  },
  mcqOptionLabel: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    fontWeight: '500',
  },
  mcqOptionText: {
    fontSize: fontSize.sm,
    color: colors.gray900,
    flex: 1,
  },
  mcqOptionTextSelected: {
    color: colors.primary,
    fontWeight: '500',
  },
  mcqOptionLabelSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  mcqOptionCorrect: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: '#22C55E',
  },
  mcqOptionIncorrect: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: '#EF4444',
  },
  solutionsContainer: {
    flex: 1,
  },
  solutionsContentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  solutionsHeader: {
    marginBottom: 16,
  },
  solutionsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  solutionsSubtitle: {
    fontSize: 13,
    color: colors.gray500,
    marginTop: 2,
  },
  solutionsEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  solutionsEmptyText: {
    fontSize: 14,
    color: colors.gray500,
    textAlign: 'center',
    marginTop: 12,
  },
  solutionsRetryBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  solutionsRetryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  solutionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
    overflow: 'hidden',
  },
  solutionCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
  },
  solutionQNumBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(43, 189, 110, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  solutionQNumText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  solutionQuestionText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  solutionChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  solutionChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  solutionChipText: {
    fontSize: 11,
    color: colors.gray600,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  solutionReadyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  solutionReadyPillText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
  },
  solutionCardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  solutionPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  solutionPlayBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  mcqCardCorrect: {
    borderLeftWidth: 4,
    borderLeftColor: '#22C55E',
  },
  mcqCardIncorrect: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  mcqMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mcqDifficultyBadge: {
    fontSize: fontSize.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  mcqDifficultyEasy: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    color: '#22C55E',
  },
  mcqDifficultyMedium: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    color: '#F59E0B',
  },
  mcqDifficultyHard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: '#EF4444',
  },
  difficultyIntermediate: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    color: '#D97706',
  },
  questionCardPending: {
    borderLeftWidth: 4,
    borderLeftColor: '#D97706',
  },
  subjectiveTypeBadge: {
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  subjectiveTypeBadgeText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '500',
  },
  subjectiveInput: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.sm,
    color: colors.gray900,
    backgroundColor: colors.gray50,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  uploadImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(43, 189, 110, 0.04)',
    justifyContent: 'center',
  },
  uploadImageButtonText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  imagePreviewContainer: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  imagePreviewThumb: {
    width: '100%',
    height: 150,
  },
  imageRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: spacing.sm,
    backgroundColor: colors.gray50,
  },
  imageRemoveBtnText: {
    fontSize: fontSize.xs,
    color: '#EF4444',
    fontWeight: '600',
  },
  correctAnswerBox: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.md,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: '#22C55E',
  },
  correctAnswerLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#16A34A',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  correctAnswerText: {
    fontSize: fontSize.sm,
    color: '#15803D',
  },
  subjectiveAnswerReview: {
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  subjectiveAnswerLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.gray500,
    marginBottom: 4,
  },
  subjectiveAnswerText: {
    fontSize: fontSize.sm,
    color: colors.gray900,
  },
  aiFeedbackBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: 'rgba(43, 189, 110, 0.05)',
    borderRadius: borderRadius.sm,
  },
  aiFeedbackText: {
    fontSize: fontSize.xs,
    color: colors.gray700,
    flex: 1,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  pendingBadgeText: {
    fontSize: fontSize.xs,
    color: '#D97706',
    fontWeight: '500',
  },
  questionImage: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    backgroundColor: colors.gray100,
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
  mcqProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  mcqProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.gray100,
    borderRadius: 3,
    overflow: 'hidden',
  },
  mcqProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  mcqProgressText: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    fontWeight: '500',
  },
  mcqNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  mcqNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  mcqNavButtonDisabled: {
    opacity: 0.5,
  },
  mcqNavButtonText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  mcqNavButtonTextDisabled: {
    color: colors.gray300,
  },
  mcqNavButtonNext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  mcqNavButtonNextText: {
    fontSize: fontSize.sm,
    color: colors.white,
    fontWeight: '600',
  },
  mcqSubmitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#22C55E',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  mcqSubmitButtonText: {
    fontSize: fontSize.sm,
    color: colors.white,
    fontWeight: '600',
  },
  resultCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  resultCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  resultCircleGood: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  resultCircleOk: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
  },
  resultCirclePoor: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  resultPercentage: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  resultLabel: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  resultSummary: {
    fontSize: fontSize.md,
    color: colors.gray600,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  resultActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  resultActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  resultActionButtonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  resultActionText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  resultActionTextPrimary: {
    color: colors.white,
  },
  explanationBox: {
    backgroundColor: 'rgba(43, 189, 110, 0.05)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  explanationLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  explanationText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
    lineHeight: 20,
  },
  // DPP (Daily Practice Problems) Dashboard styles
  dppDashboard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  streakBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  streakText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
  },
  dppIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  dppTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.xs,
  },
  dppDesc: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  dppCompletedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  dppCompletedText: {
    fontSize: fontSize.sm,
    color: '#059669',
    fontWeight: '600',
  },
  dppErrorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: spacing.sm,
  },
  dppErrorText: {
    fontSize: fontSize.xs,
    color: '#DC2626',
  },
  dppLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dppLoadingIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  dppLoadingTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.xs,
  },
  dppLoadingSubtitle: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    marginBottom: spacing.lg,
  },
  dppLoadingBar: {
    width: '100%',
    height: 6,
    backgroundColor: colors.gray100,
    borderRadius: 3,
    overflow: 'hidden',
  },
  dppLoadingBarFill: {
    width: '60%',
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  dppTestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  dppExitButton: {
    padding: spacing.xs,
  },
  dppQuestionCounter: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray900,
  },
  dppAnsweredCounter: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  dppProgressBar: {
    height: 4,
    backgroundColor: colors.gray100,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  dppProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  dppQuestionCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dppDifficultyBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: spacing.sm,
    backgroundColor: '#FEF3C7',
  },
  dppDifficultyText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: '#D97706',
  },
  dppIntegerInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.gray800,
    marginTop: spacing.sm,
  },
  dppSubjectiveInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.gray800,
    marginTop: spacing.sm,
    minHeight: 100,
    textAlignVertical: 'top' as any,
  },
  dppQuestionPalette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },
  dppDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dppDotAnswered: {
    backgroundColor: '#D1FAE5',
  },
  dppDotCurrent: {
    borderColor: colors.primary,
  },
  dppDotText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.gray500,
  },
  dppDotTextAnswered: {
    color: '#059669',
  },
  dppResultsCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dppResultsHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dppResultsTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.gray900,
    marginTop: spacing.sm,
  },
  dppScoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  dppScoreValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.primary,
  },
  dppScorePercent: {
    fontSize: fontSize.lg,
    color: colors.gray500,
  },
  dppResultsStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: spacing.lg,
  },
  dppResultsStat: {
    alignItems: 'center',
  },
  dppResultsStatValue: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginTop: 4,
  },
  dppResultsStatLabel: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  dppReviewCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dppReviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  dppReviewQNum: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.primary,
  },
  dppReviewQuestion: {
    fontSize: fontSize.sm,
    color: colors.gray700,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  dppReviewOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: 4,
    gap: 8,
  },
  dppReviewOptionCorrect: {
    backgroundColor: '#D1FAE5',
  },
  dppReviewOptionWrong: {
    backgroundColor: '#FEE2E2',
  },
  dppReviewOptionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray500,
    width: 24,
  },
  dppReviewOptionText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.gray700,
  },
  dppExplanation: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  dppExplanationLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 4,
  },
  dppExplanationText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
    lineHeight: 18,
  },
  dppCalendarWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dppCalendarDay: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
    minWidth: 70,
  },
  dppCalendarDayToday: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  dppCalendarDayText: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    marginBottom: 4,
  },
  dppCalendarScore: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dppCalendarScoreText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.gray900,
    marginVertical: 4,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.md,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  scoreDate: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    width: 70,
  },
  scoreBar: {
    flex: 1,
    height: 8,
    backgroundColor: colors.gray100,
    borderRadius: 4,
  },
  scoreBarFill: {
    height: '100%',
    backgroundColor: '#22C55E',
    borderRadius: 4,
  },
  scoreValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray900,
    width: 40,
    textAlign: 'right',
  },
  // Notes styles
  notesCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  notesTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.lg,
  },
  notesSection: {
    marginBottom: spacing.md,
  },
  notesHeading: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  notesText: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    lineHeight: 22,
  },
  notesButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  notesButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  notesButtonText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  // Assignments styles
  assignmentCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  assignmentTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPending: {
    backgroundColor: '#FEF3C7',
  },
  statusSubmitted: {
    backgroundColor: '#DBEAFE',
  },
  statusGraded: {
    backgroundColor: '#DCFCE7',
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  statusTextPending: {
    color: '#F59E0B',
  },
  statusTextSubmitted: {
    color: '#3B82F6',
  },
  statusTextGraded: {
    color: '#22C55E',
  },
  assignmentDesc: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    marginBottom: spacing.sm,
  },
  assignmentMeta: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  assignmentMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  assignmentMetaText: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  assignmentButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  assignmentButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  assignmentLeftBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: borderRadius.lg,
    borderBottomLeftRadius: borderRadius.lg,
  },
  assignmentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  assignmentStatusText: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: colors.white,
  },
  assignmentMetaLabel: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    fontWeight: '500',
  },
  assignmentMetaValue: {
    color: colors.gray700,
  },
  scoreTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: spacing.sm,
  },
  scoreTagText: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: '#2BBD6E',
  },
  assignmentDetailCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  assignmentDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  assignmentDetailTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 4,
  },
  assignmentDetailDesc: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  assignmentDetailMeta: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  scoreCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  scoreCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  scoreCardTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 4,
  },
  assignmentScoreValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#22C55E',
  },
  scoreIconContainer: {
    backgroundColor: '#DCFCE7',
    padding: spacing.sm,
    borderRadius: 20,
  },
  feedbackSection: {
    borderTopWidth: 1,
    borderTopColor: '#BBF7D0',
    paddingTop: spacing.md,
  },
  feedbackLabel: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 4,
  },
  feedbackText: {
    fontSize: fontSize.sm,
    color: colors.gray600,
  },
  gradedQuestionCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  questionNumber: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.sm,
  },
  questionText: {
    fontSize: fontSize.md,
    color: colors.gray700,
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  gradedOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray200,
    backgroundColor: colors.gray50,
  },
  gradedOptionCorrect: {
    backgroundColor: '#FFFFFF',
    borderColor: '#BBF7D0',
  },
  gradedOptionWrong: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  gradedOptionText: {
    fontSize: fontSize.sm,
    color: colors.gray600,
    flex: 1,
  },
  submittedCard: {
    backgroundColor: 'rgba(219, 234, 254, 0.5)',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  submittedIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  submittedTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 4,
  },
  submittedDate: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  submittedMessage: {
    fontSize: fontSize.sm,
    color: colors.gray400,
    textAlign: 'center',
  },
  pendingQuestionCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  answerLabel: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: colors.gray500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  answerInput: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: 12,
    padding: 16,
    minHeight: 120,
    fontSize: fontSize.sm,
    color: colors.gray900,
  },
  assignmentButtonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  saveDraftButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray200,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  saveDraftButtonText: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.gray700,
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.white,
  },
  // The button on the AI tab's error / off-topic screens. Those screens are a centred column, and submitButton
  // (flex: 1, made to share a row) grew to fill the column's height there: a tall green bar as wide as its label.
  aiActionButton: {
    minWidth: 160,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  fullscreenPresentationContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  fullscreenPresentationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingTop: 32,
    paddingBottom: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  fullscreenCloseButton: {
    height: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenSlideCounter: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.white,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    height: 28,
    lineHeight: 28,
    borderRadius: 6,
    overflow: 'hidden',
  },
  fullscreenSlideContent: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  fullscreenSlideContentInner: {
    paddingVertical: spacing.lg,
  },
  fullscreenSlideTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  fullscreenKeyPoints: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  fullscreenKeyPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  fullscreenKeyPointText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.white,
    lineHeight: 20,
  },
  fullscreenDiagram: {
    width: '100%',
    height: 350,
    borderRadius: borderRadius.lg,
    marginBottom: 0,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  fullscreenPortraitNoImage: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  fullscreenPortraitNoImageGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  fullscreenPortraitNoImageText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  fullscreenNarration: {
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 26,
    textAlign: 'justify',
  },
  subtitleContainer: {
    marginTop: 4,
    paddingHorizontal: spacing.md,
    minHeight: 60,
    justifyContent: 'center',
  },
  subtitleTextCurrent: {
    color: colors.white,
    fontWeight: '600',
    fontSize: fontSize.lg,
    lineHeight: 28,
    textAlign: 'center',
  },
  fullscreenControls: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    paddingBottom: 16,
  },
  fullscreenProgressContainer: {
    marginBottom: spacing.xs,
  },
  fullscreenProgressBar: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginBottom: 4,
  },
  fullscreenProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  fullscreenTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fullscreenTimeText: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.7)',
  },
  fullscreenControlButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  fullscreenSpeedButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.sm,
  },
  fullscreenSpeedText: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: colors.white,
  },
  fullscreenRotateButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(43, 189, 110, 0.6)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  fullscreenPlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenNavButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenNavButtonDisabled: {
    opacity: 0.5,
  },
  fullscreenControlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  fullscreenControlsGradient: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg,
  },
  fullscreenLandscapeHeader: {
    paddingTop: 0,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
  },
  fullscreenLandscapeTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.white,
    marginLeft: spacing.sm,
  },
  fullscreenLandscapeLayout: {
    flex: 1,
    flexDirection: 'row',
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    gap: 0,
  },
  fullscreenLandscapeLeft: {
    width: 200,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 0,
    borderTopRightRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
    padding: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  fullscreenLandscapeCenter: {
    flex: 1,
    padding: spacing.xs,
    paddingBottom: spacing.sm,
  },
  fullscreenLandscapeAvatarSpeakingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  fullscreenLandscapeRight: {
    width: 200,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 0,
    borderTopLeftRadius: borderRadius.md,
    borderBottomLeftRadius: borderRadius.md,
    padding: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  fullscreenLandscapeColumnTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  fullscreenLandscapeKeyPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  fullscreenLandscapeKeyPointBullet: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenLandscapeKeyPointNumber: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.white,
  },
  fullscreenLandscapeKeyPointText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 16,
  },
  fullscreenLandscapeMorePoints: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  fullscreenLandscapeFormula: {
    marginTop: spacing.sm,
    padding: spacing.xs,
    backgroundColor: 'rgba(43, 189, 110, 0.15)',
    borderRadius: borderRadius.sm,
  },
  fullscreenLandscapeFormulaTop: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
    backgroundColor: 'rgba(43, 189, 110, 0.2)',
    borderRadius: borderRadius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  fullscreenLandscapeFormulaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 2,
  },
  fullscreenLandscapeFormulaText: {
    fontSize: fontSize.xs,
    color: colors.white,
  },
  fullscreenLandscapeImageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.lg,
  },
  fullscreenLandscapeImage: {
    borderRadius: borderRadius.lg,
  },
  fullscreenLandscapeNoImage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(43, 189, 110, 0.15)',
  },
  fullscreenLandscapeNoImageGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fullscreenLandscapeNoImageText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  fullscreenLandscapeAvatarOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
  },
  fullscreenLandscapeAvatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  fullscreenLandscapeAvatarImage: {
    width: '100%',
    height: '100%',
  },
  fullscreenLandscapeSpeakingDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    borderWidth: 1,
    borderColor: colors.white,
  },
  fullscreenLandscapeNarrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  fullscreenLandscapeNarrationScroll: {
    flex: 1,
  },
  fullscreenLandscapeNarrationText: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
  },
  fullscreenLandscapeNoNarration: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
  },
  fullscreenLandscapeSpeakingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.xs,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: borderRadius.sm,
  },
  fullscreenLandscapeSpeakingWave: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  fullscreenLandscapeSpeakingBar: {
    width: 3,
    backgroundColor: '#22c55e',
    borderRadius: 2,
  },
  fullscreenLandscapeSpeakingText: {
    fontSize: 10,
    color: '#22c55e',
    fontWeight: '600',
  },
  fullscreenSpeakingIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  speakingBar: {
    width: 5,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  previousYearContainer: {
    padding: spacing.md,
  },
  emptyPapersContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyPapersText: {
    fontSize: fontSize.md,
    color: colors.gray500,
    marginTop: spacing.md,
  },
  previousYearHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  previousYearTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  paperCategoryTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  paperCategoryTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray100,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  paperCategoryTabActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  paperCategoryTabText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray600,
  },
  paperCategoryTabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  paperCategoryBadge: {
    backgroundColor: colors.gray300,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginLeft: 2,
  },
  paperCategoryBadgeActive: {
    backgroundColor: colors.primary,
  },
  paperCategoryBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.gray600,
  },
  paperCategoryBadgeTextActive: {
    color: colors.white,
  },
  paperCountBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  paperCountText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  papersGrid: {
    gap: spacing.md,
  },
  paperCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  paperCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  paperTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  paperSubtitle: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  papersList: {
    gap: spacing.md,
  },
  paperStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    flexWrap: 'wrap',
  },
  paperStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  paperStatText: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  paperType: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    marginTop: 2,
  },
  yearBadge: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  yearBadgeText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  questionCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.md,
  },
  questionCountText: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  paperActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pdfButtonText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
    fontWeight: '600',
  },
  startSolveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 10,
  },
  startSolveButtonText: {
    fontSize: fontSize.sm,
    color: colors.white,
    fontWeight: '600',
  },
  testConfigModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  testConfigModal: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  testConfigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  testConfigTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  closeModalButton: {
    padding: 4,
  },
  testConfigSection: {
    marginBottom: spacing.xl,
  },
  testConfigLabel: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 4,
  },
  testConfigSubLabel: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    marginBottom: spacing.md,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: borderRadius.lg,
    minWidth: 60,
    alignItems: 'center',
  },
  optionButtonWide: {
    minWidth: 90,
  },
  optionButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionButtonText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
    fontWeight: '500',
  },
  optionButtonTextActive: {
    color: colors.white,
  },
  startTestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 16,
  },
  startTestButtonText: {
    fontSize: fontSize.lg,
    color: colors.white,
    fontWeight: 'bold',
  },
  
  // Landscape mode styles
  landscapeContainer: {
    flex: 1,
    padding: 0,
    backgroundColor: colors.white,
    overflow: 'hidden' as const,
  },
  landscapePresentationContainer: {
    flex: 1,
    flexDirection: 'row' as const,
  },
  landscapeLeftPane: {
    width: '40%',
    backgroundColor: colors.gray50,
    padding: spacing.md,
    borderRightWidth: 1,
    borderRightColor: colors.gray200,
  },
  landscapeRightPane: {
    width: '60%',
    flex: 1,
    backgroundColor: colors.white,
  },
  landscapeSlideHeader: {
    marginBottom: spacing.sm,
  },
  landscapeSlideTitle: {
    fontSize: fontSize.md,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  landscapeSlideCounter: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '500' as const,
  },
  landscapeImageContainer: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden' as const,
    backgroundColor: colors.white,
  },
  landscapeDiagramImage: {
    width: '100%',
    height: '100%',
  },
  landscapeImageCarousel: {
    flexGrow: 1,
  },
  landscapeImageSlide: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden' as const,
    backgroundColor: colors.white,
  },
  landscapeImageCounter: {
    position: 'absolute' as const,
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  landscapeImageCounterText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: '500' as const,
  },
  landscapeImageDots: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  landscapeImageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gray300,
  },
  landscapeImageDotActive: {
    backgroundColor: colors.primary,
  },
  landscapeImageBadge: {
    position: 'absolute' as const,
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  landscapeImageBadgeText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: '600' as const,
  },
  landscapeNoImage: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  landscapeNoImageGradient: {
    flex: 1,
    width: '100%',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderRadius: borderRadius.md,
  },
  landscapeNoImageText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    marginTop: spacing.sm,
    fontWeight: '500' as const,
  },
  landscapeAvatarSection: {
    marginTop: spacing.sm,
    alignItems: 'center' as const,
  },
  landscapeAvatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden' as const,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  landscapeAvatarImage: {
    width: '100%',
    height: '100%',
  },
  landscapeSpeakingDot: {
    position: 'absolute' as const,
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.white,
  },
  landscapeContentScroll: {
    flex: 1,
    padding: spacing.md,
  },
  landscapeContentContainer: {
    paddingBottom: spacing.lg,
  },
  landscapeContentSection: {
    marginBottom: spacing.md,
  },
  landscapeSectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700' as const,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  landscapeContentText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
  landscapeKeyPointsSection: {
    marginBottom: spacing.md,
  },
  landscapeKeyPoint: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  landscapeKeyPointBullet: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  landscapeKeyPointNumber: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: '600' as const,
  },
  landscapeKeyPointText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
  landscapeFormulaSection: {
    marginBottom: spacing.md,
  },
  landscapeFormulaBox: {
    backgroundColor: 'rgba(43, 189, 110, 0.05)',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  landscapeFormulaText: {
    fontSize: fontSize.sm,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.primary,
  },
  landscapeNarrationSection: {
    marginBottom: spacing.md,
    backgroundColor: 'rgba(43, 189, 110, 0.03)',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  landscapeNarrationHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  landscapeNarrationText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 18,
    fontStyle: 'italic' as const,
  },
  landscapeControlsContainer: {
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
    backgroundColor: colors.white,
  },
  landscapeProgressBar: {
    height: 3,
    backgroundColor: colors.gray200,
    borderRadius: 2,
    overflow: 'hidden' as const,
    marginBottom: spacing.sm,
  },
  landscapeProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  landscapeControlButtons: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.md,
  },
  landscapeNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.gray100,
  },
  landscapePlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  landscapeSpeedButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.sm,
  },
  landscapeSpeedText: {
    fontSize: fontSize.xs,
    fontWeight: '600' as const,
    color: colors.gray700,
  },
  landscapeRotateButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  landscapeSubtitleBar: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
  },
  landscapeSubtitleGradient: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  landscapeSubtitleText: {
    fontSize: fontSize.sm,
    color: colors.white,
    textAlign: 'center' as const,
  },
  
  // New 3-column "simulated landscape" styles (fits within portrait screen)
  landscapeTapOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  landscapeHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary,
    zIndex: 1,
  },
  landscapeHeaderTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600' as const,
    color: colors.white,
    flex: 1,
  },
  landscapeHeaderCounter: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500' as const,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  landscapeThreeColumnContainer: {
    flex: 1,
    flexDirection: 'row' as const,
    zIndex: 1,
  },
  landscapeLeftColumn: {
    width: '25%',
    backgroundColor: colors.gray50,
    padding: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: colors.gray200,
  },
  landscapeCenterColumn: {
    width: '50%',
    backgroundColor: colors.white,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    position: 'relative' as const,
  },
  landscapeRightColumn: {
    width: '25%',
    backgroundColor: colors.gray50,
    padding: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.gray200,
  },
  landscapeColumnTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700' as const,
    color: colors.primary,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  landscapeColumnTitleSmall: {
    fontSize: fontSize.xs,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  landscapeKeyPointsList: {
    flex: 1,
  },
  landscapeKeyPointCompact: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    marginBottom: spacing.xs,
    gap: 6,
  },
  landscapeKeyPointBulletSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 2,
  },
  landscapeKeyPointNumberSmall: {
    fontSize: 10,
    color: colors.white,
    fontWeight: '600' as const,
  },
  landscapeKeyPointTextCompact: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 18,
  },
  landscapeMorePoints: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '500' as const,
    marginTop: spacing.xs,
  },
  landscapeNoContent: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic' as const,
  },
  landscapeFormulaCompact: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(43, 189, 110, 0.05)',
    borderRadius: borderRadius.sm,
    padding: spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
  },
  landscapeFormulaTextCompact: {
    fontSize: fontSize.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.primary,
    lineHeight: 16,
  },
  landscapeImageWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: spacing.sm,
  },
  landscapeImageCarouselCenter: {
    flexGrow: 1,
    alignItems: 'center' as const,
  },
  landscapeImageSlideCenter: {
    flex: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden' as const,
    backgroundColor: colors.gray100,
  },
  landscapeDiagramImageCenter: {
    width: '100%',
    height: '100%',
  },
  landscapeImageDotsCenter: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 6,
    position: 'absolute' as const,
    bottom: spacing.sm,
    left: 0,
    right: 0,
  },
  landscapeImageDotCenter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
  },
  landscapeImageDotActiveCenter: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  landscapeImageCounterCenter: {
    position: 'absolute' as const,
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  landscapeImageCounterTextCenter: {
    fontSize: 10,
    color: colors.white,
    fontWeight: '500' as const,
  },
  landscapeNoImageCenter: {
    flex: 1,
    width: '100%',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  landscapeNoImageGradientCenter: {
    flex: 1,
    width: '100%',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderRadius: borderRadius.lg,
    margin: spacing.sm,
  },
  landscapeNoImageTextCenter: {
    fontSize: fontSize.sm,
    color: colors.primary,
    marginTop: spacing.sm,
    fontWeight: '500' as const,
  },
  landscapeAvatarOverlay: {
    position: 'absolute' as const,
    bottom: spacing.md,
    left: spacing.md,
  },
  landscapeAvatarContainerOverlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden' as const,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  landscapeAvatarImageOverlay: {
    width: '100%',
    height: '100%',
  },
  landscapeSpeakingDotOverlay: {
    position: 'absolute' as const,
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.white,
  },
  landscapeSubtitleHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    marginBottom: spacing.xs,
  },
  landscapeSubtitleContent: {
    flex: 1,
  },
  landscapeSubtitleTextFull: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
  landscapeSpeakingIndicator: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  landscapeSpeakingWave: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: 2,
  },
  landscapeSpeakingBar: {
    width: 3,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  landscapeSpeakingText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '500' as const,
  },
  landscapeControlsOverlay: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  landscapeControlsGradient: {
    paddingTop: 40,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  landscapeProgressBarOverlay: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden' as const,
    marginBottom: spacing.sm,
  },
  landscapeProgressFillOverlay: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  landscapeControlButtonsOverlay: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.lg,
  },
  landscapeControlBtnOverlay: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  landscapePlayBtnOverlay: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  landscapeSpeedBtnOverlay: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.sm,
  },
  landscapeSpeedTextOverlay: {
    fontSize: fontSize.xs,
    fontWeight: '600' as const,
    color: colors.white,
  },
  landscapeRotateBtnOverlay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(43, 189, 110, 0.5)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  
  // Assignment Test View styles (only unique ones)
  timerContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  paletteButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  paletteButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600' as const,
    color: colors.primary,
  },
  paletteOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 100,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  paletteModal: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '90%',
    maxHeight: '80%',
  },
  paletteHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: spacing.md,
  },
  paletteTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700' as const,
    color: colors.text,
  },
  paletteLegend: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  legendItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.sm,
  },
  paletteItem: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray100,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  paletteItemAnswered: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
  },
  paletteItemFlagged: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  paletteItemCurrent: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  paletteItemText: {
    fontSize: fontSize.sm,
    fontWeight: '600' as const,
    color: colors.gray600,
  },
  questionScrollView: {
    flex: 1,
    padding: spacing.md,
  },
  questionCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  questionHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: spacing.sm,
    flexWrap: 'wrap' as const,
    gap: spacing.sm,
  },
  questionTypeBadge: {
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  questionTypeText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600' as const,
  },
  questionMarks: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  questionImage: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.md,
    marginVertical: spacing.md,
    backgroundColor: colors.gray100,
  },
  flagButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray100,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  flagButtonActive: {
    backgroundColor: '#FEE2E2',
  },
  optionsContainer: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  assignmentOptionButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: spacing.md,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.gray200,
    gap: spacing.md,
  },
  assignmentOptionButtonSelected: {
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    borderColor: colors.primary,
  },
  optionCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.gray200,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  optionCircleSelected: {
    backgroundColor: colors.primary,
  },
  optionLetter: {
    fontSize: fontSize.sm,
    fontWeight: '600' as const,
    color: colors.gray600,
  },
  optionText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
  },
  trueFalseContainer: {
    flexDirection: 'row' as const,
    gap: spacing.md,
    marginTop: spacing.md,
  },
  trueFalseButton: {
    flex: 1,
    paddingVertical: spacing.lg,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.gray200,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  trueFalseButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  trueFalseText: {
    fontSize: fontSize.lg,
    fontWeight: '600' as const,
    color: colors.gray600,
  },
  testFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
  },
  navButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray100,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600' as const,
    color: colors.primary,
  },
  submitTestButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  submitTestButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700' as const,
    color: colors.white,
  },
  
  // Score Circle for Results
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  scoreCircleText: {
    fontSize: fontSize.xl,
    fontWeight: '700' as const,
  },
  scoreCircleLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600' as const,
  },
  marksBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  marksBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600' as const,
  },
  subjectiveAnswerBox: {
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  answerText: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 22,
  },
  
  // Empty state styles
  emptyState: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: spacing.xl,
    minHeight: 300,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600' as const,
    color: colors.text,
    marginTop: spacing.md,
    textAlign: 'center' as const,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center' as const,
  },
});

// --- Standalone AI Lecture Card (extracted so the language hook can be called at top level) ---
interface AILectureCardProps {
  video: TopicVideo;
  topic: any;
  purchasedLanguages: string[];
  courseAvailableLanguages: string[];
  languageCourseId: string;
  languageTopupPrice: number;
  selectedAILanguage: string | null;
  onSelectLanguage: (lang: string | null) => void;
  onPress: () => void;
  onPressUnlock: () => void;
}

const LANGUAGE_DATA: Record<string, { label: string; native: string; flag: string }> = {
  english:   { label: 'English',   native: 'English',  flag: 'GB' },
  hindi:     { label: 'Hindi',     native: 'हिन्दी',    flag: 'IN' },
  kannada:  { label: 'Kannada',   native: 'ಕನ್ನಡ',    flag: 'IN' },
  marathi:  { label: 'Marathi',   native: 'मराठी',    flag: 'IN' },
  tamil:    { label: 'Tamil',     native: 'தமிழ்',    flag: 'IN' },
  telugu:   { label: 'Telugu',    native: 'తెలుగు',   flag: 'IN' },
  malayalam:{ label: 'Malayalam', native: 'മലയാളം',  flag: 'IN' },
  bengali:  { label: 'Bengali',   native: 'বাংলা',    flag: 'IN' },
  gujarati: { label: 'Gujarati',  native: 'ગુજરાતી',  flag: 'IN' },
  punjabi:  { label: 'Punjabi',   native: 'ਪੰਜਾਬੀ',  flag: 'IN' },
  odia:     { label: 'Odia',      native: 'ଓଡ଼ିଆ',    flag: 'IN' },
  assamese: { label: 'Assamese',  native: 'অসমীয়া', flag: 'IN' },
};

function AILectureCard({
  video,
  topic,
  purchasedLanguages,
  courseAvailableLanguages,
  languageCourseId,
  languageTopupPrice,
  selectedAILanguage,
  onSelectLanguage,
  onPress,
  onPressUnlock,
}: AILectureCardProps) {
  const { languages: lectureLanguages, isLoading: languagesLoading } =
    useAvailableLanguagesForLecture(video.external_job_id);

  const availableBadgeLanguages = lectureLanguages.filter(
    lang => lang !== 'english' && purchasedLanguages.includes(lang),
  );

  return (
    <View style={styles.simpleLecturesCard}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
        <LinearGradient
          colors={['#1a1a2e', '#2d1b4e', '#4a2c6e']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.simpleLecturesHeader}
        >
          <View style={styles.simpleLecturesBranding}>
            <View style={styles.simpleLecturesLogo}>
              <View style={[styles.simpleLecturesLogoSquare, { backgroundColor: '#FF6B6B' }]} />
              <View style={[styles.simpleLecturesLogoSquare, { backgroundColor: '#4ECDC4' }]} />
              <View style={[styles.simpleLecturesLogoSquare, { backgroundColor: '#FFE66D' }]} />
              <View style={[styles.simpleLecturesLogoSquare, { backgroundColor: '#95E1D3' }]} />
            </View>
            <Text style={styles.simpleLecturesBrandName}>
              <Text style={{ color: '#A78BFA' }}>Simple</Text>
              <Text style={{ color: colors.white }}>Lectures</Text>
            </Text>
          </View>

          <View style={styles.simpleLecturesPlayContainer}>
            <View style={styles.simpleLecturesPlayButton}>
              <Ionicons name="play" size={28} color={colors.white} style={{ marginLeft: 4 }} />
            </View>
          </View>

          <View style={styles.simpleLecturesAIBadge}>
            <Ionicons name="sparkles" size={14} color="#A78BFA" />
            <Text style={styles.simpleLecturesAIBadgeText}>AI-Powered Learning</Text>
          </View>
        </LinearGradient>

        <View style={styles.simpleLecturesContent}>
          <Text style={styles.simpleLecturesTitle} numberOfLines={2}>
            {video.title || topic?.title}
          </Text>
          <Text style={styles.simpleLecturesDescription}>
            AI-generated video lecture with native player
          </Text>

          <View style={styles.simpleLecturesLanguages}>
            <Text style={styles.simpleLecturesWatchIn}>Watch in:</Text>
            <View style={styles.simpleLecturesLanguageBadges}>
              <TouchableOpacity
                onPress={() => onSelectLanguage('english')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.simpleLecturesLangBadge,
                  selectedAILanguage === 'english' && { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: '#FFFFFF' }
                ]}>
                  <View style={styles.simpleLecturesLangIcon}>
                    <Text style={styles.simpleLecturesLangIconText}>GB</Text>
                  </View>
                  <Text style={styles.simpleLecturesLangText}>English</Text>
                </View>
              </TouchableOpacity>

              {languagesLoading
                ? <View style={{ width: 40, height: 24, justifyContent: 'center' }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                : availableBadgeLanguages.map(lang => {
                    const langInfo = LANGUAGE_DATA[lang] || { label: lang, native: lang, flag: 'IN' };
                    return (
                      <TouchableOpacity
                        key={lang}
                        onPress={() => onSelectLanguage(selectedAILanguage === lang ? 'english' : lang)}
                        activeOpacity={0.7}
                      >
                        <View style={[
                          styles.simpleLecturesLangBadge,
                          selectedAILanguage === lang && { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: '#FFFFFF' }
                        ]}>
                          <View style={styles.simpleLecturesLangIcon}>
                            <Text style={styles.simpleLecturesLangIconText}>{langInfo.flag}</Text>
                          </View>
                          <Text style={styles.simpleLecturesLangText}>{langInfo.label}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {(() => {
        const unpurchasedCount = courseAvailableLanguages.filter(
          lang => lang !== 'english' && !purchasedLanguages.includes(lang)
        ).length;
        const showUnlock = languageCourseId &&
          courseAvailableLanguages.length > 1 &&
          unpurchasedCount > 0 &&
          (languageTopupPrice || 0) > 0;
        if (!showUnlock) return null;
        return (
          <TouchableOpacity
            onPress={onPressUnlock}
            activeOpacity={0.8}
            style={styles.simpleLecturesUnlockContainer}
          >
            <LinearGradient
              colors={[colors.primary, '#22C55E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.simpleLecturesUnlockButton}
            >
              <Ionicons name="globe-outline" size={18} color={colors.white} />
              <Text style={styles.simpleLecturesUnlockText}>Unlock Your Language</Text>
              <Ionicons name="sparkles" size={16} color={colors.white} />
            </LinearGradient>
          </TouchableOpacity>
        );
      })()}
    </View>
  );
}
