import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { V3Section, V3Flashcard } from '../../services/v3PlayerService';

interface V3SectionSceneProps {
  section: V3Section;
  currentTime: number;
  isPlaying: boolean;
}

const C = {
  bg: '#0d1117',
  surface: '#161b22',
  elevated: '#21262d',
  border: 'rgba(255,255,255,0.07)',
  text: '#e6edf3',
  muted: 'rgba(230,237,243,0.42)',
  gold: '#f6c44e',
  amber: '#ff9f43',
  teal: '#00d2b4',
  rose: '#ff6b8a',
  sky: '#79c0ff',
  green: '#7ee787',
};

// Avatar occupies the right 55% — text content stays in the left 44%
const CONTENT_RIGHT = '56%';

function IntroScene({ section }: { section: V3Section }) {
  const riseAnim = useRef(new Animated.Value(18)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(riseAnim, { toValue: 0, duration: 800, delay: 200, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 800, delay: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={introStyles.container} pointerEvents="none">
      <View style={introStyles.shimmer} />
      <Animated.Text
        style={[
          introStyles.title,
          { transform: [{ translateY: riseAnim }], opacity: opacityAnim },
        ]}
        numberOfLines={3}
      >
        {section.title}
      </Animated.Text>
    </View>
  );
}

const introStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shimmer: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.gold,
    marginBottom: 8,
    opacity: 0.8,
  },
  title: {
    fontSize: 50,
    fontFamily: 'Caveat_700Bold',
    color: C.gold,
    lineHeight: 58,
    textAlign: 'center',
    textShadowColor: 'rgba(246,196,78,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
    paddingHorizontal: 16,
  },
});

function SummaryScene({ section, currentTime }: { section: V3Section; currentTime: number }) {
  const segments = section.narration?.segments || [];
  // Exclude intro-purpose segments, cap at 6, truncate to 120 chars
  const filteredSegs = segments
    .filter(s => s.purpose !== 'introduce')
    .slice(0, 6);
  const bullets = filteredSegs.map(s => s.text.substring(0, 120));

  const anims = useRef(bullets.map(() => ({
    x: new Animated.Value(-16),
    op: new Animated.Value(0),
  }))).current;
  const revealedRef = useRef<boolean[]>(bullets.map(() => false));

  // Reveal each bullet when currentTime passes its start_seconds
  useEffect(() => {
    bullets.forEach((_, i) => {
      if (revealedRef.current[i]) return;
      const triggerTime = filteredSegs[i]?.start_seconds ?? i * 1.5;
      if (currentTime >= triggerTime) {
        revealedRef.current[i] = true;
        Animated.parallel([
          Animated.timing(anims[i].x, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(anims[i].op, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]).start();
      }
    });
  }, [currentTime]);

  // Reveal first bullet on mount; stagger remaining at 80ms intervals if they share the same start_seconds
  useEffect(() => {
    bullets.forEach((_, i) => {
      if (revealedRef.current[i]) return;
      const triggerTime = filteredSegs[i]?.start_seconds;
      if (triggerTime != null) return; // will be handled by currentTime effect
      revealedRef.current[i] = true;
      const delay = 300 + i * 80;
      Animated.parallel([
        Animated.timing(anims[i].x, { toValue: 0, duration: 480, delay, useNativeDriver: true }),
        Animated.timing(anims[i].op, { toValue: 1, duration: 480, delay, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  return (
    <View style={summaryStyles.container} pointerEvents="none">
      <Text style={summaryStyles.header}>By the end of this section, you will…</Text>
      {bullets.map((b, i) => (
        <Animated.View
          key={i}
          style={[summaryStyles.card, { transform: [{ translateX: anims[i].x }], opacity: anims[i].op }]}
        >
          <View style={summaryStyles.circle}>
            <Text style={summaryStyles.circleText}>{i + 1}</Text>
          </View>
          <Text style={summaryStyles.bulletText} numberOfLines={2}>{b}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    left: 8,
    right: CONTENT_RIGHT,
    zIndex: 10,
  },
  header: {
    fontSize: 9,
    color: C.sky,
    fontFamily: 'Sora_600SemiBold',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(22,27,34,0.88)',
    borderRadius: 6,
    padding: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  circle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    flexShrink: 0,
  },
  circleText: {
    fontSize: 9,
    color: '#1a1000',
    fontFamily: 'Sora_700Bold',
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    color: C.text,
    fontFamily: 'Sora_400Regular',
    lineHeight: 13,
  },
});

function MemoryScene({ section, currentTime }: { section: V3Section; currentTime: number }) {
  const rawCards = section.flashcards || [];
  const cards: Required<Pick<V3Flashcard, 'front' | 'back'>>[] = rawCards.map(c => ({
    front: c.front ?? c.q ?? c.question ?? '',
    back: c.back ?? c.a ?? c.answer ?? '',
  }));

  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const segs = section.narration?.segments || [];

  // Auto-advance cards and auto-flip at 45% through each segment
  useEffect(() => {
    if (cards.length === 0 || segs.length === 0) return;
    // Find which segment the current time falls in
    let cumTime = 0;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const dur = seg.duration_seconds ?? seg.duration ?? 0;
      const segStart = seg.start_seconds ?? cumTime;
      const segEnd = segStart + dur;
      if (currentTime >= segStart && currentTime < segEnd) {
        const cardIdx = Math.min(i, cards.length - 1);
        const progress = (currentTime - segStart) / dur;
        const shouldFlip = progress >= 0.45;

        if (cardIdx !== activeCardIdx) {
          setActiveCardIdx(cardIdx);
          // Unflip new card
          Animated.timing(flipAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
          setIsFlipped(false);
        } else if (shouldFlip && !isFlipped) {
          setIsFlipped(true);
          Animated.timing(flipAnim, { toValue: 1, duration: 550, useNativeDriver: true }).start();
        } else if (!shouldFlip && isFlipped && cardIdx !== activeCardIdx) {
          setIsFlipped(false);
          Animated.timing(flipAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
        }
        break;
      }
      cumTime = segEnd;
    }
  }, [currentTime]);

  const flipManually = (toFlipped: boolean) => {
    setIsFlipped(toFlipped);
    Animated.timing(flipAnim, { toValue: toFlipped ? 1 : 0, duration: 550, useNativeDriver: true }).start();
  };

  const frontRot = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRot = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const frontOp = flipAnim.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const backOp = flipAnim.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [0, 0, 1, 1] });

  if (cards.length === 0) return null;

  const card = cards[activeCardIdx];

  return (
    <View style={memStyles.container} pointerEvents="box-none">
      {/* Dot indicators */}
      <View style={memStyles.dots}>
        {cards.map((_, i) => (
          <View
            key={i}
            style={[memStyles.dot, i === activeCardIdx && memStyles.dotActive]}
          />
        ))}
      </View>

      {/* Flip card */}
      <TouchableOpacity
        style={memStyles.cardWrap}
        onPress={() => flipManually(!isFlipped)}
        activeOpacity={0.9}
      >
        <Animated.View style={[memStyles.face, memStyles.front, { opacity: frontOp, transform: [{ perspective: 800 }, { rotateY: frontRot }] }]}>
          <Text style={memStyles.faceLabel}>QUESTION</Text>
          <Text style={memStyles.faceText}>{card.front}</Text>
          <Text style={memStyles.tapHint}>tap to flip</Text>
        </Animated.View>
        <Animated.View style={[memStyles.face, memStyles.back, { opacity: backOp, transform: [{ perspective: 800 }, { rotateY: backRot }] }]}>
          <Text style={memStyles.faceLabel}>ANSWER</Text>
          <Text style={memStyles.faceText}>{card.back}</Text>
          <Text style={memStyles.tapHint}>tap to flip back</Text>
        </Animated.View>
      </TouchableOpacity>

      {/* Prev / Next navigation */}
      <View style={memStyles.nav}>
        <TouchableOpacity
          style={[memStyles.navBtn, activeCardIdx === 0 && memStyles.navBtnDisabled]}
          onPress={() => {
            if (activeCardIdx > 0) {
              setActiveCardIdx(activeCardIdx - 1);
              flipManually(false);
            }
          }}
          disabled={activeCardIdx === 0}
        >
          <Text style={memStyles.navBtnText}>‹ Prev</Text>
        </TouchableOpacity>
        <Text style={memStyles.counter}>{activeCardIdx + 1} / {cards.length}</Text>
        <TouchableOpacity
          style={[memStyles.navBtn, activeCardIdx === cards.length - 1 && memStyles.navBtnDisabled]}
          onPress={() => {
            if (activeCardIdx < cards.length - 1) {
              setActiveCardIdx(activeCardIdx + 1);
              flipManually(false);
            }
          }}
          disabled={activeCardIdx === cards.length - 1}
        >
          <Text style={memStyles.navBtnText}>Next ›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const memStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    left: 8,
    right: CONTENT_RIGHT,
    zIndex: 10,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 6,
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    backgroundColor: C.gold,
    width: 10,
  },
  cardWrap: {
    height: 100,
    position: 'relative',
    marginBottom: 6,
  },
  face: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  front: {
    backgroundColor: '#1a1f2a',
  },
  back: {
    backgroundColor: '#1a2030',
  },
  faceLabel: {
    fontSize: 7,
    color: C.muted,
    fontFamily: 'Sora_600SemiBold',
    letterSpacing: 0.14,
    marginBottom: 4,
    position: 'absolute',
    top: 7,
    left: 10,
  },
  faceText: {
    fontSize: 11,
    color: C.text,
    fontFamily: 'Sora_400Regular',
    textAlign: 'center',
    lineHeight: 16,
  },
  tapHint: {
    position: 'absolute',
    bottom: 6,
    fontSize: 7,
    color: C.muted,
    fontFamily: 'Sora_400Regular',
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(246,196,78,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(246,196,78,0.3)',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navBtnText: {
    fontSize: 9,
    color: C.gold,
    fontFamily: 'Sora_600SemiBold',
  },
  counter: {
    fontSize: 9,
    color: C.muted,
    fontFamily: 'Sora_400Regular',
  },
});

function RecapScene({ section, currentTime }: { section: V3Section; currentTime: number }) {
  const segments = section.narration?.segments || [];
  const opacities = useRef(segments.map(() => new Animated.Value(0))).current;
  const revealedRef = useRef<boolean[]>(segments.map(() => false));

  useEffect(() => {
    segments.forEach((seg, i) => {
      if (revealedRef.current[i]) return;
      const start = seg.start_seconds ?? 0;
      if (currentTime >= start) {
        revealedRef.current[i] = true;
        Animated.timing(opacities[i], { toValue: 1, duration: 600, useNativeDriver: true }).start();
      }
    });
  }, [currentTime]);

  return (
    <View style={recapStyles.container} pointerEvents="none">
      {segments.map((seg, i) => (
        <Animated.Text key={i} style={[recapStyles.text, { opacity: opacities[i] }]}>
          {seg.text}
        </Animated.Text>
      ))}
    </View>
  );
}

const recapStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 14,
    left: 10,
    right: CONTENT_RIGHT,
    zIndex: 10,
  },
  text: {
    fontSize: 15,
    color: C.gold,
    fontFamily: 'Caveat_600SemiBold',
    marginBottom: 8,
    lineHeight: 22,
    textShadowColor: 'rgba(246,196,78,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
});

export default function V3SectionScene({ section, currentTime, isPlaying }: V3SectionSceneProps) {
  const secType = (section.section_type || '').toLowerCase();
  switch (secType) {
    case 'intro':
      return <IntroScene section={section} />;
    case 'summary':
      return <SummaryScene section={section} currentTime={currentTime} />;
    case 'memory':
    case 'memory_infographic':
      return <MemoryScene section={section} currentTime={currentTime} />;
    case 'recap':
      return <RecapScene section={section} currentTime={currentTime} />;
    default:
      return null;
  }
}
