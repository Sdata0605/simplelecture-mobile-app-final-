// Month grid for the Calendar tab, Monday first. Thin wrapper over the shared MonthGrid (agenda mode).
// Props are unchanged; `dots` maps to one coloured dot per reminder kind present on that day.
import { useMemo } from 'react';
import MonthGrid from '../calendar/MonthGrid';
import type { ReminderKind } from '../../types/reminder';
import { KIND_STYLE } from './palette';
import { colors } from '../../constants/theme';
import type { ColourDayMarkers } from '../../utils/calendarMarkers';

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

const KIND_ORDER: ReminderKind[] = ['call', 'message', 'notification'];

function dayColours(entry: ReminderKind[] | 'past'): string[] {
  if (entry === 'past') return [colors.gray300];
  const present = new Set(entry);
  return KIND_ORDER.filter((k) => present.has(k)).map((k) => KIND_STYLE[k].fg);
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
  const markers = useMemo(() => {
    const out: Record<string, ColourDayMarkers> = {};
    for (const key of Object.keys(dots)) {
      out[key] = { colours: dayColours(dots[key]) };
    }
    return out;
  }, [dots]);

  return (
    <MonthGrid
      year={year}
      month={month}
      onChangeMonth={onChangeMonth}
      selectedKey={selectedKey}
      todayKey={todayKey}
      onSelect={onSelect}
      mode="agenda"
      markers={markers}
      minMonth={minMonth}
      maxMonth={maxMonth}
      showTodayButton
    />
  );
}
