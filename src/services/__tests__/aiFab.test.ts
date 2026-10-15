import {
  AI_FAB_HIDDEN_ROUTES,
  FAB_MARGIN,
  clampPlacement,
  parsePlacement,
  placementFromDrop,
  placementToPosition,
  shouldShowAIFab,
} from '../aiFab';

const base = { routeName: 'Home', askOpen: false, sidebarOpen: false, landscape: false };
const box = { width: 400, height: 800 };
const insets = { top: 30, bottom: 20 };
const SIZE = 64;

describe('where the floating AI button shows', () => {
  it('shows on the screens a student browses', () => {
    for (const routeName of ['Home', 'Dashboard', 'MyCourses', 'MyNotes', 'Profile', 'TopicDetails', 'CourseDetails', 'Cart', 'ChaptersList', 'Curriculum']) {
      expect(shouldShowAIFab({ ...base, routeName })).toBe(true);
    }
  });

  it('is hidden before the navigator is ready', () => {
    expect(shouldShowAIFab({ ...base, routeName: null })).toBe(false);
  });

  it('is hidden while signing in, in players and tests, on the AI screens, on Reels and where there is a message box', () => {
    for (const routeName of ['Login', 'Signup', 'Onboarding', 'InterestSelection', 'V5Player', 'V4Player', 'WatchRecording', 'MyTestTake', 'AITeacher', 'AITeacherSettings', 'Reels', 'GroupChat', 'ForumPost']) {
      expect(AI_FAB_HIDDEN_ROUTES.has(routeName)).toBe(true);
      expect(shouldShowAIFab({ ...base, routeName })).toBe(false);
    }
  });

  it('is hidden while Ask AI or the side menu is open, and on a landscape phone', () => {
    expect(shouldShowAIFab({ ...base, askOpen: true })).toBe(false);
    expect(shouldShowAIFab({ ...base, sidebarOpen: true })).toBe(false);
    expect(shouldShowAIFab({ ...base, landscape: true })).toBe(false);
  });
});

describe('where the button rests', () => {
  it('sits against the chosen edge at the chosen height', () => {
    expect(placementToPosition({ edge: 'right', bottom: 100 }, box, SIZE)).toEqual({ x: 400 - SIZE - FAB_MARGIN, y: 800 - 100 - SIZE });
    expect(placementToPosition({ edge: 'left', bottom: 100 }, box, SIZE)).toEqual({ x: FAB_MARGIN, y: 800 - 100 - SIZE });
  });

  it('settles against the nearer side edge when dropped', () => {
    expect(placementFromDrop({ x: 50, y: 300 }, box, insets, SIZE).edge).toBe('left');
    expect(placementFromDrop({ x: 300, y: 300 }, box, insets, SIZE).edge).toBe('right');
    // dropped with its middle exactly on the centre line: the right edge
    expect(placementFromDrop({ x: 200 - SIZE / 2, y: 300 }, box, insets, SIZE).edge).toBe('right');
  });

  it('keeps the height it was dropped at', () => {
    const placed = placementFromDrop({ x: 300, y: 300 }, box, insets, SIZE);
    expect(placed.bottom).toBe(800 - 300 - SIZE);
  });

  it('cannot be left under the status bar or the gesture bar', () => {
    expect(placementFromDrop({ x: 300, y: -200 }, box, insets, SIZE).bottom).toBe(800 - insets.top - SIZE - FAB_MARGIN);
    expect(placementFromDrop({ x: 300, y: 790 }, box, insets, SIZE).bottom).toBe(insets.bottom + FAB_MARGIN);
  });

  it('is pulled back on screen when the screen gets smaller', () => {
    const small = { width: 300, height: 400 };
    expect(clampPlacement({ edge: 'right', bottom: 700 }, small, insets, SIZE)).toEqual({ edge: 'right', bottom: 400 - insets.top - SIZE - FAB_MARGIN });
  });

  it('survives a screen too short to fit it', () => {
    const tiny = { width: 300, height: 90 };
    expect(clampPlacement({ edge: 'left', bottom: 0 }, tiny, insets, SIZE).bottom).toBe(insets.bottom + FAB_MARGIN);
  });
});

describe('the remembered place', () => {
  it('is read back as it was saved', () => {
    expect(parsePlacement(JSON.stringify({ edge: 'left', bottom: 120 }))).toEqual({ edge: 'left', bottom: 120 });
  });

  it('is ignored when missing or damaged', () => {
    for (const raw of [null, '', 'oops', '{}', JSON.stringify({ edge: 'top', bottom: 1 }), JSON.stringify({ edge: 'left', bottom: 'high' })]) {
      expect(parsePlacement(raw)).toBeNull();
    }
  });
});
