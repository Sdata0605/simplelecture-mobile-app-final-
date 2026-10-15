import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../constants/theme';

/**
 * Reusable card used on the Course Notebooks and Subject Notebooks screens.
 * Renders a thumbnail, title, subtitle, an optional progress bar, a set of
 * small meta pills and a call-to-action row.
 */

interface MetaPill {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
}

interface NotebookCardProps {
  thumbnailUrl?: string | null;
  title: string;
  subtitle?: string | null;
  progress?: number | null;
  metaPills?: MetaPill[];
  statusLabel?: string;
  actionLabel: string;
  onPress: () => void;
  testID?: string;
}

export default function NotebookCard({
  thumbnailUrl,
  title,
  subtitle,
  progress,
  metaPills,
  statusLabel,
  actionLabel,
  onPress,
  testID,
}: NotebookCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onPress}
      testID={testID}
    >
      <View style={styles.topRow}>
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="book" size={28} color={colors.primary} />
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
          )}
          {!!statusLabel && (
            <View style={styles.statusRow}>
              <Ionicons name="cloud-done-outline" size={13} color={colors.success} />
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
          )}
        </View>
      </View>

      {typeof progress === 'number' && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, progress))}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{Math.round(progress)}%</Text>
        </View>
      )}

      {!!metaPills?.length && (
        <View style={styles.pillRow}>
          {metaPills.map((pill, i) => (
            <View key={i} style={styles.pill}>
              {pill.icon && <Ionicons name={pill.icon} size={12} color={colors.textSecondary} />}
              <Text style={styles.pillText}>{pill.label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.ctaRow}>
        <Text style={styles.ctaText}>{actionLabel}</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray100,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  statusText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.success,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gray200,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  progressLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    width: 34,
    textAlign: 'right',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gray100,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  pillText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
  },
  ctaText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.primary,
  },
});
