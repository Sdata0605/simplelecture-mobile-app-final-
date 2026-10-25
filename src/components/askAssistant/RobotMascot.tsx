// Friendly AI-tutor robot mascot for the hands-free "Ask AI" screen — a drop-in
// replacement for VoiceOrb (same props, same 5 modes).
//
// The app carries neither SVG nor Skia and must not gain a native dependency,
// so the whole character is plain Views + LinearGradient layers:
//   - the "ceramic" shell is a diagonal pearl gradient, a vertical shade
//     overlay, a translucent-white bevel border, a specular highlight and a
//     mint rim crescent (a mint copy of the shape peeking out bottom-right),
//   - glows are stacks of translucent discs (no elevation/shadow props, which
//     render differently on Android),
//   - ellipses are circles squashed with scaleY,
//   - arc eyes / smile are half rings clipped by a half-height parent,
//   - the heart is a 45deg square with two discs on its upper edges,
//   - the sparkles are two squashed 45deg squares crossed.
//
// Everything is laid out in a fixed 200-unit square and scaled by size/200, so
// the robot is crisp at any size and renders exactly size x size.
//
// Mode changes are the only React re-renders: each mode drives a 0..1 shared
// "amount" that every animated style blends from, so modes cross-fade. Blinks
// and eye saccades are scheduled by JS timers that only write shared values.
// The audio level arrives through getLevel() and is sampled into a shared
// value (same approach as VoiceOrb, with attack/release smoothing), never
// through React state.
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityRole, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ask } from './askTheme';
import type { VoiceOrbMode, VoiceOrbProps } from './VoiceOrb';

export type RobotMascotProps = VoiceOrbProps;

const C = {
  white: '#ffffff',
  screen: '#03070a',
  mint: ask.mint,
  mintLight: '#c9fbec',
  mintDeep: '#3fb79a',
  mintDark: '#2a8f77',
  gold: ask.gold,
  rose: ask.rose,
  ink: '#0a1416',
} as const;

const PEARL = ['#ffffff', '#f2f6f6', '#d6e0e1', '#aebfc2'] as const;
const PEARL_LOC = [0, 0.38, 0.8, 1] as const;
const SHADE = ['rgba(90,116,122,0)', 'rgba(90,116,122,0.26)'] as const;
const RIM = 'rgba(124,224,195,0.8)';
const MINT_A = (a: number) => `rgba(124,224,195,${a})`;

const MODE_MS = 380;
const LEVEL_SAMPLE_MS = 33; // ~30fps, same as VoiceOrb
const TAU = Math.PI * 2;

type S = (n: number) => number;
type Box = (x: number, y: number, w: number, h: number, ox?: number, oy?: number) => ViewStyle;
type SV = SharedValue<number>;

function makeScale(size: number) {
  const k = size / 200;
  const s: S = (n) => n * k;
  /** Absolute box in 200-unit space, optionally relative to a parent at (ox, oy). */
  const box: Box = (x, y, w, h, ox = 0, oy = 0) => ({
    position: 'absolute',
    left: s(x - ox),
    top: s(y - oy),
    width: s(w),
    height: s(h),
  });
  return { s, box };
}

const clamp01 = (v: number) => {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
};

// ---------------------------------------------------------------------------
// Static building blocks
// ---------------------------------------------------------------------------

/** Circle of diameter d centred at (cx, cy), optionally squashed into an ellipse. */
function disc(s: S, cx: number, cy: number, d: number, color: string, squash = 1, ox = 0, oy = 0): ViewStyle {
  return {
    position: 'absolute',
    left: s(cx - d / 2 - ox),
    top: s(cy - d / 2 - oy),
    width: s(d),
    height: s(d),
    borderRadius: s(d / 2),
    backgroundColor: color,
    ...(squash !== 1 ? { transform: [{ scaleY: squash }] } : null),
  };
}

/**
 * Glossy pearl-ceramic panel: contact shadow, mint rim crescent, diagonal pearl
 * gradient, bottom shade, white bevel border and a specular highlight.
 * `spec` is the highlight rect in the panel's local 200-space units.
 */
function Shell({
  s,
  box,
  x,
  y,
  w,
  h,
  r,
  ox = 0,
  oy = 0,
  rim = 1.8,
  spec,
}: {
  s: S;
  box: Box;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  ox?: number;
  oy?: number;
  rim?: number;
  spec?: readonly [number, number, number, number] | false;
}) {
  const sp = spec === undefined ? ([w * 0.14, h * 0.07, w * 0.4, Math.max(3, h * 0.15)] as const) : spec;
  return (
    <>
      <View style={[box(x - 0.8, y + 1.4, w + 1.6, h + 1.2, ox, oy), { borderRadius: s(r + 0.8), backgroundColor: 'rgba(0,0,0,0.35)' }]} />
      {rim > 0 && (
        <View style={[box(x + rim * 0.55, y + rim, w, h, ox, oy), { borderRadius: s(r), backgroundColor: RIM }]} />
      )}
      <View
        style={[
          box(x, y, w, h, ox, oy),
          { borderRadius: s(r), overflow: 'hidden', borderWidth: s(0.9), borderColor: 'rgba(255,255,255,0.6)' },
        ]}
      >
        <LinearGradient colors={PEARL} locations={PEARL_LOC} start={{ x: 0.12, y: 0 }} end={{ x: 0.88, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={SHADE} start={{ x: 0.5, y: 0.5 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        {sp && (
          <View
            style={{
              position: 'absolute',
              left: s(sp[0]),
              top: s(sp[1]),
              width: s(sp[2]),
              height: s(sp[3]),
              borderRadius: s(sp[3] / 2),
              overflow: 'hidden',
              transform: [{ rotate: '-6deg' }],
            }}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}
      </View>
    </>
  );
}

/** Heart centred at (cx, cy); `a` is the side of the rotated square. */
function Heart({ cx, cy, a, color, s }: { cx: number; cy: number; a: number; color: string; s: S }) {
  const sqY = cy + a * 0.18;
  const off = a * 0.3536;
  const lobe = (dx: number): ViewStyle => ({
    position: 'absolute',
    left: s(cx + dx - a / 2),
    top: s(sqY - off - a / 2),
    width: s(a),
    height: s(a),
    borderRadius: s(a / 2),
    backgroundColor: color,
  });
  return (
    <>
      <View
        style={{
          position: 'absolute',
          left: s(cx - a / 2),
          top: s(sqY - a / 2),
          width: s(a),
          height: s(a),
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View style={lobe(-off)} />
      <View style={lobe(off)} />
    </>
  );
}

/** Four-point sparkle filling a len x len box. */
function SparkleShape({ len, color, s }: { len: number; color: string; s: S }) {
  const q = len * 0.3;
  const diamond = (sx: number, sy: number): ViewStyle => ({
    position: 'absolute',
    left: s(len / 2 - q / 2),
    top: s(len / 2 - q / 2),
    width: s(q),
    height: s(q),
    borderRadius: s(q * 0.12),
    backgroundColor: color,
    transform: [{ scaleX: sx }, { scaleY: sy }, { rotate: '45deg' }],
  });
  return (
    <>
      <View style={disc(s, len / 2, len / 2, len * 0.62, color === C.gold ? 'rgba(245,198,106,0.16)' : MINT_A(0.16))} />
      <View style={diamond(1, 2.7)} />
      <View style={diamond(2.7, 1)} />
      <View style={disc(s, len / 2, len / 2, q * 0.7, 'rgba(255,255,255,0.9)')} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Animated parts
// ---------------------------------------------------------------------------

function Sparkle({ cx, cy, len, delay, color, twinkle, u, s }: { cx: number; cy: number; len: number; delay: number; color: string; twinkle: SV; u: number; s: S }) {
  const style = useAnimatedStyle(() => {
    const t = (twinkle.value + delay) % 1;
    const wave = 0.5 + 0.5 * Math.sin(t * TAU);
    const sharp = wave * wave;
    return {
      opacity: 0.3 + sharp * 0.7,
      transform: [
        { translateY: Math.sin((t + 0.25) * TAU) * u * 2.5 },
        { translateX: Math.cos(t * TAU) * u * 1.2 },
        { scale: 0.62 + sharp * 0.48 },
        { rotate: `${t * 90}deg` },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: s(cx - len / 2), top: s(cy - len / 2), width: s(len), height: s(len) }, style]}>
      <SparkleShape len={len} color={color} s={s} />
    </Animated.View>
  );
}

/** Tiny glowing mote that drifts upwards and fades. */
function Mote({ cx, cy, d, delay, drift, u, s }: { cx: number; cy: number; d: number; delay: number; drift: SV; u: number; s: S }) {
  const style = useAnimatedStyle(() => {
    const t = (drift.value + delay) % 1;
    const fade = Math.sin(t * Math.PI);
    return {
      opacity: fade * 0.85,
      transform: [{ translateY: -t * u * 34 }, { translateX: Math.sin(t * TAU) * u * 3 }, { scale: 0.6 + fade * 0.5 }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[box0(s, cx, cy, d * 3), style]}>
      <View style={disc(s, d * 1.5, d * 1.5, d * 3, MINT_A(0.18))} />
      <View style={disc(s, d * 1.5, d * 1.5, d, C.mintLight)} />
    </Animated.View>
  );
}

function box0(s: S, cx: number, cy: number, d: number): ViewStyle {
  return { position: 'absolute', left: s(cx - d / 2), top: s(cy - d / 2), width: s(d), height: s(d) };
}

/** Expanding soft ring around the visor while listening (and faintly while speaking). */
function Ring({ index, ring, listen, speak, level, s }: { index: number; ring: SV; listen: SV; speak: SV; level: SV; s: S }) {
  const style = useAnimatedStyle(() => {
    const t = (ring.value + index / 3) % 1;
    const ease = 1 - (1 - t) * (1 - t);
    return {
      opacity: (1 - t) * (listen.value * 0.6 + speak.value * level.value * 0.3),
      transform: [{ scale: 0.7 + ease * 0.6 }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: s(100 - 75),
          top: s(78 - 75),
          width: s(150),
          height: s(150),
          borderRadius: s(75),
          borderWidth: s(2),
          borderColor: MINT_A(0.7),
          backgroundColor: MINT_A(0.04),
        },
        style,
      ]}
    />
  );
}

/** One eye; (cx, cy) are relative to the visor. */
function Eye({
  cx,
  cy,
  side,
  blink,
  listen,
  speak,
  error,
  level,
  pulse,
  s,
}: {
  cx: number;
  cy: number;
  side: -1 | 1;
  blink: SV;
  listen: SV;
  speak: SV;
  error: SV;
  level: SV;
  pulse: SV;
  s: S;
}) {
  const st = 5;
  const glowStyle = useAnimatedStyle(() => ({
    opacity: clamp01(0.6 + listen.value * 0.4 * (0.6 + pulse.value * 0.4) + speak.value * level.value * 0.35) * (1 - error.value * 0.55),
    transform: [{ scale: 1 + listen.value * 0.14 + speak.value * level.value * 0.08 }, { scaleY: 1 - blink.value * 0.7 }],
  }));
  const openStyle = useAnimatedStyle(() => ({
    opacity: clamp01(1 - speak.value - error.value),
    transform: [{ scale: 1 + listen.value * 0.12 }, { scaleY: 1 - blink.value * 0.92 }],
  }));
  const lift = s(1.5); // plain number: s() itself can't run on the UI thread
  const happyStyle = useAnimatedStyle(() => ({
    opacity: speak.value * (1 - error.value),
    transform: [{ translateY: -speak.value * level.value * lift }],
  }));
  const flatStyle = useAnimatedStyle(() => ({
    opacity: error.value,
    transform: [{ rotate: `${side * 14 * error.value}deg` }, { scaleY: 1 - blink.value * 0.6 }],
  }));

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: s(cx - 22), top: s(cy - 22), width: s(44), height: s(44) }}>
      {/* Soft glow (two stacked translucent ovals). */}
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
        <View style={{ position: 'absolute', left: s(3), top: s(1), width: s(38), height: s(42), borderRadius: s(19), backgroundColor: MINT_A(0.1) }} />
        <View style={{ position: 'absolute', left: s(7.5), top: s(5), width: s(29), height: s(34), borderRadius: s(14.5), backgroundColor: MINT_A(0.17) }} />
      </Animated.View>

      {/* Open glowing eye with highlight dots. */}
      <Animated.View style={[StyleSheet.absoluteFill, openStyle]}>
        <View style={{ position: 'absolute', left: s(11), top: s(8), width: s(22), height: s(28), borderRadius: s(11), overflow: 'hidden' }}>
          <LinearGradient colors={[C.mintLight, '#93f0d4', C.mint, C.mintDeep]} locations={[0, 0.3, 0.7, 1]} style={StyleSheet.absoluteFill} />
        </View>
        <View style={{ position: 'absolute', left: s(14.5), top: s(12), width: s(7.5), height: s(8), borderRadius: s(4), backgroundColor: 'rgba(255,255,255,0.95)' }} />
        <View style={{ position: 'absolute', left: s(25), top: s(26.5), width: s(3.6), height: s(3.6), borderRadius: s(1.8), backgroundColor: 'rgba(255,255,255,0.75)' }} />
      </Animated.View>

      {/* Happy "^" arc while talking. */}
      <Animated.View style={[{ position: 'absolute', left: s(11), top: s(14), width: s(22), height: s(11 + st / 2), overflow: 'hidden' }, happyStyle]}>
        <View style={{ width: s(22), height: s(22), borderRadius: s(11), borderWidth: s(st), borderColor: C.mint }} />
      </Animated.View>

      {/* Error: flat, slightly worried line. */}
      <Animated.View
        style={[{ position: 'absolute', left: s(12), top: s(22 - st / 2), width: s(20), height: s(st), borderRadius: s(st / 2), backgroundColor: C.mint }, flatStyle]}
      />
    </View>
  );
}

function Ear({ cx, cy, s, box, listen, speak, error, level, pulse }: { cx: number; cy: number; s: S; box: Box; listen: SV; speak: SV; error: SV; level: SV; pulse: SV }) {
  const haloStyle = useAnimatedStyle(() => ({
    opacity: clamp01(0.12 + listen.value * (0.25 + pulse.value * 0.2) + speak.value * (0.2 + level.value * 0.7)) * (1 - error.value * 0.7),
    transform: [{ scale: 0.92 + listen.value * pulse.value * 0.12 + speak.value * level.value * 0.28 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: clamp01(0.55 + listen.value * 0.25 + speak.value * (0.15 + level.value * 0.4) - error.value * 0.4),
  }));
  return (
    <>
      <Animated.View style={[disc(s, cx, cy, 52, MINT_A(0.22)), haloStyle]}>
        <View style={disc(s, 26, 26, 38, MINT_A(0.22))} />
      </Animated.View>
      <Shell s={s} box={box} x={cx - 17} y={cy - 17} w={34} h={34} r={17} spec={[6, 3.5, 13, 5]} />
      <View style={[disc(s, cx, cy, 22, C.ink), { borderWidth: s(1), borderColor: 'rgba(255,255,255,0.35)' }]} />
      <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
        <View style={disc(s, cx, cy, 15, MINT_A(0.28))} />
        <View style={[disc(s, cx, cy, 21, 'transparent'), { borderWidth: s(3.4), borderColor: C.mint }]} />
        <View style={disc(s, cx - 3.6, cy - 4.6, 3, 'rgba(255,255,255,0.85)')} />
      </Animated.View>
    </>
  );
}

function BubbleDot({ cx, cy, index, phase, think, speak, level, u, s }: { cx: number; cy: number; index: number; phase: SV; think: SV; speak: SV; level: SV; u: number; s: S }) {
  const style = useAnimatedStyle(() => {
    const local = (phase.value - index * 0.18 + 1) % 1;
    const bump = local < 0.42 ? Math.sin((local / 0.42) * Math.PI) : 0;
    const t = think.value;
    const talk = speak.value * level.value * (index === 1 ? 1 : 0.7);
    return {
      opacity: clamp01(0.45 + t * (bump * 0.55 - 0.05) + talk * 0.5),
      transform: [{ translateY: -(bump * t * 4.5 + talk * 2.5) * u }, { scale: 1 + bump * 0.3 * t + talk * 0.35 }],
    };
  });
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: s(cx - 2.8), top: s(cy - 2.8), width: s(5.6), height: s(5.6), borderRadius: s(2.8), backgroundColor: C.mintDark },
        style,
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// The robot
// ---------------------------------------------------------------------------

export function RobotMascot({ mode, getLevel, size = 160, onPress, accessibilityLabel }: RobotMascotProps) {
  const { s, box } = makeScale(size);
  // Worklets can only capture plain values, not the s() closure.
  const u = size / 200;

  // Mode amounts (0..1), cross-faded so the face never snaps.
  const listen = useSharedValue(mode === 'listening' ? 1 : 0);
  const think = useSharedValue(mode === 'thinking' ? 1 : 0);
  const speak = useSharedValue(mode === 'speaking' ? 1 : 0);
  const error = useSharedValue(mode === 'error' ? 1 : 0);

  const level = useSharedValue(0);
  const float = useSharedValue(0.5);
  const sway = useSharedValue(0);
  const breath = useSharedValue(0);
  const pulse = useSharedValue(0);
  const twinkle = useSharedValue(0);
  const drift = useSharedValue(0);
  const scan = useSharedValue(0);
  const ring = useSharedValue(0);
  const blink = useSharedValue(0);
  const sacX = useSharedValue(0);
  const sacY = useSharedValue(0);
  const bob = useSharedValue(0);
  const look = useSharedValue(0);
  const dots = useSharedValue(0);
  const press = useSharedValue(0);

  // -- ambient motion for the robot's whole life ------------------------------
  useEffect(() => {
    const spring = { duration: 1500, dampingRatio: 0.92 } as const; // ~2.25s per half
    float.value = withRepeat(withSequence(withSpring(1, spring), withSpring(0, spring)), -1, false);
    const loop = (v: SV, ms: number) => {
      v.value = 0;
      v.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false);
    };
    loop(sway, 6400);
    loop(breath, 3600);
    loop(twinkle, 3400);
    loop(drift, 4600);
    loop(scan, 3200);
    loop(ring, 2100);
    pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => {
      [float, sway, breath, twinkle, drift, scan, ring, pulse].forEach((v) => cancelAnimation(v));
    };
  }, [float, sway, breath, twinkle, drift, scan, ring, pulse]);

  // -- natural blinking + eye micro-movement (JS timers write shared values only) --
  useEffect(() => {
    let blinkTimer: ReturnType<typeof setTimeout>;
    let sacTimer: ReturnType<typeof setTimeout>;
    const close = () => withTiming(1, { duration: 75, easing: Easing.in(Easing.quad) });
    const open = () => withTiming(0, { duration: 140, easing: Easing.out(Easing.quad) });
    const scheduleBlink = () => {
      blinkTimer = setTimeout(() => {
        blink.value =
          Math.random() < 0.22
            ? withSequence(close(), open(), withDelay(70, close()), open())
            : withSequence(close(), open());
        scheduleBlink();
      }, 2000 + Math.random() * 3400);
    };
    const scheduleSaccade = () => {
      sacTimer = setTimeout(() => {
        const cfg = { damping: 20, stiffness: 240, mass: 0.6 };
        // Mostly small glances, and they drift back to centre now and then.
        const home = Math.random() < 0.35;
        sacX.value = withSpring(home ? 0 : Math.random() * 2 - 1, cfg);
        sacY.value = withSpring(home ? 0 : (Math.random() * 2 - 1) * 0.6, cfg);
        scheduleSaccade();
      }, 700 + Math.random() * 1900);
    };
    scheduleBlink();
    scheduleSaccade();
    return () => {
      clearTimeout(blinkTimer);
      clearTimeout(sacTimer);
      cancelAnimation(blink);
      cancelAnimation(sacX);
      cancelAnimation(sacY);
    };
  }, [blink, sacX, sacY]);

  // -- mode -> amounts + mode-only loops ---------------------------------------
  useEffect(() => {
    const to = (v: boolean) => withTiming(v ? 1 : 0, { duration: MODE_MS, easing: Easing.inOut(Easing.quad) });
    listen.value = to(mode === 'listening');
    think.value = to(mode === 'thinking');
    speak.value = to(mode === 'speaking');
    error.value = to(mode === 'error');

    if (mode === 'thinking') {
      look.value = withRepeat(
        withSequence(
          withTiming(-1, { duration: 620, easing: Easing.inOut(Easing.cubic) }),
          withDelay(420, withTiming(1, { duration: 860, easing: Easing.inOut(Easing.cubic) })),
          withDelay(420, withTiming(1, { duration: 0 })),
        ),
        -1,
        false,
      );
      dots.value = 0;
      dots.value = withRepeat(withTiming(1, { duration: 1150, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(dots);
      look.value = withTiming(0, { duration: 340, easing: Easing.out(Easing.quad) });
      dots.value = withTiming(0, { duration: 200 });
    }

    if (mode === 'speaking') {
      bob.value = 0;
      bob.value = withRepeat(withTiming(1, { duration: 980, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(bob);
    }
  }, [mode, listen, think, speak, error, look, dots, bob]);

  // -- audio level (attack fast, release slow) ----------------------------------
  useEffect(() => {
    const live = mode === 'speaking' || mode === 'listening';
    if (!getLevel || !live) {
      level.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
      return;
    }
    let cur = level.value;
    const id = setInterval(() => {
      const raw = Math.max(0, Math.min(1, getLevel() || 0));
      const target = Math.pow(raw, 0.8);
      cur += (target - cur) * (target > cur ? 0.6 : 0.2);
      level.value = withTiming(cur, { duration: LEVEL_SAMPLE_MS + 10, easing: Easing.linear });
    }, LEVEL_SAMPLE_MS);
    return () => clearInterval(id);
  }, [getLevel, mode, level]);

  useEffect(
    () => () => {
      cancelAnimation(look);
      cancelAnimation(dots);
      cancelAnimation(bob);
      cancelAnimation(press);
    },
    [look, dots, bob, press],
  );

  // -- animated styles --------------------------------------------------------
  const rootStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.05 }] }));
  const backGlowStyle = useAnimatedStyle(() => ({
    opacity: clamp01(0.6 + Math.sin(breath.value * TAU) * 0.12 + listen.value * 0.3 + speak.value * level.value * 0.3) * (1 - error.value * 0.5),
    transform: [{ scale: 0.96 + listen.value * 0.05 + speak.value * level.value * 0.05 }],
  }));
  const floatStyle = useAnimatedStyle(() => {
    const calm = 1 - error.value * 0.65;
    return {
      transform: [
        { translateY: ((0.5 - float.value) * 5 * calm + error.value * 2) * u },
        { rotate: `${Math.sin(sway.value * TAU) * 0.9 * calm}deg` },
      ],
    };
  });
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + (1 - float.value) * 0.3,
    transform: [{ scaleX: 0.92 + (1 - float.value) * 0.08 }],
  }));
  const torsoStyle = useAnimatedStyle(() => {
    const b = Math.sin(breath.value * TAU);
    return { transform: [{ scaleY: 1 + b * 0.014 }, { scaleX: 1 - b * 0.006 }] };
  });
  const headStyle = useAnimatedStyle(() => {
    const idle = (1 - speak.value * 0.5) * (1 - error.value);
    const bobS = Math.sin(bob.value * TAU);
    const tilt = Math.sin(sway.value * TAU + 1.3) * 2.2 * idle;
    return {
      transform: [
        { translateY: (-level.value * speak.value * 2.4 + Math.abs(bobS) * speak.value * -1.2 + error.value * 5 - think.value * 1) * u },
        { rotate: `${tilt + bobS * speak.value * 2.6 - error.value * 6 + look.value * think.value * 3}deg` },
      ],
    };
  });
  const antennaOrbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * (0.06 + listen.value * 0.16) + speak.value * level.value * 0.2 }],
  }));
  const antennaHaloStyle = useAnimatedStyle(() => ({
    opacity: clamp01(0.3 + pulse.value * 0.25 + listen.value * 0.35 + think.value * 0.15 + speak.value * level.value * 0.4),
    transform: [{ scale: 0.8 + pulse.value * (0.18 + listen.value * 0.3) }],
  }));
  const antennaGoldStyle = useAnimatedStyle(() => ({ opacity: think.value * (0.35 + pulse.value * 0.55) * (1 - error.value) }));
  const antennaRoseStyle = useAnimatedStyle(() => ({ opacity: error.value }));
  const eyesStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (look.value * 8 + sacX.value * 1.8 * (1 - think.value)) * u },
      { translateY: (sacY.value * 1.3 * (1 - think.value) - think.value * 3 + error.value * 2) * u },
    ],
  }));
  const cheekStyle = useAnimatedStyle(() => ({
    opacity: clamp01(0.7 + speak.value * (0.15 + level.value * 0.3) + listen.value * 0.2 - error.value * 0.45),
  }));
  const visorGlowStyle = useAnimatedStyle(() => ({
    opacity: clamp01(0.45 + listen.value * (0.3 + pulse.value * 0.25) + speak.value * level.value * 0.4 + think.value * 0.15) * (1 - error.value * 0.5),
  }));
  const scanStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (-14 + scan.value * 94) * u }],
  }));
  const smileStyle = useAnimatedStyle(() => ({ opacity: clamp01(1 - speak.value - error.value) }));
  const talkStyle = useAnimatedStyle(() => ({
    opacity: speak.value,
    transform: [{ scaleY: 0.16 + level.value * 0.84 }, { scaleX: 1 - level.value * 0.12 }],
  }));
  const frownStyle = useAnimatedStyle(() => ({ opacity: error.value }));
  const chestLevel = () => {
    'worklet';
    return clamp01(0.35 + listen.value * 0.4 + speak.value * (0.1 + level.value * 0.5) + pulse.value * 0.15);
  };
  const chestScale = () => {
    'worklet';
    return 0.92 + listen.value * 0.2 + speak.value * level.value * 0.28 + pulse.value * 0.08 + Math.sin(breath.value * TAU) * 0.03;
  };
  const chestMintGlowStyle = useAnimatedStyle(() => ({
    opacity: chestLevel() * (1 - error.value),
    transform: [{ scale: chestScale() }],
  }));
  const chestRoseGlowStyle = useAnimatedStyle(() => ({
    opacity: chestLevel() * error.value,
    transform: [{ scale: chestScale() }],
  }));
  const heartScale = () => {
    'worklet';
    return 1 + listen.value * pulse.value * 0.14 + speak.value * level.value * 0.18 + pulse.value * 0.04;
  };
  const heartMintStyle = useAnimatedStyle(() => ({
    opacity: (1 - error.value) * (0.85 + listen.value * 0.15),
    transform: [{ scale: heartScale() }],
  }));
  const heartRoseStyle = useAnimatedStyle(() => ({
    opacity: error.value,
    transform: [{ scale: heartScale() }],
  }));
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: clamp01(0.86 + think.value * 0.14 - error.value * 0.4),
    transform: [
      { translateY: ((float.value - 0.5) * 2.5 - think.value * 1.5) * u },
      { scale: 0.92 + think.value * 0.08 + speak.value * level.value * 0.04 },
    ],
  }));

  // -- layout (200-unit space) ------------------------------------------------
  // Head shell x 26..174, y 20..126; visor x 40..160, y 40..114 (VX, VY).
  const VX = 40;
  const VY = 40;
  const VW = 120;
  const VH = 74;
  // Torso box (breathing wrapper).
  const TX = 62;
  const TY = 112;
  const TW = 76;
  const TH = 64;

  const content = (
    <Animated.View style={[{ width: size, height: size }, rootStyle]}>
      {/* Soft mint aura behind the robot (stacked translucent discs). */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, backGlowStyle]}>
        <View style={disc(s, 100, 96, 198, MINT_A(0.035))} />
        <View style={disc(s, 100, 92, 168, MINT_A(0.045))} />
        <View style={disc(s, 100, 88, 138, MINT_A(0.055))} />
        <View style={disc(s, 100, 84, 104, MINT_A(0.06))} />
      </Animated.View>

      {/* Listening ripples. */}
      {[0, 1, 2].map((i) => (
        <Ring key={i} index={i} ring={ring} listen={listen} speak={speak} level={level} s={s} />
      ))}

      {/* Ground shadow / glow ellipse. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shadowStyle]}>
        <View style={disc(s, 100, 192, 176, MINT_A(0.08), 0.1)} />
        <View style={disc(s, 100, 192, 140, MINT_A(0.14), 0.09)} />
        <View style={disc(s, 100, 192, 116, 'rgba(0,0,0,0.55)', 0.075)} />
      </Animated.View>

      {/* Floating sparkles and motes. */}
      <Sparkle cx={18} cy={26} len={15} delay={0} color={C.gold} twinkle={twinkle} u={u} s={s} />
      <Sparkle cx={186} cy={118} len={10} delay={0.35} color={C.mint} twinkle={twinkle} u={u} s={s} />
      <Sparkle cx={12} cy={124} len={10} delay={0.62} color={C.gold} twinkle={twinkle} u={u} s={s} />
      <Sparkle cx={60} cy={8} len={8} delay={0.82} color={C.mint} twinkle={twinkle} u={u} s={s} />
      <Sparkle cx={190} cy={146} len={7} delay={0.15} color={C.gold} twinkle={twinkle} u={u} s={s} />
      <Mote cx={24} cy={156} d={2.6} delay={0} drift={drift} u={u} s={s} />
      <Mote cx={176} cy={160} d={2.2} delay={0.3} drift={drift} u={u} s={s} />
      <Mote cx={40} cy={150} d={1.8} delay={0.58} drift={drift} u={u} s={s} />
      <Mote cx={162} cy={150} d={2.4} delay={0.8} drift={drift} u={u} s={s} />

      {/* Floating robot (body, book and head move together). */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, floatStyle]}>
        {/* Neck. */}
        <View style={[box(84, 112, 32, 14), { borderRadius: s(7), backgroundColor: '#1b2629' }]} />

        {/* Torso (breathing). */}
        <Animated.View style={[box(TX, TY, TW, TH), torsoStyle]}>
          <Shell s={s} box={box} x={TX} y={TY} w={TW} h={TH} r={26} ox={TX} oy={TY} rim={2} spec={[12, 8, 26, 6]} />

          {/* Chest core: glow, bezel, screen, heart. */}
          <Animated.View style={[disc(s, 100, 143, 46, MINT_A(0.22), 1, TX, TY), chestMintGlowStyle]}>
            <View style={disc(s, 23, 23, 34, MINT_A(0.3))} />
          </Animated.View>
          <Animated.View style={[disc(s, 100, 143, 46, 'rgba(251,113,133,0.22)', 1, TX, TY), chestRoseGlowStyle]}>
            <View style={disc(s, 23, 23, 34, 'rgba(251,113,133,0.3)')} />
          </Animated.View>
          <View style={[disc(s, 100, 143, 27, '#c4d0d2', 1, TX, TY), { borderWidth: s(1), borderColor: 'rgba(255,255,255,0.8)' }]} />
          <View style={[disc(s, 100, 143, 21, C.screen, 1, TX, TY), { overflow: 'hidden' }]}>
            <LinearGradient colors={['rgba(124,224,195,0.05)', 'rgba(124,224,195,0.28)']} style={StyleSheet.absoluteFill} />
          </View>
          <Animated.View style={[StyleSheet.absoluteFill, heartMintStyle]}>
            <Heart cx={100 - TX} cy={143 - TY} a={7.4} color={C.mint} s={s} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, heartRoseStyle]}>
            <Heart cx={100 - TX} cy={143 - TY} a={7.4} color={C.rose} s={s} />
          </Animated.View>
          <View style={disc(s, 96.5, 137.5, 4, 'rgba(255,255,255,0.75)', 1, TX, TY)} />
        </Animated.View>

        {/* Arms reaching down to the book. */}
        <View style={[box(49, 120, 17, 42), { transform: [{ rotate: '-12deg' }] }]}>
          <Shell s={s} box={box} x={0} y={0} w={17} h={42} r={8.5} spec={[3, 3, 5, 18]} />
        </View>
        <View style={[box(134, 120, 17, 42), { transform: [{ rotate: '12deg' }] }]}>
          <Shell s={s} box={box} x={0} y={0} w={17} h={42} r={8.5} spec={[3, 3, 5, 18]} />
        </View>

        {/* Open book: mint cover, page stack, two curved pages, spine. */}
        <View style={[box(16, 160, 168, 29), { borderRadius: s(10), overflow: 'hidden', borderWidth: s(1), borderColor: 'rgba(255,255,255,0.35)' }]}>
          <LinearGradient colors={['#9df0d7', C.mint, C.mintDeep, C.mintDark]} locations={[0, 0.25, 0.7, 1]} style={StyleSheet.absoluteFill} />
        </View>
        <View style={[box(22, 157, 156, 25), { borderRadius: s(7), backgroundColor: '#dbe5e5' }]} />
        {([-1, 1] as const).map((side) => {
          const left = side === -1;
          return (
            <View
              key={side}
              style={[
                box(left ? 24 : 100, 151, 76, 28),
                { borderRadius: s(7), overflow: 'hidden', transform: [{ rotate: left ? '-3.5deg' : '3.5deg' }] },
              ]}
            >
              <LinearGradient
                colors={left ? ['#ffffff', '#f6fafa', '#cfdcdc'] : ['#cfdcdc', '#f6fafa', '#ffffff']}
                locations={left ? [0, 0.72, 1] : [0, 0.28, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    box(left ? 10 : 14 + (i === 3 ? 18 : 0), 6.5 + i * 5, i === 3 ? 34 : 52, 1.6),
                    { borderRadius: s(0.8), backgroundColor: i === 0 ? MINT_A(0.55) : 'rgba(110,135,140,0.32)' },
                  ]}
                />
              ))}
            </View>
          );
        })}
        <View style={[box(97, 150, 6, 31), { borderRadius: s(3), overflow: 'hidden' }]}>
          <LinearGradient colors={['rgba(80,105,110,0)', 'rgba(80,105,110,0.45)', 'rgba(80,105,110,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </View>

        {/* Hands resting on the pages. */}
        <Shell s={s} box={box} x={55} y={157} w={19} h={17} r={8.5} spec={[3.5, 2.5, 9, 4]} />
        <Shell s={s} box={box} x={126} y={157} w={19} h={17} r={8.5} spec={[3.5, 2.5, 9, 4]} />

        {/* Head group: tilts around the head's centre. */}
        <Animated.View style={[box(0, 0, 200, 130), headStyle]}>
          {/* Antenna. */}
          <View style={[box(98, 9, 4, 13), { borderRadius: s(2), overflow: 'hidden' }]}>
            <LinearGradient colors={['#e9f0f0', '#9fb1b4']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          </View>
          <Shell s={s} box={box} x={89} y={16} w={22} h={8} r={4} rim={1} spec={false} />
          <Animated.View style={[disc(s, 100, 8, 30, MINT_A(0.22)), antennaHaloStyle]}>
            <View style={disc(s, 15, 15, 21, MINT_A(0.32))} />
          </Animated.View>
          <Animated.View style={[disc(s, 100, 8, 14, C.mint), { overflow: 'hidden' }, antennaOrbStyle]}>
            <LinearGradient colors={['#e4fff6', C.mint, C.mintDeep]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.gold }, antennaGoldStyle]} />
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.rose }, antennaRoseStyle]} />
            <View style={disc(s, 4.8, 4.4, 4.2, 'rgba(255,255,255,0.9)')} />
          </Animated.View>

          {/* Ear headphones. */}
          <Ear cx={22} cy={80} s={s} box={box} listen={listen} speak={speak} error={error} level={level} pulse={pulse} />
          <Ear cx={178} cy={80} s={s} box={box} listen={listen} speak={speak} error={error} level={level} pulse={pulse} />

          {/* Head shell. */}
          <Shell s={s} box={box} x={26} y={20} w={148} h={106} r={46} rim={2.2} spec={[30, 4, 56, 11]} />
          <View style={disc(s, 141, 28, 5, 'rgba(255,255,255,0.85)')} />

          {/* Visor bezel (dark top -> light bottom reads as an inset). */}
          <View style={[box(VX - 3.5, VY - 3.5, VW + 7, VH + 7), { borderRadius: s(33.5), overflow: 'hidden' }]}>
            <LinearGradient colors={['#8c9da1', '#c9d5d7', '#f4f8f8']} style={StyleSheet.absoluteFill} />
          </View>

          {/* Glossy black visor. */}
          <View style={[box(VX, VY, VW, VH), { borderRadius: s(30), overflow: 'hidden', backgroundColor: C.screen }]}>
            <LinearGradient colors={['#17262a', '#060c0e', '#020405']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
            {/* Inner mint glow rising from the bottom. */}
            <Animated.View style={[StyleSheet.absoluteFill, visorGlowStyle]}>
              <LinearGradient colors={[MINT_A(0), MINT_A(0.07), MINT_A(0.2)]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
            </Animated.View>
            {/* Moving scanline. */}
            <Animated.View style={[box(0, 0, VW, 12), scanStyle]}>
              <LinearGradient colors={[MINT_A(0), MINT_A(0.09), MINT_A(0)]} style={StyleSheet.absoluteFill} />
            </Animated.View>

            {/* Rosy-mint cheeks. */}
            <Animated.View style={[StyleSheet.absoluteFill, cheekStyle]}>
              {[59, 141].map((x) => (
                <React.Fragment key={x}>
                  <View style={disc(s, x, 94, 28, MINT_A(0.08), 0.5, VX, VY)} />
                  <View style={disc(s, x, 94, 19, 'rgba(255,140,165,0.3)', 0.5, VX, VY)} />
                  <View style={disc(s, x, 94, 10, 'rgba(255,170,190,0.35)', 0.5, VX, VY)} />
                </React.Fragment>
              ))}
            </Animated.View>

            <Animated.View style={[StyleSheet.absoluteFill, eyesStyle]}>
              <Eye cx={74 - VX} cy={72 - VY} side={-1} blink={blink} listen={listen} speak={speak} error={error} level={level} pulse={pulse} s={s} />
              <Eye cx={126 - VX} cy={72 - VY} side={1} blink={blink} listen={listen} speak={speak} error={error} level={level} pulse={pulse} s={s} />
            </Animated.View>

            {/* Mouth: smile, talking, frown — cross-faded. */}
            <Animated.View style={[box(91, 91, 18, 10.75, VX, VY), { overflow: 'hidden' }, smileStyle]}>
              <View style={{ position: 'absolute', top: s(10.75 - 18), width: s(18), height: s(18), borderRadius: s(9), borderWidth: s(3.5), borderColor: C.mint }} />
            </Animated.View>
            <Animated.View style={[box(92, 90, 16, 13, VX, VY), { borderRadius: s(6.5), overflow: 'hidden' }, talkStyle]}>
              <LinearGradient colors={[C.mintLight, C.mint, C.mintDeep]} style={StyleSheet.absoluteFill} />
              <View style={[box(4, 7, 8, 4.5), { borderRadius: s(2.25), backgroundColor: 'rgba(5,9,10,0.4)' }]} />
            </Animated.View>
            <Animated.View style={[box(93, 96, 14, 8.75, VX, VY), { overflow: 'hidden' }, frownStyle]}>
              <View style={{ width: s(14), height: s(14), borderRadius: s(7), borderWidth: s(3.5), borderColor: C.mint }} />
            </Animated.View>

            {/* Glass reflections: top sheen + diagonal streak. */}
            <LinearGradient
              colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
              locations={[0, 0.42]}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={[box(14, -18, 16, 110), { transform: [{ rotate: '28deg' }], overflow: 'hidden' }]}>
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.11)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
            <View style={[box(34, -18, 6, 110), { transform: [{ rotate: '28deg' }], backgroundColor: 'rgba(255,255,255,0.05)' }]} />
            <View style={[box(10, 5, 30, 5), { borderRadius: s(2.5), backgroundColor: 'rgba(255,255,255,0.14)', transform: [{ rotate: '-14deg' }] }]} />
          </View>
        </Animated.View>
      </Animated.View>

      {/* Speech / thought bubble with thinking dots. */}
      <Animated.View pointerEvents="none" style={[box(142, 0, 58, 40), bubbleStyle]}>
        <View style={disc(s, 153 - 142, 33 - 0, 3.6, '#e6eeee')} />
        <View style={[disc(s, 158 - 142, 27.5, 7, '#eef4f4'), { borderWidth: s(0.8), borderColor: MINT_A(0.5) }]} />
        <View style={[box(150, 1, 48, 25, 142, 0), { borderRadius: s(12.5), backgroundColor: MINT_A(0.75) }]} />
        <View style={[box(149, 0, 48, 25, 142, 0), { borderRadius: s(12.5), overflow: 'hidden', borderWidth: s(0.9), borderColor: 'rgba(255,255,255,0.8)' }]}>
          <LinearGradient colors={['#ffffff', '#eef4f4', '#d3dfe0']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
          <View style={[box(7, 3, 20, 4), { borderRadius: s(2), backgroundColor: 'rgba(255,255,255,0.95)' }]} />
        </View>
        {[0, 1, 2].map((i) => (
          <BubbleDot key={i} cx={161 + i * 12 - 142} cy={13} index={i} phase={dots} think={think} speak={speak} level={level} u={u} s={s} />
        ))}
      </Animated.View>
    </Animated.View>
  );

  if (!onPress) {
    return (
      <View accessibilityRole={'image' as AccessibilityRole} accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withSpring(1, { damping: 16, stiffness: 320 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 12, stiffness: 220 });
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {content}
    </Pressable>
  );
}

export type { VoiceOrbMode };
