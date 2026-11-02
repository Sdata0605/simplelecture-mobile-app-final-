// Date picker used by the plan wizard. Thin wrapper over the shared MonthGrid (picker mode).
// API: value, min, onChange are unchanged. rangeStart / rangeEnd are optional and shade the days between them.

import { useState } from 'react';
import MonthGrid, { MONTH_LABELS } from '../calendar/MonthGrid';
import { formatYmd } from './planWizard/state';

export const MONTH_NAMES = MONTH_LABELS;

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function DeadlinePicker({ value, min, onChange, rangeStart, rangeEnd }: {
  value: Date;
  min: Date;
  onChange: (d: Date) => void;
  rangeStart?: Date;
  rangeEnd?: Date;
}) {
  const [vYear, setVYear] = useState(value.getFullYear());
  const [vMonth, setVMonth] = useState(value.getMonth());
  const minKey = formatYmd(startOfDay(min));
  const valueKey = formatYmd(value);
  const todayKey = formatYmd(new Date());

  return (
    <MonthGrid
      year={vYear}
      month={vMonth}
      onChangeMonth={(y, m) => { setVYear(y); setVMonth(m); }}
      selectedKey={valueKey}
      todayKey={todayKey}
      onSelect={(key) => onChange(parseKey(key))}
      mode="picker"
      minKey={minKey}
      rangeStartKey={rangeStart ? formatYmd(rangeStart) : undefined}
      rangeEndKey={rangeEnd ? formatYmd(rangeEnd) : undefined}
      showTodayButton={false}
    />
  );
}
