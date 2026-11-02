// Empty and compact empty states for the Reminders screen. Spec: _scratch/reminders-v2-plan.md E.6.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../constants/theme';
import { TINT } from './palette';

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?(): void;
  compact?: boolean;
}

export default function EmptyState({ icon, title, body, actionLabel, onAction, compact }: EmptyStateProps) {
  if (compact) {
    return (
      <View style={styles.compact} accessibilityRole="text">
        <Text style={styles.compactText} maxFontSizeMultiplier={1.6}>{title}</Text>
        {actionLabel && onAction ? (
          <TouchableOpacity
            onPress={onAction}
            style={styles.compactButton}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            hitSlop={8}
          >
            <Text style={styles.compactButtonText} maxFontSizeMultiplier={1.6}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root} accessibilityRole="text">
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={36} color={colors.primary} />
      </View>
      <Text style={styles.title} maxFontSizeMultiplier={1.6}>{title}</Text>
      {body ? <Text style={styles.body} maxFontSizeMultiplier={1.6}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          style={styles.primaryButton}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText} maxFontSizeMultiplier={1.6}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: TINT.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fontFamily.headingSemiBold,
    fontSize: fontSize.xl,
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  primaryButton: {
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  primaryButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: colors.white,
  },
  compact: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  compactText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  compactButton: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  compactButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.primary,
  },
});
