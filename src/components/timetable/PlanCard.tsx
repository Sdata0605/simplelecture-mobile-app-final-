// Study plan card in the "My plans and tests" strip. Title shown once, finish date, progress, reminder chip.
// Settings and delete live behind the "more" button so nothing is deleted by accident.
import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, Modal, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';
import { cardBase } from '../../constants/surfaces';
import { TINT } from '../reminders/palette';
import { channelChipStyle } from './DayAgendaList';
import type { StudyTimetablePlan } from '../../hooks/useStudyTimetable';
import type { PlanChannelSummary } from '../../services/timetableReminders';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

interface PlanCardProps {
  plan: StudyTimetablePlan;
  progress: { done: number; total: number };
  reminder: PlanChannelSummary | null;
  selected: boolean;
  remindersAvailable: boolean;
  onPress(): void;
  onOpenReminders(): void;
  onDelete(): void;
}

export default function PlanCard({
  plan, progress, reminder, selected, remindersAvailable, onPress, onOpenReminders, onDelete,
}: PlanCardProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(280, width * 0.78);
  const [menuOpen, setMenuOpen] = useState(false);

  const meta = plan.plan_metadata ?? {};
  const isAI = plan.mode === 'auto';
  const title = meta.scopeLabel || (isAI ? 'AI Study Plan' : 'Study Plan');
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  const chip = reminder === 'mixed'
    ? { label: 'Mixed', fg: colors.textSecondary, bg: colors.gray100, icon: 'options-outline' }
    : channelChipStyle(reminder ?? 'notification'); // null = legacy default (notification), not off

  function pick(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <View
      style={[styles.card, { width: cardWidth }, selected && styles.cardSelected]}
    >
      <View style={styles.topRow}>
        <View style={[styles.modeBadge, isAI ? styles.modeAI : styles.modeManual]}>
          <Text style={[styles.modeText, isAI ? styles.modeTextAI : styles.modeTextManual]}>{isAI ? 'AI plan' : 'Manual'}</Text>
        </View>
        {selected && (
          <View style={styles.showingChip}>
            <Ionicons name="checkmark" size={12} color={colors.primaryDark} />
            <Text style={styles.showingText}>Showing</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${title}`}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.body, pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${title}. ${progress.done} of ${progress.total} sessions done. ${selected ? 'Showing on calendar' : 'Tap to show on calendar'}`}
      >
        <Text style={styles.title} numberOfLines={2}>{title}</Text>

        {!!meta.deadline && (
          <View style={styles.metaRow}>
            <Ionicons name="flag-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>Finish by {formatDate(meta.deadline)}</Text>
          </View>
        )}

        <View style={styles.progressRow}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {progress.total > 0 ? `${progress.done} of ${progress.total} done` : 'No sessions yet'}
          </Text>
        </View>

        <View style={[styles.reminderChip, { backgroundColor: chip.bg }]}>
          <Ionicons name={chip.icon as keyof typeof Ionicons.glyphMap} size={14} color={chip.fg} />
          <Text style={[styles.reminderText, { color: chip.fg }]}>{chip.label}</Text>
        </View>
      </Pressable>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu">
          <Pressable style={styles.menuSheet} onPress={() => {}}>
            <Text style={styles.menuTitle} numberOfLines={2}>{title}</Text>
            {remindersAvailable && (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => pick(onOpenReminders)}
                accessibilityRole="button"
                accessibilityLabel="Reminder settings for this plan"
              >
                <Ionicons name="notifications-outline" size={20} color={colors.text} />
                <Text style={styles.menuRowText}>Reminder settings</Text>
              </TouchableOpacity>
            )}
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => pick(onDelete)}
              accessibilityRole="button"
              accessibilityLabel="Delete this plan"
            >
              <Ionicons name="trash-outline" size={20} color={colors.error} />
              <Text style={[styles.menuRowText, { color: colors.error }]}>Delete plan</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => setMenuOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.menuRowText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...cardBase,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardSelected: { borderWidth: 2, borderColor: colors.primary },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  modeBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  modeAI: { backgroundColor: TINT.greenSoft, borderWidth: 1, borderColor: colors.primaryLight },
  modeManual: { backgroundColor: colors.gray100 },
  modeText: { fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  modeTextAI: { color: colors.primaryDark },
  modeTextManual: { color: colors.textSecondary },
  showingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: TINT.greenSoft, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  showingText: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.primaryDark },
  moreBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.sm },

  body: { gap: 6 },
  title: { fontSize: fontSize.xl, lineHeight: 24, fontFamily: fontFamily.headingSemiBold, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fontFamily.medium, color: colors.textSecondary },
  progressRow: { gap: 6, marginTop: 2 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.gray100, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  progressText: { fontSize: 13, lineHeight: 18, fontFamily: fontFamily.medium, color: colors.textSecondary },
  reminderChip: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 28, paddingHorizontal: spacing.sm, borderRadius: borderRadius.full, marginTop: 2,
  },
  reminderText: { fontSize: 13, fontFamily: fontFamily.medium },

  menuOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: TINT.overlay },
  menuSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl,
  },
  menuTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.xs },
  menuRow: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  menuRowText: { fontSize: fontSize.lg, fontFamily: fontFamily.medium, color: colors.text },
  menuDivider: { height: 1, backgroundColor: colors.border },
});
