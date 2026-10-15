import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, fontSize } from '../../constants/theme';

interface FreePreviewCardProps {
  courseId: string;
  courseSlug: string;
  chapterCount: number;
  onPress: () => void;
}

export default function FreePreviewCard({ chapterCount, onPress }: FreePreviewCardProps) {
  if (chapterCount <= 0) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={styles.wrapper}
      data-testid="button-free-preview-card"
    >
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.left}>
          <Ionicons name="play-circle" size={36} color={colors.white} />
          <View style={styles.textGroup}>
            <Text style={styles.label}>FREE PREVIEW AVAILABLE</Text>
            <Text style={styles.title}>
              Try {chapterCount} chapter{chapterCount !== 1 ? 's' : ''} free
            </Text>
            <Text style={styles.subtitle}>
              Experience real course content before you buy
            </Text>
          </View>
        </View>
        <View style={styles.right}>
          <Text style={styles.cta}>Preview now →</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(43,189,110,0.3)',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  textGroup: {
    flex: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 16,
  },
  right: {
    paddingLeft: spacing.sm,
  },
  cta: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.white,
    textAlign: 'center',
  },
});
