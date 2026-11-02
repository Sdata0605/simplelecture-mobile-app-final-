import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '../../constants/theme';
import { ask } from '../askAssistant/askTheme';
import {
  END_ASK_PROMPT_ANNOUNCEMENT,
  END_ASK_PROMPT_CLOSE_LABEL,
  END_ASK_PROMPT_MESSAGE,
  END_ASK_PROMPT_NO_LABEL,
  END_ASK_PROMPT_YES_LABEL,
  type V5EndAskPromptProps,
} from './endAskPromptCopy';

export type { V5EndAskPromptProps } from './endAskPromptCopy';


/**
 * End-of-lecture "Ask AI" prompt card (V5 player).
 *
 * Bottom-anchored overlay rendered inside the player root view (not a Modal),
 * so it works in portrait and landscape fullscreen. Stateless apart from its
 * enter animation: the parent decides `visible` and handles the flag store.
 *
 * Tokens follow the end-lecture plan, section D: dark card matching the player
 * chrome, primary green action with dark text (white on #2BBD6E fails contrast).
 */

const MIN_TOUCH = 48;
const ENTER_MS = 220;
const ENTER_OFFSET = 16;

export default function V5EndAskPrompt({
  visible,
  lectureTitle,
  onYes,
  onDismiss,
}: V5EndAskPromptProps) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      return;
    }
    let cancelled = false;
    let reduceMotion = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        reduceMotion = enabled;
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        Animated.timing(progress, {
          toValue: 1,
          duration: reduceMotion ? 0 : ENTER_MS,
          useNativeDriver: true,
        }).start();
      });
    AccessibilityInfo.announceForAccessibility(END_ASK_PROMPT_ANNOUNCEMENT);
    return () => {
      cancelled = true;
    };
  }, [visible, progress]);

  if (!visible) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [ENTER_OFFSET, 0],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Scrim: swallows taps so they do not reach the video. Tapping it does nothing. */}
      <View style={styles.scrim} />
      <View
        pointerEvents="box-none"
        style={[styles.anchor, { paddingBottom: insets.bottom + spacing.md, paddingLeft: insets.left + spacing.md, paddingRight: insets.right + spacing.md }]}
      >
        <Animated.View
          accessible={false}
          accessibilityViewIsModal={true}
          importantForAccessibility="yes"
          testID="end-ask-prompt-card"
          style={[styles.card, { opacity: progress, transform: [{ translateY }] }]}
        >
          <View style={styles.headerRow}>
            <Ionicons name="sparkles" size={20} color={ask.gold} style={styles.sparkle} />
            <View style={styles.headerText}>
              <Text
                accessibilityRole="header"
                style={styles.message}
              >
                {END_ASK_PROMPT_MESSAGE}
              </Text>
              {lectureTitle ? (
                <Text style={styles.subline} numberOfLines={1} ellipsizeMode="tail">
                  {lectureTitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={END_ASK_PROMPT_CLOSE_LABEL}
              testID="button-end-ask-close"
              hitSlop={8}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={END_ASK_PROMPT_NO_LABEL}
              accessibilityHint="Closes this message"
              testID="button-end-ask-no"
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryText}>{END_ASK_PROMPT_NO_LABEL}</Text>
            </Pressable>
            <Pressable
              onPress={onYes}
              accessibilityRole="button"
              accessibilityLabel={END_ASK_PROMPT_YES_LABEL}
              accessibilityHint="Opens Ask AI to talk about this lecture"
              testID="button-end-ask-yes"
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>{END_ASK_PROMPT_YES_LABEL}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  anchor: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(15, 15, 26, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sparkle: {
    marginTop: 2,
    marginRight: spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  message: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    lineHeight: 22,
    color: '#e5e7eb',
  },
  subline: {
    marginTop: spacing.xs,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: 'rgba(124, 224, 195, 0.85)',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
    marginTop: -spacing.sm,
    marginRight: -spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryButton: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: ask.onMint,
  },
  secondaryButton: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  secondaryText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.8,
  },
});
