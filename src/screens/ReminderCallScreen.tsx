import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../constants/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';
import RingingAvatar from '../components/callReminder/RingingAvatar';
import { useReminderCallAudio, useSpokenFallback } from '../hooks/useReminderCallAudio';
import { useReduceMotion } from '../hooks/useReduceMotion';
import {
  getReminderLocal,
  markOutcome,
  resolveVoiceSource,
  type VoiceSource,
} from '../services/reminders';
import { spokenScript } from '../services/reminders/spokenScript';
import { planOpenClass, openClassLabel, openClassLevel } from '../services/reminders/openClass';
import type { Reminder } from '../types/reminder';

type Props = NativeStackScreenProps<RootStackParamList, 'ReminderCall'>;

type CallMode = 'call' | 'message';
// Which voice path is active. 'file' = pre-generated voice file (wav or legacy mp3), 'device' = phone voice, 'text' = text only.
type VoicePath = 'file' | 'device' | 'text';

// D-9: the edge-function fetch is bounded in time so the call never hangs on "Connecting".
const VOICE_FETCH_TIMEOUT_MS = 6000;
const GRADIENT: [string, string] = ['#111827', '#1F2937'];
// Shown (and spoken with the phone voice) when a timetable call's session was deleted.
const REMOVED_NOTE = 'This session was removed from your timetable.';
const REMOVED_SCRIPT = 'This study session was removed from your timetable.';

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// The spoken script is also the transcript shown on screen (E.9).
function scriptFor(r: Reminder): string {
  return spokenScript(r.message_text, r.language) || r.message_text.trim();
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
  const params = route.params;
  const { reminderId } = params;
  const autoplay = !!params.autoplay;
  const mode: CallMode = params.mode ?? 'call';

  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [loadingReminder, setLoadingReminder] = useState(true);
  // null = voice source not resolved yet.
  const [path, setPath] = useState<VoicePath | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [playTick, setPlayTick] = useState(0);

  const sourcePromiseRef = useRef<Promise<VoiceSource> | null>(null);
  const autoplayedRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const mountedRef = useRef(true);

  const audio = useReminderCallAudio(fileUri, reminderId);
  const {
    play: playFile,
    stop: stopFile,
    positionMs,
    state: fileState,
    preloaded: filePreloaded,
  } = audio;
  const {
    speak: speakSpoken,
    stop: stopSpoken,
    state: spokenState,
  } = useSpokenFallback();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Latest stop function, so the focus check below does not re-run on every render.
  const stopAudioRef = useRef<() => void>(() => {});
  stopAudioRef.current = () => {
    stopFile();
    stopSpoken();
  };

  // Re-checks the reminder on mount and on focus. If it was deleted, stop the audio and leave.
  // Timetable calls stay on screen instead: they show the "removed" note and Answer keeps working.
  const isTimetable = params.src === 'tt';
  const checkStillExists = useCallback(() => {
    getReminderLocal(reminderId)
      .then((r) => {
        if (!mountedRef.current) return;
        if (r || isTimetable) return;
        stopAudioRef.current();
        if (navigation.canGoBack()) navigation.goBack();
      })
      .catch(() => {});
  }, [reminderId, navigation, isTimetable]);

  useEffect(() => {
    checkStillExists();
  }, [checkStillExists]);

  useFocusEffect(
    useCallback(() => {
      checkStillExists();
    }, [checkStillExists])
  );

  const isMissed = mode === 'call' && reminder?.status === 'missed';
  // Timetable call whose session was deleted (row gone), or cancelled. Shown with a note, not a silent exit.
  const missingRow = isTimetable && !loadingReminder && !reminder;
  const removedNote = isTimetable && (missingRow || reminder?.status === 'cancelled');
  const target = reminder?.target ?? params.target ?? null;
  const openLabel = openClassLabel(openClassLevel(target));
  const filePlaying = path === 'file' && fileState === 'playing';
  const deviceSpeaking = path === 'device' && spokenState === 'speaking';
  const playing = filePlaying || deviceSpeaking;

  // Timing for the answer-to-sound budget: logged once each time playback starts.
  const mountedAtRef = useRef(Date.now());
  const playLoggedRef = useRef(false);
  useEffect(() => {
    if (!playing) {
      playLoggedRef.current = false;
      return;
    }
    if (playLoggedRef.current) return;
    playLoggedRef.current = true;
    const via = path === 'device' ? 'device' : filePreloaded ? 'preloaded' : 'file';
    console.log(`[ReminderVoice] path=${via} ms=${Date.now() - mountedAtRef.current}`);
  }, [playing, path, filePreloaded]);
  const finished =
    path === 'text' ||
    (path === 'file' && fileState === 'ended') ||
    (path === 'device' && spokenState === 'ended');
  const connecting =
    loadingReminder ||
    resolving ||
    (!!reminder && mode === 'call' && path === null) ||
    (missingRow && autoplay && path === null) ||
    (path === 'file' && fileState === 'loading') ||
    (path === 'device' && spokenState === 'loading');

  // Load the reminder row. Cache first, network within 5 s (facade).
  useEffect(() => {
    let active = true;
    setLoadingReminder(true);
    getReminderLocal(reminderId)
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

  // Resolves the voice source once: local file, then network (bounded), then device voice, then text.
  const ensureSource = useCallback((r: Reminder): Promise<VoiceSource> => {
    const existing = sourcePromiseRef.current;
    if (existing) return existing;
    const created = resolveVoiceSource(r, {
      timeoutMs: VOICE_FETCH_TIMEOUT_MS,
    }).catch((): VoiceSource => ({ type: 'text', script: scriptFor(r) }));
    sourcePromiseRef.current = created;
    return created;
  }, []);

  const applySource = (s: VoiceSource) => {
    setFileUri(s.type === 'file' ? s.uri : null);
    setPath(s.type);
  };

  // Calls resolve the voice up front; messages resolve lazily on "Listen".
  useEffect(() => {
    if (!reminder || mode !== 'call') return;
    let active = true;
    ensureSource(reminder).then((s) => {
      if (active) applySource(s);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder, mode, ensureSource]);

  // Playback request. Set via a ref and a tick so the play runs after the
  // voice path has been applied to the hooks (they read the URI on render).
  const requestPlay = useCallback(() => {
    pendingPlayRef.current = true;
    setPlayTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!pendingPlayRef.current || path === null || !reminder) return;
    pendingPlayRef.current = false;
    if (path === 'file') {
      playFile();
      return;
    }
    if (path === 'device') {
      void speakSpoken(scriptFor(reminder), reminder.language).then((outcome) => {
        if (!mountedRef.current) return;
        if (outcome === 'unavailable' || outcome === 'locked') setPath('text');
      });
    }
  }, [path, playTick, reminder, playFile, speakSpoken]);

  // Answered call: play once when the voice path is known.
  useEffect(() => {
    if (autoplayedRef.current || !autoplay || mode !== 'call' || !reminder || path === null) return;
    if (reminder.status === 'missed') return;
    autoplayedRef.current = true;
    requestPlay();
  }, [autoplay, mode, reminder, path, requestPlay]);

  // Timetable call with no row left: Answer speaks a short note with the phone voice (no file, no network).
  useEffect(() => {
    if (!missingRow || !autoplay || autoplayedRef.current) return;
    autoplayedRef.current = true;
    setPath('device');
    void speakSpoken(REMOVED_SCRIPT, 'en-IN').then((outcome) => {
      if (!mountedRef.current) return;
      if (outcome === 'unavailable' || outcome === 'locked') setPath('text');
    });
  }, [missingRow, autoplay, speakSpoken]);

  // Fallback 1: the voice file failed to play, so use the phone's voice.
  useEffect(() => {
    if (path !== 'file' || fileState !== 'error' || !reminder) return;
    let active = true;
    speakSpoken(scriptFor(reminder), reminder.language).then((outcome) => {
      if (active) setPath(outcome === 'started' ? 'device' : 'text');
    });
    return () => {
      active = false;
    };
  }, [path, fileState, reminder, speakSpoken]);

  // Fallback 2: the phone's voice failed, so show the text only.
  useEffect(() => {
    if (path === 'device' && spokenState === 'error') setPath('text');
  }, [path, spokenState]);

  const onListen = () => {
    if (!reminder) return;
    if (path !== null) {
      requestPlay();
      return;
    }
    setResolving(true);
    ensureSource(reminder).then((s) => {
      if (!mountedRef.current) return;
      setResolving(false);
      applySource(s);
      requestPlay();
    });
  };

  const onPlayAgain = () => {
    requestPlay();
  };

  const onStop = () => {
    stopFile();
    stopSpoken();
  };

  const onDone = () => {
    stopFile();
    stopSpoken();
    if (reminder) {
      if (mode === 'message') {
        markOutcome(reminderId, 'delivered').catch(() => {});
      } else if (reminder.status !== 'missed') {
        markOutcome(reminderId, 'answered').catch(() => {});
      }
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  // "Open topic": stop playback, record the outcome as Done does, and go to the topic's Classes tab.
  const onOpenClass = () => {
    stopFile();
    stopSpoken();
    if (reminder) {
      if (mode === 'message') {
        markOutcome(reminderId, 'delivered').catch(() => {});
      } else if (reminder.status !== 'missed') {
        markOutcome(reminderId, 'answered').catch(() => {});
      }
    }
    const plan = planOpenClass(target, reminderId);
    if (plan.intent.name === 'StudyTimetable') {
      navigation.replace('StudyTimetable');
    } else {
      navigation.replace('TopicDetails', plan.intent.params as RootStackParamList['TopicDetails']);
    }
  };

  const openClassButton = (
    <TouchableOpacity
      style={styles.openClassBtn}
      onPress={onOpenClass}
      disabled={!reminder && !target && !isTimetable}
      accessibilityRole="button"
      accessibilityLabel={openLabel}
      activeOpacity={0.85}
    >
      <Ionicons name="book-outline" size={20} color={colors.white} />
      <Text style={styles.outlineBtnText}>{openLabel}</Text>
    </TouchableOpacity>
  );

  const headerLabel =
    mode === 'message'
      ? 'Reminder'
      : isMissed && !playing && !finished
        ? 'Missed call'
        : playing
          ? 'On call'
          : finished
            ? 'Call ended'
            : connecting
              ? 'Connecting…'
              : 'Reminder call';

  const transcript = reminder ? scriptFor(reminder) : missingRow ? REMOVED_SCRIPT : '';
  const title = reminder?.title?.trim() || 'Reminder';

  let bottom: ReactNode = null;
  if (playing) {
    bottom = (
      <View style={styles.playingRow}>
        <View style={styles.stopCol}>
          <TouchableOpacity
            onPress={onStop}
            style={[styles.circle, { backgroundColor: colors.error }]}
            accessibilityRole="button"
            accessibilityLabel="Stop call"
            activeOpacity={0.85}
          >
            <Ionicons name="stop" size={30} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.actionLabel}>Stop</Text>
        </View>
        <View style={styles.playingOpenClass}>{openClassButton}</View>
      </View>
    );
  } else if (connecting) {
    bottom = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primaryLight} />
      </View>
    );
  } else if (finished) {
    bottom = (
      <View style={styles.endRow}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Done"
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Done</Text>
        </TouchableOpacity>
        {openClassButton}
        {path !== 'text' && (
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={onPlayAgain}
            accessibilityRole="button"
            accessibilityLabel="Play again"
            activeOpacity={0.85}
          >
            <Text style={styles.outlineBtnText}>Play again</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  } else if (path === null) {
    // Message opened from a notification: voice is loaded on demand.
    bottom = (
      <View style={styles.endRow}>
        {reminder ? (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={onListen}
            accessibilityRole="button"
            accessibilityLabel="Listen"
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Listen</Text>
          </TouchableOpacity>
        ) : (
          openClassButton
        )}
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Done"
          activeOpacity={0.85}
        >
          <Text style={styles.outlineBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    // Idle with a known voice: a missed call, or a message not yet played.
    bottom = (
      <View style={styles.endRow}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onPlayAgain}
          disabled={!reminder}
          accessibilityRole="button"
          accessibilityLabel="Play message"
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Play message</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Done"
          activeOpacity={0.85}
        >
          <Text style={styles.outlineBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <LinearGradient colors={GRADIENT} style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerLabel}>{headerLabel}</Text>
          {(filePlaying || (path === 'file' && fileState === 'ended')) && (
            <Text style={styles.timer}>{formatTime(positionMs)}</Text>
          )}
        </View>

        <View style={styles.avatarBlock}>
          <RingingAvatar
            ringing={false}
            size={48}
            kind={mode === 'message' ? reminder?.kind : undefined}
          />
          <SoundBars active={playing} />
          <Text style={styles.name}>Simple Lecture Teacher</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {title}
          </Text>
        </View>

        {!loadingReminder && !reminder && !isTimetable ? (
          <View style={styles.center}>
            <Text style={styles.subtitle}>This reminder could not be found.</Text>
          </View>
        ) : (
          <ScrollView style={styles.transcriptWrap} contentContainerStyle={styles.transcriptContent}>
            {removedNote && (
              <View style={styles.fallbackRow}>
                <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
                <Text style={styles.fallbackText}>{REMOVED_NOTE}</Text>
              </View>
            )}
            {path === 'device' && (
              <View style={styles.fallbackRow}>
                <Ionicons name="volume-medium-outline" size={18} color={colors.warning} />
                <Text style={styles.fallbackText}>Using your phone's voice</Text>
              </View>
            )}
            {path === 'text' && (
              <View style={styles.fallbackRow}>
                <Ionicons name="warning-outline" size={18} color={colors.warning} />
                <Text style={styles.fallbackText}>
                  Couldn't play the voice. Here's your reminder.
                </Text>
              </View>
            )}
            {!!transcript && (
              <View style={styles.transcriptCard}>
                <Text style={styles.transcriptText}>{transcript}</Text>
              </View>
            )}
          </ScrollView>
        )}

        <View style={styles.bottom}>{bottom}</View>
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
    lineHeight: 24,
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
  playingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  playingOpenClass: {
    flex: 1,
  },
  openClassBtn: {
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
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
