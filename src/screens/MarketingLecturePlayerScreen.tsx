import { useEffect, useState, useRef, useCallback } from 'react';
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
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio, Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/AppNavigator';
import V4LectureNotesPanel from '../components/my-notes/V4LectureNotesPanel';
import {
  formatMarketingVideoTime,
  seekMillisFromPress,
} from '../utils/marketingVideoControls';
import {
  fetchV4Presentation,
  resolvePlaybackUrl,
  PlayerLanguage,
  V4Presentation,
} from '../services/v4PlayerService';

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

/**
 * Marketing Lecture Player — plays a single pre-merged Vimeo progressive MP4.
 *
 * Portrait layout mirrors the AI Lecture Player: dark header on top, a fixed
 * 16:9 video strip below it, then a white scrollable area with the same
 * quick-action grid (shown only when opened from Topic Details, i.e. topic
 * context params exist). The MP4 URL is resolved at open time from the
 * lecture's presentation.json (vimeo_mp4_url / kannada_vimeo_mp4_url), never
 * hardcoded, so it survives Vimeo signature rotation. Progressive MP4 only —
 * no HLS, no proxying, no Vimeo iframe. Fullscreen is app-controlled so the
 * course header, notes, and playback controls remain available in landscape.
 */
export default function MarketingLecturePlayerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'MarketingLecturePlayer'>>();
  const {
    jobId,
    title,
    subtitle,
    topicId,
    chapterId,
    subjectId,
    initialLanguage,
  } = route.params;
  const insets = useSafeAreaInsets();

  // Quick actions only make sense when we came from Topic Details.
  const hasTopicContext = !!topicId;

  const videoRef = useRef<Video>(null);
  const [presentation, setPresentation] = useState<V4Presentation | null>(null);
  const [language, setLanguage] = useState<PlayerLanguage>('english');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekWidthRef = useRef(1);
  const pendingSeekRef = useRef(0);
  const notesFlushRef = useRef<(() => Promise<void>) | null>(null);
  const allowExitRef = useRef(false);

  const canTakeNotes = !!topicId && !!chapterId && !!subjectId;

  // Same audio mode as the rest of the app so sound plays on iOS silent switch.
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});
  }, []);

  // Resolve the merged MP4 URL fresh at open time from presentation.json.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const pres = await fetchV4Presentation(jobId);
        if (cancelled) return;
        // Honor the language chosen on the card if that version exists;
        // otherwise prefer English, falling back to Kannada if that's the
        // only one available.
        const requested: PlayerLanguage | null =
          initialLanguage === 'kannada' || initialLanguage === 'english'
            ? initialLanguage
            : null;
        const initialLang: PlayerLanguage =
          requested && resolvePlaybackUrl(pres, requested)
            ? requested
            : resolvePlaybackUrl(pres, 'english')
              ? 'english'
              : 'kannada';
        const url = resolvePlaybackUrl(pres, initialLang);
        if (!url) {
          setError('This video is not available right now. Please try again later.');
          setLoading(false);
          return;
        }
        setPresentation(pres);
        setLanguage(initialLang);
        setVideoUrl(url);
        setLoading(false);
      } catch (e) {
        console.warn('[MarketingLecturePlayer] Failed to resolve video URL:', e);
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

  const hasKannada = !!presentation?.kannada_vimeo_mp4_url;
  const hasEnglish = !!presentation?.vimeo_mp4_url;
  const showLanguageSwitcher = hasKannada && hasEnglish;

  const switchLanguage = useCallback(
    (lang: PlayerLanguage) => {
      if (!presentation || lang === language) return;
      const url = resolvePlaybackUrl(presentation, lang);
      if (!url) return;
      pendingSeekRef.current = positionMillis;
      setLanguage(lang);
      setVideoUrl(url);
    },
    [presentation, language, positionMillis],
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
    controlsTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
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
    console.log(`[MKT] toggleFullscreen called, current isFullscreen=${isFullscreen}`);
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
        // The explicit header Close action exits the player immediately.
        // Android/system back remains two-step via beforeRemove below.
        allowExitRef.current = true;
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
          .then(() => {
            setTimeout(() => ScreenOrientation.unlockAsync().catch(() => {}), 300);
          })
          .catch(() => {});
        navigation.goBack();
      });
  }, [navigation, clearControlsTimer]);

  // Quick action: set openTab on the underlying TopicDetails route and go back —
  // same behavior as the AI Lecture Player's quick-action grid.
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

  const seekTo = useCallback((millis: number) => {
    const target = Math.max(0, Math.min(durationMillis, millis));
    setPositionMillis(target);
    videoRef.current?.setPositionAsync(target).catch(() => {});
    showControls();
  }, [durationMillis, showControls]);

  const handleSeekPress = useCallback((event: GestureResponderEvent) => {
    seekTo(
      seekMillisFromPress(
        event.nativeEvent.locationX,
        seekWidthRef.current,
        durationMillis,
      ),
    );
  }, [durationMillis, seekTo]);

  const handlePlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPositionMillis(status.positionMillis);
    setDurationMillis(status.durationMillis ?? 0);
    setIsPlaying(status.isPlaying);
  }, []);

  const handleVideoLoad = useCallback(async () => {
    const target = pendingSeekRef.current;
    if (target > 0) {
      pendingSeekRef.current = 0;
      await videoRef.current?.setPositionAsync(target).catch(() => {});
    }
  }, []);

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
          setTimeout(() => {
            ScreenOrientation.unlockAsync().catch(() => {});
          }, 300);
        })
        .catch(() => {});
    };
  }, [clearControlsTimer]);

  const progress =
    durationMillis > 0 ? Math.min(1, positionMillis / durationMillis) : 0;

  const playerHeader = (overlay = false) => (
    <View
      style={[
        styles.header,
        overlay && styles.headerOverlay,
        {
          paddingTop: insets.top + 6,
          paddingLeft: 12 + (overlay ? insets.left : 0),
          paddingRight: 12 + (overlay ? insets.right : 0),
        },
      ]}
    >
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      {showLanguageSwitcher && (
        <View style={styles.langSwitcher}>
          {(['english', 'kannada'] as PlayerLanguage[]).map((lang) => (
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
          data-testid="button-marketing-notes"
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
        data-testid="button-close-marketing-player"
      >
        <Ionicons name="close" size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

  const playbackControls = (
    <View style={styles.playbackControls}>
      <View style={styles.seekRow}>
        <Text style={styles.timeText}>{formatMarketingVideoTime(positionMillis)}</Text>
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
        <Text style={styles.timeText}>{formatMarketingVideoTime(durationMillis)}</Text>
      </View>
      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => seekTo(positionMillis - 10000)}
          accessibilityLabel="Rewind 10 seconds"
        >
          <Ionicons name="play-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.playButton}
          onPress={togglePlayback}
          accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
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
          onPress={() => seekTo(positionMillis + 10000)}
          accessibilityLabel="Forward 10 seconds"
        >
          <Ionicons name="play-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.controlsSpacer} />
        <TouchableOpacity
          style={styles.controlButton}
          onPress={toggleFullscreen}
          accessibilityLabel={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
          data-testid="button-marketing-fullscreen"
        >
          <Ionicons name={isFullscreen ? 'contract' : 'expand'} size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        isFullscreen && styles.containerFullscreen,
        isFullscreen && {
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
        console.log(`[MKT FULLSCREEN] container layout: x=${x} y=${y} w=${width} h=${height}`);
      }}
    >
      <StatusBar
        hidden={isFullscreen}
        barStyle="light-content"
        backgroundColor="#0f0f1a"
      />
      {!isFullscreen && playerHeader()}

      {/* A single Video surface is resized between portrait and landscape. */}
      <View
        style={[styles.videoStage, isFullscreen && styles.videoStageFullscreen]}
        onLayout={(e) => {
          const { x, y, width, height } = e.nativeEvent.layout;
          console.log(`[MKT] videoStage layout: x=${x} y=${y} w=${width} h=${height}`);
        }}
      >
        {loading && (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.loadingText}>Loading video…</Text>
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
          <Video
            ref={videoRef}
            key={videoUrl}
            source={{ uri: videoUrl }}
            style={[styles.video, isFullscreen && styles.videoFullscreen]}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={isPlaying}
            useNativeControls={false}
            progressUpdateIntervalMillis={250}
            onPlaybackStatusUpdate={handlePlaybackStatus}
            onLoad={handleVideoLoad}
            onError={(e) => {
              console.warn('[MarketingLecturePlayer] Playback error:', e);
              setError('Could not play this video. Please try again later.');
            }}
          />
        )}
        {!loading && !error && videoUrl && (
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
          <TouchableOpacity onPress={handleClose} style={{ padding: 4 }} data-testid="button-back-marketing">
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
                    onPress={() => handleQuickAction(item.key)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
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
  headerTitle: {
    flex: 1,
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '500',
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
    aspectRatio: 16 / 9,
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  videoStageFullscreen: {
    position: 'absolute',
    top: 20,
    left: 40,
    right: 40,
    bottom: 20,
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  videoFullscreen: {
    maxHeight: '80%',
    maxWidth: '60%',
    alignSelf: 'center',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.12)',
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
    gap: 14,
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
