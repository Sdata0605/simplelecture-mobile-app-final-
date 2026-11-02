import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { colors } from '../../constants/theme';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import type { ReminderKind } from '../../types/reminder';

const PULSE_DURATION_MS = 1800;
const PULSE_STAGGER_MS = 600;
const PULSE_COUNT = 3;

// Core icon per reminder kind. Without a kind the teacher icon is shown.
export const KIND_AVATAR_ICON: Record<ReminderKind, keyof typeof Ionicons.glyphMap> = {
  call: 'call',
  message: 'chatbubble-ellipses',
  notification: 'notifications',
};

interface RingingAvatarProps {
  ringing: boolean;
  size?: number;
  kind?: ReminderKind;
}

function PulseRing({
  progress,
  size,
  active,
}: {
  progress: SharedValue<number>;
  size: number;
  active: boolean;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: active ? 0.6 * (1 - progress.value) : 0,
    transform: [{ scale: 1 + progress.value * 0.8 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulse,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    />
  );
}

/**
 * Call avatar with pulse rings. Pulses while `ringing`; static when the user
 * has reduce-motion turned on.
 */
export default function RingingAvatar({ ringing, size = 120, kind }: RingingAvatarProps) {
  const reduceMotion = useReduceMotion();
  const animate = ringing && !reduceMotion;

  const p0 = useSharedValue(0);
  const p1 = useSharedValue(0);
  const p2 = useSharedValue(0);
  const progresses = [p0, p1, p2];

  useEffect(() => {
    progresses.forEach((p, i) => {
      if (animate) {
        p.value = withDelay(
          i * PULSE_STAGGER_MS,
          withRepeat(
            withTiming(1, { duration: PULSE_DURATION_MS, easing: Easing.out(Easing.ease) }),
            -1,
            false
          )
        );
      } else {
        cancelAnimation(p);
        p.value = 0;
      }
    });
    return () => {
      progresses.forEach((p) => cancelAnimation(p));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate]);

  const coreSize = size;
  const outerSize = size * 1.1;

  return (
    <View style={[styles.wrap, { width: size * 2, height: size * 2 }]}>
      {progresses.map((p, i) => (
        <PulseRing key={i} progress={p} size={outerSize} active={animate} />
      ))}
      <View
        style={[
          styles.core,
          { width: coreSize, height: coreSize, borderRadius: coreSize / 2 },
        ]}
      >
        <Ionicons
          name={kind ? KIND_AVATAR_ICON[kind] : 'school'}
          size={Math.round(coreSize * 0.47)}
          color={colors.white}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    backgroundColor: 'rgba(43,189,110,0.35)',
  },
  core: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
