import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardShiftView } from '../keyboard/keyboardStick';
import KindPicker from './KindPicker';
import RepeatPicker from './RepeatPicker';
import DateTimeFields, { formatDayLong, keyFromDate, timeKeyFromDate } from './DateTimeFields';
import VoiceSettings from './VoiceSettings';
import { KIND_STYLE, TINT } from './palette';
import { useReminderPermissions } from '../../hooks/useReminderPermissions';
import { saveReminder, getSnapshot, type SaveResult } from '../../services/reminders';
import {
  formatTime12, localDateTime, nextFire, parseTime, rowToMode, todayOnlyLabel, validateInput,
  type ValidationError,
} from '../../services/reminders/schedule';
import { spokenScript, detectScriptLanguage } from '../../services/reminders/spokenScript';
import {
  LIMITS, type Reminder, type ReminderInput, type ReminderKind, type ReminderMode,
  type VoiceLanguage, type VoiceName,
} from '../../types/reminder';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../constants/theme';

// Spec: _scratch/reminders-v2-plan.md E.4 (sheet), D.1 (validation), D.5 (voice), WP6 brief.
// All validation comes from validateInput; labels from todayOnlyLabel; script from spokenScript.

// ---------- Pure helpers (unit-tested) ----------

export interface FormState {
  kind: ReminderKind;
  text: string;
  mode: ReminderMode;
  date: string;   // 'YYYY-MM-DD' local
  time: string;   // 'HH:MM' local
  voice: VoiceName;
  language: VoiceLanguage;
}

function defaultTime(now: Date): string {
  // Next full hour, local. Keeps the default valid for "Once on a date" today.
  const d = new Date(now.getTime());
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return timeKeyFromDate(d);
}

/** Starting values for the sheet. Editing loads rowToMode(initial); new reminders use the preset or Call. */
export function buildInitialForm(
  now: Date,
  initial?: Reminder,
  preset?: { mode: ReminderMode; date?: string },
): FormState {
  if (initial) {
    const at = new Date(initial.scheduled_at);
    const validAt = !Number.isNaN(at.getTime());
    const timeKey = parseTime(initial.time_of_day)
      ? initial.time_of_day!.slice(0, 5)
      : validAt ? timeKeyFromDate(at) : defaultTime(now);
    return {
      kind: initial.kind,
      text: initial.message_text,
      mode: rowToMode(initial),
      date: validAt ? keyFromDate(at) : keyFromDate(now),
      time: timeKey,
      voice: initial.voice as VoiceName,
      language: initial.language,
    };
  }
  return {
    kind: 'call',
    text: '',
    mode: preset?.mode ?? 'once',
    date: preset?.date ?? keyFromDate(now),
    time: defaultTime(now),
    voice: 'shubh',
    language: 'en-IN',
  };
}

/** Counter colour for the text field: muted to 439, warning 440 to 479, error at 480. */
export function counterTone(length: number): 'muted' | 'warning' | 'error' {
  if (length >= LIMITS.textMax) return 'error';
  if (length >= LIMITS.textWarn) return 'warning';
  return 'muted';
}

/** Save button label. Today only switches to "Set for tomorrow, h:mm AM" once the time has passed. */
export function saveLabel(mode: ReminderMode, time: string, now: Date, saving: boolean): string {
  if (saving) return 'Saving...';
  const t = parseTime(time);
  if (mode === 'today_only' && t && todayOnlyLabel(time, now) === 'Tomorrow only') {
    return `Set for tomorrow, ${formatTime12(t.hour, t.minute)}`;
  }
  return 'Save';
}

/** Confirmation line under the date and time fields. */
export function buildSummary(mode: ReminderMode, date: string, time: string, now: Date): string {
  const t = parseTime(time);
  if (!t) return '';
  const timeText = formatTime12(t.hour, t.minute);
  if (mode === 'once') {
    const at = localDateTime(date, time);
    if (!at) return '';
    // Shows the normalised time when JS moved a non-existent DST time.
    return `Rings on ${formatDayLong(keyFromDate(at))} at ${formatTime12(at.getHours(), at.getMinutes())}`;
  }
  if (mode === 'today_only') {
    return todayOnlyLabel(time, now) === 'Today only'
      ? `Rings today at ${timeText}`
      : `Rings tomorrow at ${timeText}, once`;
  }
  const first = nextFire(
    { status: 'scheduled', enabled: true, repeat_rule: 'daily', time_of_day: time, scheduled_at: now.toISOString() },
    now,
  );
  const firstIsToday = first !== null && keyFromDate(first) === keyFromDate(now);
  return `Rings every day at ${timeText}. First: ${firstIsToday ? 'today' : 'tomorrow'}`;
}

/** Number of enabled daily reminders other than the one being edited (the cap is 20). */
export function countOtherDailies(reminders: ReadonlyArray<Reminder>, excludeId?: string): number {
  return reminders.filter(
    r => r.id !== excludeId && r.enabled && r.status !== 'cancelled' && rowToMode(r) === 'daily',
  ).length;
}

/** Message shown when the save call throws. */
export function saveErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? '');
  if (text.includes('reminder_limit')) {
    return 'You have reached the limit of saved reminders. Delete some first.';
  }
  return "Couldn't save the reminder. Check your connection and try again.";
}

export interface SubmitDeps {
  save: (input: ReminderInput, existing?: Reminder) => Promise<SaveResult>;
  notificationPermission: 'granted' | 'denied' | 'undetermined';
  requestNotifications: () => Promise<boolean>;
  existingDailyCount: number;
  now: Date;
}

export type SubmitOutcome =
  | { ok: true; result: SaveResult }
  | { ok: false; error: ValidationError | null; message: string };

/**
 * Validate, save, then ask for notification permission on the first save (after the row is stored).
 * Permission is requested only when undetermined, so a denial never blocks the save.
 */
export async function submitReminder(
  input: ReminderInput,
  existing: Reminder | undefined,
  deps: SubmitDeps,
): Promise<SubmitOutcome> {
  const error = validateInput(input, deps.now, deps.existingDailyCount);
  if (error) return { ok: false, error, message: error.message };

  let result: SaveResult;
  try {
    result = await deps.save(input, existing);
  } catch (e) {
    return { ok: false, error: null, message: saveErrorMessage(e) };
  }

  if (deps.notificationPermission === 'undetermined') {
    try {
      await deps.requestNotifications();
    } catch {
      // A failed prompt is not a failed save. The banner explains the state.
    }
  }
  return { ok: true, result };
}

/** Builds the ReminderInput the facade expects from the form. */
export function toReminderInput(form: FormState, id?: string): ReminderInput {
  return {
    id,
    text: form.text,
    kind: form.kind,
    mode: form.mode,
    date: form.mode === 'once' ? form.date : undefined,
    time: form.time,
    voice: form.voice,
    language: form.language,
  };
}

// ---------- Component ----------

interface ReminderEditorSheetProps {
  visible: boolean;
  initial?: Reminder;
  preset?: { mode: ReminderMode; date?: string };
  onClose: () => void;
  /** Parent closes the sheet and shows the snackbar. */
  onSaved: (result: SaveResult) => void;
  onDeleteConfirmed: (reminder: Reminder) => void;
}

export default function ReminderEditorSheet({
  visible, initial, preset, onClose, onSaved, onDeleteConfirmed,
}: ReminderEditorSheetProps) {
  const insets = useSafeAreaInsets();
  const permissions = useReminderPermissions();
  const [form, setForm] = useState<FormState>(() => buildInitialForm(new Date(), initial, preset));
  const [baseline, setBaseline] = useState<string>('');
  const [error, setError] = useState<ValidationError | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [textFocused, setTextFocused] = useState(false);
  const [debouncedText, setDebouncedText] = useState('');
  const savingRef = useRef(false);
  const languageTouchedRef = useRef(false);

  // Reset when the sheet opens or switches to a different reminder.
  useEffect(() => {
    if (!visible) return;
    const next = buildInitialForm(new Date(), initial, preset);
    languageTouchedRef.current = false;
    setForm(next);
    setBaseline(JSON.stringify(next));
    setError(null);
    setSaveError(null);
    setVoiceOpen(false);
    setDebouncedText(next.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initial?.id, preset?.mode, preset?.date]);

  // Kannada script selects kn-IN unless the user has already chosen a language.
  useEffect(() => {
    if (languageTouchedRef.current) return;
    if (detectScriptLanguage(form.text).language === 'kn-IN') {
      setForm(f => (f.language === 'kn-IN' ? f : { ...f, language: 'kn-IN' }));
    }
  }, [form.text]);

  // Voice preview line updates 300 ms after typing stops.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedText(form.text), 300);
    return () => clearTimeout(id);
  }, [form.text]);

  const dirty = baseline !== '' && JSON.stringify(form) !== baseline;
  const now = new Date();
  const scriptPreview = form.kind === 'call' ? spokenScript(debouncedText, form.language) : '';
  const summary = buildSummary(form.mode, form.date, form.time, now);
  const saveText = saveLabel(form.mode, form.time, now, saving);
  const count = form.text.length;
  const tone = counterTone(count);
  const counterColor = tone === 'error' ? colors.error : tone === 'warning' ? TINT.amberText : colors.textMuted;
  const kindStyle = KIND_STYLE[form.kind];

  function update(patch: Partial<FormState>) {
    setForm(f => ({ ...f, ...patch }));
    setError(null);
    setSaveError(null);
  }

  function requestClose() {
    if (saving) return;
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert('Discard changes?', 'Your edits to this reminder will not be saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  }

  async function handleSave() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const outcome = await submitReminder(toReminderInput(form, initial?.id), initial, {
        save: saveReminder,
        notificationPermission: permissions.notifications,
        requestNotifications: permissions.requestNotifications,
        existingDailyCount: countOtherDailies(getSnapshot().reminders, initial?.id),
        now: new Date(),
      });
      if (outcome.ok) {
        onSaved(outcome.result);
      } else if (outcome.error) {
        setError(outcome.error);
      } else {
        setSaveError(outcome.message);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!initial) return;
    const mode = initial.repeat_rule === 'daily' ? 'daily' : 'one-off';
    Alert.alert(
      'Delete this reminder?',
      `"${initial.title}" is a ${mode} reminder. It will stop ringing. You can undo for a few seconds.`,
      [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDeleteConfirmed(initial) },
    ]);
  }

  const textError = error?.field === 'text' ? error.message : null;
  const dateTimeError = error?.field === 'date' || error?.field === 'time' ? error.message : null;
  const dailyError = error?.field === 'daily' ? error.message : null;

  const body = (
    <>
      <Text style={styles.sectionLabel}>HOW SHOULD WE REMIND YOU?</Text>
      <KindPicker
        value={form.kind}
        onChange={kind => update({ kind })}
        disabled={saving}
      />

      <View style={styles.counterRow}>
        <Text style={styles.sectionLabel}>REMIND ME TO</Text>
        <Text style={[styles.counter, { color: counterColor }]}>{count}/{LIMITS.textMax}</Text>
      </View>
      <TextInput
        style={[
          styles.textInput,
          textFocused && styles.textInputFocused,
          textError ? styles.textInputError : null,
        ]}
        value={form.text}
        onChangeText={text => update({ text })}
        onFocus={() => setTextFocused(true)}
        onBlur={() => setTextFocused(false)}
        placeholder="e.g. Go to college for your submission"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={LIMITS.textMax}
        autoFocus={!initial}
        editable={!saving}
        textAlignVertical="top"
        accessibilityLabel="Reminder text"
      />
      {textError ? <Text style={styles.error}>{textError}</Text> : null}
      {form.kind === 'call' && scriptPreview ? (
        <Text style={styles.scriptPreview} numberOfLines={3}>
          The voice will say:{'\n'}
          <Text style={styles.scriptText}>"{scriptPreview}"</Text>
        </Text>
      ) : null}

      <Text style={styles.sectionLabel}>REPEAT</Text>
      <RepeatPicker
        value={form.mode}
        onChange={mode => update({ mode })}
        todayLabel={todayOnlyLabel(form.time, now)}
        disabled={saving}
      />
      {dailyError ? <Text style={styles.error}>{dailyError}</Text> : null}

      <View style={styles.dateTimeBlock}>
        <DateTimeFields
          mode={form.mode}
          date={form.date}
          time={form.time}
          onChangeDate={date => update({ date })}
          onChangeTime={time => update({ time })}
          summary={summary}
          error={dateTimeError ?? undefined}
          disabled={saving}
        />
      </View>

      {form.kind === 'call' ? (
        <VoiceSettings
          text={form.text}
          language={form.language}
          voice={form.voice}
          onChangeLanguage={language => {
            languageTouchedRef.current = true;
            update({ language });
          }}
          onChangeVoice={voice => update({ voice })}
          open={voiceOpen}
          onToggleOpen={() => setVoiceOpen(o => !o)}
          disabled={saving}
        />
      ) : null}

      {initial ? (
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={confirmDelete}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Delete reminder"
        >
          <Ionicons name="trash-outline" size={16} color={colors.error} />
          <Text style={styles.deleteText}>Delete reminder</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={requestClose}>
      <KeyboardShiftView style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>{initial ? 'Edit reminder' : 'New reminder'}</Text>
            <TouchableOpacity
              onPress={requestClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
              disabled={saving}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {body}
          </ScrollView>

          <View style={styles.footer}>
            {saveError ? <Text style={styles.footerError}>{saveError}</Text> : null}
            <View style={styles.footerRow}>
              <TouchableOpacity
                onPress={requestClose}
                disabled={saving}
                style={styles.cancelButton}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={[styles.saveButton, saving && styles.saveButtonBusy]}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving, busy: saving }}
              >
                {saving ? <ActivityIndicator size="small" color={colors.white} /> : null}
                <Text style={styles.saveText}>{saveText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardShiftView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: TINT.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, maxHeight: '92%',
  },
  handleWrap: { alignItems: 'center', paddingTop: spacing.sm },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.gray300 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm,
  },
  title: { fontSize: fontSize.xl, fontFamily: fontFamily.headingSemiBold, color: colors.text },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: spacing.md },
  sectionLabel: {
    fontSize: 12, fontFamily: fontFamily.semiBold, letterSpacing: 0.6, color: colors.textMuted,
    marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { fontSize: 12, fontFamily: fontFamily.regular, marginTop: spacing.lg, marginBottom: spacing.sm },
  textInput: {
    minHeight: 96, maxHeight: 160, borderRadius: borderRadius.md, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: fontSize.lg, fontFamily: fontFamily.regular, color: colors.text,
    backgroundColor: colors.white,
  },
  textInputFocused: { borderColor: colors.primary },
  textInputError: { borderColor: colors.error },
  error: {
    fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.error, marginTop: spacing.sm,
  },
  scriptPreview: {
    fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: spacing.sm,
  },
  scriptText: { fontFamily: fontFamily.medium, color: colors.text },
  dateTimeBlock: { marginTop: spacing.sm },
  deleteButton: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg,
    alignSelf: 'flex-start', minHeight: 44,
  },
  deleteText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.error },
  footer: {
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12,
  },
  footerError: {
    fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.error, marginBottom: spacing.sm,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancelButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  cancelText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.textSecondary },
  saveButton: {
    minWidth: 150, minHeight: 48, borderRadius: borderRadius.md, backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  saveButtonBusy: { opacity: 0.7 },
  saveText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.white },
});
