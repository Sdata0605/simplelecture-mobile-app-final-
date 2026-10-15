import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MathText from '../MathText';
import type { V5TimelineSection } from '../../services/v5PlayerService';

/**
 * V5 key points — React Native port of the web app's `v5/V5KeyPoints.tsx`.
 *
 * Points for the active section are revealed progressively as the video plays
 * (`visibleCount` grows), with the newest one highlighted. Rendered through the
 * shared MathText component so LaTeX in a key point typesets — MathText only
 * spins up a KaTeX WebView when the string actually contains LaTeX, so plain
 * prose points stay cheap native <Text>.
 */

interface V5KeyPointsOverlayProps {
  active: V5TimelineSection | null;
  visibleCount: number;
  isHidden: boolean;
  onToggle: () => void;
  /** Landscape/fullscreen matches web's 38% width; portrait widens for legibility. */
  isFullscreen: boolean;
  /**
   * Left safe-area inset. In fullscreen the stage runs edge to edge (Android
   * edge-to-edge is on by default in SDK 54), so without this the panel sits
   * under the landscape display cutout.
   */
  leftInset?: number;
}

const ACCENT = '#60a5fa';
const INK = '#eaf8f4';

function PulseDot() {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.pulse, { opacity }]} />;
}

export default function V5KeyPointsOverlay({
  active,
  visibleCount,
  isHidden,
  onToggle,
  isFullscreen,
  leftInset = 0,
}: V5KeyPointsOverlayProps) {
  // Same guard as web: nothing to show until the section has revealed a point.
  if (!active || active.keyPoints.length === 0 || visibleCount === 0) return null;

  const wrapStyle = [styles.wrap, { paddingLeft: 14 + leftInset }];

  if (isHidden) {
    return (
      <View style={wrapStyle} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.showButton}
          onPress={onToggle}
          accessibilityLabel="Show key points"
          data-testid="button-v5-show-keypoints"
        >
          <Ionicons name="eye-outline" size={14} color="#dbeafe" />
          <Text style={styles.showButtonText}>Key points</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const points = active.keyPoints.slice(0, visibleCount);

  return (
    <View style={wrapStyle} pointerEvents="box-none">
      <View style={[styles.panel, { width: isFullscreen ? '38%' : '54%' }]}>
        <View style={styles.eyebrow}>
          <View style={styles.eyebrowLabel}>
            <PulseDot />
            <Text style={styles.eyebrowText}>KEY POINTS</Text>
          </View>
          <TouchableOpacity
            style={styles.hideButton}
            onPress={onToggle}
            accessibilityLabel="Hide key points"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            data-testid="button-v5-hide-keypoints"
          >
            <Ionicons name="eye-off-outline" size={13} color="#dbeafe" />
            <Text style={styles.hideButtonText}>Hide</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {points.map((point, index) => {
            const isNewest = index === visibleCount - 1;
            return (
              <View
                key={`${active.section.section_id}-${index}`}
                style={[styles.point, isNewest && styles.pointActive]}
              >
                <Text style={[styles.pointNumber, isNewest && styles.pointNumberActive]}>
                  {String(index + 1).padStart(2, '0')}
                </Text>
                <View style={styles.pointBody}>
                  <MathText
                    content={point}
                    color={INK}
                    textStyle={{ fontSize: 12.5, lineHeight: 18 }}
                  />
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-bleed layer that vertically centres the panel, matching web's
  // `top: 50%; transform: translateY(-50%)`. box-none so taps fall through to
  // the video everywhere except on the panel itself.
  wrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'flex-start',
    zIndex: 3,
  },
  panel: {
    maxHeight: '74%',
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderLeftWidth: 3,
    borderLeftColor: ACCENT,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    // Web uses backdrop-filter blur over rgba(4,18,15,.2); RN has no backdrop
    // blur without a BlurView, so this is opaque enough to stay readable on a
    // bright video frame.
    backgroundColor: 'rgba(4, 18, 15, 0.62)',
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 9,
    marginBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(157, 201, 255, 0.18)',
  },
  eyebrowLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pulse: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: ACCENT,
  },
  eyebrowText: {
    color: '#9dc9ff',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  hideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(157, 201, 255, 0.25)',
    backgroundColor: 'rgba(10, 20, 30, 0.84)',
  },
  hideButtonText: {
    color: '#dbeafe',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  list: {
    flexGrow: 0,
  },
  point: {
    flexDirection: 'row',
    gap: 9,
    paddingVertical: 6,
    paddingHorizontal: 7,
    marginBottom: 5,
    borderRadius: 8,
  },
  pointActive: {
    backgroundColor: 'rgba(96, 165, 250, 0.14)',
  },
  pointNumber: {
    color: 'rgba(157, 201, 255, 0.55)',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: 0.5,
  },
  pointNumberActive: {
    color: ACCENT,
  },
  pointBody: {
    flex: 1,
  },
  showButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(157, 201, 255, 0.25)',
    backgroundColor: 'rgba(10, 20, 30, 0.84)',
  },
  showButtonText: {
    color: '#dbeafe',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
