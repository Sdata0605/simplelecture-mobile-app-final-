// Shared month calendar: timetable agenda, wizard date picker and Reminders calendar.
// Stateless: the parent owns the visible month and the selection. Spec: timetable-ui-fix-plan.md C.4.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily } from '../../constants/theme';
import { cardBase } from '../../constants/surfaces';
import { buildCalendarGrid, datePrefixForDay } from '../../utils/calendar';
import { markerA11y, markerDots, type DayMarkers } from '../../utils/calendarMarkers';
import { TINT } from '../reminders/palette';

export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// Indexed by Date.getDay(): 0 = Sunday.
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CIRCLE = 36;
const DAY_FONT_SIZE = 15; // Inter 500, per C.4
const CELL_HEIGHT_PICKER = 48;
const CELL_HEIGHT_AGENDA = 52;

export interface MonthGridProps {
  year: number;
  month: number; // 0-based
  onChangeMonth(year: number, month: number): void;
  selectedKey: string | null; // YYYY-MM-DD
  todayKey: string; // YYYY-MM-DD
  onSelect(key: string): void;
  mode: 'agenda' | 'picker';
  markers?: Record<string, DayMarkers>;
  minKey?: string;
  maxKey?: string;
  rangeStartKey?: string;
  rangeEndKey?: string;
  minMonth?: { y: number; m: number };
  maxMonth?: { y: number; m: number };
  /** Shows a "Today" button when the user is away from today. Defaults to true in agenda mode. */
  showTodayButton?: boolean;
  testID?: string;
}

function monthIndex(y: number, m: number): number {
  return y * 12 + m;
}

export default function MonthGrid({
  year,
  month,
  onChangeMonth,
  selectedKey,
  todayKey,
  onSelect,
  mode,
  markers,
  minKey,
  maxKey,
  rangeStartKey,
  rangeEndKey,
  minMonth,
  maxMonth,
  showTodayButton,
  testID,
}: MonthGridProps) {
  const cells = buildCalendarGrid(year, month);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const current = monthIndex(year, month);
  const canPrev = !minMonth || current > monthIndex(minMonth.y, minMonth.m);
  const canNext = !maxMonth || current < monthIndex(maxMonth.y, maxMonth.m);

  const [todayY, todayM] = todayKey.split('-').map(Number);
  const onTodayMonth = year === todayY && month === todayM - 1;
  const wantToday = showTodayButton ?? mode === 'agenda';
  const showToday = wantToday && (!onTodayMonth || selectedKey !== todayKey);
  const cellHeight = mode === 'agenda' ? CELL_HEIGHT_AGENDA : CELL_HEIGHT_PICKER;

  function shift(delta: number) {
    const idx = current + delta;
    onChangeMonth(Math.floor(idx / 12), ((idx % 12) + 12) % 12);
  }

  return (
    <View style={[cardBase, styles.root]} testID={testID}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => shift(-1)}
          disabled={!canPrev}
          style={styles.navBtn}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: !canPrev }}
        >
          <Ionicons name="chevron-back" size={22} color={canPrev ? colors.text : colors.gray300} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.6} accessibilityRole="header">
            {MONTH_LABELS[month]} {year}
          </Text>
        </View>
        {showToday ? (
          <TouchableOpacity
            onPress={() => {
              if (!onTodayMonth) onChangeMonth(todayY, todayM - 1);
              onSelect(todayKey);
            }}
            style={styles.todayBtn}
            accessibilityRole="button"
            accessibilityLabel="Go to today"
          >
            <Text style={styles.todayBtnText} maxFontSizeMultiplier={1.6}>Today</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() => shift(1)}
          disabled={!canNext}
          style={styles.navBtn}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: !canNext }}
        >
          <Ionicons name="chevron-forward" size={22} color={canNext ? colors.text : colors.gray300} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_LETTERS.map((d, i) => (
          <Text key={i} style={styles.weekday} maxFontSizeMultiplier={1.3}>{d}</Text>
        ))}
      </View>

      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((day, c) => {
            if (day === null) return <View key={c} style={[styles.cell, { height: cellHeight }]} />;

            const key = datePrefixForDay(year, month, day);
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            const disabled =
              mode === 'picker' && ((!!minKey && key < minKey) || (!!maxKey && key > maxKey));
            const isPast = mode === 'agenda' && key < todayKey;
            const isRangeEdge = mode === 'picker' && (key === rangeStartKey || key === rangeEndKey);
            const filled = isSelected || isRangeEdge;
            const inRange =
              mode === 'picker' && !!rangeStartKey && !!rangeEndKey &&
              key > rangeStartKey && key < rangeEndKey;

            const dateObj = new Date(year, month, day);
            const label = `${WEEKDAY_NAMES[dateObj.getDay()]} ${day} ${MONTH_LABELS[month]} ${year}`;
            const entry = markers?.[key];
            const markerText = entry ? `, ${markerA11y(entry)}` : '';
            const dots = entry ? markerDots(entry, isSelected) : [];

            return (
              <TouchableOpacity
                key={c}
                onPress={() => onSelect(key)}
                disabled={disabled}
                style={[styles.cell, { height: cellHeight }, disabled && styles.cellDisabled]}
                accessibilityRole="button"
                accessibilityLabel={`${label}${markerText}${isToday ? ', today' : ''}${isSelected ? ', selected' : ''}`}
                accessibilityState={{ selected: isSelected, disabled }}
              >
                {inRange ? <View style={styles.rangeBand} /> : null}
                <View
                  style={[
                    styles.circle,
                    isToday && !filled && styles.todayRing,
                    filled && styles.filledCircle,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isPast && !filled && styles.pastText,
                      isToday && !filled && styles.todayText,
                      filled && styles.filledText,
                    ]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {day}
                  </Text>
                </View>
                {dots.length > 0 ? (
                  <View style={styles.dotRow}>
                    {dots.map((colour, i) => (
                      <View key={i} style={[styles.dot, { backgroundColor: colour }]} />
                    ))}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: spacing.sm + 4, // 12
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  title: {
    fontFamily: fontFamily.headingSemiBold,
    fontSize: fontSize.xl, // 18
    color: colors.text,
  },
  todayBtn: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm + 1, // 13
    color: colors.primaryDark,
  },
  weekRow: {
    flexDirection: 'row',
    height: 28,
    alignItems: 'center',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm, // 12
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 2,
  },
  cellDisabled: {
    opacity: 0.3,
  },
  rangeBand: {
    position: 'absolute',
    top: 2,
    height: CIRCLE,
    left: 0,
    right: 0,
    backgroundColor: TINT.greenSoft,
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayRing: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  filledCircle: {
    backgroundColor: colors.primary,
  },
  dayText: {
    fontFamily: fontFamily.medium,
    fontSize: DAY_FONT_SIZE,
    color: colors.text,
  },
  pastText: {
    color: colors.textMuted,
  },
  todayText: {
    fontFamily: fontFamily.bold,
    color: colors.primary,
  },
  filledText: {
    fontFamily: fontFamily.bold,
    color: colors.white,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
    height: 6,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
