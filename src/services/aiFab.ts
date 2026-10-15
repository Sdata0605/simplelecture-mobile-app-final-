// Rules for the floating AI button that sits over every screen: where it is hidden, and where it rests once the
// student has dragged it somewhere. Kept free of React Native so it is easy to test.

/**
 * Screens that have no use for it or where it would be in the way: signing in and onboarding (no account yet),
 * full-screen players and tests (the lecture player has its own Ask AI button, and a test is no place for hints),
 * the AI screens themselves, Reels (its buttons run down the right edge) and the screens with a message box at
 * the bottom.
 */
export const AI_FAB_HIDDEN_ROUTES: ReadonlySet<string> = new Set([
  'Onboarding',
  'Login',
  'Signup',
  'OtpVerification',
  'ForgotPassword',
  'InterestSelection',
  'SubcategorySelection',
  'V3Player',
  'V4Player',
  'V5Player',
  'MarketingLecturePlayer',
  'AILecturePlayer',
  'WatchRecording',
  'MyTestTake',
  'AITeacher',
  'AITeacherSettings',
  'Reels',
  'GroupChat',
  'ForumPost',
  'Support',
]);

export interface FabVisibility {
  /** Name of the screen in front, or null before the navigator is ready. */
  routeName: string | null;
  /** Ask AI is open (it is a full-screen modal of its own). */
  askOpen: boolean;
  /** The side menu is open. */
  sidebarOpen: boolean;
  /** A landscape phone is showing a video or a lesson, not a page to browse. */
  landscape: boolean;
}

export function shouldShowAIFab({ routeName, askOpen, sidebarOpen, landscape }: FabVisibility): boolean {
  if (!routeName || askOpen || sidebarOpen || landscape) return false;
  return !AI_FAB_HIDDEN_ROUTES.has(routeName);
}

// ---- where the button rests ---------------------------------------------------------------------------------

/** The button rests against the left or right edge, this far above the bottom of the screen. */
export interface FabPlacement {
  edge: 'left' | 'right';
  bottom: number;
}

export interface FabBox {
  width: number;
  height: number;
}

export interface FabInsets {
  top: number;
  bottom: number;
}

/** The gap between the button and the screen's edge. */
export const FAB_MARGIN = 10;

/** Keeps the button on the screen, clear of the status bar and the gesture bar. */
export function clampPlacement(placement: FabPlacement, box: FabBox, insets: FabInsets, size: number): FabPlacement {
  const min = insets.bottom + FAB_MARGIN;
  const max = Math.max(min, box.height - insets.top - size - FAB_MARGIN);
  return { edge: placement.edge, bottom: Math.min(max, Math.max(min, placement.bottom)) };
}

/** Top-left corner of the button for a placement. */
export function placementToPosition(placement: FabPlacement, box: FabBox, size: number): { x: number; y: number } {
  return {
    x: placement.edge === 'left' ? FAB_MARGIN : box.width - size - FAB_MARGIN,
    y: box.height - placement.bottom - size,
  };
}

/** Where a dropped button settles: against the nearer side edge, at the height it was dropped. */
export function placementFromDrop(topLeft: { x: number; y: number }, box: FabBox, insets: FabInsets, size: number): FabPlacement {
  const edge = topLeft.x + size / 2 < box.width / 2 ? 'left' : 'right';
  return clampPlacement({ edge, bottom: box.height - topLeft.y - size }, box, insets, size);
}

export function parsePlacement(raw: string | null): FabPlacement | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if ((value?.edge === 'left' || value?.edge === 'right') && Number.isFinite(value.bottom)) {
      return { edge: value.edge, bottom: value.bottom };
    }
  } catch {
    // fall through
  }
  return null;
}
