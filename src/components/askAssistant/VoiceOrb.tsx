// Hero orb for the hands-free "Ask AI" assistant — the one thing the student
// looks at for a whole conversation, so it's built to read as a piece of lit
// glass rather than a flat circle.
//
// React Native has no <canvas>, no radial gradient, and this app carries
// neither SVG nor Skia, so every layer below is a plain View or a
// LinearGradient disc:
//   - a radial aura faked with concentric low-alpha discs,
//   - two tilted orbit rings (a circle flattened with scaleY, then rotated)
//     each carrying a travelling spark,
//   - three translucent "liquid" lobes that orbit and spin at different speeds
//     inside the body, so its shading keeps morphing organically,
//   - sphere shading, a specular highlight and a rotating shimmer sweep for
//     the glass read,
//   - a rotating arc for "thinking" and expanding rings for "listening".
//
// Every layer is inscribed inside the body circle (see LOBES for the geometry
// that guarantees it), so nothing here depends on Android clipping transformed
// children — `overflow: hidden` is belt-and-braces only.
//
// Same public API and the same 5 modes as the first version. Mode colour
// identity still cross-fades through two stacked layers trading opacity
// (Reanimated can't animate a LinearGradient's `colors` array), and the level
// still arrives through a function so the parent never re-renders per frame.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityRole } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export type VoiceOrbMode = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface VoiceOrbProps {
  mode: VoiceOrbMode;
  /** 0..1, read every frame — a function so the parent never re-renders per frame. */
  getLevel?: () => number;
  size?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}

interface Palette {
  /** Body gradient, top-left -> bottom-right. */
  body: readonly [string, string, string];
  /** Aura and ripple colour; alpha is applied per layer. */
  glow: string;
  /** How alive the orb looks — drives aura, rings and sparks. 0..1 */
  energy: number;
}

const PALETTES: Record<VoiceOrbMode, Palette> = {
  idle: { body: ['#5EEAD4', '#22D3EE', '#4F46E5'], glow: '#2DD4BF', energy: 0.3 },
  listening: { body: ['#7DD3FC', '#818CF8', '#C084FC'], glow: '#818CF8', energy: 0.72 },
  thinking: { body: ['#C4B5FD', '#6366F1', '#22D3EE'], glow: '#8B5CF6', energy: 0.85 },
  speaking: { body: ['#FDE68A', '#5EEAD4', '#22D3EE'], glow: '#5EEAD4', energy: 1 },
  error: { body: ['#FDA4AF', '#F472B6', '#A78BFA'], glow: '#FB7185', energy: 0.45 },
};

/** A liquid lobe, sized and orbited as a fraction of the body diameter.
 * Corner radii are never below 0.38 * lobe size, so a lobe's farthest corner
 * sits at `offset + 1.414 * (0.5 - 0.38) * size + 0.38 * size` from the body
 * centre — under 0.5 for all three, i.e. always inside the body circle. */
const LOBES = [
  { size: 0.68, offset: 0.1, duration: 9000, dir: 1, colors: ['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.04)'] },
  { size: 0.58, offset: 0.14, duration: 14000, dir: -1, colors: ['rgba(255,255,255,0.32)', 'rgba(255,255,255,0)'] },
  { size: 0.5, offset: 0.18, duration: 21000, dir: 1, colors: ['rgba(8,10,40,0.3)', 'rgba(8,10,40,0)'] },
] as const;

/** Tilted orbit rings: `flatten` is the scaleY that turns the circle into an
 * ellipse, `tilt` its resting angle. */
const ORBITS = [
  { scale: 1.24, flatten: 0.42, duration: 11000, dir: 1, tilt: 24, alpha: 0.22 },
  { scale: 1.48, flatten: 0.3, duration: 17000, dir: -1, tilt: -32, alpha: 0.14 },
] as const;

/** Concentric discs approximating a radial falloff around the body. */
const AURA = [
  { scale: 1.08, alpha: 0.3 },
  { scale: 1.34, alpha: 0.18 },
  { scale: 1.66, alpha: 0.1 },
  { scale: 2.0, alpha: 0.05 },
] as const;

const WRAP = 2.1; // wrap box as a multiple of the diameter — fits the widest aura disc
const CROSSFADE_MS = 420;
const LEVEL_SAMPLE_MS = 33; // ~30fps — plenty smooth for a compact orb, light on battery

function rgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const spin = (to: number, duration: number) =>
  withRepeat(withTiming(to, { duration, easing: Easing.linear }), -1, false);

/** One translucent lobe drifting inside the body. */
function Lobe({ d, spec }: { d: number; spec: (typeof LOBES)[number] }) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = spin(360 * spec.dir, spec.duration);
    return () => cancelAnimation(rotation);
  }, [rotation, spec.dir, spec.duration]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const s = d * spec.size;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, style]}>
      <View
        style={{
          width: s,
          height: s,
          borderTopLeftRadius: s * 0.5,
          borderTopRightRadius: s * 0.38,
          borderBottomRightRadius: s * 0.48,
          borderBottomLeftRadius: s * 0.42,
          overflow: 'hidden',
          transform: [{ translateY: -d * spec.offset }],
        }}
      >
        <LinearGradient
          colors={spec.colors}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </Animated.View>
  );
}

/** A tilted ring around the body with a spark riding it. */
function OrbitRing({
  d,
  spec,
  energy,
}: {
  d: number;
  spec: (typeof ORBITS)[number];
  energy: SharedValue<number>;
}) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = spin(360 * spec.dir, spec.duration);
    return () => cancelAnimation(rotation);
  }, [rotation, spec.dir, spec.duration]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.2 + energy.value * 0.7,
    transform: [{ rotate: `${spec.tilt + rotation.value}deg` }, { scaleY: spec.flatten }],
  }));

  const r = d * spec.scale;
  const dot = Math.max(5, d * 0.07);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.layer,
        {
          width: r,
          height: r,
          borderRadius: r / 2,
          borderWidth: 1,
          borderColor: `rgba(255,255,255,${spec.alpha + 0.12})`,
        },
        style,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          top: -dot / 2,
          left: r / 2 - dot / 2,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: 'rgba(255,255,255,0.9)',
          // Cancel the ring's flattening so the spark stays round.
          transform: [{ scaleY: 1 / spec.flatten }],
        }}
      />
    </Animated.View>
  );
}

/** The four aura discs for one mode — one of these per cross-fade layer. */
function AuraStack({ d, glow }: { d: number; glow: string }) {
  return (
    <>
      {AURA.map((layer) => {
        const w = d * layer.scale;
        return (
          <View
            key={layer.scale}
            pointerEvents="none"
            style={[
              styles.layer,
              { width: w, height: w, borderRadius: w / 2, backgroundColor: rgba(glow, layer.alpha) },
            ]}
          />
        );
      })}
    </>
  );
}

export function VoiceOrb({ mode, getLevel, size = 72, onPress, accessibilityLabel }: VoiceOrbProps) {
  const d = size;

  // Colour identity cross-fade: `from` holds the mode on screen, `to` the one
  // fading in. One re-render per mode change, then opacity does the rest.
  const [skins, setSkins] = useState<{ from: VoiceOrbMode; to: VoiceOrbMode }>({ from: mode, to: mode });
  const fade = useSharedValue(1);
  const shownModeRef = useRef(mode);

  const level = useSharedValue(0);
  const energy = useSharedValue(PALETTES[mode].energy);
  const breathe = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const arcRotation = useSharedValue(0);
  const arcOpacity = useSharedValue(0);

  const ripple1 = useSharedValue(0); // 0 = not playing, drives both scale and fade-out
  const ripple2 = useSharedValue(0);
  const rippleTurn = useRef(0);
  const lastLevelRef = useRef(0);
  const lastRippleAtRef = useRef(0);

  // -- ambient motion (runs for the orb's whole life) -------------------------
  useEffect(() => {
    breathe.value = withRepeat(withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }), -1, true);
    shimmer.value = spin(360, 7000);
    return () => {
      cancelAnimation(breathe);
      cancelAnimation(shimmer);
    };
  }, [breathe, shimmer]);

  // -- mode: colour cross-fade, energy, thinking arc --------------------------
  useEffect(() => {
    if (shownModeRef.current !== mode) {
      setSkins({ from: shownModeRef.current, to: mode });
      shownModeRef.current = mode;
      fade.value = 0;
      fade.value = withTiming(1, { duration: CROSSFADE_MS, easing: Easing.inOut(Easing.quad) });
    }
    energy.value = withTiming(PALETTES[mode].energy, { duration: 500 });
  }, [mode, fade, energy]);

  useEffect(() => {
    if (mode === 'thinking') {
      arcOpacity.value = withTiming(1, { duration: 250 });
      arcRotation.value = 0;
      arcRotation.value = spin(360, 1200);
    } else {
      arcOpacity.value = withTiming(0, { duration: 250 });
      cancelAnimation(arcRotation);
    }
  }, [mode, arcOpacity, arcRotation]);

  // -- level-reactive pulse/glow + listening ripples ---------------------------
  useEffect(() => {
    if (!getLevel) return;
    const id = setInterval(() => {
      const raw = Math.max(0, Math.min(1, getLevel()));
      const next = Math.pow(raw, 0.8);
      level.value = withTiming(next, { duration: LEVEL_SAMPLE_MS, easing: Easing.out(Easing.quad) });

      if (mode === 'listening' && next > 0.18 && next - lastLevelRef.current > 0.08) {
        const now = Date.now();
        if (now - lastRippleAtRef.current > 340) {
          lastRippleAtRef.current = now;
          const ring = rippleTurn.current % 2 === 0 ? ripple1 : ripple2;
          rippleTurn.current += 1;
          ring.value = 0;
          ring.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) });
        }
      }
      lastLevelRef.current = next;
    }, LEVEL_SAMPLE_MS);
    return () => clearInterval(id);
  }, [getLevel, mode, level, ripple1, ripple2]);

  // -- animated styles --------------------------------------------------------
  const fromStyle = useAnimatedStyle(() => ({ opacity: 1 - fade.value }));
  const toStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: (1 + breathe.value * 0.03) * (1 + level.value * 0.18) }],
  }));
  const auraStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, (0.5 + energy.value * 0.5) * (0.7 + level.value * 0.6)),
    transform: [{ scale: 1 + breathe.value * 0.06 + level.value * 0.1 }],
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.2 + energy.value * 0.35,
    transform: [{ rotate: `${shimmer.value}deg` }],
  }));
  const arcStyle = useAnimatedStyle(() => ({
    opacity: arcOpacity.value,
    transform: [{ rotate: `${arcRotation.value}deg` }],
  }));
  const ripple1Style = useAnimatedStyle(() => ({
    opacity: ripple1.value > 0 ? (1 - ripple1.value) * 0.55 : 0,
    transform: [{ scale: 1 + ripple1.value * 0.9 }],
  }));
  const ripple2Style = useAnimatedStyle(() => ({
    opacity: ripple2.value > 0 ? (1 - ripple2.value) * 0.55 : 0,
    transform: [{ scale: 1 + ripple2.value * 0.9 }],
  }));

  const rippleRing = {
    width: d,
    height: d,
    borderRadius: d / 2,
    borderWidth: 1.5,
    borderColor: rgba(PALETTES[mode].glow, 0.65),
  };

  const content = (
    <View style={[styles.wrap, { width: d * WRAP, height: d * WRAP }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, auraStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, fromStyle]}>
          <AuraStack d={d} glow={PALETTES[skins.from].glow} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, toStyle]}>
          <AuraStack d={d} glow={PALETTES[skins.to].glow} />
        </Animated.View>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.layer, rippleRing, ripple1Style]} />
      <Animated.View pointerEvents="none" style={[styles.layer, rippleRing, ripple2Style]} />

      {ORBITS.map((spec) => (
        <OrbitRing key={spec.scale} d={d} spec={spec} energy={energy} />
      ))}

      <Animated.View style={[{ width: d, height: d, borderRadius: d / 2, overflow: 'hidden' }, bodyStyle]}>
        {/* Colour identity, cross-faded between modes. */}
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: d / 2, overflow: 'hidden' }, fromStyle]}>
          <LinearGradient
            colors={PALETTES[skins.from].body}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: d / 2, overflow: 'hidden' }, toStyle]}>
          <LinearGradient
            colors={PALETTES[skins.to].body}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {LOBES.map((spec) => (
          <Lobe key={spec.size} d={d} spec={spec} />
        ))}

        {/* Sphere shading: lit at the top, falling into shadow at the bottom. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: d / 2, overflow: 'hidden' }]}>
          <LinearGradient
            colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.02)', 'rgba(3,7,30,0.34)']}
            locations={[0, 0.46, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Shimmer sweep — a diagonal band of light rotating inside the glass. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: d / 2, overflow: 'hidden' }, shimmerStyle]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0)']}
            locations={[0.3, 0.5, 0.7]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Specular highlight — the giveaway that this is a lit sphere. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: d * 0.11,
            left: d * 0.17,
            width: d * 0.42,
            height: d * 0.3,
            borderRadius: d * 0.21,
            overflow: 'hidden',
          }}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.72)', 'rgba(255,255,255,0)']}
            start={{ x: 0.3, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Rim light. */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: d / 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
          ]}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.thinkingArc,
            { width: d - 6, height: d - 6, borderRadius: (d - 6) / 2, top: 3, left: 3 },
            arcStyle,
          ]}
        />
      </Animated.View>
    </View>
  );

  if (!onPress) {
    return (
      <View accessibilityRole={'image' as AccessibilityRole} accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Absolute without insets: the wrap's own centring places it, so every
  // decorative layer stays concentric with the body whatever its size.
  layer: {
    position: 'absolute',
  },
  thinkingArc: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: 'rgba(255,255,255,0.9)',
    borderRightColor: 'rgba(255,255,255,0.4)',
  },
});
