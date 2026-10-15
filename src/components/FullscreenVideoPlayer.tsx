import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Text,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';

interface FullscreenVideoPlayerProps {
  videoUrl: string;
  onClose: () => void;
  onVideoEnd?: () => void;
}

export default function FullscreenVideoPlayer({
  videoUrl,
  onClose,
  onVideoEnd,
}: FullscreenVideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    lockToLandscape();
    StatusBar.setHidden(true);

    return () => {
      unlockOrientation();
      StatusBar.setHidden(false);
    };
  }, []);

  const lockToLandscape = async () => {
    try {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE
      );
    } catch (error) {
      console.error('Failed to lock orientation:', error);
    }
  };

  const unlockOrientation = async () => {
    try {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
    } catch (error) {
      console.error('Failed to unlock orientation:', error);
    }
  };

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        console.error('Video error:', status.error);
      }
      return;
    }

    setIsLoading(false);
    setIsPlaying(status.isPlaying);
    setProgress(status.positionMillis || 0);
    setDuration(status.durationMillis || 0);

    if (status.didJustFinish) {
      handleVideoEnd();
    }
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
    if (onVideoEnd) {
      onVideoEnd();
    }
  };

  const handleScreenTap = async () => {
    if (showControls) {
      if (videoRef.current) {
        if (isPlaying) {
          await videoRef.current.pauseAsync();
        } else {
          await videoRef.current.playAsync();
        }
      }
    } else {
      setShowControls(true);
      resetControlsTimeout();
    }
  };

  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const handleClose = async () => {
    if (videoRef.current) {
      await videoRef.current.stopAsync();
    }
    await unlockOrientation();
    StatusBar.setHidden(false);
    onClose();
  };

  const formatTime = (millis: number): string => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      <TouchableWithoutFeedback onPress={handleScreenTap}>
        <View style={styles.videoContainer}>
          <Video
            ref={videoRef}
            source={{ uri: videoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={true}
            isLooping={false}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            onLoad={() => setIsLoading(false)}
            onError={(error) => console.error('Video load error:', error)}
          />

          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#2BBD6E" />
              <Text style={styles.loadingText}>Loading video...</Text>
            </View>
          )}

          {showControls && (
            <View style={styles.controlsOverlay}>
              <View style={styles.topControls}>
                <TouchableWithoutFeedback onPress={handleClose}>
                  <View style={styles.closeButton}>
                    <Ionicons name="close" size={28} color="white" />
                  </View>
                </TouchableWithoutFeedback>
              </View>

              <View style={styles.centerControls}>
                <View style={styles.playPauseButton}>
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={48}
                    color="white"
                  />
                </View>
              </View>

              <View style={styles.bottomControls}>
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View
                      style={[styles.progressFill, { width: `${progressPercent}%` }]}
                    />
                  </View>
                  <View style={styles.timeRow}>
                    <Text style={styles.timeText}>{formatTime(progress)}</Text>
                    <Text style={styles.timeText}>{formatTime(duration)}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {!showControls && !isPlaying && !isLoading && (
            <View style={styles.pausedOverlay}>
              <View style={styles.playPauseButton}>
                <Ionicons name="play" size={48} color="white" />
              </View>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: Math.max(width, height),
    height: Math.min(width, height),
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    marginTop: 16,
    fontSize: 16,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'space-between',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerControls: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(43, 189, 110, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomControls: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  progressContainer: {
    width: '100%',
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2BBD6E',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    color: 'white',
    fontSize: 12,
  },
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
