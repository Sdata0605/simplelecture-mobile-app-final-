import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ask } from './askTheme';

const FACE_W = 26;
const FACE_H = 18;
const EYE_W = 5;
const EYE_H = 7;
const HALO = 46;

const closeEye = () =>
  withTiming(0.1, { duration: 70, easing: Easing.in(Easing.quad) });
const openEye = () =>
  withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) });

/**
 * Small animated robot face for the Ask AI header. Lightweight alternative
 * to RobotMascot: floats gently and blinks now and then.
 */
export function MiniRobotBadge({
  size = 38,
  reduceMotion,
}: {
  size?: number;
  reduceMotion: boolean;
}) {
  const floatY = useSharedValue(0);
  const eyeScale = useSharedValue(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Float: translateY 0 -> -3 -> 0, forever.
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(floatY);
      floatY.value = 0;
      return;
    }
    floatY.value = withRepeat(
      withTiming(-3, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(floatY);
    };
  }, [reduceMotion, floatY]);

  // Blink: recursive timeout every ~4000 ms +/- 400 ms, ~1 in 5 is a double blink.
  useEffect(() => {
    if (reduceMotion) {
      eyeScale.value = 1;
      return;
    }
    let cancelled = false;
    const schedule = () => {
      const delay = 4000 + (Math.random() * 800 - 400);
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        if (Math.random() < 0.2) {
          eyeScale.value = withSequence(
            closeEye(),
            openEye(),
            withTiming(1, { duration: 110 }),
            closeEye(),
            openEye(),
          );
        } else {
          eyeScale.value = withSequence(closeEye(), openEye());
        }
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      cancelAnimation(eyeScale);
    };
  }, [reduceMotion, eyeScale]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  const eyeStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: eyeScale.value }],
  }));

  return (
    <Animated.View
      style={[{ width: size, height: size }, styles.wrap, floatStyle]}
    >
      <View
        style={[
          styles.halo,
          {
            left: (size - HALO) / 2,
            top: (size - HALO) / 2,
          },
        ]}
      />
      <View
        style={[
          styles.outer,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <View style={styles.screen}>
          <Animated.View style={[styles.eye, eyeStyle]} />
          <Animated.View style={[styles.eye, eyeStyle]} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    backgroundColor: ask.mintFill,
  },
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ask.panelStrong,
    borderWidth: 1,
    borderColor: ask.lineStrong,
  },
  screen: {
    width: FACE_W,
    height: FACE_H,
    borderRadius: 7,
    backgroundColor: '#03070a',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  eye: {
    width: EYE_W,
    height: EYE_H,
    borderRadius: 3,
    backgroundColor: ask.mint,
    marginHorizontal: 3, // 6 px gap between the two eyes
  },
});
