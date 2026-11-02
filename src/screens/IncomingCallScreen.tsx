import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  BackHandler,
  AccessibilityInfo,
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
} from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../constants/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';
import RingingAvatar from '../components/callReminder/RingingAvatar';
import {
  primeReminderVoice,
  releaseReminderVoice,
  useRingtone,
} from '../hooks/useReminderCallAudio';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { getReminderLocal, markOutcome } from '../services/reminders';
import { findLocalAudio } from '../services/reminders/audio';
import type { Reminder } from '../types/reminder';

type Props = NativeStackScreenProps<RootStackParamList, 'IncomingCall'>;

const RING_TIMEOUT_MS = 30000;
const GRADIENT: [string, string] = ['#111827', '#1F2937'];
const GLOW_DURATION_MS = 1200;

export default function IncomingCallScreen({ navigation, route }: Props) {
  const { reminderId } = route.params;
  const reduceMotion = useReduceMotion();
  const [ringing, setRinging] = useState(true);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const handledRef = useRef(false);
  // Answer keeps the primed voice for ReminderCallScreen, so the unmount below must not release it.
  const answeredRef = useRef(false);
  const mountedRef = useRef(true);

  useRingtone(ringing);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (!answeredRef.current) releaseReminderVoice();
    };
  }, []);

  // While ringing, load the saved voice file paused (disk only, no network) so Answer plays at once.
  useEffect(() => {
    if (!reminder) return;
    let active = true;
    findLocalAudio(reminder)
      .then((local) => {
        if (!active || !local || answeredRef.current || handledRef.current) return;
        void primeReminderVoice(reminder.id, local.uri);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [reminder]);

  // Re-checks the reminder. If it was deleted while ringing, stop ringing and leave the screen.
  const checkStillExists = useCallback(() => {
    getReminderLocal(reminderId)
      .then((r) => {
        if (!mountedRef.current) return;
        if (!r) {
          if (handledRef.current) return;
          handledRef.current = true;
          setRinging(false);
          navigation.goBack();
          return;
        }
        setReminder(r);
      })
      .catch(() => {});
  }, [reminderId, navigation]);

  useEffect(() => {
    checkStillExists();
  }, [checkStillExists]);

  useFocusEffect(
    useCallback(() => {
      checkStillExists();
    }, [checkStillExists])
  );

  const text = reminder?.message_text?.trim() ?? '';

  // Announce the incoming call once the reminder text is known (or not found).
  const announcedRef = useRef(false);
  useEffect(() => {
    if (announcedRef.current) return;
    if (!reminder && text === '') return;
    announcedRef.current = true;
    AccessibilityInfo.announceForAccessibility(
      text ? `Incoming reminder call: ${text}` : 'Incoming reminder call'
    );
  }, [reminder, text]);

  // Gentle bounce on the Answer button.
  const bounce = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || !ringing) {
      cancelAnimation(bounce);
      bounce.value = 0;
      return;
    }
    bounce.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 350, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 350, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [reduceMotion, ringing, bounce]);
  const answerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }],
  }));

  // Glow ring behind the Answer button: primary at 0.25 opacity, scaling 1 to 1.25.
  const glow = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || !ringing) {
      cancelAnimation(glow);
      glow.value = 0;
      return;
    }
    glow.value = withRepeat(
      withTiming(1, { duration: GLOW_DURATION_MS, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
  }, [reduceMotion, ringing, glow]);
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.25 * (1 - glow.value),
    transform: [{ scale: 1 + 0.25 * glow.value }],
  }));

  const finish = (kind: 'answer' | 'decline' | 'missed') => {
    if (handledRef.current) return;
    handledRef.current = true;
    if (mountedRef.current) setRinging(false);

    if (kind === 'decline') {
      releaseReminderVoice();
      markOutcome(reminderId, 'declined').catch(() => {});
      navigation.goBack();
      return;
    }
    if (kind === 'answer') {
      answeredRef.current = true;
    } else {
      releaseReminderVoice();
    }
    const outcome = kind === 'answer' ? 'answered' : 'missed';
    markOutcome(reminderId, outcome).catch(() => {});
    // The ReminderCall route type gains `mode` in WP8; cast until then.
    const callParams = {
      reminderId,
      autoplay: kind === 'answer',
      mode: 'call',
    } as RootStackParamList['ReminderCall'];
    navigation.replace('ReminderCall', callParams);
  };

  // Auto-missed after 30 s of ringing.
  useEffect(() => {
    if (!ringing) return;
    const timer = setTimeout(() => finish('missed'), RING_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringing, reminderId]);

  // Hardware back button (Android) counts as Decline.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish('decline');
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminderId]);

  return (
    <LinearGradient colors={GRADIENT} style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.top}>
          <Text style={styles.kicker}>Incoming reminder call</Text>
        </View>

        <View style={styles.middle}>
          <RingingAvatar ringing={ringing} size={120} />
          <Text style={styles.name}>Simple Lecture Teacher</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {text || 'Reminder'}
          </Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.actionCol}>
            <TouchableOpacity
              onPress={() => finish('decline')}
              style={[styles.circle, { backgroundColor: colors.error }]}
              accessibilityRole="button"
              accessibilityLabel="Decline call"
              activeOpacity={0.8}
            >
              <Ionicons name="call" size={32} color={colors.white} style={styles.declineIcon} />
            </TouchableOpacity>
            <Text style={styles.actionLabel}>Decline</Text>
          </View>

          <View style={styles.actionCol}>
            <Animated.View style={answerStyle}>
              <View style={styles.answerWrap}>
                <Animated.View
                  pointerEvents="none"
                  style={[styles.glow, glowStyle]}
                />
                <TouchableOpacity
                  onPress={() => finish('answer')}
                  style={[styles.circle, { backgroundColor: colors.success }]}
                  accessibilityRole="button"
                  accessibilityLabel="Answer call"
                  activeOpacity={0.8}
                >
                  <Ionicons name="call" size={32} color={colors.white} />
                </TouchableOpacity>
              </View>
            </Animated.View>
            <Text style={styles.actionLabel}>Answer</Text>
          </View>
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
  top: {
    flex: 0.7,
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  kicker: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.gray300,
  },
  middle: {
    flex: 1.3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  name: {
    fontFamily: fontFamily.heading,
    fontSize: fontSize.xxl,
    color: colors.white,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.lg,
    color: colors.gray300,
    maxWidth: '85%',
    textAlign: 'center',
  },
  actions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingBottom: spacing.xxl,
  },
  actionCol: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  answerWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary,
  },
  circle: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineIcon: {
    transform: [{ rotate: '135deg' }],
  },
  actionLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.gray300,
  },
});
