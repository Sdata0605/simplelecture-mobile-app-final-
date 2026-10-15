/**
 * Shared real-time keyboard handling, used by the Doubts tab and the AI chat
 * inputs. On some Android devices (Android 15 edge-to-edge, several OEM
 * skins) the native "resize" soft-input mode is silently ignored, leaving
 * bottom-anchored inputs hidden behind the keyboard. The fix: track the real
 * keyboard height frame-by-frame with react-native-keyboard-controller and
 * move the input ourselves.
 *
 * The library needs its native module (present in EAS builds, absent in Expo
 * Go — where merely importing it throws), so it is loaded lazily and every
 * consumer falls back to the legacy behavior when it is unavailable.
 */
import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

let KeyboardControllerLib: typeof import('react-native-keyboard-controller') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  KeyboardControllerLib = require('react-native-keyboard-controller');
} catch {
  KeyboardControllerLib = null;
}

/** True when the native module is available (EAS builds; false in Expo Go). */
export const isKeyboardControlled = !!KeyboardControllerLib;

/**
 * Mounts the keyboard-controller provider locally (NOT app-wide) so only the
 * wrapped subtree opts into library-managed keyboard behavior; the rest of
 * the app keeps native resize handling. Renders children as-is when the
 * native module is unavailable.
 */
export function KeyboardScope({ children }: { children: ReactNode }) {
  if (!KeyboardControllerLib) return <>{children}</>;
  const { KeyboardProvider } = KeyboardControllerLib;
  return (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      {children}
    </KeyboardProvider>
  );
}

/**
 * Shared value tracking the keyboard's height frame-by-frame (0 when closed,
 * growing as it slides up) so UI can stay glued to the keyboard's top edge.
 * No-op when disabled or the native module is unavailable; the caller then
 * drives the offset from legacy Keyboard listeners instead.
 * `KeyboardControllerLib` is fixed at module load and `enabled` must be
 * constant for a component's lifetime, so the branch is stable across renders
 * (no conditional-hook violation).
 */
export function useKeyboardDrivenOffset(enabled: boolean) {
  const offset = useSharedValue(0);
  if (enabled && KeyboardControllerLib) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    KeyboardControllerLib.useKeyboardHandler(
      {
        onMove: (e) => {
          'worklet';
          offset.value = Math.max(e.height, 0);
        },
        onEnd: (e) => {
          'worklet';
          offset.value = Math.max(e.height, 0);
        },
      },
      []
    );
  }
  return offset;
}

/**
 * Drop-in replacement for a full-height KeyboardAvoidingView whose bottom
 * edge sits at the window bottom (chat layouts with the input bar last in a
 * flex column). When the native module is available, applies an animated
 * bottom padding equal to the real keyboard height; otherwise renders the
 * legacy KeyboardAvoidingView (iOS 'padding' behavior + native Android
 * resize) exactly as before.
 */
export function KeyboardShiftView({
  style,
  children,
  iosKeyboardVerticalOffset = 0,
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** Legacy-fallback KAV offset (iOS only), kept for Expo Go parity. */
  iosKeyboardVerticalOffset?: number;
}) {
  if (!KeyboardControllerLib) {
    return (
      <KeyboardAvoidingView
        style={style}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? iosKeyboardVerticalOffset : 0}
      >
        {children}
      </KeyboardAvoidingView>
    );
  }
  return (
    <KeyboardScope>
      <KeyboardShiftInner style={style}>{children}</KeyboardShiftInner>
    </KeyboardScope>
  );
}

function KeyboardShiftInner({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const offset = useKeyboardDrivenOffset(true);
  const animatedStyle = useAnimatedStyle(() => ({ paddingBottom: offset.value }));
  return <Reanimated.View style={[style, animatedStyle]}>{children}</Reanimated.View>;
}
