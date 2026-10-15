/**
 * Pure calendar / date-bucketing helpers for the Study Timetable.
 *
 * Extracted from StudyTimetableScreen so the logic can be unit-tested without
 * pulling in React Native. Behaviour is identical to the original in-screen
 * definitions — these functions are referenced back from the screen.
 */

/** Human-readable label for a study-plan scope type. */
export function planScopeLabel(scopeType?: string | null): string | null {
  if (!scopeType) return null;
  switch (scopeType) {
    case 'subject': return 'Subject scope';
    case 'chapter': return 'Chapter scope';
    case 'topic': return 'Topic scope';
    case 'course': return 'Full course';
    default: return `${scopeType.charAt(0).toUpperCase()}${scopeType.slice(1)} scope`;
  }
}

/** Monday=0 … Sunday=6 */
export function dayOfWeekMon(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Always returns exactly 42 cells (6 rows × 7 columns). */
export function buildCalendarGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = getDaysInMonth(year, month);
  const startOffset = dayOfWeekMon(firstDay);
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length < 42) cells.push(null);
  return cells;
}

export function datePrefixForDay(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Local-time 'YYYY-MM-DD' key for an ISO timestamp. Sessions/tests are stored
 *  in UTC; bucketing by the local date keeps evening (e.g. IST) items on the
 *  correct calendar day instead of the UTC day. */
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
