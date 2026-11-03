import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { RobotMascot } from './RobotMascot';
import { ask } from './askTheme';

// The same robot as the big one (RobotMascot), drawn small inside a 40 px circle with a halo behind it.
const CIRCLE = 40;
const HALO = 46;
const ROBOT = 36;

const ENTER_DELAY = 80;
const ENTER_MS = 220;
const EXIT_MS = 160;
const START_SCALE = 0.6;

/**
 * Floating presentation-mode entry point: a small robot badge that fades and
 * scales in when `visible` becomes true and out when it becomes false.
 */
export function PresentationFocusHeader({
  visible,
  onPress,
  reduceMotion,
}: {
  visible: boolean;
  onPress: () => void;
  reduceMotion: boolean;
}) {
  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(true);

  const opacity = useSharedValue(visible ? 1 : 0);
  const scale = useSharedValue(visible ? 1 : START_SCALE);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const finishExit = useCallback(() => {
    if (mountedRef.current) setMounted(false);
  }, []);

  useEffect(() => {
    if (visible) {
      if (mountedRef.current) setMounted(true);
      if (reduceMotion) {
        opacity.value = 1;
        scale.value = 1;
        return;
      }
      opacity.value = 0;
      scale.value = START_SCALE;
      opacity.value = withDelay(
        ENTER_DELAY,
        withTiming(1, { duration: ENTER_MS, easing: Easing.out(Easing.cubic) }),
      );
      scale.value = withDelay(
        ENTER_DELAY,
        withTiming(1, { duration: ENTER_MS, easing: Easing.out(Easing.cubic) }),
      );
      return;
    }

    if (reduceMotion) {
      opacity.value = 0;
      scale.value = START_SCALE;
      setMounted(false);
      return;
    }
    opacity.value = withTiming(0, { duration: EXIT_MS });
    scale.value = withTiming(
      START_SCALE,
      { duration: EXIT_MS },
      (finished) => {
        if (finished) runOnJS(finishExit)();
      },
    );
  }, [visible, reduceMotion, opacity, scale, finishExit]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const handlePress = () => {
    pressScale.value = withSequence(
      withTiming(0.96, { duration: 120 }),
      withTiming(1, { duration: 120 }),
    );
    onPress();
  };

  if (!mounted) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Animated.View style={enterStyle} pointerEvents="box-none">
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Show your teacher"
          onPress={handlePress}
        >
          <Animated.View style={pressStyle}>
            <View style={styles.badge}>
              <View style={styles.halo} />
              <View style={styles.circle} />
              <View style={styles.robot} pointerEvents="none">
                <RobotMascot mode="idle" size={ROBOT} />
              </View>
            </View>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: HALO,
    height: HALO,
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
  circle: {
    position: 'absolute',
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: ask.panelStrong,
    borderWidth: 1,
    borderColor: ask.lineStrong,
  },
  robot: {
    position: 'absolute',
    width: ROBOT,
    height: ROBOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
