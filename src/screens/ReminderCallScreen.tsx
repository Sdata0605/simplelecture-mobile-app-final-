import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../constants/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';
import RingingAvatar from '../components/callReminder/RingingAvatar';
import { useReminderCallAudio } from '../hooks/useReminderCallAudio';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { getReminder, ensureLocalAudio } from '../services/callReminders';
import type { CallReminder } from '../types/callReminder';

type Props = NativeStackScreenProps<RootStackParamList, 'ReminderCall'>;

const GRADIENT: [string, string] = ['#111827', '#1F2937'];

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function SoundBar({ progress, active }: { progress: SharedValue<number>; active: boolean }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.25 + progress.value * 0.75 }],
  }));
  return <Animated.View style={[styles.bar, style, !active && styles.barIdle]} />;
}

function SoundBars({ active }: { active: boolean }) {
  const reduceMotion = useReduceMotion();
  const animate = active && !reduceMotion;
  const bars = [useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0)];

  useEffect(() => {
    bars.forEach((b, i) => {
      if (animate) {
        b.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 280 + i * 90, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.2, { duration: 280 + i * 90, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
      } else {
        cancelAnimation(b);
        b.value = 0.4;
      }
    });
    return () => {
      bars.forEach((b) => cancelAnimation(b));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate]);

  return (
    <View style={styles.bars}>
      {bars.map((b, i) => (
        <SoundBar key={i} progress={b} active={animate} />
      ))}
    </View>
  );
}

export default function ReminderCallScreen({ navigation, route }: Props) {
  const { reminderId, autoplay } = route.params;
  const [reminder, setReminder] = useState<CallReminder | null>(null);
  const [loadingReminder, setLoadingReminder] = useState(true);
  // undefined = not resolved yet, null = no local audio (text fallback)
  const [localUri, setLocalUri] = useState<string | null | undefined>(undefined);
  const autoplayedRef = useRef(false);

  const audio = useReminderCallAudio(localUri ?? null);
  const { state, play, stop, positionMs } = audio;

  // Load the reminder row.
  useEffect(() => {
    let active = true;
    setLoadingReminder(true);
    getReminder(reminderId)
      .then((r) => {
        if (active) setReminder(r);
      })
      .catch(() => {
        if (active) setReminder(null);
      })
      .finally(() => {
        if (active) setLoadingReminder(false);
      });
    return () => {
      active = false;
    };
  }, [reminderId]);

  // Resolve the local mp3 (downloads if missing). Null means text-only.
  useEffect(() => {
    if (!reminder) return;
    let active = true;
    ensureLocalAudio(reminder)
      .then((uri) => {
        if (active) setLocalUri(uri ?? null);
      })
      .catch(() => {
        if (active) setLocalUri(null);
      });
    return () => {
      active = false;
    };
  }, [reminder]);

  // Autoplay once, when the audio has been resolved and the call was answered.
  useEffect(() => {
    if (autoplayedRef.current) return;
    if (!autoplay || localUri === undefined || !reminder) return;
    if (reminder.status === 'missed') return;
    autoplayedRef.current = true;
    play();
  }, [autoplay, localUri, reminder, play]);

  const isMissed = reminder?.status === 'missed' && state === 'idle';
  const showConnecting =
    loadingReminder || localUri === undefined || state === 'loading' || (state === 'idle' && !!autoplay && !isMissed);
  const showPlaying = state === 'playing';
  const showEnded = state === 'ended';
  const showError = state === 'error';
  const showReady = state === 'idle' && !autoplay && !isMissed && !!reminder;

  const title = reminder?.title?.trim() || 'Study call';
  const message = reminder?.message_text ?? '';

  const headerLabel = isMissed
    ? 'Missed study call'
    : showPlaying
      ? 'On call'
      : showEnded
        ? 'Call ended'
        : showError
          ? 'Call ended'
          : showConnecting
            ? 'Connecting…'
            : 'Study call';

  const endButtons = (
    <View style={styles.endRow}>
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => navigation.navigate('StudyTimetable')}
        accessibilityRole="button"
        accessibilityLabel="Start studying"
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>Start studying</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.outlineBtn}
        onPress={play}
        disabled={!reminder}
        accessibilityRole="button"
        accessibilityLabel="Play again"
        activeOpacity={0.85}
      >
        <Text style={styles.outlineBtnText}>Play again</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <LinearGradient colors={GRADIENT} style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerLabel}>{headerLabel}</Text>
          {(showPlaying || showEnded) && (
            <Text style={styles.timer}>{formatTime(positionMs)}</Text>
          )}
        </View>

        <View style={styles.avatarBlock}>
          <RingingAvatar ringing={false} size={48} />
          <SoundBars active={showPlaying} />
          <Text style={styles.name}>Simple Lecture Teacher</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {title}
          </Text>
        </View>

        {!loadingReminder && !reminder ? (
          <View style={styles.center}>
            <Text style={styles.subtitle}>This reminder could not be found.</Text>
          </View>
        ) : (
          <ScrollView style={styles.transcriptWrap} contentContainerStyle={styles.transcriptContent}>
            {showError && (
              <View style={styles.fallbackRow}>
                <Ionicons name="warning-outline" size={18} color={colors.warning} />
                <Text style={styles.fallbackText}>
                  Couldn't load voice — here's your message
                </Text>
              </View>
            )}
            {!!message && (
              <View style={styles.transcriptCard}>
                <Text style={styles.transcriptText}>{message}</Text>
              </View>
            )}
          </ScrollView>
        )}

        <View style={styles.bottom}>
          {showConnecting && (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primaryLight} />
            </View>
          )}

          {isMissed && (
            <View style={styles.endRow}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={play}
                disabled={!reminder}
                accessibilityRole="button"
                accessibilityLabel="Play message"
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Play message</Text>
              </TouchableOpacity>
            </View>
          )}

          {showReady && (
            <View style={styles.stopCol}>
              <TouchableOpacity
                onPress={play}
                style={[styles.circle, { backgroundColor: colors.success }]}
                accessibilityRole="button"
                accessibilityLabel="Play message"
                activeOpacity={0.85}
              >
                <Ionicons name="play" size={30} color={colors.white} />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Play message</Text>
            </View>
          )}

          {showPlaying && (
            <View style={styles.stopCol}>
              <TouchableOpacity
                onPress={stop}
                style={[styles.circle, { backgroundColor: colors.error }]}
                accessibilityRole="button"
                accessibilityLabel="Stop call"
                activeOpacity={0.85}
              >
                <Ionicons name="stop" size={30} color={colors.white} />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Stop</Text>
            </View>
          )}

          {(showEnded || showError) && endButtons}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  headerLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.gray300,
  },
  timer: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.lg,
    color: colors.gray300,
  },
  avatarBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 28,
    gap: 4,
    marginTop: spacing.xs,
  },
  bar: {
    width: 5,
    height: 28,
    borderRadius: 3,
    backgroundColor: colors.primaryLight,
  },
  barIdle: {
    opacity: 0.5,
  },
  name: {
    fontFamily: fontFamily.heading,
    fontSize: fontSize.xl,
    color: colors.white,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.lg,
    color: colors.gray300,
    textAlign: 'center',
  },
  transcriptWrap: {
    flex: 1,
    marginTop: spacing.lg,
  },
  transcriptContent: {
    gap: spacing.md,
  },
  transcriptCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  transcriptText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.white,
    lineHeight: 22,
  },
  fallbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fallbackText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.warning,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  bottom: {
    minHeight: 150,
    justifyContent: 'center',
    paddingBottom: spacing.xxl,
  },
  stopCol: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  circle: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.gray300,
  },
  endRow: {
    gap: spacing.md,
    alignItems: 'stretch',
  },
  primaryBtn: {
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: colors.white,
  },
  outlineBtn: {
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  outlineBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: colors.white,
  },
});
