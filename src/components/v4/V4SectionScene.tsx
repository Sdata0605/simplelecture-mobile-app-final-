import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Image } from 'react-native';
import {
  V4Section,
  V4Flashcard,
  V4NarrationSegment,
  resolveInfographicImages,
} from '../../services/v4PlayerService';

interface V4SectionSceneProps {
  section: V4Section;
  currentTime: number;
  isPlaying: boolean;
  duration?: number;
  jobId?: string;
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

function IntroScene({ section }: { section: V4Section }) {
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

// Build per-bullet reveal thresholds (start time in seconds) with a 3-tier fallback:
//  1. cumulative segment durations (validated monotonic + within avatar duration)
//  2. explicit per-segment start_seconds (validated monotonic + within bounds)
//  3. even distribution across the avatar duration (or N*4s when unknown)
function buildBulletThresholds(
  segs: V4NarrationSegment[],
  n: number,
  avatarDuration: number,
): number[] {
  if (n <= 0) return [];
  const within = (last: number) => avatarDuration <= 0 || last <= avatarDuration + 0.5;
  const strictlyIncreasing = (arr: number[]) => arr.every((v, i) => i === 0 || v > arr[i - 1]);

  // Tier 1 — cumulative durations: thresholds[i] = sum of durations before segment i
  if (segs.length >= n) {
    const cum: number[] = [];
    let acc = 0;
    let durationsOk = true;
    for (let i = 0; i < n; i++) {
      cum.push(acc);
      const d = segs[i].duration_seconds ?? segs[i].duration ?? 0;
      if (d <= 0) durationsOk = false;
      acc += d;
    }
    if (durationsOk && strictlyIncreasing(cum) && within(cum[n - 1])) return cum;
  }

  // Tier 2 — explicit start_seconds
  if (segs.length >= n) {
    const starts: number[] = [];
    let allPresent = true;
    for (let i = 0; i < n; i++) {
      const s = segs[i].start_seconds;
      if (s == null) { allPresent = false; break; }
      starts.push(s);
    }
    if (allPresent && strictlyIncreasing(starts) && within(starts[n - 1])) return starts;
  }

  // Tier 3 — even distribution
  const total = avatarDuration > 0 ? avatarDuration : n * 4;
  return Array.from({ length: n }, (_, i) => (i * total) / n);
}

function SummaryScene({
  section,
  currentTime,
  duration = 0,
}: {
  section: V4Section;
  currentTime: number;
  duration?: number;
}) {
  // 1. Pick the bullet source — prefer a `bullet_list` visual beat's display_text,
  //    else fall back to narration segments excluding intro-purpose ones.
  const filteredSegs = (section.narration?.segments || []).filter(s => s.purpose !== 'introduce');

  const bulletListBeat = (section.visual_beats || []).find(
    b => (b.visual_type as string) === 'bullet_list' && b.display_text != null,
  );
  const beatTexts = bulletListBeat
    ? (Array.isArray(bulletListBeat.display_text)
        ? bulletListBeat.display_text
        : [bulletListBeat.display_text as string])
    : [];

  const sourceTexts = beatTexts.length > 0 ? beatTexts : filteredSegs.map(s => s.text);
  const bullets = sourceTexts.slice(0, 6).map(t => (t || '').substring(0, 120));
  const n = bullets.length;

  // 2. Avatar duration — prefer the real video duration, fall back to narration total.
  const avatarDuration = duration > 0 ? duration : (section.narration?.total_duration_seconds || 0);

  // 3. Reveal thresholds (recomputed only when the section/source/duration changes).
  const thresholds = useMemo(
    () => buildBulletThresholds(filteredSegs, n, avatarDuration),
    [section.section_id, n, avatarDuration],
  );

  const anims = useRef(bullets.map(() => ({
    x: new Animated.Value(-16),
    op: new Animated.Value(0),
  }))).current;
  const animatedRef = useRef<boolean[]>(bullets.map(() => false));
  const [visibleCount, setVisibleCount] = useState(0);

  // Reset reveal state whenever the section changes.
  useEffect(() => {
    setVisibleCount(0);
    animatedRef.current = bullets.map(() => false);
    anims.forEach(a => { a.x.setValue(-16); a.op.setValue(0); });
  }, [section.section_id]);

  // Drive visibleCount from the avatar's real playback time (monotonic — never un-reveals).
  useEffect(() => {
    let count = 0;
    for (let i = 0; i < thresholds.length; i++) {
      if (currentTime + 0.05 >= thresholds[i]) count = i + 1; // 50ms lead-in
    }
    // End-of-section safety: force-show all bullets near the end.
    if (avatarDuration > 0 && currentTime >= avatarDuration - 0.5) count = n;
    setVisibleCount(prev => (count > prev ? count : prev));
  }, [currentTime, thresholds, avatarDuration, n]);

  // Animate any newly revealed bullets in (staggered fade + slide).
  useEffect(() => {
    for (let i = 0; i < visibleCount && i < anims.length; i++) {
      if (animatedRef.current[i]) continue;
      animatedRef.current[i] = true;
      const delay = i * 80;
      Animated.parallel([
        Animated.timing(anims[i].x, { toValue: 0, duration: 480, delay, useNativeDriver: true }),
        Animated.timing(anims[i].op, { toValue: 1, duration: 480, delay, useNativeDriver: true }),
      ]).start();
    }
  }, [visibleCount]);

  if (n === 0) return null;

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
    right: '50%',
    paddingRight: 8,
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

function MemoryScene({
  section,
  currentTime,
  duration = 0,
}: {
  section: V4Section;
  currentTime: number;
  duration?: number;
}) {
  const segs = section.narration?.segments || [];

  // Card source priority (per spec): section.flashcards[] supporting any of
  // q|front|question and a|back|answer. Fallback when there are no flashcards
  // (e.g. some memory_infographic sections): derive one card per narration
  // segment so the left half is never blank.
  const rawCards = section.flashcards || [];
  const cards: Required<Pick<V4Flashcard, 'front' | 'back'>>[] = rawCards.length > 0
    ? rawCards.map(c => ({
        front: c.front ?? c.q ?? c.question ?? '',
        back: c.back ?? c.a ?? c.answer ?? '',
      }))
    : segs.map((s, i) => ({
        front: `Card ${i + 1}`,
        back: (s.text || '').slice(0, 150),
      }));

  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const cardCount = cards.length;

  // The avatar's REAL duration drives card timing. The segments' start_seconds
  // in the data follow a padded timeline (~2x the real clip), so we accumulate
  // duration_seconds instead and fall back to an even split across the real
  // video duration when segment durations are missing/mismatched.
  const videoDuration = duration > 0 ? duration : (section.narration?.total_duration_seconds || 0);

  // Ref-guarded auto state — mirrors only what the auto loop last applied so we
  // never trigger a re-render unless the active card or flip actually changes.
  const autoStateRef = useRef({ idx: 0, autoFlipped: false });

  // Reset card + flip state whenever the section changes.
  useEffect(() => {
    setActiveCardIdx(0);
    setIsFlipped(false);
    autoStateRef.current = { idx: 0, autoFlipped: false };
    flipAnim.setValue(0);
  }, [section.section_id]);

  // Auto-advance cards and auto-flip at 45% through each card's segment, keyed
  // off the avatar's real playback time + cumulative segment durations.
  useEffect(() => {
    if (cardCount === 0) return;
    const fallbackPer = videoDuration > 0 ? videoDuration / cardCount : 8;

    let idx = 0;
    let cum = 0;
    let activeStart = 0;
    let activeDur = fallbackPer;
    for (let i = 0; i < cardCount; i++) {
      const effDur = segs[i]?.duration_seconds ?? segs[i]?.duration ?? fallbackPer;
      if (currentTime >= cum) {
        idx = i;
        activeStart = cum;
        activeDur = effDur;
      }
      cum += effDur;
    }

    const flipPoint = activeStart + activeDur * 0.45;
    const shouldFlip = currentTime >= flipPoint;

    const prev = autoStateRef.current;
    if (idx !== prev.idx) {
      autoStateRef.current = { idx, autoFlipped: shouldFlip };
      setActiveCardIdx(idx);
      setIsFlipped(shouldFlip);
      Animated.timing(flipAnim, { toValue: shouldFlip ? 1 : 0, duration: shouldFlip ? 550 : 300, useNativeDriver: true }).start();
    } else if (shouldFlip && !prev.autoFlipped) {
      autoStateRef.current = { idx, autoFlipped: true };
      setIsFlipped(true);
      Animated.timing(flipAnim, { toValue: 1, duration: 550, useNativeDriver: true }).start();
    }
  }, [currentTime, cardCount, videoDuration]);

  const flipManually = (toFlipped: boolean) => {
    setIsFlipped(toFlipped);
    // Mark autoFlipped so the auto loop won't immediately re-flip this card.
    autoStateRef.current = { ...autoStateRef.current, autoFlipped: true };
    Animated.timing(flipAnim, { toValue: toFlipped ? 1 : 0, duration: 550, useNativeDriver: true }).start();
  };

  const goToCard = (nextIdx: number) => {
    setActiveCardIdx(nextIdx);
    setIsFlipped(false);
    autoStateRef.current = { idx: nextIdx, autoFlipped: false };
    Animated.timing(flipAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
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
            if (activeCardIdx > 0) goToCard(activeCardIdx - 1);
          }}
          disabled={activeCardIdx === 0}
        >
          <Text style={memStyles.navBtnText}>‹ Prev</Text>
        </TouchableOpacity>
        <Text style={memStyles.counter}>{activeCardIdx + 1} / {cards.length}</Text>
        <TouchableOpacity
          style={[memStyles.navBtn, activeCardIdx === cards.length - 1 && memStyles.navBtnDisabled]}
          onPress={() => {
            if (activeCardIdx < cards.length - 1) goToCard(activeCardIdx + 1);
          }}
          disabled={activeCardIdx === cards.length - 1}
        >
          <Text style={memStyles.navBtnText}>Next ›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Infographic memory section: show the infographic image in the LEFT 50%
// (the avatar takes the right 50%, driven from the player). When the section
// carries multiple timed infographic beats, the displayed image follows the
// narration time. Renders nothing when no image is available.
function InfographicMemoryScene({
  section,
  currentTime,
  jobId = '',
}: {
  section: V4Section;
  currentTime: number;
  jobId?: string;
}) {
  const images = useMemo(
    () => resolveInfographicImages(section, jobId),
    [section.section_id, jobId],
  );

  if (images.length === 0) return null;

  // Pick the active image by current time; fall back to the last image whose
  // start has passed, else the first.
  let active = images[0];
  for (const img of images) {
    if (currentTime >= img.start && currentTime < img.end) {
      active = img;
      break;
    }
    if (currentTime >= img.start) active = img;
  }

  if (!active?.url) return null;

  return (
    <View style={infoStyles.container} pointerEvents="none">
      <Image source={{ uri: active.url }} style={infoStyles.image} resizeMode="contain" />
    </View>
  );
}

const infoStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: '50%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    zIndex: 10,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

const memStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 8,
    right: '50%',
    paddingRight: 8,
    paddingVertical: 10,
    justifyContent: 'center',
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

function RecapScene({ section, currentTime }: { section: V4Section; currentTime: number }) {
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

export default function V4SectionScene({ section, currentTime, isPlaying, duration, jobId }: V4SectionSceneProps) {
  const secType = (section.section_type || '').toLowerCase();
  switch (secType) {
    case 'intro':
      return <IntroScene section={section} />;
    case 'summary':
      return <SummaryScene section={section} currentTime={currentTime} duration={duration} />;
    case 'memory':
      return <MemoryScene section={section} currentTime={currentTime} duration={duration} />;
    case 'memory_infographic':
      return <InfographicMemoryScene section={section} currentTime={currentTime} jobId={jobId} />;
    case 'recap':
      return <RecapScene section={section} currentTime={currentTime} />;
    default:
      return null;
  }
}
