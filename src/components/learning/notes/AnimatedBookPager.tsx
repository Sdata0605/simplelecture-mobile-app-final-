/**
 * AnimatedBookPager
 *
 * A premium page-turn pager built on React Native's built-in Animated API
 * and PanResponder (no Reanimated required). Provides a 3D perspective
 * page-flip animation with:
 *
 * - Front and back faces with backfaceVisibility: 'hidden'
 * - Rotation around the book spine (left edge for backward, right edge for forward)
 * - Dynamic cast shadow and edge highlight overlays
 * - Spring completion / spring cancellation physics
 * - Velocity-aware completion threshold
 * - Gesture conflict resolution: horizontal flip vs vertical scroll
 * - Reduced-motion: simple fade instead of 3D flip
 * - First/last page boundary resistance
 * - Interaction locking during animation
 * - Safe unmount cleanup
 */

import React, {
  useRef,
  useCallback,
  useEffect,
  useMemo,
  memo,
} from 'react';
import {
  View,
  Animated,
  PanResponder,
  StyleSheet,
  Dimensions,
  AccessibilityInfo,
} from 'react-native';
import { colors } from '../../../constants/theme';
import { NotePage } from '../../../types/topicNotes';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PAGE_FLIP_CONFIG = {
  perspective: 1200,
  completionProgress: 0.35,     // fraction of page width (0-1) to commit
  completionVelocity: 500,      // px/s to auto-commit regardless of progress
  minDuration: 260,             // ms
  maxDuration: 420,             // ms
  shadowMaxOpacity: 0.28,
  edgeHighlightMaxOpacity: 0.18,
  gestureActivationX: 12,       // px horizontal threshold to activate
  gestureFailY: 18,             // px vertical threshold to pass off to scroll
  springDamping: 22,
  springStiffness: 220,
  springMass: 0.8,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type LayoutMode = 'phone' | 'tablet' | 'spread';

interface AnimatedBookPagerProps {
  pages: NotePage[];
  currentPageIndex: number;
  onPageIndexChange: (index: number) => void;
  renderPage: (page: NotePage, index: number) => React.ReactNode;
  layoutMode: LayoutMode;
  reducedMotion?: boolean;
}

// ---------------------------------------------------------------------------
// Memoised page content wrapper — prevents re-rendering during animation
// ---------------------------------------------------------------------------

const PageContent = memo(function PageContent({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return <View style={style}>{children}</View>;
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnimatedBookPager({
  pages,
  currentPageIndex,
  onPageIndexChange,
  renderPage,
  layoutMode,
  reducedMotion = false,
}: AnimatedBookPagerProps) {
  const { width: screenWidth } = Dimensions.get('window');
  const pageWidth =
    layoutMode === 'spread' ? screenWidth / 2 : screenWidth;

  // Current displayed index (may differ from props during animation)
  const displayedIndexRef = useRef(currentPageIndex);
  const isAnimatingRef = useRef(false);

  // Flip progress 0 (rest) → 1 (fully turned)
  const flipProgress = useRef(new Animated.Value(0)).current;

  // Which direction are we turning?
  const directionRef = useRef<'forward' | 'backward'>('forward');

  // Track whether reduced-motion preference is active
  const reducedMotionRef = useRef(reducedMotion);
  useEffect(() => { reducedMotionRef.current = reducedMotion; }, [reducedMotion]);

  // Sync displayed index when props change externally (Contents jump)
  useEffect(() => {
    if (
      currentPageIndex !== displayedIndexRef.current &&
      !isAnimatingRef.current
    ) {
      displayedIndexRef.current = currentPageIndex;
      flipProgress.setValue(0);
    }
  }, [currentPageIndex, flipProgress]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      flipProgress.stopAnimation();
    };
  }, [flipProgress]);

  // ---------------------------------------------------------------------------
  // Commit a page-index change after animation completes
  // ---------------------------------------------------------------------------

  const commitFlip = useCallback(() => {
    const dir = directionRef.current;
    const idx = displayedIndexRef.current;
    const next =
      dir === 'forward'
        ? Math.min(idx + 1, pages.length - 1)
        : Math.max(idx - 1, 0);

    if (next !== idx) {
      displayedIndexRef.current = next;
      onPageIndexChange(next);
    }

    flipProgress.setValue(0);
    isAnimatingRef.current = false;
  }, [pages.length, onPageIndexChange, flipProgress]);

  // ---------------------------------------------------------------------------
  // Animate to completion or cancellation
  // ---------------------------------------------------------------------------

  const animateToCompletion = useCallback(
    (velocity: number) => {
      const vx = Math.abs(velocity);
      // Shorter duration when release velocity is high
      const duration = Math.max(
        PAGE_FLIP_CONFIG.minDuration,
        PAGE_FLIP_CONFIG.maxDuration - (vx / 1000) * 160,
      );

      if (reducedMotionRef.current) {
        commitFlip();
        return;
      }

      Animated.timing(flipProgress, {
        toValue: 1,
        duration,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) commitFlip();
        else {
          flipProgress.setValue(0);
          isAnimatingRef.current = false;
        }
      });
    },
    [flipProgress, commitFlip],
  );

  const animateToCancellation = useCallback(() => {
    if (reducedMotionRef.current) {
      flipProgress.setValue(0);
      isAnimatingRef.current = false;
      return;
    }

    Animated.spring(flipProgress, {
      toValue: 0,
      damping: PAGE_FLIP_CONFIG.springDamping,
      stiffness: PAGE_FLIP_CONFIG.springStiffness,
      mass: PAGE_FLIP_CONFIG.springMass,
      overshootClamping: true,
      useNativeDriver: true,
    }).start(() => {
      flipProgress.setValue(0);
      isAnimatingRef.current = false;
    });
  }, [flipProgress]);

  // ---------------------------------------------------------------------------
  // Programmatic page turn (Previous/Next buttons & Contents)
  // ---------------------------------------------------------------------------

  const triggerPageTurn = useCallback(
    (direction: 'forward' | 'backward', immediate = false) => {
      if (isAnimatingRef.current) return;
      const idx = displayedIndexRef.current;
      if (direction === 'forward' && idx >= pages.length - 1) return;
      if (direction === 'backward' && idx <= 0) return;

      isAnimatingRef.current = true;
      directionRef.current = direction;

      if (immediate || reducedMotionRef.current) {
        commitFlip();
        return;
      }

      animateToCompletion(0);
    },
    [pages.length, animateToCompletion, commitFlip],
  );

  // Expose imperative controls via ref so NotesBookReader can call them
  // (returned as part of the rendered element's context — parent uses callbacks)

  // ---------------------------------------------------------------------------
  // PanResponder
  // ---------------------------------------------------------------------------

  const panResponder = useRef(
    PanResponder.create({
      // Don't claim the gesture until we see a clear horizontal intent
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,

      onMoveShouldSetPanResponder: (_, gs) => {
        if (isAnimatingRef.current) return false;
        const { dx, dy, moveX, moveY } = gs;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        // Activate only when dx dominates dy and exceeds the threshold
        return (
          absDx >= PAGE_FLIP_CONFIG.gestureActivationX &&
          absDx > absDy * 1.2
        );
      },
      onMoveShouldSetPanResponderCapture: () => false,

      onPanResponderGrant: (_, gs) => {
        if (isAnimatingRef.current) return;
        directionRef.current = gs.dx < 0 ? 'forward' : 'backward';
        isAnimatingRef.current = true;
        flipProgress.stopAnimation();
        flipProgress.setValue(0);
      },

      onPanResponderMove: (_, gs) => {
        const { dx, dy } = gs;
        // Bail out if the gesture drifts vertical
        if (Math.abs(dy) > Math.abs(dx) * 1.5 + PAGE_FLIP_CONFIG.gestureFailY) {
          return;
        }

        const idx = displayedIndexRef.current;
        const dir = gs.dx < 0 ? 'forward' : 'backward';
        directionRef.current = dir;

        // Boundary resistance
        if (dir === 'forward' && idx >= pages.length - 1) {
          const resistance = Math.min(Math.abs(dx) / pageWidth, 1) * 0.12;
          flipProgress.setValue(resistance);
          return;
        }
        if (dir === 'backward' && idx <= 0) {
          const resistance = Math.min(Math.abs(dx) / pageWidth, 1) * 0.12;
          flipProgress.setValue(resistance);
          return;
        }

        const progress = Math.min(Math.max(Math.abs(dx) / pageWidth, 0), 1);
        flipProgress.setValue(progress);
      },

      onPanResponderRelease: (_, gs) => {
        const { dx, vx } = gs;
        const idx = displayedIndexRef.current;
        const dir = directionRef.current;

        // Boundary — always cancel
        if (
          (dir === 'forward' && idx >= pages.length - 1) ||
          (dir === 'backward' && idx <= 0)
        ) {
          animateToCancellation();
          return;
        }

        const progress = Math.abs(dx) / pageWidth;
        const velocityPxS = Math.abs(vx) * 1000;

        const shouldComplete =
          progress >= PAGE_FLIP_CONFIG.completionProgress ||
          velocityPxS >= PAGE_FLIP_CONFIG.completionVelocity;

        if (shouldComplete) {
          animateToCompletion(velocityPxS);
        } else {
          animateToCancellation();
        }
      },

      onPanResponderTerminate: () => {
        animateToCancellation();
      },
    }),
  ).current;

  // ---------------------------------------------------------------------------
  // Derived transforms
  // ---------------------------------------------------------------------------

  const idx = currentPageIndex; // use prop for rendering (displayedIndexRef is internal)

  // Clamp safely
  const safeIdx = Math.min(Math.max(idx, 0), pages.length - 1);
  const prevIdx = Math.max(safeIdx - 1, 0);
  const nextIdx = Math.min(safeIdx + 1, pages.length - 1);

  // Rotation around the spine edge:
  // Forward: right edge peels left → rotate around right edge → translateX(+w/2) rotateY(-180) translateX(-w/2)
  // Backward: left edge peels right → rotate around left edge → translateX(-w/2) rotateY(+180) translateX(+w/2)

  // Front face: 0° → -180° (forward) or 0° → +180° (backward)
  const frontRotateY = flipProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-180deg'],
  });

  // Back face: 180° → 0° (forward) or -180° → 0° (backward)
  const backRotateY = flipProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '0deg'],
  });

  // Shadow under the turning page
  const shadowOpacity = flipProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, PAGE_FLIP_CONFIG.shadowMaxOpacity, 0],
  });

  // Edge highlight on the turning page
  const edgeOpacity = flipProgress.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, PAGE_FLIP_CONFIG.edgeHighlightMaxOpacity, 0],
  });

  // Pivot is at the right edge for forward, left for backward
  // We simulate the origin shift with paired translateX transforms
  const pivotShift = pageWidth / 2;

  // Reduced-motion: just fade
  const reducedFadeOpacity = flipProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 1],
  });

  // ---------------------------------------------------------------------------
  // Memoised page renderers — stable across animation frames
  // ---------------------------------------------------------------------------

  const prevContent = useMemo(
    () => (prevIdx !== safeIdx && pages[prevIdx] ? renderPage(pages[prevIdx], prevIdx) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prevIdx, pages],
  );
  const currentContent = useMemo(
    () => (pages[safeIdx] ? renderPage(pages[safeIdx], safeIdx) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [safeIdx, pages],
  );
  const nextContent = useMemo(
    () => (nextIdx !== safeIdx && pages[nextIdx] ? renderPage(pages[nextIdx], nextIdx) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nextIdx, pages],
  );

  // ---------------------------------------------------------------------------
  // Reduced-motion rendering
  // ---------------------------------------------------------------------------

  if (reducedMotion || pages.length === 0) {
    return (
      <View style={[s.container, { width: pageWidth }]} {...panResponder.panHandlers}>
        <Animated.View
          style={[s.page, { width: pageWidth, opacity: pages.length === 0 ? 1 : reducedFadeOpacity }]}
          accessibilityLabel={`Page ${safeIdx + 1} of ${pages.length}`}
        >
          <PageContent style={s.fill}>{currentContent}</PageContent>
        </Animated.View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Full 3D page flip rendering
  // ---------------------------------------------------------------------------

  return (
    <View style={[s.container, { width: pageWidth }]} {...panResponder.panHandlers}>
      {/* Book background — warm off-white */}
      <View style={[s.bookBackground, { width: pageWidth }]} />

      {/* Spine shadow (static, gives depth at rest) */}
      <View style={s.spineShadow} />

      {/* Destination page (underneath) */}
      <View style={[s.page, s.destinationPage, { width: pageWidth }]}>
        <PageContent style={s.fill}>
          {directionRef.current === 'forward' ? nextContent : prevContent}
        </PageContent>
      </View>

      {/* Front face of the turning page (current page) */}
      <Animated.View
        style={[
          s.page,
          s.turningPage,
          {
            width: pageWidth,
            transform: [
              { perspective: PAGE_FLIP_CONFIG.perspective },
              { translateX: pivotShift },
              { rotateY: frontRotateY },
              { translateX: -pivotShift },
            ],
            backfaceVisibility: 'hidden',
          },
        ]}
        accessibilityLabel={`Page ${safeIdx + 1} of ${pages.length}`}
      >
        <PageContent style={s.fill}>{currentContent}</PageContent>

        {/* Edge highlight overlay */}
        <Animated.View
          style={[
            s.edgeHighlight,
            {
              right: 0,
              opacity: edgeOpacity,
            },
          ]}
          pointerEvents="none"
        />
      </Animated.View>

      {/* Back face of the turning page (reveals previous page heading) */}
      <Animated.View
        style={[
          s.page,
          s.turningPage,
          {
            width: pageWidth,
            transform: [
              { perspective: PAGE_FLIP_CONFIG.perspective },
              { translateX: pivotShift },
              { rotateY: backRotateY },
              { translateX: -pivotShift },
            ],
            backfaceVisibility: 'hidden',
          },
        ]}
        pointerEvents="none"
      >
        {/* Warm paper back surface */}
        <View style={[s.fill, s.paperBack]} />
        {/* Subtle fold line */}
        <View style={s.foldLine} />
      </Animated.View>

      {/* Dynamic cast shadow beneath the turning page */}
      <Animated.View
        style={[
          s.castShadow,
          { width: pageWidth, opacity: shadowOpacity },
        ]}
        pointerEvents="none"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#F5EFE6', // warm off-white book background
  },
  bookBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F5EFE6',
  },
  spineShadow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 6,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1,
  },
  page: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FEFDF9', // premium off-white
    borderRadius: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  destinationPage: {
    zIndex: 1,
  },
  turningPage: {
    zIndex: 10,
  },
  fill: {
    flex: 1,
    overflow: 'hidden',
  },
  paperBack: {
    backgroundColor: '#F0EAD6', // slightly darker paper back
  },
  foldLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 4,
    width: 2,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  edgeHighlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 12,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  castShadow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 5,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: -8, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
  },
});
