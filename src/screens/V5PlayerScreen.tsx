import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  BackHandler,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio, Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/AppNavigator';
import V4LectureNotesPanel from '../components/my-notes/V4LectureNotesPanel';
import KeepScreenAwake from '../components/KeepScreenAwake';
import V5KeyPointsOverlay from '../components/v5/V5KeyPointsOverlay';
import V5SectionProgress from '../components/v5/V5SectionProgress';
import { AskAIAssistant } from '../components/askAssistant/AskAIAssistant';
import { useTeacherSubject } from '../hooks/useTeacherSubject';
import { buildAskContext } from '../services/askAssistant/lectureContext';
import type { LectureAskContext } from '../services/askAssistant/lectureLesson';
import { openAskAI } from '../services/askAIStore';
import { seekMillisFromPress } from '../utils/marketingVideoControls';
import {
  fetchV5Presentation,
  fetchV5Subtitles,
  buildSectionTimeline,
  getMergedVideoCandidates,
  getTimelinePosition,
  hasMergedVideo,
  formatV5Time,
  V5Language,
  V5Presentation,
  V5SubtitleData,
} from '../services/v5PlayerService';

const QUICK_ACTIONS = [
  { key: 'ai', icon: 'sparkles', label: 'Ask AI', desc: 'Have a doubt? Get help' },
  { key: 'questions', icon: 'help-circle-outline', label: 'Questions', desc: 'Browse Q&A' },
  { key: 'solutions', icon: 'bulb-outline', label: 'Solutions', desc: 'Step-by-step answers' },
  { key: 'assignments', icon: 'clipboard-outline', label: 'Assignments', desc: 'View your tasks' },
  { key: 'dpp', icon: 'disc-outline', label: 'DPP', desc: 'Daily Practice Problems' },
  { key: 'doubts', icon: 'chatbubble-ellipses-outline', label: 'Doubts', desc: 'Ask lecture doubts' },
  { key: 'pyqs', icon: 'document-text-outline', label: "PYQ's", desc: 'Previous year questions' },
  { key: 'results', icon: 'bar-chart-outline', label: 'Results', desc: 'View your scores' },
] as const;

const PRIMARY = '#2BBD6E';
const CONTROLS_HIDE_MS = 3000;
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

/**
 * V5 Lecture Player — the mobile counterpart of the web app's V5 player
 * (`src/components/learning/v5/`), replacing the Marketing player as the
 * learner-facing player for merged AI lectures.
 *
 * Like the Marketing player it streams a single pre-merged MP4 resolved at
 * open time from presentation.json. What V5 adds is the key-points layer:
 * subtitles.json gives per-section word timings, those build a logical section
 * timeline, and key points for the active section are revealed progressively
 * in sync with playback. It also gains playback speed, mute, replay and a
 * multi-candidate video URL fallback (Vimeo → CDN) so a rotated signature
 * doesn't dead-end playback.
 *
 * The mobile shell around it is carried over from the Marketing player —
 * portrait header, 16:9 stage, quick-action grid when opened from Topic
 * Details, the lecture notes panel, and app-controlled fullscreen so the
 * header and notes stay reachable in landscape.
 *
 * The Marketing player it replaces is still in the tree
 * (MarketingLecturePlayerScreen) and still registered on the navigator; it is
 * simply no longer navigated to.
 */
export default function V5PlayerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'V5Player'>>();
  const { jobId, title, subtitle, topicId, chapterId, subjectId, initialLanguage } = route.params;
  const insets = useSafeAreaInsets();

  const hasTopicContext = !!topicId;
  const canTakeNotes = !!topicId && !!chapterId && !!subjectId;

  // "Ask AI": the student talks to the live AI Teacher, which can teach any subject whose lectures are indexed.
  // Until the list loads, or if it fails, the player simply has no Ask AI button.
  const teacherSubject = useTeacherSubject(subjectId);
  const [askAIOpen, setAskAIOpen] = useState(false);
  // Where the lecture was when Ask AI was tapped, so the teacher can answer in context.
  const [askContext, setAskContext] = useState<LectureAskContext | null>(null);
  // Ask AI is a landscape screen; remember whether the player was already in landscape (fullscreen) to restore it.
  const askWasFullscreenRef = useRef(false);
  const resumeAfterAskRef = useRef(false);

  const videoRef = useRef<Video>(null);
  const [presentation, setPresentation] = useState<V5Presentation | null>(null);
  const [subtitleData, setSubtitleData] = useState<V5SubtitleData | null>(null);
  const [language, setLanguage] = useState<V5Language>('english');
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [keyPointsHidden, setKeyPointsHidden] = useState(false);
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null);

  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekWidthRef = useRef(1);
  // Ratio (0..1) to restore after a language swap remounts the video.
  const pendingRatioRef = useRef<number | null>(null);
  const notesFlushRef = useRef<(() => Promise<void>) | null>(null);
  const allowExitRef = useRef(false);

  // Same audio mode as the rest of the app so sound plays on iOS silent switch.
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});
  }, []);

  // Presentation + subtitles load together; subtitles are optional, so a
  // failure there degrades to narration-derived section durations.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [pres, subs] = await Promise.all([
          fetchV5Presentation(jobId),
          fetchV5Subtitles(jobId),
        ]);
        if (cancelled) return;

        // Honour the language chosen on the card when that version exists,
        // else prefer English, falling back to Kannada if that's all there is.
        const requested: V5Language | null =
          initialLanguage === 'kannada' || initialLanguage === 'english'
            ? initialLanguage
            : null;
        const initialLang: V5Language =
          requested && hasMergedVideo(pres, requested)
            ? requested
            : hasMergedVideo(pres, 'english')
              ? 'english'
              : 'kannada';

        if (getMergedVideoCandidates(pres, jobId, initialLang).length === 0) {
          setError('This video is not available right now. Please try again later.');
          setLoading(false);
          return;
        }

        setPresentation(pres);
        setSubtitleData(subs);
        setLanguage(initialLang);
        setSourceIndex(0);
        setLoading(false);
      } catch (e) {
        console.warn('[V5Player] Failed to load presentation:', e);
        if (!cancelled) {
          setError('Could not load this video. Please check your connection and try again.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, initialLanguage]);

  const timeline = useMemo(
    () => buildSectionTimeline(presentation?.sections || [], subtitleData),
    [presentation, subtitleData],
  );
  const sources = useMemo(
    () => (presentation ? getMergedVideoCandidates(presentation, jobId, language) : []),
    [presentation, jobId, language],
  );
  const videoUrl = sources[sourceIndex] || null;
  const position = useMemo(
    () => getTimelinePosition(timeline, positionMillis / 1000, durationMillis / 1000),
    [timeline, positionMillis, durationMillis],
  );

  const hasKannada = !!presentation && hasMergedVideo(presentation, 'kannada');
  const hasEnglish = !!presentation && hasMergedVideo(presentation, 'english');
  const showLanguageSwitcher = hasKannada && hasEnglish;

  const switchLanguage = useCallback(
    (lang: V5Language) => {
      if (!presentation || lang === language) return;
      if (!hasMergedVideo(presentation, lang)) return;
      pendingRatioRef.current = durationMillis > 0 ? positionMillis / durationMillis : 0;
      setLanguage(lang);
      setSourceIndex(0);
    },
    [presentation, language, positionMillis, durationMillis],
  );

  const clearControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
  }, []);

  const scheduleControlsHide = useCallback(() => {
    clearControlsTimer();
    if (!isFullscreen || notesOpen || !isPlaying) return;
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }, [clearControlsTimer, isFullscreen, notesOpen, isPlaying]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  const leaveFullscreen = useCallback(() => {
    clearControlsTimer();
    setControlsVisible(true);
    setIsFullscreen(false);
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
      .then(() => {
        setTimeout(() => ScreenOrientation.unlockAsync().catch(() => {}), 300);
      })
      .catch(() => {});
  }, [clearControlsTimer]);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      leaveFullscreen();
      return;
    }
    setIsFullscreen(true);
    setControlsVisible(true);
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, [isFullscreen, leaveFullscreen]);

  const handleClose = useCallback(() => {
    Promise.resolve(notesFlushRef.current?.())
      .catch(() => {})
      .finally(() => {
        clearControlsTimer();
        allowExitRef.current = true;
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
          .then(() => {
            setTimeout(() => ScreenOrientation.unlockAsync().catch(() => {}), 300);
          })
          .catch(() => {});
        navigation.goBack();
      });
  }, [navigation, clearControlsTimer]);

  // Quick action: set openTab on the underlying TopicDetails route and go back.
  const handleQuickAction = useCallback(
    (key: string) => {
      setActiveQuickAction(key);
      const state = navigation.getState();
      const currentIndex = state?.index ?? 0;
      if (currentIndex > 0) {
        const prevRoute = state.routes[currentIndex - 1];
        if (prevRoute?.name === 'TopicDetails') {
          navigation.dispatch({
            ...CommonActions.setParams({ ...(prevRoute.params as any), openTab: key }),
            source: prevRoute.key,
          });
        }
      }
      navigation.goBack();
    },
    [navigation],
  );

  const togglePlayback = useCallback(() => {
    setIsPlaying((playing) => {
      if (playing) videoRef.current?.pauseAsync().catch(() => {});
      else videoRef.current?.playAsync().catch(() => {});
      return !playing;
    });
    showControls();
  }, [showControls]);

  const seekTo = useCallback(
    (millis: number) => {
      const target = Math.max(0, Math.min(durationMillis, millis));
      setPositionMillis(target);
      videoRef.current?.setPositionAsync(target).catch(() => {});
      showControls();
    },
    [durationMillis, showControls],
  );

  const handleSeekPress = useCallback(
    (event: GestureResponderEvent) => {
      seekTo(
        seekMillisFromPress(event.nativeEvent.locationX, seekWidthRef.current, durationMillis),
      );
    },
    [durationMillis, seekTo],
  );

  const handleReplay = useCallback(() => {
    setPositionMillis(0);
    videoRef.current?.setPositionAsync(0).catch(() => {});
    videoRef.current?.playAsync().catch(() => {});
    setIsPlaying(true);
    showControls();
  }, [showControls]);

  const toggleMute = useCallback(() => {
    setIsMuted((muted) => !muted);
    showControls();
  }, [showControls]);

  // Mirrors the web V5 player's handleAskAI: remember whether the video was playing, pause it, and open the
  // assistant. Ask AI is a landscape screen (lesson board left, teacher right), so the screen rotates first, and
  // goes back to how the player was on close. The video resumes only if it was playing before (never auto-resume
  // a video the student had already paused themselves).
  const handleAskAI = useCallback(() => {
    if (!teacherSubject) return;
    resumeAfterAskRef.current = isPlaying;
    videoRef.current?.pauseAsync().catch(() => {});
    setIsPlaying(false);
    setAskContext(buildAskContext(timeline, position.active, positionMillis / 1000, durationMillis / 1000));
    askWasFullscreenRef.current = isFullscreen;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    setAskAIOpen(true);
    showControls();
  }, [teacherSubject, isPlaying, timeline, position.active, positionMillis, durationMillis, isFullscreen, showControls]);

  const handleCloseAskAI = useCallback(() => {
    setAskAIOpen(false);
    setAskContext(null);
    // Back to how the player was: portrait, unless it was already in landscape fullscreen.
    if (!askWasFullscreenRef.current) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        .then(() => {
          setTimeout(() => ScreenOrientation.unlockAsync().catch(() => {}), 300);
        })
        .catch(() => {});
    }
    if (resumeAfterAskRef.current) {
      resumeAfterAskRef.current = false;
      videoRef.current?.playAsync().catch(() => {});
      setIsPlaying(true);
    }
  }, []);

  // No AI Teacher plan: leave the lecture for the plans screen (the player's own back handling restores the orientation).
  const handleOpenPlans = useCallback(() => {
    handleCloseAskAI();
    navigation.navigate('AITeacher');
  }, [handleCloseAskAI, navigation]);

  // The "Ask AI" quick action opens Ask AI right here (the lecture is paused and handed to it), not the old AI tab.
  const handleAskQuickAction = useCallback(() => {
    if (teacherSubject) handleAskAI();
    else openAskAI({ subjectId, topicTitle: title });
  }, [teacherSubject, handleAskAI, subjectId, title]);

  const cycleSpeed = useCallback(() => {
    setPlaybackRate((rate) => {
      const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
      // setRateAsync is more reliable than the `rate` prop for mid-playback
      // changes; shouldCorrectPitch keeps narration from sounding chipmunked.
      videoRef.current?.setRateAsync(next, true).catch(() => {});
      return next;
    });
    showControls();
  }, [showControls]);

  const handlePlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPositionMillis(status.positionMillis);
    setDurationMillis(status.durationMillis ?? 0);
    setIsPlaying(status.isPlaying);
  }, []);

  // Restore position after a language swap, and re-apply the chosen speed
  // since a remounted video resets to 1x.
  const handleVideoLoad = useCallback(async () => {
    const ratio = pendingRatioRef.current;
    if (ratio !== null) {
      pendingRatioRef.current = null;
      const status = await videoRef.current?.getStatusAsync().catch(() => null);
      const total = status && status.isLoaded ? status.durationMillis ?? 0 : 0;
      if (total > 0) {
        await videoRef.current?.setPositionAsync(Math.min(total - 50, ratio * total)).catch(() => {});
      }
    }
    if (playbackRate !== 1) {
      await videoRef.current?.setRateAsync(playbackRate, true).catch(() => {});
    }
  }, [playbackRate]);

  // Walk the candidate list (Vimeo → CDN) before surfacing an error.
  const handleVideoError = useCallback(
    (e: string) => {
      console.warn('[V5Player] Playback error:', e);
      if (sourceIndex < sources.length - 1) {
        setSourceIndex((index) => index + 1);
        return;
      }
      setError('Could not play this video. Please try again later.');
    },
    [sourceIndex, sources.length],
  );

  const closeNotes = useCallback(() => {
    Promise.resolve(notesFlushRef.current?.())
      .catch(() => {})
      .finally(() => {
        setNotesOpen(false);
        showControls();
      });
  }, [showControls]);

  const toggleNotes = useCallback(() => {
    if (!canTakeNotes) return;
    if (notesOpen) {
      closeNotes();
      return;
    }
    clearControlsTimer();
    setControlsVisible(true);
    setNotesOpen(true);
  }, [canTakeNotes, notesOpen, closeNotes, clearControlsTimer]);

  useEffect(() => {
    if (isFullscreen) scheduleControlsHide();
    else clearControlsTimer();
  }, [isFullscreen, isPlaying, notesOpen, scheduleControlsHide, clearControlsTimer]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (notesOpen) {
        closeNotes();
        return true;
      }
      if (isFullscreen) {
        leaveFullscreen();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [notesOpen, isFullscreen, closeNotes, leaveFullscreen]);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event: any) => {
      if (allowExitRef.current) return;
      if (isFullscreen) {
        event.preventDefault();
        leaveFullscreen();
        return;
      }
      if (!notesFlushRef.current) return;
      event.preventDefault();
      Promise.resolve(notesFlushRef.current())
        .catch(() => {})
        .finally(() => {
          allowExitRef.current = true;
          navigation.dispatch(event.data.action);
        });
    });
  }, [navigation, isFullscreen, leaveFullscreen]);

  // Safety: never leave the app stuck in landscape after this screen closes.
  useEffect(() => {
    return () => {
      clearControlsTimer();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        .then(() => {
          setTimeout(() => ScreenOrientation.unlockAsync().catch(() => {}), 300);
        })
        .catch(() => {});
    };
  }, [clearControlsTimer]);

  const progress = durationMillis > 0 ? Math.min(1, positionMillis / durationMillis) : 0;
  const sectionLabel = position.active?.section.title || 'Starting lesson';

  const playerHeader = (overlay = false) => (
    <View
      style={[
        styles.header,
        overlay && styles.headerOverlay,
        {
          paddingTop: (overlay ? insets.top : insets.top) + 6,
          paddingLeft: 12 + (overlay ? insets.left : 0),
          paddingRight: 12 + (overlay ? insets.right : 0),
        },
      ]}
    >
      <View style={styles.headerIdentity}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.headerSection} numberOfLines={1}>
          {sectionLabel}
        </Text>
      </View>
      {showLanguageSwitcher && (
        <View style={styles.langSwitcher}>
          {(['english', 'kannada'] as V5Language[]).map((lang) => (
            <TouchableOpacity
              key={lang}
              style={[styles.langChip, language === lang && styles.langChipActive]}
              onPress={() => switchLanguage(lang)}
              accessibilityLabel={`Switch to ${lang}`}
              data-testid={`button-lang-${lang}`}
            >
              <Text style={[styles.langChipText, language === lang && styles.langChipTextActive]}>
                {lang === 'english' ? 'EN' : 'ಕ'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {canTakeNotes && (
        <TouchableOpacity
          style={[styles.headerAction, notesOpen && styles.headerActionActive]}
          onPress={toggleNotes}
          accessibilityLabel="Open lecture notes"
          data-testid="button-v5-notes"
        >
          <Ionicons
            name={notesOpen ? 'create' : 'create-outline'}
            size={17}
            color={notesOpen ? '#f6c44e' : '#FFFFFF'}
          />
          <Text style={[styles.headerActionText, notesOpen && styles.headerActionTextActive]}>
            Notes
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.headerClose}
        onPress={handleClose}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Close video"
        data-testid="button-close-v5-player"
      >
        <Ionicons name="close" size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

  // Control set mirrors web V5: replay / play-pause / mute, then speed +
  // fullscreen. (Web V5 has no ±10s skip, so neither does this.)
  const playbackControls = (
    <View
      style={[
        styles.playbackControls,
        isFullscreen && {
          paddingLeft: 14 + insets.left,
          paddingRight: 14 + insets.right,
          paddingBottom: 10 + insets.bottom,
        },
      ]}
    >
      <View style={styles.seekRow}>
        <Text style={styles.timeText}>{formatV5Time(positionMillis / 1000)}</Text>
        <TouchableOpacity
          style={styles.seekHitArea}
          activeOpacity={1}
          onLayout={(event) => {
            seekWidthRef.current = Math.max(1, event.nativeEvent.layout.width);
          }}
          onPress={handleSeekPress}
          accessibilityLabel="Seek video"
        >
          <View style={styles.seekTrack}>
            <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={[styles.seekThumb, { left: `${progress * 100}%` }]} />
        </TouchableOpacity>
        <Text style={styles.timeText}>{formatV5Time(durationMillis / 1000)}</Text>
      </View>
      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleReplay}
          accessibilityLabel="Replay from start"
          data-testid="button-v5-replay"
        >
          <Ionicons name="refresh" size={19} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.playButton}
          onPress={togglePlayback}
          accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
          data-testid="button-v5-play"
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={28}
            color="#FFFFFF"
            style={isPlaying ? undefined : { marginLeft: 3 }}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={toggleMute}
          accessibilityLabel={isMuted ? 'Unmute' : 'Mute'}
          data-testid="button-v5-mute"
        >
          <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={19} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.controlsSpacer} />
        {!!teacherSubject && (
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleAskAI}
            accessibilityLabel="Ask AI about this lecture"
            data-testid="button-v5-ask-ai"
          >
            <Ionicons name="sparkles" size={19} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.speedButton}
          onPress={cycleSpeed}
          accessibilityLabel={`Playback speed ${playbackRate}x`}
          data-testid="button-v5-speed"
        >
          <Text style={styles.speedText}>{playbackRate}x</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={toggleFullscreen}
          accessibilityLabel={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
          data-testid="button-v5-fullscreen"
        >
          <Ionicons name={isFullscreen ? 'contract' : 'expand'} size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, isFullscreen && styles.containerFullscreen]}>
      {isPlaying && <KeepScreenAwake />}
      <StatusBar hidden={isFullscreen} barStyle="light-content" backgroundColor="#0f0f1a" />
      {!isFullscreen && playerHeader()}

      {/* One Video surface, resized between portrait strip and fullscreen. */}
      <View style={isFullscreen ? styles.videoStageFullscreen : styles.videoStage}>
        {loading && (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.loadingText}>Preparing the presentation…</Text>
          </View>
        )}

        {!loading && error && (
          <View style={styles.centerFill}>
            <Ionicons name="alert-circle-outline" size={36} color="#FFFFFF" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleClose}
              data-testid="button-error-close"
            >
              <Text style={styles.retryButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && videoUrl && (
          <>
            <Video
              ref={videoRef}
              key={`${language}-${sourceIndex}`}
              source={{ uri: videoUrl }}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={isPlaying}
              isMuted={isMuted}
              rate={playbackRate}
              shouldCorrectPitch
              useNativeControls={false}
              progressUpdateIntervalMillis={250}
              onPlaybackStatusUpdate={handlePlaybackStatus}
              onLoad={handleVideoLoad}
              onError={handleVideoError}
            />

            {/* Tap layer sits under the key points so the panel stays scrollable. */}
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => {
                if (!isFullscreen) {
                  setControlsVisible((visible) => !visible);
                  return;
                }
                if (controlsVisible) {
                  clearControlsTimer();
                  setControlsVisible(false);
                } else {
                  showControls();
                }
              }}
              accessibilityLabel="Show or hide video controls"
            />

            <V5KeyPointsOverlay
              active={position.active}
              visibleCount={position.visibleCount}
              isHidden={keyPointsHidden}
              onToggle={() => setKeyPointsHidden((hidden) => !hidden)}
              isFullscreen={isFullscreen}
              leftInset={isFullscreen ? insets.left : 0}
            />

            {/* Section bar is hidden in fullscreen, same as web V5. */}
            {!isFullscreen && (
              <V5SectionProgress
                timeline={timeline}
                activeIndex={position.active?.sectionIndex ?? null}
              />
            )}
          </>
        )}

        {controlsVisible && !loading && !error && (
          <View style={styles.controlsOverlay} pointerEvents="box-none">
            {isFullscreen && playerHeader(true)}
            <View style={styles.overlaySpacer} pointerEvents="none" />
            {playbackControls}
          </View>
        )}
      </View>

      {/* White area below the video — quick actions when opened from a topic */}
      {!isFullscreen && (
        <ScrollView style={styles.belowScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.topicRow}>
            <TouchableOpacity onPress={handleClose} style={{ padding: 4 }} data-testid="button-back-v5">
              <Ionicons name="arrow-back" size={20} color="#1f2937" />
            </TouchableOpacity>
            <Text style={styles.topicTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {!!subtitle && <Text style={styles.topicSubtitle}>{subtitle}</Text>}
          {hasTopicContext && (
            <>
              <Text style={styles.quickActionsHeading}>Quick Actions</Text>
              <View style={styles.quickActionsGrid}>
                {QUICK_ACTIONS.map((item) => {
                  const isActive = activeQuickAction === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.quickActionButton, isActive && styles.quickActionButtonActive]}
                      onPress={() => (item.key === 'ai' ? handleAskQuickAction() : handleQuickAction(item.key))}
                      data-testid={`button-quick-action-${item.key}`}
                    >
                      <View style={[styles.quickActionIcon, isActive && styles.quickActionIconActive]}>
                        <Ionicons name={item.icon as any} size={18} color={isActive ? '#fff' : '#6b7280'} />
                      </View>
                      <Text style={styles.quickActionLabel}>{item.label}</Text>
                      <Text style={styles.quickActionDesc}>{item.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      )}

      <V4LectureNotesPanel
        visible={notesOpen}
        variant={isFullscreen ? 'side' : 'portrait'}
        jobId={jobId}
        subjectId={subjectId}
        chapterId={chapterId}
        topicId={topicId}
        topicTitle={title}
        insets={insets}
        onRequestClose={closeNotes}
        onFlushReady={(flush) => {
          notesFlushRef.current = flush;
        }}
      />

      {askAIOpen && !!teacherSubject && (
        <AskAIAssistant
          trigger="mid"
          onClose={handleCloseAskAI}
          subject={teacherSubject}
          topicTitle={title}
          lectureLanguage={language}
          context={askContext}
          onOpenPlans={handleOpenPlans}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  // Fullscreen is just the same flex:1 root going black. The navigator has
  // headerShown:false and SafeAreaProvider only supplies insets as context, so
  // this already covers the whole screen — no absolute/negative-inset tricks.
  containerFullscreen: {
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    backgroundColor: 'rgba(15, 15, 26, 0.98)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(99, 102, 241, 0.2)',
    gap: 8,
  },
  headerOverlay: {
    backgroundColor: 'rgba(10, 10, 18, 0.88)',
  },
  headerIdentity: {
    flex: 1,
  },
  headerTitle: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '500',
  },
  headerSection: {
    color: 'rgba(124, 224, 195, 0.85)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 1,
  },
  headerClose: {
    padding: 6,
  },
  headerAction: {
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerActionActive: {
    borderColor: 'rgba(246,196,78,0.65)',
    backgroundColor: 'rgba(246,196,78,0.14)',
  },
  headerActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  headerActionTextActive: {
    color: '#f6c44e',
  },
  langSwitcher: {
    flexDirection: 'row',
    gap: 6,
  },
  langChip: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)',
    backgroundColor: 'transparent',
  },
  langChipActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  langChipText: {
    color: 'rgba(230, 237, 243, 0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  langChipTextActive: {
    color: '#fff',
  },
  videoStage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  // Fullscreen repeats every property instead of being merged over videoStage,
  // and is selected with a ternary rather than an array. Both matter: a style
  // key set to `undefined` is dropped when the style is serialized to native,
  // so `aspectRatio: undefined` never reaches Yoga. Since this View is the same
  // element in both modes, it would keep the portrait 16:9 constraint and pin
  // itself to height x 16/9 in landscape, leaving dead space to the right.
  videoStageFullscreen: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    zIndex: 5,
  },
  overlaySpacer: {
    flex: 1,
  },
  playbackControls: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  seekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeText: {
    minWidth: 38,
    color: '#FFFFFF',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  seekHitArea: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
  },
  seekTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  seekFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#2BBD6E',
  },
  seekThumb: {
    position: 'absolute',
    marginLeft: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2BBD6E',
  },
  controlsRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  controlsSpacer: {
    flex: 1,
  },
  controlButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  speedButton: {
    minWidth: 44,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  speedText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  retryButton: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  belowScroll: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 10,
  },
  topicTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  topicSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  quickActionsHeading: {
    fontSize: 14,
    color: '#6b7280',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 10,
    paddingBottom: 20,
  },
  quickActionButton: {
    width: '47%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 14,
  },
  quickActionButtonActive: {
    borderColor: PRIMARY,
    backgroundColor: 'rgba(43, 189, 110, 0.08)',
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionIconActive: {
    backgroundColor: PRIMARY,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
  },
  quickActionDesc: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
});
