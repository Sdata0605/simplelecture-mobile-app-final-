import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontFamily } from '../../constants/theme';
import { getScoreColor } from '../../utils/resultHelpers';

interface ScoreRingProps {
  percent: number | null | undefined;
  size?: number;
  strokeWidth?: number;
  /** Ring colour override; defaults to the score colour. */
  color?: string;
  trackColor?: string;
  textColor?: string;
}

/**
 * Progress ring without react-native-svg. The track is a bordered circle; the
 * progress is drawn as small round dots placed along the ring's centre line,
 * spaced closely enough to read as one continuous arc.
 */
export default function ScoreRing({
  percent,
  size = 88,
  strokeWidth = 6,
  color,
  trackColor = colors.gray100,
  textColor,
}: ScoreRingProps) {
  const hasValue = percent !== null && percent !== undefined && !Number.isNaN(percent);
  const clamped = hasValue ? Math.max(0, Math.min(100, percent as number)) : 0;
  const ringColor = color ?? getScoreColor(hasValue ? clamped : null);
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * 2 * radius;
  const dotCount = Math.max(12, Math.round(circumference / 3.4));
  const filledDots = Math.round((clamped / 100) * dotCount);
  const center = size / 2;
  const fontSize = Math.round(size * 0.27);

  const dots = [];
  for (let i = 0; i < dotCount && hasValue; i++) {
    const angle = (i / dotCount) * Math.PI * 2 - Math.PI / 2;
    const x = center + radius * Math.cos(angle) - strokeWidth / 2;
    const y = center + radius * Math.sin(angle) - strokeWidth / 2;
    dots.push(
      <View
        key={i}
        style={[
          styles.dot,
          {
            width: strokeWidth,
            height: strokeWidth,
            borderRadius: strokeWidth / 2,
            left: x,
            top: y,
            backgroundColor: i < filledDots ? ringColor : 'transparent',
          },
        ]}
      />,
    );
  }

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: trackColor,
        }}
      />
      {dots}
      <Text
        style={[
          styles.value,
          { fontSize, color: textColor ?? (hasValue ? colors.text : colors.textMuted) },
        ]}
        numberOfLines={1}
      >
        {hasValue ? `${Math.round(clamped)}%` : '--'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
  },
  value: {
    fontFamily: fontFamily.bold,
  },
});
