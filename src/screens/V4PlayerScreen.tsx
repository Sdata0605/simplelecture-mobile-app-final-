import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, Dimensions, Animated, Easing, Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  fetchV4Presentation, V4PreloadManager, V4Presentation,
  resolveV4MediaUrl, getCachedUrl, resolveFinalVideoPath, resolveAvatarPath, PreloadProgress,
  sectionHasInfographicImage, PlayerLanguage, resolvePlaybackUrl,
} from '../services/v4PlayerService';
import { V4Avatar, V4AvatarRef } from '../components/v4/V4Avatar';
import { V4MergedVideo, V4MergedVideoRef } from '../components/v4/V4MergedVideo';
import V4Quiz from '../components/v4/V4Quiz';
import V4Subtitles, { SubtitleMode } from '../components/v4/V4Subtitles';
import V4SectionScene from '../components/v4/V4SectionScene';
import { V4ControlsTop, V4ControlsBottom } from '../components/v4/V4Controls';
import { buildWordTimings } from '../hooks/useV4Karaoke';
import { useVideoCompletionTracker } from '../hooks/useVideoCompletionTracker';
import KeepScreenAwake from '../components/KeepScreenAwake';
import V4LectureNotesPanel from '../components/my-notes/V4LectureNotesPanel';

type RouteProps = RouteProp<RootStackParamList, 'V4Player'>;
type NavProps = NativeStackNavigationProp<RootStackParamList>;

const C = {
  bg: '#0d1117',
  surface: '#161b22',
  gold: '#f6c44e',
  amber: '#ff9f43',
  text: '#e6edf3',
  muted: 'rgba(230,237,243,0.42)',
};

function normalizePath(path: string, type: 'avatar' | 'video' | 'image' = 'video'): string {
  if (!path) return path;
  // If it's already an absolute URL, pass through unchanged
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const hasFolder =
    path.includes('avatars/') ||
    path.includes('videos/') ||
    path.includes('audio/') ||
    path.includes('manim/') ||
    path.includes('images/');
  let fullPath = path;
  if (!hasFolder) {
    if (type === 'avatar') fullPath = `avatars/${path}`;
    else if (type === 'image') fullPath = `images/${path}`;
    else fullPath = `videos/${path}`;
  }
  // Only append .mp4 for video/avatar types that have no extension
  if (type !== 'image' && !fullPath.match(/\.(mp4|webm|mov)$/i)) fullPath += '.mp4';
  return fullPath;
}

const { width: SCREEN_W } = Dimensions.get('window');

// Section types that play the standalone avatar clip (so a scene can sit beside
// it) rather than the full-frame pre-composited final video.
const AVATAR_CLIP_TYPES = new Set(['intro', 'summary', 'memory', 'memory_infographic']);

// Single source of truth for the avatar-vs-final routing rule. Intro/summary
// (idx 0/1) and memory sections play the standalone avatar clip; everything
// else from idx 2 onward plays the pre-composited final video.
function shouldUseFinalVideo(idx: number, sectionType: string | undefined): boolean {
  const t = (sectionType || '').toLowerCase();
  if (AVATAR_CLIP_TYPES.has(t)) return false;
  return idx >= 2;
}

// Section types whose V4SectionScene overlay (cards/bullets) should mount.
const SCENE_OVERLAY_TYPES = new Set(['summary', 'memory', 'memory_infographic']);

function shouldMountSceneOverlay(sectionType: string | undefined): boolean {
  return SCENE_OVERLAY_TYPES.has((sectionType || '').toLowerCase());
}

function GoldSpinner() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={[spinnerStyles.ring, { transform: [{ rotate }] }]} />
  );
}

const spinnerStyles = StyleSheet.create({
  ring: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: C.gold,
    borderRightColor: C.amber,
  },
});

export default function V4PlayerScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const insets = useSafeAreaInsets();
  const { jobId, topicId, chapterId, subjectId, courseId, topicTitle } = route.params;

  // mergedRef drives the merged teaching video (master clock + audio).
  // avatarRef stays for the quiz phase, whose per-question clips are NOT merged.
  const mergedRef = useRef<V4MergedVideoRef>(null);
  const avatarRef = useRef<V4AvatarRef>(null);
  const preloadManagerRef = useRef<V4PreloadManager | null>(null);
  // pendingPlayRef: true when we want the video to play as soon as it's loaded
  const pendingPlayRef = useRef(false);

  const [loadState, setLoadState] = useState<'loading' | 'tap_to_start' | 'playing'>('loading');
  const [preloadProgress, setPreloadProgress] = useState<PreloadProgress>({ completed: 0, total: 0, percent: 0 });
  const [error, setError] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<V4Presentation | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<PlayerLanguage>('english');
  const [languageUnavailable, setLanguageUnavailable] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [subtitlesKilled, setSubtitlesKilled] = useState(false);
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>('karaoke');
  const [wordTimings, setWordTimings] = useState<ReturnType<typeof buildWordTimings>>([]);

  // Lecture-note editor panel. Playback keeps running while it's open.
  const [notesOpen, setNotesOpen] = useState(false);
  const notesFlushRef = useRef<(() => Promise<void>) | null>(null);
  const toggleNotes = useCallback(() => {
    if (!notesOpen) {
      setNotesOpen(true);
      return;
    }
    void Promise.resolve(notesFlushRef.current?.())
      .catch(() => {})
      .finally(() => setNotesOpen(false));
  }, [notesOpen]);
  const closeNotes = useCallback(() => setNotesOpen(false), []);
  const registerNotesFlush = useCallback((flush: (() => Promise<void>) | null) => {
    notesFlushRef.current = flush;
  }, []);
  const allowExitRef = useRef(false);
  const closePlayer = useCallback(async () => {
    try {
      await notesFlushRef.current?.();
    } catch {
      // Every keystroke is already cached locally; cloud sync can retry later.
    }
    navigation.goBack();
  }, [navigation]);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (allowExitRef.current || !notesOpen || !notesFlushRef.current) return;
      event.preventDefault();
      void notesFlushRef.current().catch(() => {}).finally(() => {
        allowExitRef.current = true;
        navigation.dispatch(event.data.action);
      });
    });
  }, [navigation, notesOpen]);

  // Fullscreen overlay controls visibility
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const playbackRateRef = useRef(1);
  const presentationRef = useRef<V4Presentation | null>(null);
  const showQuizRef = useRef(false);
  // True while the current section's teaching is played through the WebView
  // avatar (intro idx 0 + summary idx 1, no chroma) rather than the native
  // merged video. Transport controls and the fullscreen re-attach branch on it.
  const avatarTeachingRef = useRef(false);
  const isMutedRef = useRef(false);
  // URL of the merged teaching video currently loaded (used by the fullscreen
  // re-attach effect to restore playback after a remount).
  const currentVideoUrlRef = useRef<string>('');
  const currentFallbackUrlRef = useRef<string>('');
  const currentTimeRef = useRef<number>(0);

  const currentSection = presentation?.sections[currentIndex] ?? null;

  // Show the chapter-test-ready dialog once per mount.
  const chapterTestPromptedRef = useRef(false);
  const handleChapterTestReady = useCallback(
    (result: { selfTestId: string; chapterTitle: string }) => {
      if (chapterTestPromptedRef.current) return;
      chapterTestPromptedRef.current = true;
      const name = result.chapterTitle ? `"${result.chapterTitle}"` : 'this chapter';
      Alert.alert(
        'Chapter Test Ready',
        `Great work — you've finished ${name}! A test is ready to check what you've learned.`,
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Start Test Now',
            onPress: () => navigation.navigate('MyTestTake', { testId: result.selfTestId }),
          },
        ]
      );
    },
    [navigation]
  );

  const { reportWatchTime, reset: resetTracker } = useVideoCompletionTracker({
    sections: presentation?.sections ?? [],
    videoTitle: presentation?.presentation_title ?? topicTitle ?? 'Lecture',
    topicId,
    chapterId,
    subjectId,
    courseId,
    topicTitle,
    onChapterTestReady: handleChapterTestReady,
  });

  // Reset tracker when a new presentation loads
  useEffect(() => {
    if (presentation) resetTracker();
  }, [presentation, resetTracker]);

  const resolveUrl = useCallback((path: string, type: 'avatar' | 'video' | 'image' = 'video') => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return getCachedUrl(path);
    const full = resolveV4MediaUrl(jobId, normalizePath(path, type));
    return getCachedUrl(full);
  }, [jobId]);

  useEffect(() => {
    (async () => {
      try {
        console.log('[V4Player] ── INIT jobId:', jobId);
        setLoadState('loading');
        const data = await fetchV4Presentation(jobId);
        console.log('[V4Player] ── Presentation loaded title:', data.presentation_title, 'sections:', data.sections?.length);
        setPresentation(data);
        presentationRef.current = data;
        const manager = new V4PreloadManager(data.sections, jobId);
        preloadManagerRef.current = manager;
        console.log('[V4Player] ── Starting prefetchInitial…');
        await manager.prefetchInitial((p) => {
          console.log('[V4Player]   preload progress:', p.percent + '%', p.completed + '/' + p.total);
          setPreloadProgress(p);
        });
        console.log('[V4Player] ── prefetchInitial DONE — ready to play');
        setLoadState('tap_to_start');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[V4Player] ── ERROR during init:', msg, e);
        setError(msg || 'Failed to load presentation');
      }
    })();
  }, [jobId]);

  const loadSection = useCallback((idx: number, autoPlay = false) => {
    const pres = presentationRef.current;
    if (!pres) return;
    const sec = pres.sections[idx];
    if (!sec) return;

    console.log(`[V4Player] ── loadSection idx:${idx} type:${sec.section_type} title:"${sec.title}" autoPlay:${autoPlay}`);

    currentIndexRef.current = idx;
    setCurrentIndex(idx);
    setCurrentTime(0);
    setDuration(sec.narration?.total_duration_seconds || 0);
    showQuizRef.current = false;
    setShowQuiz(false);
    setSubtitlesKilled(false);
    setSubtitleMode('karaoke');

    const segs = Array.isArray(sec.narration?.segments) ? sec.narration!.segments : [];
    const timings = buildWordTimings(segs);
    setWordTimings(timings);

    // Native expo-av cannot decode these AVC files on this Qualcomm device
    // ("Decoder failed: c2.qti.avc.decoder") — this affects BOTH the avatar
    // clips AND the pre-merged final videos. The WebView player (HTML5 <video>,
    // mirroring the web V4 player) is the only decoder that works on this device,
    // so EVERY non-quiz section now plays through it with chroma keying DISABLED.
    //
    // URL selection mirrors the web routing spec (the single source of truth):
    //   - intro/summary/memory sections → standalone avatar clip (a scene can
    //                                      then sit beside it on the stage)
    //   - other sections from idx >= 2  → final composited video, falling back
    //                                      to the avatar
    const useFinal = shouldUseFinalVideo(idx, sec.section_type);
    const kind = useFinal ? 'final' : 'avatar';
    // All section playback now runs on the single WebView avatar surface.
    avatarTeachingRef.current = true;

    if (autoPlay) {
      pendingPlayRef.current = true;
    }

    const cbs = {
      onTimeUpdate: (t: number, d: number) => {
        currentTimeRef.current = t;
        setCurrentTime(t);
        if (d > 0) setDuration(d);
        reportWatchTime(t);
      },
      onLoaded: (d: number) => {
        console.log(`[V4Player]   ${kind} LOADED duration:${d}s idx:${idx}`);
        if (d > 0) setDuration(d);
        avatarRef.current?.setRate(playbackRateRef.current);
        if (pendingPlayRef.current) {
          pendingPlayRef.current = false;
          avatarRef.current?.play();
        }
      },
      onEnded: handleAvatarEnded,
      onError: (msg: string) => console.error(`[V4Player] !! ${kind} error idx:`, idx, msg),
    };

    // The WebView needs a remote HTTPS URL — its JS can't read the file:// cache.
    const toRemote = (path: string, mediaType: 'avatar' | 'video') =>
      path.startsWith('http') ? path : resolveV4MediaUrl(jobId, normalizePath(path, mediaType));

    const avatarRaw = resolveAvatarPath(sec, selectedLanguage);
    const avatarRemote = avatarRaw ? toRemote(avatarRaw, 'avatar') : null;

    // Top-level language MP4 (vimeo_mp4_url / kannada_vimeo_mp4_url) is the
    // primary native video source when the presentation carries one.
    // English → presentation.vimeo_mp4_url
    // Kannada → presentation.kannada_vimeo_mp4_url
    const topLevelUrl = resolvePlaybackUrl(pres, selectedLanguage);

    let primary: string;
    let fallback: string;
    if (topLevelUrl) {
      // Derived from the top-level language MP4 — this IS the native player source.
      primary = toRemote(topLevelUrl, 'video');
      // Avatar clip is the fallback if the top-level URL cannot be played.
      fallback = avatarRemote ?? primary;
    } else if (useFinal) {
      primary = toRemote(resolveFinalVideoPath(sec), 'video');
      // A missing / undecodable final degrades to the avatar clip.
      fallback = avatarRemote ?? primary;
    } else {
      primary = avatarRemote ?? toRemote(resolveFinalVideoPath(sec), 'video');
      fallback = primary;
    }

    console.log(`[V4Source] sec=${idx} kind=${kind} lang=${selectedLanguage} PRIMARY=${primary} FALLBACK=${fallback}`);
    currentVideoUrlRef.current = primary;
    currentFallbackUrlRef.current = fallback;
    currentTimeRef.current = 0;
    // Keep the native player idle so it never grabs the device's single HW decoder.
    mergedRef.current?.clear();
    avatarRef.current?.loadSection(primary, playbackRateRef.current, cbs, fallback, { noChroma: true });

    // Pre-buffer the next non-quiz section into the WebView standby buffer.
    const currentHasQuiz =
      (Array.isArray(sec.questions) && sec.questions.length > 0) ||
      (Array.isArray(sec.understanding_quiz) && sec.understanding_quiz.length > 0);
    const nextSec = pres.sections[idx + 1];
    if (nextSec && !currentHasQuiz) {
      const nIdx = idx + 1;
      const nUseFinal = shouldUseFinalVideo(nIdx, nextSec.section_type);
      let nUrl: string | null = null;
      if (nUseFinal) {
        nUrl = toRemote(resolveFinalVideoPath(nextSec), 'video');
      } else {
        const nAv = resolveAvatarPath(nextSec, selectedLanguage);
        nUrl = nAv ? toRemote(nAv, 'avatar') : null;
      }
      if (nUrl) avatarRef.current?.prefetch(nUrl);
    }

    preloadManagerRef.current?.prefetchAhead(idx);
  }, [jobId, reportWatchTime, selectedLanguage]);

  const handleAvatarEnded = useCallback(() => {
    if (showQuizRef.current) return;
    const pres = presentationRef.current;
    if (!pres) return;
    const idx = currentIndexRef.current;
    const sec = pres.sections[idx];
    // After normalisation, all quiz items live in sec.questions
    const quizItems = Array.isArray(sec?.questions) ? sec!.questions! : [];
    console.log(`[V4Player] ── handleAvatarEnded idx:${idx} quizItems:${quizItems.length}`);

    if (quizItems.length > 0) {
      showQuizRef.current = true;
      setShowQuiz(true);
      setSubtitlesKilled(true);
      // Carry the user's current mute choice over to the quiz avatar clips
      // (V4Avatar persists mutedRef across loadSection calls).
      avatarRef.current?.setMuted(isMutedRef.current);
      return;
    }

    const next = idx + 1;
    if (next < pres.sections.length) {
      loadSection(next, true);
    } else {
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  }, [loadSection]);

  const handleQuizComplete = useCallback(() => {
    showQuizRef.current = false;
    setShowQuiz(false);
    setSubtitlesKilled(false);
    const next = currentIndexRef.current + 1;
    const pres = presentationRef.current;
    if (pres && next < pres.sections.length) {
      loadSection(next, true);
    } else {
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  }, [loadSection]);

  const handleTapToStart = useCallback(() => {
    const pres = presentationRef.current;
    if (!pres) return;
    setLoadState('playing');
    setIsPlaying(true);
    isPlayingRef.current = true;
    loadSection(0, true);
  }, [loadSection]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => {
      const next = !prev;
      isPlayingRef.current = next;
      // During the quiz OR intro/summary avatar teaching, transport controls
      // drive the WebView avatar; during merged teaching they drive the native
      // merged video.
      const ctrl = (showQuizRef.current || avatarTeachingRef.current) ? avatarRef.current : mergedRef.current;
      if (next) {
        pendingPlayRef.current = false;
        ctrl?.play();
      } else {
        ctrl?.pause();
      }
      return next;
    });
  }, []);

  const handlePrev = useCallback(() => {
    const idx = currentIndexRef.current;
    if (idx > 0) loadSection(idx - 1, isPlayingRef.current);
  }, [loadSection]);

  const handleNext = useCallback(() => {
    const pres = presentationRef.current;
    const idx = currentIndexRef.current;
    if (pres && idx + 1 < pres.sections.length) {
      loadSection(idx + 1, isPlayingRef.current);
    }
  }, [loadSection]);

  const handleSeek = useCallback((seconds: number) => {
    setCurrentTime(seconds);
    ((showQuizRef.current || avatarTeachingRef.current) ? avatarRef.current : mergedRef.current)?.seek(seconds);
  }, []);

  const handleSpeedChange = useCallback((rate: number) => {
    playbackRateRef.current = rate;
    setPlaybackRate(rate);
    ((showQuizRef.current || avatarTeachingRef.current) ? avatarRef.current : mergedRef.current)?.setRate(rate);
  }, []);

  const handleVolumeToggle = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      isMutedRef.current = next;
      ((showQuizRef.current || avatarTeachingRef.current) ? avatarRef.current : mergedRef.current)?.setMuted(next);
      return next;
    });
  }, []);

  const handleSubtitleToggle = useCallback(() => {
    setSubtitleMode(prev => {
      if (prev === 'karaoke') return 'full';
      if (prev === 'full') return 'off';
      return 'karaoke';
    });
  }, []);

  // Fullscreen controls auto-hide
  const showControlsForDuration = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    setControlsVisible(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    controlsTimerRef.current = setTimeout(() => {
      Animated.timing(controlsOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        setControlsVisible(false);
      });
    }, 3000);
  }, [controlsOpacity]);

  const handleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      const next = !prev;
      if (next) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        showControlsForDuration();
      } else {
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        setControlsVisible(true);
        Animated.timing(controlsOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).then(() => {
          setTimeout(() => ScreenOrientation.unlockAsync(), 300);
        });
      }
      return next;
    });
  }, [showControlsForDuration, controlsOpacity]);

  const handleStageTap = useCallback(() => {
    if (!isFullscreen) return;
    if (controlsVisible) {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      Animated.timing(controlsOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setControlsVisible(false);
      });
    } else {
      showControlsForDuration();
    }
  }, [isFullscreen, controlsVisible, controlsOpacity, showControlsForDuration]);

  useEffect(() => {
    return () => {
      ScreenOrientation.unlockAsync();
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  // Diagnostic: log isFullscreen changes
  useEffect(() => {
    console.log('[V4Player] ── isFullscreen changed to:', isFullscreen);
  }, [isFullscreen]);

  // Re-attach the merged video after a fullscreen toggle: the orientation change
  // re-renders into a different branch, remounting the <Video> elements with
  // fresh state, so we reload the current section and restore position/play.
  // Skipped during the quiz, which drives its own avatar clips.
  useEffect(() => {
    if (showQuizRef.current) return;
    const url = currentVideoUrlRef.current;
    if (!url || loadState !== 'playing') return;
    const seekTo = currentTimeRef.current;
    const wasPlaying = isPlayingRef.current;
    const useAvatar = avatarTeachingRef.current;
    console.log(`[V4Player] ── fullscreen re-attach (${useAvatar ? 'avatar' : 'merged'}) url:...${url.slice(-40)} seekTo:${seekTo.toFixed(2)} wasPlaying:${wasPlaying}`);
    const cbs = {
      onTimeUpdate: (t: number, d: number) => {
        currentTimeRef.current = t;
        setCurrentTime(t);
        if (d > 0) setDuration(d);
        reportWatchTime(t);
      },
      onLoaded: (d: number) => {
        console.log(`[V4Player]   re-attach LOADED duration:${d}s seekTo:${seekTo.toFixed(2)}`);
        if (d > 0) setDuration(d);
        const player = useAvatar ? avatarRef.current : mergedRef.current;
        player?.setRate(playbackRateRef.current);
        if (seekTo > 0.5) {
          player?.seek(seekTo);
        }
        if (wasPlaying) {
          player?.play();
        }
      },
      onEnded: handleAvatarEnded,
      onError: (msg: string) => console.error(`[V4Player] !! re-attach ${useAvatar ? 'avatar' : 'merged'} error:`, msg),
    };
    if (useAvatar) {
      avatarRef.current?.loadSection(url, playbackRateRef.current, cbs, currentFallbackUrlRef.current || url, { noChroma: true });
    } else {
      mergedRef.current?.loadSection(url, playbackRateRef.current, cbs, currentFallbackUrlRef.current || url);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

  // After normalisation all quiz items live in sec.questions (understanding_quiz
  // is merged in by the service), so read questions directly for a clean type.
  const quizItems = Array.isArray(currentSection?.questions) ? currentSection!.questions! : [];

  // Every section now plays through the WebView avatar surface (native expo-av
  // fails to decode these AVC files on this device), so the avatar is always
  // visible and the native merged player stays hidden/idle. Fill the stage
  // during teaching; during a quiz the avatar sits (chroma-keyed) over the quiz
  // UI, so it must NOT fill the stage.
  const avatarVisible = true;

  // memory_infographic is image-driven: show the infographic image in the left
  // half with the avatar in the right half WHEN an image exists; otherwise show
  // nothing and let the avatar fill/center the stage. Plain memory and summary
  // keep their right-half layout (handled inside V4Avatar by section type).
  const isMemInfographic = (currentSection?.section_type || '').toLowerCase() === 'memory_infographic';
  const memInfoHasImage = isMemInfographic && !!currentSection && sectionHasInfographicImage(currentSection);

  // Avatar sits in the right half during a quiz, OR for an infographic memory
  // section that actually has an image to show on the left.
  const avatarHalfRight = showQuiz || memInfoHasImage;
  // Avatar fills/centers the stage while teaching; during a quiz it sits over
  // the quiz UI (so not filling). An infographic memory section WITH an image
  // also yields to the right-half layout instead of filling.
  const fillStage = !avatarHalfRight;
  // The scene overlay should not mount for an infographic memory section that
  // has no image — nothing should be layered over the centered avatar.
  const mountSceneOverlay =
    shouldMountSceneOverlay(currentSection?.section_type) && !(isMemInfographic && !memInfoHasImage);

  // Error screen (no player needed)
  if (error) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <Ionicons name="alert-circle-outline" size={48} color="#ff6b8a" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.retryText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isFullscreen) {
    const { width: screenW, height: screenH_val } = Dimensions.get('window');
    console.log(`[V4Player FULLSCREEN] screen=${screenW}x${screenH_val} insets={top:${insets.top} left:${insets.left} right:${insets.right} bottom:${insets.bottom}}`);
    return (
      <View
        style={[
          styles.screenFS,
          {
            position: 'absolute',
            top: -insets.top,
            left: -insets.left,
            right: -insets.right,
            bottom: -insets.bottom,
            backgroundColor: 'red',
          },
        ]}
        onLayout={(e) => {
          const { x, y, width, height } = e.nativeEvent.layout;
          console.log(`[V4Player] screenFS container layout: x=${x} y=${y} w=${width} h=${height}`);
        }}
      >
        {isPlaying && <KeepScreenAwake />}
        <StatusBar barStyle="light-content" backgroundColor={C.bg} hidden />
        <TouchableOpacity
          style={{ backgroundColor: 'blue', flex: 1 }}
          onPress={handleStageTap}
          activeOpacity={1}
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            console.log(`[V4Player] tapTarget layout: x=${x} y=${y} w=${width} h=${height}`);
          }}
        >
          {/* Merged teaching video — single pre-composited file per section */}
          <View style={[StyleSheet.absoluteFill, { opacity: 0 }]}>
            <V4MergedVideo ref={mergedRef} />
          </View>

          <V4Avatar
            ref={avatarRef}
            sectionType={currentSection?.section_type}
            isFullscreen
            fillStage={fillStage}
            halfRight={avatarHalfRight}
            style={{ opacity: avatarVisible ? 1 : 0 }}
          />

          {mountSceneOverlay && currentSection && (
            <V4SectionScene
              key={currentSection.section_id}
              section={currentSection}
              currentTime={currentTime}
              isPlaying={isPlaying}
              duration={duration}
              jobId={jobId}
            />
          )}

          {showQuiz && quizItems.length > 0 && currentSection && (
            <V4Quiz
              questions={quizItems}
              jobId={jobId}
              avatarRef={avatarRef}
              onComplete={handleQuizComplete}
              resolveUrl={resolveUrl}
              isFullscreen
            />
          )}

          {!subtitlesKilled && (
            <V4Subtitles timings={wordTimings} currentTime={currentTime} mode={subtitleMode} />
          )}
        </TouchableOpacity>

        {/* Overlay controls (auto-hide) */}
        <Animated.View
          style={[styles.fsOverlay, { opacity: controlsOpacity }]}
          pointerEvents={controlsVisible ? 'box-none' : 'none'}
        >
          <V4ControlsTop
            title={presentation?.presentation_title || ''}
            sections={presentation?.sections || []}
            currentIndex={currentIndex}
            onClose={closePlayer}
            onNotes={toggleNotes}
            notesActive={notesOpen}
          />
          <View style={styles.fsSpacer} />
          <V4ControlsBottom
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            playbackRate={playbackRate}
            isMuted={isMuted}
            sections={presentation?.sections || []}
            currentIndex={currentIndex}
            onPlayPause={handlePlayPause}
            onPrev={handlePrev}
            onNext={handleNext}
            onSeek={handleSeek}
            onVolumeToggle={handleVolumeToggle}
            onSpeedChange={handleSpeedChange}
            onSectionSelect={(idx) => loadSection(idx, isPlayingRef.current)}
            onFullscreen={handleFullscreen}
            isFullscreen
            subtitleMode={subtitleMode}
            onSubtitleToggle={handleSubtitleToggle}
          />
        </Animated.View>

        {/* Loading/tap overlays sit on top so V4Avatar stays mounted */}
        {loadState !== 'playing' && (
          <View style={styles.prePlayOverlay} pointerEvents="box-none">
            {loadState === 'loading' && (
              <View style={styles.prePlayContent}>
                <GoldSpinner />
                <Text style={styles.loadingLabel}>
                  {preloadProgress.total > 0 ? `Caching media… ${preloadProgress.percent}%` : 'Loading presentation…'}
                </Text>
                {preloadProgress.total > 0 && (
                  <View style={styles.progressTrack}>
                    <LinearGradient
                      colors={[C.gold, C.amber]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.progressFill, { width: `${preloadProgress.percent}%` }]}
                    />
                  </View>
                )}
              </View>
            )}
            {loadState === 'tap_to_start' && (
              <TouchableOpacity style={styles.prePlayContent} onPress={handleTapToStart} activeOpacity={0.8}>
                <View style={styles.playCircle}>
                  <Ionicons name="play" size={30} color="#1a1000" style={{ marginLeft: 3 }} />
                </View>
                <Text style={styles.tapText}>Tap to Start</Text>
                <Text style={styles.tapSubText}>{presentation?.presentation_title}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Landscape/fullscreen side panel — playback keeps running to its left */}
        <V4LectureNotesPanel
          visible={notesOpen}
          variant="side"
          jobId={jobId}
          subjectId={subjectId}
          chapterId={chapterId}
          topicId={topicId}
          topicTitle={topicTitle || presentation?.presentation_title}
          insets={insets}
          onRequestClose={closeNotes}
          onFlushReady={registerNotesFlush}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {isPlaying && <KeepScreenAwake />}
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <V4ControlsTop
        title={presentation?.presentation_title || ''}
        sections={presentation?.sections || []}
        currentIndex={currentIndex}
        onClose={closePlayer}
        onNotes={toggleNotes}
        notesActive={notesOpen}
      />

      {/* 16:9 stage */}
      <View style={styles.stage}>
        {/* Merged teaching video — single pre-composited file per section */}
        <View style={[StyleSheet.absoluteFill, { opacity: 0 }]}>
          <V4MergedVideo ref={mergedRef} />
        </View>

        <V4Avatar
          ref={avatarRef}
          sectionType={currentSection?.section_type}
          isFullscreen={false}
          fillStage={fillStage}
          halfRight={avatarHalfRight}
          style={{ opacity: avatarVisible ? 1 : 0 }}
        />

        {mountSceneOverlay && currentSection && (
          <V4SectionScene
            key={currentSection.section_id}
            section={currentSection}
            currentTime={currentTime}
            isPlaying={isPlaying}
            duration={duration}
            jobId={jobId}
          />
        )}

        {showQuiz && quizItems.length > 0 && currentSection && (
          <V4Quiz
            questions={quizItems}
            jobId={jobId}
            avatarRef={avatarRef}
            onComplete={handleQuizComplete}
            resolveUrl={resolveUrl}
          />
        )}

        {!subtitlesKilled && (
          <V4Subtitles timings={wordTimings} currentTime={currentTime} mode={subtitleMode} />
        )}
      </View>

      {/* Language selector — only shown when the presentation carries a Kannada top-level URL */}
      {presentation?.kannada_vimeo_mp4_url && (
        <View style={styles.langSelectorRow}>
          {(['english', 'kannada'] as PlayerLanguage[]).map(lang => (
            <TouchableOpacity
              key={lang}
              style={[styles.langSelectorBtn, selectedLanguage === lang && styles.langSelectorBtnActive]}
              onPress={() => {
                if (lang === selectedLanguage) return;
                // Resolve the top-level URL for this language before switching.
                // English: presentation.vimeo_mp4_url
                // Kannada: presentation.kannada_vimeo_mp4_url
                const targetUrl = resolvePlaybackUrl(presentation!, lang);
                if (lang !== 'english' && !targetUrl) {
                  setLanguageUnavailable(true);
                  return;
                }
                setLanguageUnavailable(false);
                setSelectedLanguage(lang);
                // loadSection re-runs with the new language; the native video
                // source (primary) will now be derived from targetUrl.
                loadSection(currentIndexRef.current, isPlayingRef.current);
              }}
            >
              <Text style={[styles.langSelectorText, selectedLanguage === lang && styles.langSelectorTextActive]}>
                {lang === 'english' ? 'EN' : 'ಕನ್ನಡ'}
              </Text>
            </TouchableOpacity>
          ))}
          {languageUnavailable && (
            <Text style={styles.langUnavailableText}>Language unavailable</Text>
          )}
        </View>
      )}

      {/* Controls + remaining area */}
      <View style={styles.belowStage}>
        <V4ControlsBottom
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          isMuted={isMuted}
          sections={presentation?.sections || []}
          currentIndex={currentIndex}
          onPlayPause={handlePlayPause}
          onPrev={handlePrev}
          onNext={handleNext}
          onSeek={handleSeek}
          onVolumeToggle={handleVolumeToggle}
          onSpeedChange={handleSpeedChange}
          onSectionSelect={(idx) => loadSection(idx, isPlayingRef.current)}
          onFullscreen={handleFullscreen}
          isFullscreen={false}
          subtitleMode={subtitleMode}
          onSubtitleToggle={handleSubtitleToggle}
        />
      </View>

      {/* Loading/tap overlays — rendered on top so V4Avatar stays mounted */}
      {loadState !== 'playing' && (
        <View style={styles.prePlayOverlay} pointerEvents="box-none">
          {loadState === 'loading' && (
            <View style={styles.prePlayContent}>
              <GoldSpinner />
              <Text style={styles.loadingLabel}>
                {preloadProgress.total > 0 ? `Caching media… ${preloadProgress.percent}%` : 'Loading presentation…'}
              </Text>
              {preloadProgress.total > 0 && (
                <View style={styles.progressTrack}>
                  <LinearGradient
                    colors={[C.gold, C.amber]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.progressFill, { width: `${preloadProgress.percent}%` }]}
                  />
                </View>
              )}
            </View>
          )}
          {loadState === 'tap_to_start' && (
            <TouchableOpacity style={styles.prePlayContent} onPress={handleTapToStart} activeOpacity={0.8}>
              <View style={styles.playCircle}>
                <Ionicons name="play" size={30} color="#1a1000" style={{ marginLeft: 3 }} />
              </View>
              <Text style={styles.tapText}>Tap to Start</Text>
              <Text style={styles.tapSubText}>{presentation?.presentation_title}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Portrait keyboard-safe bottom sheet — playback keeps running behind it */}
      <V4LectureNotesPanel
        visible={notesOpen}
        variant="portrait"
        jobId={jobId}
        subjectId={subjectId}
        chapterId={chapterId}
        topicId={topicId}
        topicTitle={topicTitle || presentation?.presentation_title}
        insets={insets}
        onRequestClose={closeNotes}
        onFlushReady={registerNotesFlush}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Portrait
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  stage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  belowStage: {
    flex: 1,
    backgroundColor: C.bg,
  },
  langSelectorRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
    backgroundColor: C.bg,
  },
  langSelectorBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#444',
  },
  langSelectorBtnActive: {
    borderColor: C.gold,
    backgroundColor: 'rgba(255,198,41,0.12)',
  },
  langSelectorText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
  },
  langSelectorTextActive: {
    color: C.gold,
  },
  langUnavailableText: {
    color: '#f87171',
    fontSize: 10,
    marginLeft: 4,
    alignSelf: 'center',
  },
  // Fullscreen
  screenFS: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  fsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    justifyContent: 'space-between',
  },
  fsSpacer: {
    flex: 1,
  },
  // Pre-play overlay (covers the player while loading or waiting for tap)
  prePlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  prePlayContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  // Shared
  center: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingLabel: {
    marginTop: 16,
    fontSize: 14,
    color: C.muted,
    fontFamily: 'Sora_400Regular',
    textAlign: 'center',
  },
  progressTrack: {
    width: '80%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  playCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    marginBottom: 16,
  },
  tapText: {
    fontSize: 18,
    color: C.text,
    fontFamily: 'Sora_600SemiBold',
    marginBottom: 6,
  },
  tapSubText: {
    fontSize: 13,
    color: C.muted,
    fontFamily: 'Sora_400Regular',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#ff6b8a',
    fontFamily: 'Sora_400Regular',
    textAlign: 'center',
    marginTop: 12,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.gold,
  },
  retryText: {
    color: C.gold,
    fontSize: 14,
    fontFamily: 'Sora_600SemiBold',
  },
});
