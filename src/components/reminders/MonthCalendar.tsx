// Month grid for the Calendar tab, Monday first. Spec: _scratch/reminders-v2-plan.md E.2 (MonthCalendar).
import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../constants/theme';
import { buildCalendarGrid, datePrefixForDay } from '../../utils/calendar';
import type { ReminderKind } from '../../types/reminder';
import { KIND_STYLE } from './palette';

export interface MonthCalendarProps {
  year: number;
  month: number; // 0-based
  selectedKey: string; // YYYY-MM-DD
  todayKey: string; // YYYY-MM-DD
  dots: Record<string, ReminderKind[] | 'past'>;
  onSelect(key: string): void;
  onChangeMonth(year: number, month: number): void;
  minMonth: { y: number; m: number };
  maxMonth: { y: number; m: number };
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const KIND_ORDER: ReminderKind[] = ['call', 'message', 'notification'];

function monthIndex(y: number, m: number): number {
  return y * 12 + m;
}

function dayDotColours(entry: ReminderKind[] | 'past' | undefined, selected: boolean): string[] {
  if (!entry) return [];
  if (entry === 'past') return [selected ? colors.white : colors.gray300];
  const present = new Set(entry);
  return KIND_ORDER.filter((k) => present.has(k)).map((k) => (selected ? colors.white : KIND_STYLE[k].fg));
}

export default function MonthCalendar({
  year,
  month,
  selectedKey,
  todayKey,
  dots,
  onSelect,
  onChangeMonth,
  minMonth,
  maxMonth,
}: MonthCalendarProps) {
  const cells = useMemo(() => buildCalendarGrid(year, month), [year, month]);
  const rows = useMemo(() => {
    const out: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);

  const current = monthIndex(year, month);
  const canPrev = current > monthIndex(minMonth.y, minMonth.m);
  const canNext = current < monthIndex(maxMonth.y, maxMonth.m);
  const [todayY, todayM] = todayKey.split('-').map(Number);
  const onTodayMonth = year === todayY && month === todayM - 1;
  const showTodayButton = !onTodayMonth || selectedKey !== todayKey;
  const title = new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  function shift(delta: number) {
    const idx = current + delta;
    const y = Math.floor(idx / 12);
    const m = idx % 12;
    onChangeMonth(y, m);
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => shift(-1)}
          disabled={!canPrev}
          style={[styles.navBtn, !canPrev && styles.navDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: !canPrev }}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} maxFontSizeMultiplier={1.6} accessibilityRole="header">{title}</Text>
        <TouchableOpacity
          onPress={() => shift(1)}
          disabled={!canNext}
          style={[styles.navBtn, !canNext && styles.navDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: !canNext }}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text key={`${d}-${i}`} style={styles.weekday} accessibilityElementsHidden importantForAccessibility="no">
            {d}
          </Text>
        ))}
      </View>

      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((day, c) => {
            if (day === null) return <View key={c} style={styles.cell} />;
            const key = datePrefixForDay(year, month, day);
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            const isPast = key < todayKey;
            const entry = dots[key];
            const count = entry === undefined ? 0 : entry === 'past' ? 1 : entry.length;
            const dotColours = dayDotColours(entry, isSelected);
            const dateObj = new Date(year, month, day);
            const dateLabel = dateObj.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
            const countLabel = count === 0 ? 'no reminders' : `${count} reminder${count === 1 ? '' : 's'}`;

            return (
              <TouchableOpacity
                key={c}
                onPress={() => onSelect(key)}
                style={styles.cell}
                accessibilityRole="button"
                accessibilityLabel={`${dateLabel}, ${countLabel}${isToday ? ', today' : ''}`}
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  style={[
                    styles.dayCircle,
                    isToday && !isSelected && styles.todayCircle,
                    isSelected && styles.selectedCircle,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isPast && !isSelected && styles.pastText,
                      isToday && !isSelected && styles.todayText,
                      isSelected && styles.selectedText,
                    ]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {day}
                  </Text>
                </View>
                <View style={styles.dotRow}>
                  {dotColours.map((colour, i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: colour }]} />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {showTodayButton ? (
        <TouchableOpacity
          onPress={() => {
            if (!onTodayMonth) onChangeMonth(todayY, todayM - 1);
            onSelect(todayKey);
          }}
          style={styles.todayButton}
          accessibilityRole="button"
          accessibilityLabel="Go to today"
        >
          <Text style={styles.todayButtonText} maxFontSizeMultiplier={1.6}>Today</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: 12,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  header: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 36,
    height: 36,
    minHeight: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDisabled: {
    opacity: 0.3,
  },
  title: {
    fontFamily: fontFamily.headingSemiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  weekRow: {
    flexDirection: 'row',
    height: 24,
    alignItems: 'center',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayCircle: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  selectedCircle: {
    backgroundColor: colors.primary,
  },
  dayText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.text,
  },
  pastText: {
    color: colors.textMuted,
  },
  todayText: {
    fontFamily: fontFamily.bold,
    color: colors.primary,
  },
  selectedText: {
    fontFamily: fontFamily.bold,
    color: colors.white,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 4,
    height: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  todayButton: {
    alignSelf: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  todayButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
});
