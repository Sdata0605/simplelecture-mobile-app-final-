import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  PixelRatio,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';
import { TINT } from '../reminders/palette';
import { KeyboardShiftView } from '../keyboard/keyboardStick';
import TimeField from '../time/TimeField';
import { DurationField } from '../time/DurationField';
import ReminderChannelPicker from './ReminderChannelPicker';
import { fetchDaySessions } from '../../hooks/useStudyTimetable';
import type { StudyTimetableSession } from '../../hooks/useStudyTimetable';
import type { ReminderChoice } from '../../types/reminder';
import { localDateKey } from '../../utils/calendar';
import {
  dayBounds,
  formatClock12,
  formatDayLabel,
  hhmmToMinutes,
  localMinutesOf,
  minutesToHHMM,
  saveErrorMessage,
  saveSessionEdit,
  validateSessionEdit,
  type OverlapCandidate,
  type SaveSessionEditResult,
  type SessionEditDraft,
} from '../../services/sessionEdit';

const DAY_LOAD_WARNING = 'Could not check other plans. Check your internet.';

export interface SessionEditSheetProps {
  visible: boolean;
  session: StudyTimetableSession | null;
  /** Fallback for the overlap check when the day cannot be fetched (offline). */
  daySessions?: OverlapCandidate[];
  /** Self tests on the same day. */
  dayTests?: OverlapCandidate[];
  /** Structurally matches ReminderSupport from useTimetableReminderSupport. Only `channels` is read here. */
  reminderSupport: { channels: ReminderChoice[] };
  planDefault: ReminderChoice | null;
  onClose: () => void;
  onSaved: (result: SaveSessionEditResult) => void;
}

/** Edit title, start time, duration, reminder channel and notes for one session. Start and length are locked unless the session is pending. */
export function SessionEditSheet({
  visible,
  session,
  daySessions,
  dayTests,
  reminderSupport,
  planDefault,
  onClose,
  onSaved,
}: SessionEditSheetProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Stack Start and Duration vertically on narrow phones or when the user has a large font.
  const stacked = width < 360 || PixelRatio.getFontScale() > 1.15;
  const sessionId = session?.id ?? null;

  const [draft, setDraft] = useState<SessionEditDraft | null>(null);
  const [dayRows, setDayRows] = useState<OverlapCandidate[]>([]);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset the draft only when the sheet opens or another session is shown,
  // so a parent re-render never wipes what the student is typing.
  useEffect(() => {
    if (!visible || !session) return;
    setDraft({
      title: session.title,
      startMin: localMinutesOf(session.scheduled_at),
      durationMin: session.duration_minutes,
      notes: session.notes ?? '',
      channel: session.reminder_channel ?? null,
    });
    setSaveError(null);
    setLoadWarning(null);
    setSaving(false);
    setDayRows(daySessions ?? []);

    let active = true;
    const { fromIso, toIso } = dayBounds(localDateKey(session.scheduled_at));
    fetchDaySessions(fromIso, toIso)
      .then(rows => {
        if (active) setDayRows(rows);
      })
      .catch(() => {
        if (active) {
          setDayRows(daySessions ?? []);
          setLoadWarning(DAY_LOAD_WARNING);
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, sessionId]);

  const validation = useMemo(() => {
    if (!session || !draft) return null;
    return validateSessionEdit({
      session,
      draft,
      daySessions: dayRows,
      dayTests: dayTests ?? [],
      now: new Date(),
    });
  }, [session, draft, dayRows, dayTests]);

  if (!session || !draft || !validation) return null;

  const editable = session.status === 'pending';
  const endMin = draft.startMin + draft.durationMin;
  const canSave = validation.ok && !saving;
  const reminderMoves =
    validation.startChanged && draft.channel !== 'none' && !validation.errors.start;

  const update = (patch: Partial<SessionEditDraft>) =>
    setDraft(d => (d ? { ...d, ...patch } : d));

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveSessionEdit(session, draft);
      onSaved(result);
    } catch (e) {
      setSaveError(saveErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardShiftView style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.sm }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.heading} accessibilityRole="header">Edit session</Text>
              <Text style={styles.subheading}>{formatDayLabel(localDateKey(session.scheduled_at))}</Text>
            </View>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onClose}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Close edit session"
            >
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={draft.title}
              onChangeText={t => update({ title: t })}
              maxLength={200}
              editable={!saving}
              accessibilityLabel="Session title"
            />
            {validation.errors.title ? (
              <Text style={styles.errorText}>{validation.errors.title}</Text>
            ) : null}

            {editable ? (
              <View style={stacked ? styles.stack : styles.row}>
                <View style={styles.cell}>
                  <TimeField
                    label="Start time"
                    sheetTitle="Start time"
                    value={minutesToHHMM(draft.startMin)}
                    onChange={v => {
                      const m = hhmmToMinutes(v);
                      if (m !== null) update({ startMin: m });
                    }}
                    disabled={saving}
                    testID="session-edit-start"
                  />
                </View>
                <View style={styles.cell}>
                  <Text style={styles.label}>Duration</Text>
                  <DurationField
                    value={draft.durationMin}
                    onChange={n => update({ durationMin: n })}
                    min={5}
                    max={240}
                    disabled={saving}
                    testID="session-edit-duration"
                  />
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.label}>Start time and duration</Text>
                <Text style={styles.readOnly}>
                  {`${formatClock12(localMinutesOf(session.scheduled_at))} · ${session.duration_minutes} min`}
                </Text>
                <Text style={styles.hint}>Mark as to do to change the time</Text>
              </View>
            )}

            {editable && !validation.errors.start ? (
              <Text style={styles.endsText}>
                {endMin <= 24 * 60 ? `Ends at ${formatClock12(endMin)}` : 'Ends after midnight'}
              </Text>
            ) : null}
            {validation.errors.start ? (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {validation.errors.start}
              </Text>
            ) : null}
            {validation.errors.duration ? (
              <Text style={styles.errorText}>{validation.errors.duration}</Text>
            ) : null}
            {reminderMoves ? (
              <Text style={styles.hint}>{`Reminder moves to ${formatClock12(draft.startMin)} when you save.`}</Text>
            ) : null}
            {loadWarning ? <Text style={styles.warningText}>{loadWarning}</Text> : null}

            {reminderSupport.channels.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.label}>Remind me by</Text>
                <ReminderChannelPicker
                  layout="list"
                  value={draft.channel}
                  onChange={c => update({ channel: c })}
                  recommended={planDefault ?? undefined}
                  allowed={reminderSupport.channels}
                  disabled={saving}
                />
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.label}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={draft.notes}
                onChangeText={t => update({ notes: t })}
                multiline
                maxLength={500}
                editable={!saving}
                accessibilityLabel="Session notes"
              />
            </View>

          </ScrollView>

          {saveError ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {saveError}
            </Text>
          ) : null}

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onClose}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, !canSave && styles.disabled]}
              onPress={onSave}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityLabel="Save session"
              accessibilityState={{ disabled: !canSave, busy: saving }}
            >
              <Text style={styles.primaryText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardShiftView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: TINT.overlay,
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  heading: {
    fontFamily: fontFamily.headingSemiBold,
    fontSize: fontSize.xl,
    lineHeight: 24,
    color: colors.text,
  },
  subheading: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xxl,
    color: colors.textSecondary,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.text,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  stack: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  cell: {
    flex: 1,
  },
  readOnly: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  hint: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  endsText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: TINT.redText,
    marginTop: spacing.xs,
  },
  warningText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: TINT.amberText,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  primaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.white,
  },
  disabled: {
    opacity: 0.4,
  },
});

export default SessionEditSheet;
