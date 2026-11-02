// Bottom sheet to pick any minute from 00 to 59. Hours and minutes are typed or stepped with arrows.
// The phone's own clock is one tap away and is never limited to 15-minute steps.
// Spec: _scratch/timetable-ux-plan.md D.3 (TimePickerSheet).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, fontSize, fontFamily } from '../../constants/theme';
import { KeyboardShiftView } from '../keyboard/keyboardStick';
import { useClockFormat } from '../../hooks/useClockFormat';
import {
  formatTime, from12, parseHHMM, parseTyped, stepHour, to12, toHHMM,
  type Clock, type Period,
} from '../../utils/timeOfDay';

const FALLBACK_MIN = 9 * 60;
const REPEAT_MS = 120;
const MINUTE_SHORTCUTS = [0, 15, 30, 45];

export interface TimePickerSheetProps {
  visible: boolean;
  title: string;
  /** 'HH:MM' 24-hour. */
  value: string;
  clock?: Clock;
  /** Gives back the chosen time as 'HH:MM' 24-hour. The parent closes the sheet. */
  onConfirm(v: string): void;
  onClose(): void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function dateFor(min: number): Date {
  const d = new Date();
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  return d;
}

export default function TimePickerSheet({ visible, title, value, clock: clockProp, onConfirm, onClose }: TimePickerSheetProps) {
  const detected = useClockFormat();
  const clock = clockProp ?? detected;
  const insets = useSafeAreaInsets();

  const [hourText, setHourText] = useState('');
  const [minuteText, setMinuteText] = useState('');
  const [period, setPeriod] = useState<Period>('AM');
  const [showWheel, setShowWheel] = useState(false);

  // Last valid minutes, read by the arrow buttons (which must keep working while a box holds bad text).
  const lastValid = useRef<number>(parseHHMM(value) ?? FALLBACK_MIN);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function seedFrom(min: number) {
    lastValid.current = min;
    if (clock === '12h') {
      const t = to12(min);
      setHourText(pad2(t.hour12));
      setPeriod(t.period);
    } else {
      setHourText(pad2(Math.floor(min / 60)));
    }
    setMinuteText(pad2(min % 60));
  }

  // Each time the sheet opens, start from the value the parent holds.
  useEffect(() => {
    if (!visible) return;
    seedFrom(parseHHMM(value) ?? FALLBACK_MIN);
    setShowWheel(false);
  }, [visible, value, clock]);

  // Stop any auto-repeat when the sheet closes or the component unmounts.
  useEffect(() => () => stopRepeat(), []);

  const parsed = parseTyped(hourText, minuteText, clock, period);
  const valid = typeof parsed === 'number';
  const error = valid ? null : (parsed as string);
  if (valid) lastValid.current = parsed as number;

  function bumpHour(delta: number) {
    seedFrom(stepHour(lastValid.current, delta));
  }

  function bumpMinute(delta: number) {
    const base = lastValid.current;
    const hour = Math.floor(base / 60);
    const minute = (((base % 60) + delta) % 60 + 60) % 60;
    seedFrom(hour * 60 + minute);
  }

  function startRepeat(step: () => void) {
    stopRepeat();
    repeatTimer.current = setInterval(step, REPEAT_MS);
  }

  function stopRepeat() {
    if (repeatTimer.current !== null) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
  }

  function setHourDigits(t: string) {
    setHourText(t.replace(/\D/g, '').slice(0, 2));
  }

  function setMinuteDigits(t: string) {
    setMinuteText(t.replace(/\D/g, '').slice(0, 2));
  }

  function blurMinute() {
    // Pads a single typed digit (7 becomes 07) once the box is left.
    if (valid) seedFrom(parsed as number);
  }

  function pickShortcut(m: number) {
    const base = lastValid.current;
    seedFrom(Math.floor(base / 60) * 60 + m);
  }

  function onWheelChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setShowWheel(false);
      if (event.type === 'set' && selected) seedFrom(selected.getHours() * 60 + selected.getMinutes());
      return;
    }
    if (event.type === 'set' && selected) seedFrom(selected.getHours() * 60 + selected.getMinutes());
  }

  function confirm() {
    if (!valid) return;
    onConfirm(toHHMM(parsed as number));
  }

  const confirmLabel = valid ? `Set ${formatTime(parsed as number, clock)}` : 'Set time';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardShiftView style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close time picker" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 8) + 12 }]} accessibilityViewIsModal>
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            <Pressable style={styles.iconBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.timeRow}>
            <Stepper
              label="Hour"
              onUp={() => bumpHour(1)}
              onDown={() => bumpHour(-1)}
              onRepeat={startRepeat}
              onStopRepeat={stopRepeat}
            >
              <TextInput
                style={styles.box}
                value={hourText}
                onChangeText={setHourDigits}
                keyboardType="number-pad"
                maxLength={2}
                selectTextOnFocus
                accessibilityLabel="Hour"
                testID="time-hour"
              />
            </Stepper>

            <Text style={styles.colon}>:</Text>

            <Stepper
              label="Minute"
              onUp={() => bumpMinute(1)}
              onDown={() => bumpMinute(-1)}
              onRepeat={startRepeat}
              onStopRepeat={stopRepeat}
            >
              <TextInput
                style={styles.box}
                value={minuteText}
                onChangeText={setMinuteDigits}
                onBlur={blurMinute}
                keyboardType="number-pad"
                maxLength={2}
                selectTextOnFocus
                accessibilityLabel="Minute"
                testID="time-minute"
              />
            </Stepper>

            {clock === '12h' ? (
              <View style={styles.periodCol} accessibilityRole="radiogroup">
                {(['AM', 'PM'] as Period[]).map(p => {
                  const on = period === p;
                  return (
                    <Pressable
                      key={p}
                      style={[styles.periodBtn, on && styles.periodBtnOn]}
                      onPress={() => {
                        setPeriod(p);
                        if (valid) {
                          const t = to12(lastValid.current);
                          seedFrom(from12(t.hour12, t.minute, p));
                        }
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={p === 'AM' ? 'Morning, AM' : 'Afternoon or evening, PM'}
                    >
                      <Text style={[styles.periodText, on && styles.periodTextOn]}>{p}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionLabel}>Minutes</Text>
          <View style={styles.chips}>
            {MINUTE_SHORTCUTS.map(m => {
              const on = valid && (parsed as number) % 60 === m;
              return (
                <Pressable
                  key={m}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => pickShortcut(m)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Set minutes to ${pad2(m)}`}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{`:${pad2(m)}`}</Text>
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
          ) : null}

          <Pressable
            style={styles.phoneBtn}
            onPress={() => setShowWheel(v => !v)}
            accessibilityRole="button"
            accessibilityLabel={showWheel ? 'Hide phone clock' : 'Use phone clock'}
          >
            <Ionicons name="time-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.phoneBtnText}>{showWheel ? 'Hide phone clock' : 'Use phone clock'}</Text>
          </Pressable>

          {showWheel ? (
            <DateTimePicker
              value={dateFor(valid ? (parsed as number) : lastValid.current)}
              mode="time"
              is24Hour={clock === '24h'}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onWheelChange}
            />
          ) : null}

          <Pressable
            style={[styles.setBtn, !valid && styles.setBtnOff]}
            onPress={confirm}
            disabled={!valid}
            accessibilityRole="button"
            accessibilityState={{ disabled: !valid }}
            accessibilityLabel={confirmLabel}
          >
            <Text style={styles.setBtnText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </KeyboardShiftView>
    </Modal>
  );
}

function Stepper({ label, onUp, onDown, onRepeat, onStopRepeat, children }: {
  label: string;
  onUp(): void;
  onDown(): void;
  onRepeat(step: () => void): void;
  onStopRepeat(): void;
  children: ReactNode;
}) {
  return (
    <View style={styles.stepCol}>
      <Pressable
        style={styles.arrow}
        onPress={onUp}
        onLongPress={() => onRepeat(onUp)}
        onPressOut={onStopRepeat}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label.toLowerCase()}`}
      >
        <Ionicons name="chevron-up" size={24} color={colors.text} />
      </Pressable>
      {children}
      <Pressable
        style={styles.arrow}
        onPress={onDown}
        onLongPress={() => onRepeat(onDown)}
        onPressOut={onStopRepeat}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label.toLowerCase()}`}
      >
        <Ionicons name="chevron-down" size={24} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: colors.white, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.sm,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: fontSize.xl, fontFamily: fontFamily.headingSemiBold, color: colors.text },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  stepCol: { alignItems: 'center', gap: 4 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.full, backgroundColor: colors.gray100 },
  box: {
    width: 64, height: 72, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white, textAlign: 'center', fontSize: fontSize.xxxl, fontFamily: fontFamily.heading, color: colors.text,
  },
  colon: { fontSize: fontSize.xxxl, fontFamily: fontFamily.heading, color: colors.text, marginTop: -4 },
  periodCol: { gap: spacing.sm, marginLeft: spacing.xs },
  periodBtn: {
    width: 64, height: 44, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  periodBtnOn: { borderColor: colors.primary, borderWidth: 2, backgroundColor: '#F0FDF4' },
  periodText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.textSecondary },
  periodTextOn: { color: colors.primaryDark },
  sectionLabel: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center',
    borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  chipOn: { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: '#F0FDF4' },
  chipText: { fontSize: fontSize.md, fontFamily: fontFamily.medium, color: colors.text },
  chipTextOn: { color: colors.primaryDark, fontFamily: fontFamily.semiBold },
  error: { fontSize: fontSize.md, fontFamily: fontFamily.medium, color: colors.error, textAlign: 'center' },
  phoneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 44 },
  phoneBtnText: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.primaryDark },
  setBtn: {
    minHeight: 52, borderRadius: borderRadius.md, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs,
  },
  setBtnOff: { backgroundColor: colors.gray300 },
  setBtnText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.white },
});
