import { useRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio, Video, ResizeMode } from 'expo-av';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { HOMEPAGE_HERO_LECTURE } from '../lib/homepageHeroLecture';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_H_MARGIN = 16; // horizontal margin on each side
const CARD_W = SCREEN_W - CARD_H_MARGIN * 2;
// 16:9 height, but never smaller than the minimum card height. Using a single
// explicit height (instead of height + a larger minHeight) keeps the laid-out
// height in sync with what the video actually occupies, so following sections
// are positioned below the real bottom of the card.
const CARD_MIN_H = 270;
const CARD_H = Math.max(Math.round((CARD_W * 9) / 16), CARD_MIN_H);

export default function HeroVideoBanner() {
  const videoRef = useRef<Video>(null);
  const isFocused = useIsFocused();
  const [isMuted, setIsMuted] = useState(true);

  // Make the video's audio actually audible: without this, iOS keeps media
  // silent when the ringer switch is on silent. Same audio mode the AI
  // narration player uses, so behavior stays consistent app-wide.
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});
  }, []);

  // Pause when screen loses focus; resume when it regains focus.
  // This also satisfies the "release when not visible" requirement —
  // pausing (vs unloading) keeps the surface alive so no setSurface/Released
  // crash on Android when the screen comes back.
  useFocusEffect(
    useCallback(() => {
      // Resume playback when screen comes into focus
      if (videoRef.current) {
        videoRef.current.playAsync().catch(() => {
          // video may not be loaded yet — shouldPlay handles initial autoplay
        });
      }

      return () => {
        // Pause (not unload) on blur — keeps the Android surface alive
        // to avoid the setSurface/Released crash on return
        if (videoRef.current) {
          videoRef.current.pauseAsync().catch(() => {});
        }
      };
    }, [])
  );

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Video
          ref={videoRef}
          source={{ uri: HOMEPAGE_HERO_LECTURE.videoMp4Url }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={isFocused}
          isMuted={isMuted}
          isLooping
          useNativeControls
        />
        <TouchableOpacity
          style={styles.muteButton}
          onPress={() => setIsMuted((m) => !m)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={isMuted ? 'Unmute video' : 'Mute video'}
          data-testid="button-toggle-mute"
        >
          <Ionicons
            name={isMuted ? 'volume-mute' : 'volume-high'}
            size={18}
            color="#FFFFFF"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_W,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
    // Bring the shadow into view on Android
    paddingHorizontal: CARD_H_MARGIN,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.2)',
    // Android shadow
    elevation: 8,
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  muteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
});
