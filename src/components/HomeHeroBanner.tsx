import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  ImageBackground,
  AppState,
  AppStateStatus,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily } from '../constants/theme';

const heroImage = require('../../assets/students_studying_real.png');

const { width: SCREEN_W } = Dimensions.get('window');
const BANNER_H = 256;
const ROTATE_MS = 5000;
const FADE_MS = 700;

interface Slide {
  title: string;
  subtitle: string;
  bullets: string[];
  ctaLabel: string;
}

// Copy is verbatim from the home page spec (heroSlideData).
const SLIDES: Slide[] = [
  {
    title: 'SSLC Board Exam Prep',
    subtitle: 'Score 90+ in Your 10th Board Exams',
    bullets: ['All subjects covered', 'AI doubt clearing 24/7', 'Unlimited practice tests'],
    ctaLabel: 'Start Learning - ₹1000 + GST',
  },
  {
    title: '10th Board Made Easy',
    subtitle: 'Complete SSLC Course with AI Tutoring',
    bullets: ['Chapter-wise video lessons', 'Previous year papers solved', 'Personalized weak area focus'],
    ctaLabel: 'Join Now - ₹1000 + GST',
  },
  {
    title: 'Ace Your SSLC Exams',
    subtitle: 'Maths, Science, Social Studies & More',
    bullets: ['Kannada & English medium', 'Mock tests & quizzes', 'Track your progress daily'],
    ctaLabel: 'Get Started Today',
  },
];

interface Props {
  onPrimaryPress: () => void;
  onPreviewPress: () => void;
}

export default function HomeHeroBanner({ onPrimaryPress, onPreviewPress }: Props) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const indexRef = useRef(0);
  indexRef.current = index;
  const pausedRef = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      pausedRef.current = next !== 'active';
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      Animated.timing(fade, {
        toValue: 0,
        duration: FADE_MS / 2,
        useNativeDriver: true,
      }).start(() => {
        setIndex((prev) => (prev + 1) % SLIDES.length);
        Animated.timing(fade, {
          toValue: 1,
          duration: FADE_MS / 2,
          useNativeDriver: true,
        }).start();
      });
    }, ROTATE_MS);
    return () => clearInterval(interval);
  }, [fade]);

  const slide = SLIDES[index];

  return (
    <View style={styles.container} testID="home-hero-banner">
      <ImageBackground source={heroImage} style={styles.bg} resizeMode="cover">
        <LinearGradient
          colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View style={[styles.content, { opacity: fade }]}>
          <Text style={styles.title} numberOfLines={1}>{slide.title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{slide.subtitle}</Text>
          <View style={styles.bullets}>
            {slide.bullets.map((b) => (
              <View key={b} style={styles.bulletRow}>
                <Ionicons name="checkmark-circle" size={13} color={colors.primaryLight} />
                <Text style={styles.bulletText} numberOfLines={1}>{b}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={styles.primaryCta}
            onPress={onPrimaryPress}
            activeOpacity={0.85}
            testID="button-hero-primary"
          >
            <Text style={styles.primaryCtaText} numberOfLines={1}>{slide.ctaLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryCta}
            onPress={onPreviewPress}
            activeOpacity={0.85}
            testID="button-hero-preview"
          >
            <Ionicons name="play" size={13} color={colors.white} />
            <Text style={styles.secondaryCtaText}>Free Preview</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]} />
          ))}
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_W,
    height: BANNER_H,
    backgroundColor: '#0d1117',
    marginBottom: 12,
  },
  bg: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    paddingHorizontal: 18,
  },
  title: {
    color: colors.white,
    fontFamily: fontFamily.heading,
    fontSize: 22,
    marginBottom: 3,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginBottom: 10,
  },
  bullets: {
    gap: 4,
    marginBottom: 14,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bulletText: {
    color: 'rgba(255,255,255,0.92)',
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  ctaRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: 10,
    marginBottom: 14,
  },
  primaryCta: {
    backgroundColor: colors.white,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
  },
  primaryCtaText: {
    color: colors.primaryDark,
    fontFamily: fontFamily.bold,
    fontSize: 13,
  },
  secondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
  },
  secondaryCtaText: {
    color: colors.white,
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  dots: {
    position: 'absolute',
    top: 12,
    right: 14,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 16,
    backgroundColor: colors.white,
  },
  dotInactive: {
    width: 8,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});
