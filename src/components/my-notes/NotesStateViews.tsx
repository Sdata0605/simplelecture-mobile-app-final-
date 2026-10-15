import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../constants/theme';
import { Skeleton } from '../SkeletonLoader';

/**
 * Shared visual states for the My Notes screens: loading skeletons, empty
 * placeholders and error views with retry. Kept generic so all three screens
 * (courses / subjects / chapter) can reuse them.
 */

export function NotesCardSkeleton() {
  return (
    <View style={styles.skelCard} testID="skeleton-notes-card">
      <Skeleton width={64} height={64} borderRadius={borderRadius.md} />
      <View style={styles.skelBody}>
        <Skeleton width={'70%'} height={16} style={styles.skelLine} />
        <Skeleton width={'90%'} height={12} style={styles.skelLine} />
        <Skeleton width={'40%'} height={12} />
      </View>
    </View>
  );
}

export function NotesListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View testID="skeleton-notes-list">
      {Array.from({ length: count }).map((_, i) => (
        <NotesCardSkeleton key={i} />
      ))}
    </View>
  );
}

export function NotesEmptyState({
  icon = 'document-text-outline',
  title,
  message,
  actionLabel,
  onAction,
  testID = 'empty-notes',
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.centerWrap} testID={testID}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={40} color={colors.primary} />
      </View>
      <Text style={styles.centerTitle}>{title}</Text>
      <Text style={styles.centerMessage}>{message}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.primaryBtn} onPress={onAction} testID={`${testID}-action`}>
          <Text style={styles.primaryBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function NotesErrorState({
  message,
  onRetry,
  testID = 'error-notes',
}: {
  message?: string;
  onRetry?: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.centerWrap} testID={testID}>
      <View style={[styles.iconCircle, styles.iconCircleError]}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.error} />
      </View>
      <Text style={styles.centerTitle}>Something went wrong</Text>
      <Text style={styles.centerMessage}>
        {message || 'We could not load your notes. Please check your connection and try again.'}
      </Text>
      {onRetry && (
        <TouchableOpacity style={styles.outlineBtn} onPress={onRetry} testID={`${testID}-retry`}>
          <Ionicons name="refresh" size={16} color={colors.primary} />
          <Text style={styles.outlineBtnText}>Try again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  skelCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skelBody: {
    flex: 1,
    justifyContent: 'center',
  },
  skelLine: {
    marginBottom: 8,
  },
  centerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#EAF7F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconCircleError: {
    backgroundColor: '#FEF2F2',
  },
  centerTitle: {
    fontFamily: fontFamily.headingSemiBold,
    fontSize: fontSize.xl,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  centerMessage: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
  },
  primaryBtnText: {
    color: colors.white,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
  },
  outlineBtnText: {
    color: colors.primary,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
  },
});
