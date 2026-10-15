import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  SafeAreaView,
  Modal,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors } from '../constants/theme';
import { supabase, ClassRecording, PlaybackUrlResponse, VideoWatchProgress } from '../services/supabase';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'WatchRecording'>;

const getScreenDimensions = () => {
  const { width, height } = Dimensions.get('window');
  return { width, height };
};

export default function WatchRecordingScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { recordingId } = route.params;

  const videoRef = useRef<Video>(null);
  const [recording, setRecording] = useState<ClassRecording | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<PlaybackUrlResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string>('720p');
  const [showQualitySelector, setShowQualitySelector] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [initialProgress, setInitialProgress] = useState<VideoWatchProgress | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentPositionRef = useRef(0);
  const durationRef = useRef(0);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [screenDimensions, setScreenDimensions] = useState(getScreenDimensions());

  const fetchRecordingData = async () => {
    try {
      setError(null);
      const [recordingResult, userResult] = await Promise.all([
        supabase.getRecordingById(recordingId),
        supabase.getStoredUser(),
      ]);

      if (!recordingResult.success || !recordingResult.recording) {
        setError(recordingResult.error || 'Recording not found');
        setLoading(false);
        return;
      }

      setRecording(recordingResult.recording);
      const user = userResult;
      if (user?.id) {
        setUserId(user.id);
        const progressResult = await supabase.getWatchProgress(recordingId, user.id);
        if (progressResult.success && progressResult.progress) {
          setInitialProgress(progressResult.progress);
        }
      }

      const defaultQuality = recordingResult.recording.default_quality || 
        (recordingResult.recording.available_qualities?.includes('720p') ? '720p' : 
        recordingResult.recording.available_qualities?.[0] || '720p');
      setSelectedQuality(defaultQuality);

      const playbackResult = await supabase.getPlaybackUrl(recordingId, defaultQuality);
      if (playbackResult.success && playbackResult.playback && (playbackResult.playback.hlsUrl || playbackResult.playback.directUrl)) {
        console.log('Using edge function playback URL');
        setPlaybackUrl(playbackResult.playback);
      } else {
        console.warn('Edge function failed or returned no URL, trying fallback:', playbackResult.error);
        const fallbackResult = getFallbackPlaybackUrl(recordingResult.recording, defaultQuality);
        if (fallbackResult) {
          const derivedQualities = getAvailableQualitiesFromPaths(recordingResult.recording);
          setSelectedQuality(fallbackResult.actualQuality);
          setPlaybackUrl({
            hlsUrl: fallbackResult.url,
            directUrl: fallbackResult.url,
            quality: fallbackResult.actualQuality,
            availableQualities: derivedQualities.length > 0 ? derivedQualities : (recordingResult.recording.available_qualities || []),
            duration: recordingResult.recording.duration_seconds,
            expiresAt: Date.now() + 3600000,
            usingCdn: true,
          });
        } else {
          setError('Video playback is not available for this recording');
        }
      }
    } catch (err) {
      console.log('Error fetching recording data:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getAvailableQualitiesFromPaths = (rec: ClassRecording): string[] => {
    const qualities: string[] = [];
    if (rec.b2_hls_1080p_path) qualities.push('1080p');
    if (rec.b2_hls_720p_path) qualities.push('720p');
    if (rec.b2_hls_480p_path) qualities.push('480p');
    if (rec.b2_hls_360p_path) qualities.push('360p');
    return qualities;
  };

  const getFallbackPlaybackUrl = (rec: ClassRecording, quality: string): { url: string; actualQuality: string } | null => {
    const cdnBase = rec.cdn_base_url?.replace(/\/+$/, '');
    
    const hlsPaths: { quality: string; path: string | null }[] = [
      { quality: '1080p', path: rec.b2_hls_1080p_path },
      { quality: '720p', path: rec.b2_hls_720p_path },
      { quality: '480p', path: rec.b2_hls_480p_path },
      { quality: '360p', path: rec.b2_hls_360p_path },
    ];

    let selectedEntry = hlsPaths.find(e => e.quality === quality && e.path);
    
    if (!selectedEntry) {
      selectedEntry = hlsPaths.find(e => e.path);
    }

    if (!selectedEntry || !selectedEntry.path) {
      console.warn('No HLS path available for recording:', rec.id);
      return null;
    }

    const hlsPath = selectedEntry.path;
    const actualQuality = selectedEntry.quality;

    if (hlsPath.startsWith('http://') || hlsPath.startsWith('https://')) {
      console.log('Using absolute HLS URL:', hlsPath);
      return { url: hlsPath, actualQuality };
    }

    const normalizedPath = hlsPath.replace(/^\/+/, '');

    if (cdnBase) {
      const fullUrl = `${cdnBase}/${normalizedPath}`;
      console.log('Fallback playback URL constructed:', fullUrl);
      return { url: fullUrl, actualQuality };
    }

    console.warn('No CDN base URL and path is not absolute:', normalizedPath);
    return null;
  };

  useEffect(() => {
    fetchRecordingData();

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      if (progressSaveIntervalRef.current) {
        clearInterval(progressSaveIntervalRef.current);
      }
    };
  }, [recordingId]);

  useEffect(() => {
    return () => {
      if (userId && duration > 0 && currentPosition > 0) {
        const progressPercent = Math.round((currentPosition / duration) * 100);
        const completed = progressPercent >= 90;
        supabase.saveWatchProgress(
          recordingId,
          userId,
          Math.floor(currentPosition / 1000),
          progressPercent,
          completed
        );
      }
    };
  }, [recordingId, userId, currentPosition, duration]);

  useEffect(() => {
    if (isPlaying && userId) {
      progressSaveIntervalRef.current = setInterval(() => {
        saveProgressFromRef();
      }, 10000);
    } else {
      if (progressSaveIntervalRef.current) {
        clearInterval(progressSaveIntervalRef.current);
      }
    }

    return () => {
      if (progressSaveIntervalRef.current) {
        clearInterval(progressSaveIntervalRef.current);
      }
    };
  }, [isPlaying, userId]);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenDimensions({ width: window.width, height: window.height });
    });

    return () => {
      subscription?.remove();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      setIsFullscreen(false);
    } else {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      setIsFullscreen(true);
      // Hide controls immediately when entering fullscreen if video is playing
      if (isPlaying) {
        Animated.timing(controlsOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setShowControls(false));
      }
    }
  };

  const saveProgressFromRef = useCallback(async () => {
    if (!userId || durationRef.current === 0) return;
    
    const progressPercent = Math.round((currentPositionRef.current / durationRef.current) * 100);
    const completed = progressPercent >= 90;
    
    await supabase.saveWatchProgress(
      recordingId,
      userId,
      Math.floor(currentPositionRef.current / 1000),
      progressPercent,
      completed
    );
  }, [recordingId, userId]);

  const saveProgress = useCallback(async () => {
    if (!userId || duration === 0) return;
    
    const progressPercent = Math.round((currentPosition / duration) * 100);
    const completed = progressPercent >= 90;
    
    await supabase.saveWatchProgress(
      recordingId,
      userId,
      Math.floor(currentPosition / 1000),
      progressPercent,
      completed
    );
  }, [recordingId, userId, currentPosition, duration]);

  const handleQualityChange = async (quality: string) => {
    setSelectedQuality(quality);
    setShowQualitySelector(false);
    setLoading(true);

    const currentPos = currentPosition;
    const wasPlaying = isPlaying;

    const playbackResult = await supabase.getPlaybackUrl(recordingId, quality);
    if (playbackResult.success && playbackResult.playback && (playbackResult.playback.hlsUrl || playbackResult.playback.directUrl)) {
      setPlaybackUrl(playbackResult.playback);
    } else if (recording) {
      const fallbackResult = getFallbackPlaybackUrl(recording, quality);
      if (fallbackResult) {
        const derivedQualities = getAvailableQualitiesFromPaths(recording);
        setSelectedQuality(fallbackResult.actualQuality);
        setPlaybackUrl({
          hlsUrl: fallbackResult.url,
          directUrl: fallbackResult.url,
          quality: fallbackResult.actualQuality,
          availableQualities: derivedQualities.length > 0 ? derivedQualities : (recording.available_qualities || []),
          duration: recording.duration_seconds,
          expiresAt: Date.now() + 3600000,
          usingCdn: true,
        });
      }
    }
    
    if (videoRef.current) {
      await videoRef.current.setPositionAsync(currentPos);
      if (wasPlaying) {
        await videoRef.current.playAsync();
      }
    }
    setLoading(false);
  };

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setCurrentPosition(status.positionMillis);
      currentPositionRef.current = status.positionMillis;
      if (status.durationMillis) {
        setDuration(status.durationMillis);
        durationRef.current = status.durationMillis;
      }
      setIsPlaying(status.isPlaying);
    }
  };

  const togglePlayPause = async () => {
    if (videoRef.current) {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
        saveProgress();
      } else {
        await videoRef.current.playAsync();
        // Immediately hide controls when video starts playing
        Animated.timing(controlsOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setShowControls(false));
      }
    }
  };

  const seekForward = async () => {
    if (videoRef.current) {
      await videoRef.current.setPositionAsync(currentPosition + 10000);
    }
    resetControlsTimeout();
  };

  const seekBackward = async () => {
    if (videoRef.current) {
      await videoRef.current.setPositionAsync(Math.max(0, currentPosition - 10000));
    }
    resetControlsTimeout();
  };

  const toggleControls = () => {
    if (showControls) {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setShowControls(false));
    } else {
      setShowControls(true);
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      resetControlsTimeout();
    }
  };

  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        Animated.timing(controlsOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setShowControls(false));
      }, 1000);
    }
  };

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentPosition / duration) * 100 : 0;

  const handleGoBack = async () => {
    saveProgress();
    if (isFullscreen) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      setIsFullscreen(false);
    }
    navigation.goBack();
  };

  if (loading && !playbackUrl) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading video...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
        <Text style={styles.errorTitle}>Unable to play video</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchRecordingData} data-testid="button-retry">
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButtonError} onPress={() => navigation.goBack()} data-testid="button-go-back">
          <Text style={styles.backButtonErrorText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const videoUrl = playbackUrl?.hlsUrl || playbackUrl?.directUrl;
  const title = recording?.recording_title || recording?.topic?.title || recording?.scheduled_class?.subject || 'Recording';
  const chapterInfo = recording?.chapter ? `Ch ${recording.chapter.chapter_number}: ${recording.chapter.title}` : null;
  const courseName = recording?.course?.name || recording?.scheduled_class?.course?.name;

  const videoWidth = isFullscreen ? screenDimensions.width : screenDimensions.width;
  const videoHeight = isFullscreen ? screenDimensions.height : screenDimensions.width * 0.5625;

  return (
    <View style={[styles.container, isFullscreen && styles.fullscreenContainer]}>
      <StatusBar hidden={isFullscreen} barStyle="light-content" backgroundColor="#000" />
      
      <View style={[styles.videoStage, isFullscreen && { flex: 1, paddingTop: 0 }]}>
        <TouchableOpacity
          style={[styles.backButton, isFullscreen && styles.fullscreenBackButton]}
          onPress={handleGoBack}
          data-testid="button-back"
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.qualityBadge, isFullscreen && styles.fullscreenQualityBadge]}
          onPress={() => setShowQualitySelector(true)}
          data-testid="button-quality"
        >
          <Ionicons name="settings-outline" size={16} color="#fff" />
          <Text style={styles.qualityBadgeText}>{selectedQuality}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.videoWrapper, { width: videoWidth, height: videoHeight }]}
          activeOpacity={1}
          onPress={toggleControls}
        >
          {videoUrl ? (
            <Video
              ref={videoRef}
              source={{ uri: videoUrl }}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              isLooping={false}
              onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
              onLoad={async () => {
                if (initialProgress && videoRef.current) {
                  await videoRef.current.setPositionAsync(initialProgress.progress_seconds * 1000);
                }
              }}
            />
          ) : (
            <View style={styles.noVideoContainer}>
              <Ionicons name="videocam-off" size={48} color="#6B7280" />
              <Text style={styles.noVideoText}>Video not available</Text>
            </View>
          )}

          {showControls && (
            <Animated.View style={[styles.controlsOverlay, { opacity: controlsOpacity }]}>
              <View style={styles.centerControls}>
                <TouchableOpacity style={styles.seekButton} onPress={seekBackward} data-testid="button-seek-back">
                  <Ionicons name="play-back" size={28} color="#fff" />
                  <Text style={styles.seekText}>10s</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.playButton} onPress={togglePlayPause} data-testid="button-play-pause">
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={36}
                    color="#fff"
                    style={!isPlaying && { marginLeft: 4 }}
                  />
                </TouchableOpacity>

                <TouchableOpacity style={styles.seekButton} onPress={seekForward} data-testid="button-seek-forward">
                  <Ionicons name="play-forward" size={28} color="#fff" />
                  <Text style={styles.seekText}>10s</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {loading && (
            <View style={styles.bufferingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        <View style={[styles.progressSection, isFullscreen && styles.fullscreenProgressSection]}>
          <Text style={styles.timeText}>{formatTime(currentPosition)}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            <View style={[styles.progressThumb, { left: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
          <TouchableOpacity 
            style={styles.fullscreenButton} 
            onPress={toggleFullscreen}
            data-testid="button-fullscreen"
          >
            <Ionicons 
              name={isFullscreen ? 'contract-outline' : 'expand-outline'} 
              size={22} 
              color="#fff" 
            />
          </TouchableOpacity>
        </View>
      </View>

      {!isFullscreen && (
        <View style={styles.infoCard}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          
          {chapterInfo && (
            <Text style={styles.chapterText}>{chapterInfo}</Text>
          )}
          
          {courseName && (
            <View style={styles.courseRow}>
              <Ionicons name="book-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.courseName}>{courseName}</Text>
            </View>
          )}
        </View>
      )}

      <Modal
        visible={showQualitySelector}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQualitySelector(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowQualitySelector(false)}
        >
          <View style={styles.qualityModal}>
            <Text style={styles.qualityModalTitle}>Video Quality</Text>
            {playbackUrl?.availableQualities?.map((quality) => (
              <TouchableOpacity
                key={quality}
                style={[
                  styles.qualityOption,
                  selectedQuality === quality && styles.qualityOptionActive,
                ]}
                onPress={() => handleQualityChange(quality)}
                data-testid={`quality-option-${quality}`}
              >
                <Text
                  style={[
                    styles.qualityOptionText,
                    selectedQuality === quality && styles.qualityOptionTextActive,
                  ]}
                >
                  {quality}
                </Text>
                {selectedQuality === quality && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  fullscreenContainer: {
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#9CA3AF',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 24,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  backButtonError: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  backButtonErrorText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  videoStage: {
    backgroundColor: '#000',
    paddingTop: 44,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  qualityBadge: {
    position: 'absolute',
    top: 50,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    gap: 4,
    zIndex: 10,
  },
  qualityBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  fullscreenBackButton: {
    top: 20,
    left: 20,
  },
  fullscreenQualityBadge: {
    top: 20,
    right: 20,
  },
  videoWrapper: {
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  noVideoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noVideoText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
  },
  seekButton: {
    alignItems: 'center',
  },
  seekText: {
    fontSize: 11,
    color: '#fff',
    marginTop: 2,
    fontWeight: '500',
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  fullscreenProgressSection: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
  },
  fullscreenButton: {
    marginLeft: 8,
    padding: 4,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
    minWidth: 36,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    marginLeft: -6,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 16,
    paddingTop: 24,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 28,
  },
  chapterText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  courseName: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qualityModal: {
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  qualityModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  qualityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  qualityOptionActive: {
    backgroundColor: `${colors.primary}10`,
  },
  qualityOptionText: {
    fontSize: 16,
    color: '#374151',
  },
  qualityOptionTextActive: {
    fontWeight: '600',
    color: colors.primary,
  },
});
