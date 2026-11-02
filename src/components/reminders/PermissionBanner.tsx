// Banner shown under the Reminders tabs (spec E.7). Max two banners at once, chosen by the screen.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '../../constants/theme';
import { TINT } from './palette';

export type PermissionBannerVariant = 'notifications-off' | 'exact-alarm' | 'queued' | 'offline' | 'sync-error';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface VariantStyle {
  icon: IconName;
  bg: string;
  fg: string;
  text: string;
  actionLabel?: string;
}

const VARIANTS: Record<PermissionBannerVariant, VariantStyle> = {
  'notifications-off': {
    icon: 'notifications-off-outline',
    bg: TINT.redBg,
    fg: TINT.redText,
    text: "Notifications are off, so reminders can't ring.",
    actionLabel: 'Turn on',
  },
  'exact-alarm': {
    icon: 'alarm-outline',
    bg: TINT.amberBg,
    fg: TINT.amberText,
    text: 'Reminders may ring a few minutes late. Allow Alarms & reminders.',
    actionLabel: 'Allow',
  },
  queued: {
    icon: 'time-outline',
    bg: colors.gray100,
    fg: colors.textSecondary,
    text: 'Some far-off reminders will be set the next time you open the app.',
  },
  offline: {
    icon: 'cloud-offline-outline',
    bg: colors.gray100,
    fg: colors.textSecondary,
    text: "You're offline. Reminders still ring; changes will sync later.",
    actionLabel: 'Retry',
  },
  'sync-error': {
    icon: 'alert-circle-outline',
    bg: TINT.amberBg,
    fg: TINT.amberText,
    text: "Couldn't sync reminders. Saved on this phone.",
    actionLabel: 'Retry',
  },
};

interface Props {
  variant: PermissionBannerVariant;
  onAction?: () => void;
  onDismiss?: () => void;
}

export function PermissionBanner({ variant, onAction, onDismiss }: Props) {
  const style = VARIANTS[variant];

  return (
    <View
      accessibilityRole="alert"
      style={[styles.container, { backgroundColor: style.bg }]}
    >
      <Ionicons name={style.icon} size={20} color={style.fg} />
      <Text style={[styles.text, { color: colors.text }]}>{style.text}</Text>

      {style.actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={style.actionLabel}
          onPress={onAction}
          hitSlop={8}
          style={styles.actionButton}
        >
          <Text style={[styles.actionText, { color: style.fg }]}>{style.actionLabel}</Text>
        </Pressable>
      ) : null}

      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          hitSlop={8}
          style={styles.dismissButton}
        >
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  text: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
  },
  actionButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  actionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
  },
  dismissButton: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
