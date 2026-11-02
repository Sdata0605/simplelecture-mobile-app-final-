import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, spacing, borderRadius, fontSize, fontFamily } from '../../../constants/theme';
import {
  format12, keepRangeValid, minutesToTime, roundToQuarter, toMinutes,
} from './timePresets';

// Custom From / To times. Uses the phone's own time picker, so no text is typed.
// Pattern follows components/reminders/DateTimeFields.tsx (Android closes itself; iOS shows a spinner and Done).

interface TimeRangeFieldProps {
  /** 'HH:MM' 24-hour. */
  start: string;
  /** 'HH:MM' 24-hour. */
  end: string;
  onChange(start: string, end: string): void;
  disabled?: boolean;
}

type Which = 'start' | 'end';

/** A Date on today's date at the given 'HH:MM' (used as the picker value). */
function dateFor(time: string): Date {
  const d = new Date();
  const m = toMinutes(time) ?? 9 * 60;
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
}

export default function TimeRangeField({ start, end, onChange, disabled }: TimeRangeFieldProps) {
  const [picker, setPicker] = useState<Which | null>(null);
  const [iosDraft, setIosDraft] = useState<Date | null>(null);

  function commit(which: Which, picked: Date) {
    // Rounded to 15 minutes, and always 'HH:MM' with a leading zero (7:00 becomes 07:00).
    const time = minutesToTime(roundToQuarter(picked.getHours() * 60 + picked.getMinutes()));
    if (which === 'start') {
      const next = keepRangeValid(time, end);
      onChange(next.start, next.end);
    } else {
      onChange(start, time);
    }
  }

  function open(which: Which) {
    if (disabled) return;
    if (Platform.OS === 'ios') setIosDraft(dateFor(which === 'start' ? start : end));
    setPicker(picker === which ? null : which);
  }

  function handleAndroid(which: Which) {
    return (event: DateTimePickerEvent, selected?: Date) => {
      setPicker(null);
      if (event.type === 'set' && selected) commit(which, selected);
    };
  }

  function handleIos(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'set' && selected) setIosDraft(selected);
  }

  function doneIos() {
    if (picker !== null && iosDraft) commit(picker, iosDraft);
    setIosDraft(null);
    setPicker(null);
  }

  const activeValue = picker === 'start' ? start : end;

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          style={[styles.field, disabled && styles.disabled]}
          onPress={() => open('start')}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`From ${format12(start) ?? start}`}
        >
          <Text style={styles.label}>From</Text>
          <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.value}>{format12(start) ?? start}</Text>
        </Pressable>
        <Pressable
          style={[styles.field, disabled && styles.disabled]}
          onPress={() => open('end')}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`To ${format12(end) ?? end}`}
        >
          <Text style={styles.label}>To</Text>
          <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.value}>{format12(end) ?? end}</Text>
        </Pressable>
      </View>

      {picker !== null && Platform.OS === 'android' ? (
        <DateTimePicker
          value={dateFor(activeValue)}
          mode="time"
          is24Hour={false}
          display="default"
          minuteInterval={15}
          onChange={handleAndroid(picker)}
        />
      ) : null}

      {picker !== null && Platform.OS === 'ios' ? (
        <View>
          <DateTimePicker
            value={iosDraft ?? dateFor(activeValue)}
            mode="time"
            is24Hour={false}
            display="spinner"
            minuteInterval={15}
            onChange={handleIos}
          />
          <Pressable
            style={styles.done}
            onPress={doneIos}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  field: {
    flex: 1, minHeight: 48, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm,
  },
  disabled: { opacity: 0.5 },
  label: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary },
  value: { flexShrink: 1, fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.text },
  done: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  doneText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.primaryDark },
});
