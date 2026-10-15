// The Home screen's pitch for the AI Teacher, shown to students without a plan: a sample lesson that plays by
// itself (a question, then the teacher explaining step by step, with the same orb as the Ask AI screen), what they
// get, and one button to the plans.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import { VoiceOrb, type VoiceOrbMode } from '../askAssistant/VoiceOrb';
import { ask } from '../askAssistant/askTheme';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import {
  DEMO_START,
  DEMO_TICK_MS,
  PROMO_BADGE,
  PROMO_CTA,
  PROMO_DEMOS,
  PROMO_FEATURES,
  PROMO_FOOTNOTE,
  PROMO_SUBTITLE,
  PROMO_TITLE,
  advanceDemo,
  demoPhase,
  finishedDemo,
  startDemo,
  type DemoPhase,
  type DemoState,
  type PromoIcon,
} from '../../services/aiTeacherPromo';

const ICONS: Record<PromoIcon, keyof typeof Ionicons.glyphMap> = {
  mic: 'mic',
  steps: 'layers',
  maths: 'calculator',
  quiz: 'help-circle',
};

const ORB_SIZE = 46;
/** The orb's layout box is 2.1x its diameter (room for its glow); the stage shows it clipped to 1.6x. */
const ORB_BOX = Math.round(ORB_SIZE * 1.6);

const ORB_MODE: Record<DemoPhase, VoiceOrbMode> = { asking: 'listening', explaining: 'speaking', done: 'idle' };

/** Plays the sample lessons in turn — paused while Home is not on screen, and shown complete to anyone who wants less motion. */
function usePromoDemo() {
  const focused = useIsFocused();
  const reduceMotion = useReduceMotion();
  const [state, setState] = useState<DemoState>(DEMO_START);

  useEffect(() => {
    if (!focused || reduceMotion) return;
    const id = setInterval(() => setState((s) => advanceDemo(s)), DEMO_TICK_MS);
    return () => clearInterval(id);
  }, [focused, reduceMotion]);

  const choose = useCallback((index: number) => setState(reduceMotion ? finishedDemo(index) : startDemo(index)), [reduceMotion]);

  return { state: reduceMotion ? finishedDemo(state.demo) : state, choose, reduceMotion };
}

/** A line of the lesson sliding in as the teacher says it. */
function Reveal({ children, instant }: { children: React.ReactNode; instant: boolean }) {
  const t = useRef(new Animated.Value(instant ? 1 : 0)).current;
  useEffect(() => {
    if (instant) return;
    Animated.timing(t, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [t, instant]);
  return (
    <Animated.View style={{ opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

function StepLine({ step }: { step: string }) {
  const [label, ...rest] = step.split(' · ');
  return (
    <Text style={styles.step}>
      <Text style={styles.stepLabel}>{label}</Text>
      {rest.length > 0 && <Text> · {rest.join(' · ')}</Text>}
    </Text>
  );
}

interface Props {
  /** The lowest plan price, shown as "From ₹…". */
  price: number;
  /** Opens the plans. */
  onPress: () => void;
}

export function AITeacherShowcase({ price, onPress }: Props) {
  const { state, choose, reduceMotion } = usePromoDemo();
  const demo = PROMO_DEMOS[state.demo] ?? PROMO_DEMOS[0];
  const phase = demoPhase(state);

  // The orb "hears" the question and "speaks" the steps: its level follows a made-up voice while one of those is going on.
  const phaseRef = useRef<DemoPhase>(phase);
  phaseRef.current = phase;
  const motionRef = useRef(reduceMotion);
  motionRef.current = reduceMotion;
  const getLevel = useCallback(() => {
    if (motionRef.current || phaseRef.current === 'done') return 0;
    return 0.3 + 0.35 * Math.abs(Math.sin(Date.now() / 170));
  }, []);

  return (
    <View style={styles.card}>
      <LinearGradient colors={['#0b2a25', '#050d0c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.glow} />

      <View style={styles.topRow}>
        <View style={styles.badge}>
          <Ionicons name="sparkles" size={12} color={ask.gold} />
          <Text style={styles.badgeText}>{PROMO_BADGE}</Text>
        </View>
        <View style={styles.price}>
          <Text style={styles.priceText}>From ₹{price}</Text>
        </View>
      </View>

      <Text style={styles.title}>{PROMO_TITLE}</Text>
      <Text style={styles.subtitle}>{PROMO_SUBTITLE}</Text>

      <View style={styles.stage}>
        <View style={styles.asked}>
          <View style={styles.askedHead}>
            <Ionicons name="mic" size={12} color={ask.mint} />
            <Text style={styles.askedLabel}>YOU ASKED · {demo.subject.toUpperCase()}</Text>
          </View>
          <Text style={styles.askedText}>“{demo.ask}”</Text>
        </View>

        <View style={styles.teacher}>
          <View style={styles.orbBox}>
            <VoiceOrb mode={ORB_MODE[phase]} getLevel={getLevel} size={ORB_SIZE} />
          </View>
          <View style={styles.steps}>
            {state.shown === 0 && <Text style={styles.listening}>Listening…</Text>}
            {demo.steps.slice(0, state.shown).map((step, i) => (
              <Reveal key={`${demo.id}-${i}`} instant={reduceMotion}>
                <StepLine step={step} />
              </Reveal>
            ))}
          </View>
        </View>

        <View style={styles.subjects}>
          {PROMO_DEMOS.map((d, i) => {
            const active = i === state.demo;
            return (
              <Pressable
                key={d.id}
                onPress={() => choose(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Sample lesson: ${d.subject}`}
                style={[styles.subject, active && styles.subjectActive]}
              >
                <Text style={[styles.subjectText, active && styles.subjectTextActive]}>{d.subject}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.grid}>
        {PROMO_FEATURES.map((feature) => (
          <View key={feature.id} style={styles.tile}>
            <View style={styles.tileIcon}>
              <Ionicons name={ICONS[feature.icon]} size={15} color={ask.mint} />
            </View>
            <Text style={styles.tileTitle}>{feature.title}</Text>
            <Text style={styles.tileBody}>{feature.body}</Text>
          </View>
        ))}
      </View>

      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={PROMO_CTA} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}>
        <LinearGradient colors={['#7ce0c3', '#5eead4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <Text style={styles.ctaText}>{PROMO_CTA}</Text>
        <Ionicons name="arrow-forward" size={16} color={ask.onMint} />
      </Pressable>
      <Text style={styles.footnote}>{PROMO_FOOTNOTE}</Text>
    </View>
  );
}

export default AITeacherShowcase;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 10,
    padding: 16,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ask.lineStrong,
    backgroundColor: ask.bg,
  },
  glow: {
    position: 'absolute',
    top: -70,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(124, 224, 195, 0.1)',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: ask.goldSoft,
    borderWidth: 1,
    borderColor: 'rgba(245, 198, 106, 0.3)',
  },
  badgeText: { color: ask.gold, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  price: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: ask.mintFill },
  priceText: { color: ask.mint, fontSize: 11, fontWeight: '800' },
  title: { color: ask.ink, fontSize: 23, lineHeight: 29, fontWeight: '800' },
  subtitle: { color: ask.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },

  stage: {
    marginTop: 14,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ask.line,
    backgroundColor: ask.panel,
  },
  asked: { paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ask.lineStrong },
  askedHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  askedLabel: { color: ask.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  askedText: { color: ask.ink, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  // Room for all three steps, so the card does not grow and shrink as the lesson plays.
  teacher: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, minHeight: 112 },
  orbBox: { width: ORB_BOX, height: ORB_BOX, borderRadius: ORB_BOX / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  steps: { flex: 1, minWidth: 0, gap: 6, justifyContent: 'center' },
  listening: { color: ask.muted, fontSize: 13, fontStyle: 'italic' },
  step: { color: ask.ink, fontSize: 13, lineHeight: 18 },
  stepLabel: { color: ask.mint, fontWeight: '800' },
  subjects: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  subject: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: ask.line },
  subjectActive: { borderColor: ask.mint, backgroundColor: ask.mintFill },
  subjectText: { color: ask.muted, fontSize: 11, fontWeight: '700' },
  subjectTextActive: { color: ask.mint },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    padding: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ask.line,
    backgroundColor: ask.panel,
  },
  tileIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ask.mintSoft,
    marginBottom: 7,
  },
  tileTitle: { color: ask.ink, fontSize: 13, fontWeight: '800', marginBottom: 2 },
  tileBody: { color: ask.muted, fontSize: 11, lineHeight: 15 },

  cta: {
    marginTop: 14,
    height: 48,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: { color: ask.onMint, fontSize: 15, fontWeight: '800' },
  footnote: { color: ask.muted, fontSize: 10, textAlign: 'center', marginTop: 8 },
});
