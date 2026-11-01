import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../constants/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';
import RingingAvatar from '../components/callReminder/RingingAvatar';
import { useRingtone } from '../hooks/useReminderCallAudio';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { getReminder, markStatus } from '../services/callReminders';
import type { CallReminder } from '../types/callReminder';

type Props = NativeStackScreenProps<RootStackParamList, 'IncomingCall'>;

const RING_TIMEOUT_MS = 30000;
const GRADIENT: [string, string] = ['#111827', '#1F2937'];

export default function IncomingCallScreen({ navigation, route }: Props) {
  const { reminderId } = route.params;
  const reduceMotion = useReduceMotion();
  const [ringing, setRinging] = useState(true);
  const [reminder, setReminder] = useState<CallReminder | null>(null);
  const handledRef = useRef(false);

  useRingtone(ringing);

  useEffect(() => {
    let active = true;
    getReminder(reminderId)
      .then((r) => {
        if (active) setReminder(r);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [reminderId]);

  // Gentle bounce on the Answer button.
  const bounce = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || !ringing) {
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

  const finish = (kind: 'answer' | 'decline' | 'missed') => {
    if (handledRef.current) return;
    handledRef.current = true;
    setRinging(false);

    if (kind === 'answer') {
      markStatus(reminderId, 'answered').catch(() => {});
      navigation.replace('ReminderCall', { reminderId, autoplay: true });
    } else if (kind === 'decline') {
      markStatus(reminderId, 'declined').catch(() => {});
      navigation.goBack();
    } else {
      markStatus(reminderId, 'missed').catch(() => {});
      navigation.replace('ReminderCall', { reminderId, autoplay: false });
    }
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

  const title = reminder?.title?.trim() || 'Study call';

  return (
    <LinearGradient colors={GRADIENT} style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.top}>
          <Text style={styles.kicker}>Incoming study call</Text>
        </View>

        <View style={styles.middle}>
          <RingingAvatar ringing={ringing} size={120} />
          <Text style={styles.name}>Simple Lecture Teacher</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {title}
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
              <TouchableOpacity
                onPress={() => finish('answer')}
                style={[styles.circle, { backgroundColor: colors.success }]}
                accessibilityRole="button"
                accessibilityLabel="Answer call"
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={32} color={colors.white} />
              </TouchableOpacity>
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
