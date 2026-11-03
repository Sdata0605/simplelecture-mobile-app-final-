// Bottom sheet opened from a day-list session: Done, Skip, Edit, Delete.
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';
import { TINT } from '../reminders/palette';
import type { StudyTimetableSession } from '../../hooks/useStudyTimetable';

const STATUS_LABEL: Record<StudyTimetableSession['status'], string> = {
  pending: 'To do', done: 'Done', skipped: 'Skipped',
};

function clock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

interface SessionActionsSheetProps {
  session: StudyTimetableSession | null;
  onClose(): void;
  onOpen?(): void;
  onDone(): void;
  onSkip(): void;
  onEdit(): void;
  onDelete(): void;
  busy: boolean;
}

export default function SessionActionsSheet({
  session, onClose, onOpen, onDone, onSkip, onEdit, onDelete, busy,
}: SessionActionsSheetProps) {
  const insets = useSafeAreaInsets();
  const isPending = session?.status === 'pending';

  return (
    <Modal visible={session !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 8) + spacing.md }]}>
          <View style={styles.handle} />
          {session && (
            <>
              <View style={styles.headerRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.title} numberOfLines={2}>{session.title}</Text>
                  <Text style={styles.meta}>
                    {clock(session.scheduled_at)} · {session.duration_minutes} min · {STATUS_LABEL[session.status]}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close actions"
                >
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {onOpen && (
                <TouchableOpacity
                  style={[styles.bigBtn, styles.outlineBtn, busy && styles.disabled]}
                  onPress={() => { onClose(); onOpen(); }}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Open lecture"
                >
                  <Ionicons name="play-circle-outline" size={20} color={colors.text} />
                  <Text style={styles.outlineBtnText}>Open lecture</Text>
                </TouchableOpacity>
              )}

              {isPending ? (
                <>
                  <TouchableOpacity
                    style={[styles.bigBtn, styles.primaryBtn, busy && styles.disabled]}
                    onPress={onDone}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Mark as done"
                  >
                    <Ionicons name="checkmark-circle-outline" size={20} color={colors.white} />
                    <Text style={styles.primaryBtnText}>Done</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.bigBtn, styles.outlineBtn, busy && styles.disabled]}
                    onPress={onSkip}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Skip this session"
                  >
                    <Ionicons name="play-skip-forward-outline" size={20} color={colors.text} />
                    <Text style={styles.outlineBtnText}>Skip</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={styles.hint}>
                  {session.status === 'done' ? 'Marked as done. Its time is locked.' : 'Skipped. Its time is locked.'}
                </Text>
              )}

              <TouchableOpacity
                style={[styles.bigBtn, styles.outlineBtn, busy && styles.disabled]}
                onPress={onEdit}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Edit session"
              >
                <Ionicons name="pencil-outline" size={20} color={colors.text} />
                <Text style={styles.outlineBtnText}>Edit</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={[styles.bigBtn, styles.deleteBtn, busy && styles.disabled]}
                onPress={onDelete}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Delete session"
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: TINT.overlay },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.xs,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xs },
  title: { fontSize: fontSize.xl, lineHeight: 24, fontFamily: fontFamily.headingSemiBold, color: colors.text },
  meta: { fontSize: fontSize.md, fontFamily: fontFamily.regular, color: colors.textSecondary },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -10, marginRight: -8 },
  hint: { fontSize: fontSize.md, fontFamily: fontFamily.regular, color: colors.textSecondary, paddingVertical: spacing.xs },

  bigBtn: {
    minHeight: 52, borderRadius: borderRadius.md, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md,
  },
  primaryBtn: { backgroundColor: colors.primary },
  primaryBtnText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.white },
  outlineBtn: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  outlineBtnText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  deleteBtn: { backgroundColor: TINT.redBg },
  deleteBtnText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.error },
  disabled: { opacity: 0.5 },
});
