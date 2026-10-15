export function formatMarketingVideoTime(millis: number): string {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function seekMillisFromPress(
  locationX: number,
  trackWidth: number,
  durationMillis: number,
): number {
  if (durationMillis <= 0) return 0;
  const safeWidth = Math.max(1, trackWidth);
  const ratio = Math.max(0, Math.min(1, locationX / safeWidth));
  return ratio * durationMillis;
}