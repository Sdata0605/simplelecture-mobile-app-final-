// Bottom snackbar with an optional action (Undo). Spec: _scratch/reminders-v2-plan.md E.8 and E.1 (Snackbar, motion).
// The parent keys this component per message, so each new message restarts the timer.
import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../constants/theme';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { TINT } from './palette';

export interface UndoSnackbarProps {
  visible: boolean;
  message: string;
  actionLabel?: string;
  onAction?(): void;
  onHide(): void;
  durationMs?: number;
}

export default function UndoSnackbar({
  visible,
  message,
  actionLabel,
  onAction,
  onHide,
  durationMs = 5000,
}: UndoSnackbarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const enter = useRef(new Animated.Value(0)).current;
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  useEffect(() => {
    if (!visible) return;
    Animated.timing(enter, {
      toValue: 1,
      duration: reduceMotion ? 0 : 200,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => onHideRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [visible, durationMs, reduceMotion, enter]);

  if (!visible) return null;

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <Animated.View
      style={[
        styles.root,
        { bottom: insets.bottom + 88, opacity: enter, transform: [{ translateY }] },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.message} maxFontSizeMultiplier={1.6} numberOfLines={2}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
        >
          <Text style={styles.actionText} maxFontSizeMultiplier={1.6}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    minHeight: 48,
    borderRadius: borderRadius.md,
    backgroundColor: TINT.snackbar,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  message: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.white,
  },
  action: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    color: colors.primaryLight,
  },
});
