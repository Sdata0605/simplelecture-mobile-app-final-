import { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  Linking,
} from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';

const YT_ORIGIN = 'https://www.youtube.com';

interface YouTubePlayerModalProps {
  visible: boolean;
  videoId: string | null;
  title?: string;
  onClose: () => void;
}

// We use react-native-youtube-iframe (the official IFrame Player API wrapped in a
// correctly-configured WebView). The hand-rolled HTML host page failed on real
// devices with embed errors 152/153 because of subtle Android WebView setup the
// library already handles (correct baseUrl/origin, postMessage protocol, inline
// playback flags). The videos themselves embed fine on the web, so the library
// plays them here too. We still keep a "Watch on YouTube" fallback for the rare
// case where embedding is genuinely disabled (onError → embed_not_allowed).
export default function YouTubePlayerModal({
  visible,
  videoId,
  title,
  onClose,
}: YouTubePlayerModalProps) {
  const [loading, setLoading] = useState(true);
  const [playbackError, setPlaybackError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The app is locked to portrait in app.json, so the OS will not auto-rotate
  // when the player enters its native fullscreen. We explicitly rotate to
  // landscape on fullscreen enter and restore portrait on exit/close/unmount,
  // mirroring the FullscreenVideoPlayer pattern, so the user is never stuck.
  const restorePortrait = async () => {
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch (e) {
      console.log('[YouTubePlayer] restore portrait failed', e);
    }
  };

  const handleFullScreenChange = async (isFullScreen: boolean) => {
    StatusBar.setHidden(isFullScreen);
    try {
      if (isFullScreen) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    } catch (e) {
      console.log('[YouTubePlayer] fullscreen orientation failed', e);
    }
  };

  // Safety net: if the modal unmounts while still in fullscreen, restore portrait.
  useEffect(() => {
    return () => {
      StatusBar.setHidden(false);
      restorePortrait();
    };
  }, []);

  // The parent keeps this component mounted and only toggles `visible`/`videoId`,
  // so unmount cleanup never fires on a normal dismissal. Restore portrait and the
  // status bar whenever the modal becomes hidden so the user is never left stuck.
  useEffect(() => {
    if (!visible) {
      StatusBar.setHidden(false);
      restorePortrait();
    }
  }, [visible]);

  const handleClose = () => {
    StatusBar.setHidden(false);
    restorePortrait();
    onClose();
  };

  useEffect(() => {
    if (videoId) {
      setLoading(true);
      setPlaybackError(false);
      setPlaying(false);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      // The player normally reports "ready" within a second or two. If it never
      // does (script blocked, no network, init stall), surface the actionable
      // "Watch on YouTube" fallback instead of leaving a blank black player.
      safetyTimer.current = setTimeout(
        () => handleLoadError('ready-timeout'),
        15000,
      );
    }
    return () => {
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    };
  }, [videoId]);

  const screenWidth = Dimensions.get('window').width;
  const playerHeight = Math.round((screenWidth * 9) / 16);

  const handleLoadError = (context: string, detail?: unknown) => {
    console.log('[YouTubePlayer] load error:', context, detail);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    setLoading(false);
    setPlaybackError(true);
  };

  const handleReady = () => {
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    setLoading(false);
    // Start muted autoplay once the player is ready (Android blocks unmuted
    // autoplay); the user can unmute via the standard player controls.
    setPlaying(true);
  };

  const openInYouTube = () => {
    if (videoId) {
      Linking.openURL(`${YT_ORIGIN}/watch?v=${videoId}`);
    }
  };

  return (
    <Modal
      visible={visible && !!videoId}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title || 'Live Class'}
          </Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            testID="button-close-youtube"
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={[styles.playerWrapper, { height: playerHeight }]}>
          {videoId && !playbackError && (
            <YoutubePlayer
              key={videoId}
              height={playerHeight}
              width={screenWidth}
              videoId={videoId}
              play={playing}
              mute
              onReady={handleReady}
              onError={(error: string) => handleLoadError('embed-error', error)}
              onFullScreenChange={handleFullScreenChange}
              initialPlayerParams={{
                controls: true,
                rel: false,
                iv_load_policy: 3,
              }}
              webViewProps={{
                allowsInlineMediaPlayback: true,
                allowsFullscreenVideo: true,
                androidLayerType: 'hardware',
              }}
              webViewStyle={styles.webview}
            />
          )}

          {playbackError && (
            <View style={styles.errorOverlay}>
              <Ionicons name="alert-circle-outline" size={40} color="#FFFFFF" />
              <Text style={styles.errorTitle}>Can't play this video here</Text>
              <Text style={styles.errorSubtitle}>
                This video can't be played inside the app. You can watch it on YouTube instead.
              </Text>
              <TouchableOpacity
                style={styles.watchButton}
                onPress={openInYouTube}
                testID="button-watch-on-youtube"
              >
                <Ionicons name="logo-youtube" size={18} color="#FFFFFF" />
                <Text style={styles.watchButtonText}>Watch on YouTube</Text>
              </TouchableOpacity>
            </View>
          )}

          {loading && !playbackError && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#000000',
  },
  headerTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 12,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerWrapper: {
    width: '100%',
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  webview: {
    backgroundColor: '#000000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  errorSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    textAlign: 'center',
  },
  watchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: '#FF0000',
  },
  watchButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
