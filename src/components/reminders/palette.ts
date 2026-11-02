// Reminders feature palette. Spec: _scratch/reminders-v2-plan.md section E.1.
// Tints already used across the app, plus one blue in the same Tailwind family as the theme greys.

export const KIND_STYLE = {
  call:         { icon: 'call',               fg: '#2BBD6E', bg: '#E8F8EF', label: 'Call' },
  message:      { icon: 'chatbubble-ellipses', fg: '#3B82F6', bg: '#EFF6FF', label: 'Message' },
  notification: { icon: 'notifications',      fg: '#F59E0B', bg: '#FEF3C7', label: 'Notification' },
} as const;

export const TINT = {
  greenSoft: '#F0FDF4', amberBg: '#FEF3C7', amberText: '#B45309',
  redBg: '#FEE2E2', redText: '#B91C1C', successBg: '#D1FAE5',
  headerGradientEnd: '#4ADE80', callGradient: ['#111827', '#1F2937'],
  overlay: 'rgba(0,0,0,0.4)', snackbar: '#1F2937',
} as const;
