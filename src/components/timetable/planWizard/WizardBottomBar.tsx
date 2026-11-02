// Fixed Back / Next bar for the plan creator (plan D.1). Rendered outside the
// step ScrollView so it never scrolls away. Bottom padding respects the safe area.

import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize, fontFamily, borderRadius, spacing } from '../../../constants/theme';

export default function WizardBottomBar({
  showBack, nextLabel, nextEnabled, reason, busy, onBack, onNext,
}: {
  showBack: boolean;
  nextLabel: string;
  nextEnabled: boolean;
  reason?: string | null;
  busy?: boolean;
  onBack(): void;
  onNext(): void;
}) {
  const insets = useSafeAreaInsets();
  const disabled = !nextEnabled || !!busy;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) + 12 }]}>
      {!nextEnabled && reason ? (
        <View style={styles.reasonRow} accessibilityLiveRegion="polite">
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.reasonText}>{reason}</Text>
        </View>
      ) : null}
      <View style={styles.row}>
        {showBack ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onBack}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityLabel="Back to previous step"
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.nextBtn, disabled && styles.nextBtnDisabled]}
          onPress={onNext}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
          accessibilityState={{ disabled, busy: !!busy }}
          accessibilityHint={!nextEnabled && reason ? reason : undefined}
        >
          {busy
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Text style={styles.nextText}>{nextLabel}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reasonText: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.regular },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2,
    height: 52, minWidth: 104, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    backgroundColor: colors.white,
  },
  backText: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.text },
  nextBtn: {
    flex: 1, height: 52, borderRadius: borderRadius.md,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  nextBtnDisabled: { backgroundColor: colors.gray300 },
  nextText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.white },
});
