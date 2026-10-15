// The glowing AI button that floats over the app. It carries the same orb as the Ask AI screen, so the student
// recognises it when they get there. It only reports the tap (GlobalAIButton decides what the tap opens), and it
// can be dragged: it settles against the nearer side edge, so a screen with something at the bottom (a buy bar, a
// message box) is never stuck with it in the way.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VoiceOrb } from '../askAssistant/VoiceOrb';
import { ask } from '../askAssistant/askTheme';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { clampPlacement, placementFromDrop, placementToPosition, type FabBox, type FabPlacement } from '../../services/aiFab';

const HIT = 64; // the tap target
const ORB = 42; // the orb's body; its glow reaches about twice that, past the tap target
const LABEL_DELAY_MS = 1200;
const LABEL_SHOWN_MS = 5500;
const LABEL_HEIGHT = 32;
/** A touch that moves less than this is a tap, not a drag. */
const TAP_SLOP = 8;

// The label introduces the button once per launch, then gets out of the way.
let introPlayed = false;

function springTo(pos: Animated.ValueXY, placement: FabPlacement, box: FabBox) {
  Animated.spring(pos, { toValue: placementToPosition(placement, box, HIT), useNativeDriver: false, friction: 8, tension: 90 }).start();
}

interface Props {
  hasActivePlan: boolean;
  onPress: () => void;
  /** The area the button floats in. */
  box: FabBox;
  placement: FabPlacement;
  onPlacementChange: (placement: FabPlacement) => void;
}

export function AITeacherFab({ hasActivePlan, onPress, box, placement, onPlacementChange }: Props) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const bob = useRef(new Animated.Value(0)).current;
  const label = useRef(new Animated.Value(0)).current;
  const resting = clampPlacement(placement, box, insets, HIT);
  // Starts at its resting place, so it never shows up in a corner for a frame first.
  const pos = useRef(new Animated.ValueXY(placementToPosition(resting, box, HIT))).current;
  const placed = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // The responder is created once, so it reads the current props through a ref.
  const latest = useRef({ box, insets, onPress, onPlacementChange, resting });
  latest.current = { box, insets, onPress, onPlacementChange, resting };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pos.stopAnimation((value) => {
          dragStart.current = value;
        });
      },
      onPanResponderMove: (_event, g) => {
        pos.setValue({ x: dragStart.current.x + g.dx, y: dragStart.current.y + g.dy });
      },
      onPanResponderRelease: (_event, g) => {
        const { box: area, insets: safe, onPress: press, onPlacementChange: change, resting: home } = latest.current;
        if (Math.hypot(g.dx, g.dy) < TAP_SLOP) {
          // It did not move: put it back exactly (the grab may have stopped a spring) and treat it as a tap.
          springTo(pos, home, area);
          press();
          return;
        }
        const dropped = placementFromDrop({ x: dragStart.current.x + g.dx, y: dragStart.current.y + g.dy }, area, safe, HIT);
        springTo(pos, dropped, area);
        change(dropped);
      },
      // Something took the touch over (a system gesture): settle where it was.
      onPanResponderTerminate: () => springTo(pos, latest.current.resting, latest.current.box),
    }),
  ).current;

  // Go to the resting place: straight there the first time, then with a short spring (a rotation, a new inset).
  useEffect(() => {
    if (!placed.current || reduceMotion) {
      pos.setValue(placementToPosition(resting, box, HIT));
      placed.current = true;
      return;
    }
    springTo(pos, resting, box);
  }, [pos, reduceMotion, resting.edge, resting.bottom, box.width, box.height]);

  // A slow float, so the button reads as alive without being a distraction.
  useEffect(() => {
    if (reduceMotion) {
      bob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -4, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, reduceMotion]);

  useEffect(() => {
    if (introPlayed) return;
    introPlayed = true;
    const intro = Animated.sequence([
      Animated.delay(LABEL_DELAY_MS),
      Animated.timing(label, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.delay(LABEL_SHOWN_MS),
      Animated.timing(label, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]);
    intro.start();
    return () => intro.stop();
  }, [label]);

  const labelSide = resting.edge === 'right' ? { right: HIT } : { left: HIT };
  const labelFrom = resting.edge === 'right' ? 10 : -10;

  return (
    <Animated.View
      {...responder.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={hasActivePlan ? 'Open AI Teacher' : 'See AI Teacher plans'}
      style={[styles.anchor, { transform: pos.getTranslateTransform() }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.label,
          labelSide,
          { opacity: label, transform: [{ translateX: label.interpolate({ inputRange: [0, 1], outputRange: [labelFrom, 0] }) }] },
        ]}
      >
        <Text style={styles.labelText}>{hasActivePlan ? 'Ask AI Teacher' : 'Meet your AI Teacher'}</Text>
      </Animated.View>

      <Animated.View pointerEvents="none" style={{ transform: [{ translateY: bob }] }}>
        <View style={styles.face}>
          <VoiceOrb mode="idle" size={ORB} />
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <Text style={styles.ai}>AI</Text>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

export default AITeacherFab;

const styles = StyleSheet.create({
  // Placed by the transform alone: its top-left corner is the screen's.
  anchor: { position: 'absolute', left: 0, top: 0, width: HIT, height: HIT },
  // The orb's layout box is bigger than the tap target; centring lets its glow spill evenly around the button.
  face: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  ai: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.6,
    textShadowColor: 'rgba(3, 7, 30, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  label: {
    position: 'absolute',
    top: (HIT - LABEL_HEIGHT) / 2,
    height: LABEL_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ask.lineStrong,
    backgroundColor: 'rgba(5, 13, 12, 0.94)',
  },
  labelText: { color: ask.mint, fontSize: 12, fontWeight: '700' },
});
