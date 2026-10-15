import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, Dimensions, Animated, Easing, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  fetchV3Presentation, V3PreloadManager, V3Presentation, V3Section,
  resolveV3MediaUrl, getCachedUrl, resolveAvatarPath, PreloadProgress,
} from '../services/v3PlayerService';
import { V3Avatar, V3AvatarRef } from '../components/v3/V3Avatar';
import V3ContentLayers from '../components/v3/V3ContentLayers';
import V3SectionScene from '../components/v3/V3SectionScene';
import V3Quiz from '../components/v3/V3Quiz';
import V3Subtitles, { SubtitleMode } from '../components/v3/V3Subtitles';
import { V3ControlsTop, V3ControlsBottom } from '../components/v3/V3Controls';
import { buildWordTimings } from '../hooks/useV3Karaoke';
import { useVideoCompletionTracker } from '../hooks/useVideoCompletionTracker';

type RouteProps = RouteProp<RootStackParamList, 'V3Player'>;
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

export default function V3PlayerScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const insets = useSafeAreaInsets();
  const { jobId, topicId, chapterId, subjectId, courseId, topicTitle } = route.params;

  const avatarRef = useRef<V3AvatarRef>(null);
  const preloadManagerRef = useRef<V3PreloadManager | null>(null);
  // pendingPlayRef: true when we want the avatar to play as soon as it's loaded
  const pendingPlayRef = useRef(false);

  const [loadState, setLoadState] = useState<'loading' | 'tap_to_start' | 'playing'>('loading');
  const [preloadProgress, setPreloadProgress] = useState<PreloadProgress>({ completed: 0, total: 0, percent: 0 });
  const [error, setError] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<V3Presentation | null>(null);

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

  // Fullscreen overlay controls visibility
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const playbackRateRef = useRef(1);
  const presentationRef = useRef<V3Presentation | null>(null);
  const showQuizRef = useRef(false);
  const currentAvatarUrlRef = useRef<string>('');
  const currentTimeRef = useRef<number>(0);

  // A/B double-buffer: keep two V3ContentLayers always mounted to avoid remount gap
  const [contentSlotA, setContentSlotA] = useState<V3Section | null>(null);
  const [contentSlotB, setContentSlotB] = useState<V3Section | null>(null);
  const [activeContentSlot, setActiveContentSlot] = useState<'A' | 'B'>('A');
  const activeContentSlotRef = useRef<'A' | 'B'>('A');
  const contentSlotARef = useRef<V3Section | null>(null);
  const contentSlotBRef = useRef<V3Section | null>(null);

  const currentSection = activeContentSlot === 'A' ? contentSlotA : contentSlotB;

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
    const full = resolveV3MediaUrl(jobId, normalizePath(path, type));
    return getCachedUrl(full);
  }, [jobId]);

  useEffect(() => {
    (async () => {
      try {
        console.log('[V3Player] ── INIT jobId:', jobId);
        setLoadState('loading');
        const data = await fetchV3Presentation(jobId);
        console.log('[V3Player] ── Presentation loaded title:', data.presentation_title, 'sections:', data.sections?.length);
        setPresentation(data);
        presentationRef.current = data;
        const manager = new V3PreloadManager(data.sections, jobId);
        preloadManagerRef.current = manager;
        console.log('[V3Player] ── Starting prefetchInitial…');
        await manager.prefetchInitial((p) => {
          console.log('[V3Player]   preload progress:', p.percent + '%', p.completed + '/' + p.total);
          setPreloadProgress(p);
        });
        console.log('[V3Player] ── prefetchInitial DONE — ready to play');
        setLoadState('tap_to_start');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[V3Player] ── ERROR during init:', msg, e);
        setError(msg || 'Failed to load presentation');
      }
    })();
  }, [jobId]);

  const loadSection = useCallback((idx: number, autoPlay = false) => {
    const pres = presentationRef.current;
    if (!pres) return;
    const sec = pres.sections[idx];
    if (!sec) return;

    console.log(`[V3Player] ── loadSection idx:${idx} type:${sec.section_type} title:"${sec.title}" autoPlay:${autoPlay}`);

    // ── A/B double-buffer slot management ──────────────────────────────────
    const currentActive = activeContentSlotRef.current;
    const standby = currentActive === 'A' ? 'B' : 'A';
    const standbySection = standby === 'A' ? contentSlotARef.current : contentSlotBRef.current;

    const alreadyBuffered = standbySection?.section_id === sec.section_id;
    if (!alreadyBuffered) {
      // Assign the target section to the standby slot so it starts buffering
      if (standby === 'A') {
        contentSlotARef.current = sec;
        setContentSlotA(sec);
      } else {
        contentSlotBRef.current = sec;
        setContentSlotB(sec);
      }
    }
    // Flip visibility to standby (now has the target section)
    activeContentSlotRef.current = standby;
    setActiveContentSlot(standby);

    // After flipping, assign next section to the old active slot (new standby)
    // so it silently buffers the section after this one
    const nextSec = pres.sections[idx + 1] || null;
    if (currentActive === 'A') {
      contentSlotARef.current = nextSec;
      setContentSlotA(nextSec);
    } else {
      contentSlotBRef.current = nextSec;
      setContentSlotB(nextSec);
    }
    // ───────────────────────────────────────────────────────────────────────

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

    const avatarPath = resolveAvatarPath(sec);
    console.log(`[V3Player]   avatarPath:`, avatarPath?.slice(0, 80));
    if (avatarPath) {
      const resolvedPath = normalizePath(avatarPath, 'avatar');
      const remoteUrl = resolvedPath.startsWith('http')
        ? resolvedPath
        : resolveV3MediaUrl(jobId, resolvedPath);
      // Always use remote HTTPS URL for the WebView avatar — the WebView JS cannot
      // access file:// URIs in Expo's cache directory (Android OS restriction).
      // This matches ChromaKeyVideo's approach and ensures prefetch/load use the
      // same URL identity so the fast-path standby swap works correctly.
      console.log('[V3Player]   avatarUrl (remote):', remoteUrl?.slice(0, 80));
      currentAvatarUrlRef.current = remoteUrl;
      currentTimeRef.current = 0;

      if (autoPlay) {
        pendingPlayRef.current = true;
      }

      avatarRef.current?.loadSection(remoteUrl, playbackRateRef.current, {
        onTimeUpdate: (t, d) => {
          currentTimeRef.current = t;
          setCurrentTime(t);
          if (d > 0) setDuration(d);
          reportWatchTime(t);
        },
        onLoaded: (d) => {
          console.log(`[V3Player]   avatar LOADED duration:${d}s idx:${idx}`);
          if (d > 0) setDuration(d);
          // Re-apply rate before play — Android WebView's MediaPlayer can reset
          // playbackRate to 1.0 during load(). This is a no-op on fast/slow paths
          // where the rate was already preserved, and a recovery on the fallback path.
          avatarRef.current?.setRate(playbackRateRef.current);
          if (pendingPlayRef.current) {
            pendingPlayRef.current = false;
            avatarRef.current?.play();
          }
          // Safety-net prefetch: if the immediate prefetch below was skipped (e.g.
          // standbyPendingUrl was still set from a prior section), retry here.
          // WebView JS ignores duplicates via the standbyPendingUrl/standbyLoadedFor guards.
          const nextSec = presentationRef.current?.sections[idx + 1];
          if (nextSec) {
            const nextAvatarPath = resolveAvatarPath(nextSec);
            if (nextAvatarPath) {
              const nextResolved = normalizePath(nextAvatarPath, 'avatar');
              const nextRemote = nextResolved.startsWith('http')
                ? nextResolved
                : resolveV3MediaUrl(jobId, nextResolved);
              console.log(`[V3Player]   prefetch-onLoaded idx:${idx + 1} url:...${nextRemote.slice(-40)}`);
              avatarRef.current?.prefetch(nextRemote);
            }
          }
        },
        onEnded: handleAvatarEnded,
        onError: (msg) => console.error('[V3Player] !! Avatar error idx:', idx, msg),
      }, remoteUrl);

      // Immediate prefetch of next section's avatar — mirrors the old AI player's
      // dual-layer strategy where both current and next avatars start loading at
      // the same time. This prefetch queues inside WebView JS pendingCmds and drains
      // the moment load(N) completes internally (fast/slow/fallback path), with no
      // React Native bridge round-trip delay. By the time section N ends (20-200s),
      // N+1 has had the full duration to buffer in standby → guaranteed fast-path swap.
      const immNextSec = presentationRef.current?.sections[idx + 1];
      if (immNextSec) {
        const immNextPath = resolveAvatarPath(immNextSec);
        if (immNextPath) {
          const immNextResolved = normalizePath(immNextPath, 'avatar');
          const immNextRemote = immNextResolved.startsWith('http')
            ? immNextResolved
            : resolveV3MediaUrl(jobId, immNextResolved);
          console.log(`[V3Player]   prefetch-immediate idx:${idx + 1} url:...${immNextRemote.slice(-40)}`);
          avatarRef.current?.prefetch(immNextRemote);
        }
      }
    }

    preloadManagerRef.current?.prefetchAhead(idx);
  }, [jobId, reportWatchTime]);

  const handleAvatarEnded = useCallback(() => {
    if (showQuizRef.current) return;
    const pres = presentationRef.current;
    if (!pres) return;
    const idx = currentIndexRef.current;
    const sec = pres.sections[idx];
    // After normalisation, all quiz items live in sec.questions
    const quizItems = Array.isArray(sec?.questions) ? sec!.questions! : [];
    console.log(`[V3Player] ── handleAvatarEnded idx:${idx} quizItems:${quizItems.length}`);

    if (quizItems.length > 0) {
      showQuizRef.current = true;
      setShowQuiz(true);
      setSubtitlesKilled(true);
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
      if (next) {
        pendingPlayRef.current = false;
        avatarRef.current?.play();
      } else {
        avatarRef.current?.pause();
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
    avatarRef.current?.seek(seconds);
  }, []);

  const handleSpeedChange = useCallback((rate: number) => {
    playbackRateRef.current = rate;
    setPlaybackRate(rate);
    avatarRef.current?.setRate(rate);
  }, []);

  const handleVolumeToggle = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      avatarRef.current?.setMuted(next);
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
    console.log('[V3Player] ── isFullscreen changed to:', isFullscreen);
  }, [isFullscreen]);

  // Re-attach avatar after fullscreen toggle to recover from WebView remount
  useEffect(() => {
    const url = currentAvatarUrlRef.current;
    if (!url || loadState !== 'playing') return;
    const seekTo = currentTimeRef.current;
    const wasPlaying = isPlayingRef.current;
    console.log(`[V3Player] ── fullscreen re-attach url:...${url.slice(-40)} seekTo:${seekTo.toFixed(2)} wasPlaying:${wasPlaying}`);
    avatarRef.current?.loadSection(url, playbackRateRef.current, {
      onTimeUpdate: (t, d) => {
        currentTimeRef.current = t;
        setCurrentTime(t);
        if (d > 0) setDuration(d);
        reportWatchTime(t);
      },
      onLoaded: (d) => {
        console.log(`[V3Player]   re-attach LOADED duration:${d}s seekTo:${seekTo.toFixed(2)}`);
        if (d > 0) setDuration(d);
        // Re-apply rate — fullscreen toggle causes a WebView remount (fresh state),
        // so the playback rate must be re-set before resume.
        avatarRef.current?.setRate(playbackRateRef.current);
        if (seekTo > 0.5) {
          avatarRef.current?.seek(seekTo);
        }
        if (wasPlaying) {
          avatarRef.current?.play();
        }
      },
      onEnded: handleAvatarEnded,
      onError: (msg) => console.error('[V3Player] !! re-attach avatar error:', msg),
    }, url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

  const quizItems = currentSection?.questions || currentSection?.understanding_quiz || [];

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
    return (
      <View style={styles.screenFS}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} hidden />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleStageTap} activeOpacity={1}>
          {/* Slot A — pre-buffered hidden when standby, visible when active */}
          {contentSlotA && !showQuiz && (
            <View style={[StyleSheet.absoluteFill, {
              opacity: activeContentSlot === 'A' ? 1 : 0,
              zIndex: activeContentSlot === 'A' ? 1 : 0,
            }]}>
              <V3ContentLayers
                section={contentSlotA}
                jobId={jobId}
                currentTime={activeContentSlot === 'A' ? currentTime : 0}
                isPlaying={activeContentSlot === 'A' && isPlaying}
                playbackRate={playbackRate}
              />
            </View>
          )}
          {/* Slot B */}
          {contentSlotB && !showQuiz && (
            <View style={[StyleSheet.absoluteFill, {
              opacity: activeContentSlot === 'B' ? 1 : 0,
              zIndex: activeContentSlot === 'B' ? 1 : 0,
            }]}>
              <V3ContentLayers
                section={contentSlotB}
                jobId={jobId}
                currentTime={activeContentSlot === 'B' ? currentTime : 0}
                isPlaying={activeContentSlot === 'B' && isPlaying}
                playbackRate={playbackRate}
              />
            </View>
          )}

          {currentSection && (
            <V3SectionScene
              section={currentSection}
              currentTime={currentTime}
              isPlaying={isPlaying}
            />
          )}

          <V3Avatar
            ref={avatarRef}
            sectionType={currentSection?.section_type}
            isFullscreen
          />

          {showQuiz && quizItems.length > 0 && currentSection && (
            <V3Quiz
              questions={quizItems}
              jobId={jobId}
              avatarRef={avatarRef}
              onComplete={handleQuizComplete}
              resolveUrl={resolveUrl}
              isFullscreen
            />
          )}

          {!subtitlesKilled && (
            <V3Subtitles timings={wordTimings} currentTime={currentTime} mode={subtitleMode} />
          )}
        </TouchableOpacity>

        {/* Overlay controls (auto-hide) */}
        <Animated.View
          style={[styles.fsOverlay, { opacity: controlsOpacity }]}
          pointerEvents={controlsVisible ? 'box-none' : 'none'}
        >
          <V3ControlsTop
            title={presentation?.presentation_title || ''}
            sections={presentation?.sections || []}
            currentIndex={currentIndex}
            onClose={() => navigation.goBack()}
          />
          <View style={styles.fsSpacer} />
          <V3ControlsBottom
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

        {/* Loading/tap overlays sit on top so V3Avatar stays mounted */}
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
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <V3ControlsTop
        title={presentation?.presentation_title || ''}
        sections={presentation?.sections || []}
        currentIndex={currentIndex}
        onClose={() => navigation.goBack()}
      />

      {/* 16:9 stage */}
      <View style={styles.stage}>
        {/* Slot A — pre-buffered hidden when standby, visible when active */}
        {contentSlotA && !showQuiz && (
          <View style={[StyleSheet.absoluteFill, {
            opacity: activeContentSlot === 'A' ? 1 : 0,
            zIndex: activeContentSlot === 'A' ? 1 : 0,
          }]}>
            <V3ContentLayers
              section={contentSlotA}
              jobId={jobId}
              currentTime={activeContentSlot === 'A' ? currentTime : 0}
              isPlaying={activeContentSlot === 'A' && isPlaying}
              playbackRate={playbackRate}
            />
          </View>
        )}
        {/* Slot B */}
        {contentSlotB && !showQuiz && (
          <View style={[StyleSheet.absoluteFill, {
            opacity: activeContentSlot === 'B' ? 1 : 0,
            zIndex: activeContentSlot === 'B' ? 1 : 0,
          }]}>
            <V3ContentLayers
              section={contentSlotB}
              jobId={jobId}
              currentTime={activeContentSlot === 'B' ? currentTime : 0}
              isPlaying={activeContentSlot === 'B' && isPlaying}
              playbackRate={playbackRate}
            />
          </View>
        )}

        {currentSection && (
          <V3SectionScene
            section={currentSection}
            currentTime={currentTime}
            isPlaying={isPlaying}
          />
        )}

        <V3Avatar
          ref={avatarRef}
          sectionType={currentSection?.section_type}
          isFullscreen={false}
        />

        {showQuiz && quizItems.length > 0 && currentSection && (
          <V3Quiz
            questions={quizItems}
            jobId={jobId}
            avatarRef={avatarRef}
            onComplete={handleQuizComplete}
            resolveUrl={resolveUrl}
          />
        )}

        {!subtitlesKilled && (
          <V3Subtitles timings={wordTimings} currentTime={currentTime} mode={subtitleMode} />
        )}
      </View>

      {/* Controls + remaining area */}
      <View style={styles.belowStage}>
        <V3ControlsBottom
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

      {/* Loading/tap overlays — rendered on top so V3Avatar stays mounted */}
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
  // Fullscreen
  screenFS: {
    flex: 1,
    backgroundColor: '#000',
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
