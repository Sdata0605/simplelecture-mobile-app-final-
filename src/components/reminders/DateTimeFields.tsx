import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { ReminderMode } from '../../types/reminder';
import { formatTime12, parseTime } from '../../services/reminders/schedule';
import { colors, spacing, borderRadius, fontSize, fontFamily } from '../../constants/theme';

// Spec: _scratch/reminders-v2-plan.md E.4 (DateTimeFields). Date is only shown for "Once on a date".

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' to a local Date at midnight, or null. */
export function dateFromKey(key: string): Date | null {
  const m = DATE_KEY_RE.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local Date to 'YYYY-MM-DD'. */
export function keyFromDate(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${da}`;
}

/** Local Date to 'HH:MM' (24h). */
export function timeKeyFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 'Sat 15 Nov' for a 'YYYY-MM-DD' key. Returns '' when the key is invalid. */
export function formatDayLabel(key: string): string {
  const d = dateFromKey(key);
  if (!d) return '';
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** Long form used in the summary, for example 'Saturday, 15 Nov'. */
export function formatDayLong(key: string): string {
  const d = dateFromKey(key);
  if (!d) return '';
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** 'HH:MM' to a Date on the given day (used as the picker value). */
function timeToDate(time: string, base: Date): Date {
  const t = parseTime(time);
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  if (t) d.setHours(t.hour, t.minute, 0, 0);
  return d;
}

interface DateTimeFieldsProps {
  mode: ReminderMode;
  /** 'YYYY-MM-DD' local. Used only when mode is 'once'. */
  date: string;
  /** 'HH:MM' local, 24h. */
  time: string;
  onChangeDate: (dateKey: string) => void;
  onChangeTime: (timeKey: string) => void;
  /** Confirmation line, for example 'Rings on Saturday, 15 Nov at 9:30 AM'. */
  summary: string;
  /** When set, replaces the summary in the error colour. */
  error?: string;
  disabled?: boolean;
}

export default function DateTimeFields({
  mode, date, time, onChangeDate, onChangeTime, summary, error, disabled,
}: DateTimeFieldsProps) {
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const maxDate = new Date(now.getFullYear(), now.getMonth() + 24, now.getDate());
  const showDate = mode === 'once';
  const dateValue = dateFromKey(date) ?? today;
  const timeValue = timeToDate(time, today);

  function handleDate(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setPicker(null);
    if (event.type === 'set' && selected) onChangeDate(keyFromDate(selected));
  }

  function handleTime(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setPicker(null);
    if (event.type === 'set' && selected) onChangeTime(timeKeyFromDate(selected));
  }

  const fieldStyle = [styles.field, disabled && styles.disabled];

  return (
    <View>
      <View style={styles.row}>
        {showDate ? (
          <TouchableOpacity
            style={[...fieldStyle, styles.dateField]}
            onPress={() => setPicker(picker === 'date' ? null : 'date')}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Date: ${formatDayLabel(date)}`}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.value}>{formatDayLabel(date) || 'Pick a date'}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[...fieldStyle, showDate ? styles.timeField : styles.timeFieldFull]}
          onPress={() => setPicker(picker === 'time' ? null : 'time')}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Time: ${formatTime12(timeValue.getHours(), timeValue.getMinutes())}`}
        >
          <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.value}>{formatTime12(timeValue.getHours(), timeValue.getMinutes())}</Text>
        </TouchableOpacity>
      </View>

      {picker === 'date' ? (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={today}
          maximumDate={maxDate}
          onChange={handleDate}
        />
      ) : null}
      {picker === 'time' ? (
        <DateTimePicker
          value={timeValue}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleTime}
        />
      ) : null}
      {Platform.OS === 'ios' && picker !== null ? (
        <TouchableOpacity
          style={styles.done}
          onPress={() => setPicker(null)}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
      ) : (
        <Text style={styles.summary}>{summary}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  field: {
    height: 48, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, gap: spacing.sm,
  },
  dateField: { flex: 1 },
  timeField: { flex: 1 },
  timeFieldFull: { flex: 1 },
  disabled: { opacity: 0.5 },
  value: { fontSize: fontSize.lg, fontFamily: fontFamily.regular, color: colors.text },
  done: { alignSelf: 'flex-end', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  doneText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.primary },
  summary: {
    fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  error: {
    fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.error, marginTop: spacing.sm,
  },
});
