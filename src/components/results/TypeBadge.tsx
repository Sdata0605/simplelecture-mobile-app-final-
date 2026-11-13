import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, fontSize, borderRadius } from '../../constants/theme';
import { getCategoryMeta } from '../../utils/resultHelpers';

interface TypeBadgeProps {
  category: string | null | undefined;
  /** 'onDark' renders white text for use on the gradient hero. */
  tone?: 'default' | 'onDark';
}

export default function TypeBadge({ category, tone = 'default' }: TypeBadgeProps) {
  const meta = getCategoryMeta(category);
  const onDark = tone === 'onDark';
  const tint = onDark ? colors.white : meta.color;

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: onDark ? 'rgba(255,255,255,0.2)' : `${meta.color}1A` },
      ]}
      accessibilityLabel={meta.label}
    >
      <Ionicons name={meta.icon} size={12} color={tint} />
      <Text style={[styles.text, { color: tint }]}>{meta.label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  text: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    letterSpacing: 0.6,
  },
});
