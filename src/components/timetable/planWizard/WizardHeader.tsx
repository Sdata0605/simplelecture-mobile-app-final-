// Green header + progress for the full-screen plan creator (plan D.2).

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize, fontFamily, spacing } from '../../../constants/theme';
import { TINT } from '../../reminders/palette';

export default function WizardHeader({
  title, subtitle, stepIndex, total, stepLabel, onClose,
}: {
  title: string;
  subtitle: string;
  stepIndex: number;
  total: number;
  stepLabel: string;
  onClose(): void;
}) {
  const insets = useSafeAreaInsets();
  const pct = total > 0 ? Math.min(1, (stepIndex + 1) / total) : 0;
  return (
    <View>
      <LinearGradient
        colors={[colors.primary, TINT.headerGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Close plan creator"
        >
          <Ionicons name="close" size={24} color={colors.white} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
        <View style={styles.closeBtn} />
      </LinearGradient>

      <View style={styles.progressWrap}>
        <View
          style={styles.track}
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: total, now: stepIndex + 1 }}
          accessibilityLabel={`Step ${stepIndex + 1} of ${total}`}
        >
          <View style={[styles.fill, { width: `${pct * 100}%` }]} />
        </View>
        <Text style={styles.stepLabel} accessibilityLiveRegion="polite">
          {`Step ${stepIndex + 1} of ${total} · ${stepLabel}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingBottom: spacing.md,
  },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
  title: { fontSize: fontSize.xl, fontFamily: fontFamily.heading, color: colors.white },
  subtitle: { fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  progressWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: 6, backgroundColor: colors.white },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.gray100, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  stepLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.medium },
});
