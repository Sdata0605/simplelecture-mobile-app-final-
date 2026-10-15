/**
 * Slide-presentation player for a Doubts answer's `slide_preview`.
 *
 * Progress bar: a single tappable strip. Tap anywhere to jump to the slide
 * that falls at that point in time. Fill = (elapsed + positionSec) / total.
 * Prev / next / play controls are fully async (generation-ref teardown).
 */
import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { DoubtSlidePreview } from '../../utils/doubtThreads';

const NO_AUDIO_SLIDE_SECONDS = 6;

const colors = {
  primary: '#2BBD6E',
  primaryLight: '#DCFCE7',
  text: '#1F2937',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  track: '#E5E7EB',
  card: '#FFFFFF',
};

interface SlidePreviewPlayerProps {
  preview: DoubtSlidePreview;
}

const SlidePreviewPlayer = memo(({ preview }: SlidePreviewPlayerProps) => {
  const slides = preview.presentation_slides;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  // Measured pixel width of the progress bar for tap-to-seek math.
  const [barWidth, setBarWidth] = useState(0);

  const generationRef = useRef(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);
  indexRef.current = index;
  const playingRef = useRef(false);
  playingRef.current = playing;

  // ─── duration helpers ────────────────────────────────────────────────────

  const audioByIndex = useMemo(() => {
    const map = new Map<number, { audioUrl: string; duration?: number }>();
    for (const u of preview.slide_audio_urls?.urls ?? []) {
      map.set(u.slideIndex, { audioUrl: u.audioUrl, duration: u.duration });
    }
    return map;
  }, [preview]);

  const slideDurations = useMemo(
    () =>
      slides.map((_, i) => {
        const d = audioByIndex.get(i)?.duration;
        return d && d > 0 ? d : NO_AUDIO_SLIDE_SECONDS;
      }),
    [slides, audioByIndex]
  );

  const totalSeconds = useMemo(() => {
    const summed = slideDurations.reduce((a, b) => a + b, 0);
    return preview.total_duration_seconds && preview.total_duration_seconds > 0
      ? preview.total_duration_seconds
      : summed;
  }, [preview, slideDurations]);

  const elapsedBefore = useCallback(
    (i: number) => slideDurations.slice(0, i).reduce((a, b) => a + b, 0),
    [slideDurations]
  );

  // ─── teardown ─────────────────────────────────────────────────────────────

  const stopEverything = useCallback((): number => {
    const newGen = generationRef.current + 1;
    generationRef.current = newGen;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) {
      sound.setOnPlaybackStatusUpdate(null);
      sound.unloadAsync().catch(() => {});
    }
    return newGen;
  }, []);

  useEffect(() => {
    return () => { stopEverything(); };
  }, [stopEverything]);

  // ─── playback ─────────────────────────────────────────────────────────────

  const playSlide = useCallback(async (i: number) => {
    const myGen = stopEverything();
    setIndex(i);
    setPositionSec(0);
    setPlaying(true);

    const narration = audioByIndex.get(i);
    if (!narration) {
      fallbackTimerRef.current = setTimeout(() => {
        if (generationRef.current !== myGen) return;
        const next = i + 1;
        if (next < slides.length) {
          playSlide(next);
        } else {
          stopEverything();
          setPlaying(false);
        }
      }, NO_AUDIO_SLIDE_SECONDS * 1000);
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      if (generationRef.current !== myGen) return;

      const { sound } = await Audio.Sound.createAsync(
        { uri: narration.audioUrl },
        { shouldPlay: true }
      );
      if (generationRef.current !== myGen) {
        sound.unloadAsync().catch(() => {});
        return;
      }

      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((s) => {
        if (generationRef.current !== myGen) return;
        if (!s.isLoaded) return;
        if (s.didJustFinish) {
          const next = i + 1;
          if (next < slides.length) {
            playSlide(next);
          } else {
            stopEverything();
            setPlaying(false);
            setPositionSec(slideDurations[i] ?? 0);
          }
        } else {
          setPositionSec((s.positionMillis || 0) / 1000);
        }
      });
    } catch {
      if (generationRef.current !== myGen) return;
      fallbackTimerRef.current = setTimeout(() => {
        if (generationRef.current !== myGen) return;
        const next = i + 1;
        if (next < slides.length) {
          playSlide(next);
        } else {
          stopEverything();
          setPlaying(false);
        }
      }, NO_AUDIO_SLIDE_SECONDS * 1000);
    }
  }, [audioByIndex, slides.length, slideDurations, stopEverything]);

  // ─── control handlers ─────────────────────────────────────────────────────

  const handlePlayPause = useCallback(() => {
    if (playingRef.current) {
      stopEverything();
      setPlaying(false);
      setPositionSec(0);
    } else {
      playSlide(indexRef.current);
    }
  }, [playSlide, stopEverything]);

  const handlePrev = useCallback(() => {
    const i = Math.max(0, indexRef.current - 1);
    if (playingRef.current) {
      playSlide(i);
    } else {
      stopEverything();
      setIndex(i);
      setPositionSec(0);
    }
  }, [playSlide, stopEverything]);

  const handleNext = useCallback(() => {
    const i = Math.min(slides.length - 1, indexRef.current + 1);
    if (playingRef.current) {
      playSlide(i);
    } else {
      stopEverything();
      setIndex(i);
      setPositionSec(0);
    }
  }, [playSlide, slides.length, stopEverything]);

  /**
   * Tap anywhere on the progress bar → map tap X to a time fraction →
   * find which slide owns that time → jump there.
   */
  const handleBarPress = useCallback((e: { nativeEvent: { locationX: number } }) => {
    if (barWidth <= 0 || totalSeconds <= 0) return;
    const fraction = Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth));
    const targetSec = fraction * totalSeconds;

    // Walk slides to find which slide owns targetSec.
    let elapsed = 0;
    let targetIndex = slides.length - 1;
    for (let i = 0; i < slides.length; i++) {
      const end = elapsed + slideDurations[i];
      if (targetSec <= end) {
        targetIndex = i;
        break;
      }
      elapsed = end;
    }

    if (playingRef.current) {
      playSlide(targetIndex);
    } else {
      stopEverything();
      setIndex(targetIndex);
      setPositionSec(0);
    }
  }, [barWidth, totalSeconds, slides.length, slideDurations, playSlide, stopEverything]);

  const handleBarLayout = useCallback((e: LayoutChangeEvent) => {
    setBarWidth(e.nativeEvent.layout.width);
  }, []);

  // ─── progress fraction ────────────────────────────────────────────────────

  const progress = totalSeconds > 0
    ? Math.min(1, (elapsedBefore(index) + positionSec) / totalSeconds)
    : 0;

  // ─── render ───────────────────────────────────────────────────────────────

  const slide = slides[index];
  const imageUrl = preview.image_urls?.[String(index)]?.url ?? slide?.infographicUrl;

  return (
    <View style={styles.card}>

      {/* Header */}
      <View style={styles.headerRow}>
        <Ionicons name="easel-outline" size={14} color={colors.primary} />
        <Text style={styles.headerText}>Watch this explained</Text>
        <Text style={styles.slideCount}>{index + 1}/{slides.length}</Text>
      </View>

      {/* Slide content */}
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" />
      ) : (
        <View style={styles.slideTextBlock}>
          {!!slide?.title && <Text style={styles.slideTitle}>{slide.title}</Text>}
          {!!slide?.content && <Text style={styles.slideContent}>{slide.content}</Text>}
          {(slide?.bullet_points ?? []).map((b, bi) => (
            <View key={bi} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{b}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Single tappable progress bar */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleBarPress}
        onLayout={handleBarLayout}
        style={styles.progressTrack}
        testID="progress-bar"
      >
        <View style={styles.progressRail}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </TouchableOpacity>

      {/* Controls */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handlePrev}
          disabled={index === 0}
          style={[styles.controlButton, index === 0 && styles.controlDisabled]}
          testID="button-slide-prev"
        >
          <Ionicons name="play-skip-back" size={14} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handlePlayPause}
          style={styles.playButton}
          testID="button-slide-play"
        >
          <Ionicons name={playing ? 'stop' : 'play'} size={16} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleNext}
          disabled={index === slides.length - 1}
          style={[styles.controlButton, index === slides.length - 1 && styles.controlDisabled]}
          testID="button-slide-next"
        >
          <Ionicons name="play-skip-forward" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    padding: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  headerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.text,
  },
  slideCount: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
  },
  slideTextBlock: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  slideTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  slideContent: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  bulletDot: {
    fontSize: 13,
    color: colors.primary,
    marginRight: 6,
    fontWeight: '700',
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },

  // ── Progress bar ──
  progressTrack: {
    height: 20,             // tall hit area so fingers can tap easily
    marginTop: 10,
    marginBottom: 2,
    justifyContent: 'center',
  },
  progressRail: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },

  // ── Controls ──
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 4,
  },
  controlButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlDisabled: {
    opacity: 0.35,
  },
  playButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SlidePreviewPlayer;
