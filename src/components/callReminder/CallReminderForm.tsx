import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Platform,
  Linking,
  KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../../constants/theme';
import {
  CallReminder,
  CallReminderInput,
  RepeatRule,
  SARVAM_LANGUAGES,
  SARVAM_VOICES,
} from '../../types/callReminder';
import { useCallReminders } from '../../hooks/useCallReminders';
import { generateAudio } from '../../services/callReminders';
import OptionPicker from './OptionPicker';

interface CallReminderFormProps {
  visible: boolean;
  initial?: CallReminder;
  onClose(): void;
  onSaved(r: CallReminder): void;
}

const TITLE_MAX = 80;
const MESSAGE_MAX = 500;
const MIN_LEAD_MS = 2 * 60 * 1000;

const REPEAT_OPTIONS: { value: RepeatRule; label: string }[] = [
  { value: 'none', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
];

const DEFAULT_VOICE = 'shubh';
const DEFAULT_LANGUAGE = 'en-IN';

function defaultWhen(): Date {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d;
}

function formatReadable(d: Date): string {
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

export default function CallReminderForm({ visible, initial, onClose, onSaved }: CallReminderFormProps) {
  const { save } = useCallReminders();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [when, setWhen] = useState<Date>(defaultWhen);
  const [repeat, setRepeat] = useState<RepeatRule>('none');
  const [callEnabled, setCallEnabled] = useState(false);
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE);
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);

  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [errors, setErrors] = useState<{ title?: string; message?: string; when?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [audioWarning, setAudioWarning] = useState(false);
  const [savedReminder, setSavedReminder] = useState<CallReminder | null>(null);
  const [notifDenied, setNotifDenied] = useState(false);

  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const soundRef = useRef<Audio.Sound | null>(null);

  // Reset the form whenever it opens or the item being edited changes.
  useEffect(() => {
    if (!visible) return;
    setTitle(initial?.title ?? '');
    setMessage(initial?.message_text ?? '');
    setWhen(initial ? new Date(initial.scheduled_at) : defaultWhen());
    setRepeat(initial?.repeat_rule ?? 'none');
    setCallEnabled(initial?.call_enabled ?? false);
    setVoice(initial?.voice ?? DEFAULT_VOICE);
    setLanguage(initial?.language ?? DEFAULT_LANGUAGE);
    setPickerMode(null);
    setErrors({});
    setFormError(null);
    setSaving(false);
    setAudioWarning(false);
    setSavedReminder(null);
    setNotifDenied(false);
  }, [visible, initial]);

  // Stop and unload preview audio when the sheet closes or unmounts.
  useEffect(() => {
    if (!visible) void stopPreview();
    return () => { void stopPreview(); };
  }, [visible]);

  async function stopPreview() {
    const s = soundRef.current;
    soundRef.current = null;
    setPreviewState('idle');
    if (s) {
      try { await s.unloadAsync(); } catch { /* already unloaded */ }
    }
  }

  // Turning the call on asks for notification permission (the ring needs it).
  async function handleCallToggle(next: boolean) {
    setCallEnabled(next);
    if (!next) { setNotifDenied(false); return; }
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.status === 'granted') { setNotifDenied(false); return; }
      const req = await Notifications.requestPermissionsAsync();
      setNotifDenied(req.status !== 'granted');
    } catch {
      setNotifDenied(false);
    }
  }

  function handlePickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setPickerMode(null);
    if (event.type === 'dismissed' || !selected) return;
    setErrors(e => ({ ...e, when: undefined }));
    setWhen(prev => {
      const next = new Date(prev);
      if (pickerMode === 'date') {
        next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      } else {
        next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      }
      return next;
    });
  }

  function validate(): boolean {
    const next: typeof errors = {};
    const t = title.trim();
    const m = message.trim();
    if (t.length < 1 || t.length > TITLE_MAX) next.title = `Enter a title (1–${TITLE_MAX} characters).`;
    if (m.length < 1 || m.length > MESSAGE_MAX) next.message = `Enter a message (1–${MESSAGE_MAX} characters).`;
    if (when.getTime() < Date.now() + MIN_LEAD_MS) next.when = 'Pick a time at least 2 minutes from now.';
    setErrors(next);
    return !next.title && !next.message && !next.when;
  }

  function buildInput(): CallReminderInput {
    return {
      title: title.trim(),
      message_text: message.trim(),
      scheduled_at: when.toISOString(),
      repeat_rule: repeat,
      call_enabled: callEnabled,
      voice,
      language,
    };
  }

  async function handlePreview() {
    if (previewState === 'playing' || previewState === 'loading') { await stopPreview(); return; }
    if (!message.trim()) {
      setErrors(e => ({ ...e, message: `Enter a message (1–${MESSAGE_MAX} characters).` }));
      return;
    }
    setFormError(null);
    setPreviewState('loading');
    try {
      const res: any = await generateAudio({
        text: message.trim(),
        voice,
        language,
        preview: true,
      });
      const dest = `${FileSystem.cacheDirectory}call-preview-${res.hash}.mp3`;
      await FileSystem.downloadAsync(res.signedUrl, dest);

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });
      const { sound } = await Audio.Sound.createAsync({ uri: dest }, { shouldPlay: true });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded && status.didJustFinish) void stopPreview();
      });
      setPreviewState('playing');
    } catch {
      setPreviewState('idle');
      setFormError("Couldn't play the voice preview. Check your connection and try again.");
    }
  }

  async function handleSave() {
    if (savedReminder) { onSaved(savedReminder); return; }
    setFormError(null);
    if (!validate()) return;
    await stopPreview();
    setSaving(true);
    try {
      const result: any = await save(buildInput(), initial);
      const reminder: CallReminder = result.reminder ?? result;
      if (result.audioWarning) {
        // Reminder is saved as a normal notification. Keep the sheet open so the
        // user sees the note; the Save button becomes Done.
        setSavedReminder(reminder);
        setAudioWarning(true);
        setSaving(false);
        return;
      }
      setSaving(false);
      onSaved(reminder);
    } catch {
      setSaving(false);
      setFormError("Couldn't save the reminder. Please try again.");
    }
  }

  const saveLabel = saving
    ? (callEnabled ? 'Preparing voice…' : 'Saving…')
    : savedReminder ? 'Done' : 'Save';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          <Text style={styles.sheetTitle}>{initial ? 'Edit reminder' : 'New reminder'}</Text>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {/* Title */}
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={t => { setTitle(t); setErrors(e => ({ ...e, title: undefined })); }}
              placeholder="e.g. Physics revision"
              placeholderTextColor={colors.textMuted}
              maxLength={TITLE_MAX}
              editable={!saving}
            />
            {errors.title ? <Text style={styles.errorText}>{errors.title}</Text> : null}

            {/* Message */}
            <View style={styles.labelRow}>
              <Text style={styles.label}>Message</Text>
              <Text style={styles.counter}>{message.length}/{MESSAGE_MAX}</Text>
            </View>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={message}
              onChangeText={m => { setMessage(m); setErrors(e => ({ ...e, message: undefined })); }}
              placeholder="Hey, it's time to study. Start with chapter 3, then do the 10 practice questions."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              maxLength={MESSAGE_MAX}
              textAlignVertical="top"
              editable={!saving}
            />
            {errors.message ? <Text style={styles.errorText}>{errors.message}</Text> : null}

            {/* Date and time */}
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={[styles.dateField, { flex: 1 }]}
                onPress={() => setPickerMode('date')}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Pick date"
              >
                <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.dateText}>
                  {when.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dateField, { flex: 1 }]}
                onPress={() => setPickerMode('time')}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Pick time"
              >
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.dateText}>
                  {when.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
            </View>
            {errors.when ? <Text style={styles.errorText}>{errors.when}</Text> : null}
            {pickerMode && (
              <DateTimePicker
                value={when}
                mode={pickerMode}
                is24Hour={false}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={pickerMode === 'date' ? new Date() : undefined}
                onChange={handlePickerChange}
              />
            )}
            <Text style={styles.hint}>{formatReadable(when)}</Text>

            {/* Repeat */}
            <Text style={styles.label}>Repeat</Text>
            <View style={styles.chipRow}>
              {REPEAT_OPTIONS.map(o => {
                const active = repeat === o.value;
                return (
                  <TouchableOpacity
                    key={o.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setRepeat(o.value)}
                    disabled={saving}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Call reminder toggle */}
            <View style={styles.callRow}>
              <View style={styles.callIcon}>
                <Ionicons name="call" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.callTitle}>Call reminder</Text>
                <Text style={styles.callSub}>Ring like a phone call and play a voice message</Text>
              </View>
              <Switch
                value={callEnabled}
                onValueChange={handleCallToggle}
                disabled={saving}
                trackColor={{ true: colors.primaryLight, false: colors.gray300 }}
                thumbColor={callEnabled ? colors.primary : colors.white}
                accessibilityLabel="Call reminder"
              />
            </View>

            {notifDenied ? (
              <View style={styles.warnCard}>
                <Text style={styles.warnText}>Notifications are off, so we can't ring you.</Text>
                <TouchableOpacity onPress={() => Linking.openSettings()}>
                  <Text style={styles.warnLink}>Open settings</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {callEnabled && (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
                <OptionPicker
                  label="Voice"
                  value={voice}
                  options={SARVAM_VOICES}
                  onChange={setVoice}
                  disabled={saving}
                />
                <OptionPicker
                  label="Language"
                  value={language}
                  options={SARVAM_LANGUAGES}
                  onChange={setLanguage}
                  disabled={saving}
                />
                <Text style={styles.hint}>Type your message in the language you choose</Text>

                <TouchableOpacity
                  style={styles.previewBtn}
                  onPress={handlePreview}
                  disabled={saving}
                  accessibilityRole="button"
                >
                  {previewState === 'loading' ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons
                      name={previewState === 'playing' ? 'stop' : 'play'}
                      size={16}
                      color={colors.primary}
                    />
                  )}
                  <Text style={styles.previewText}>
                    {previewState === 'playing' ? 'Stop preview' : 'Preview voice'}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {audioWarning ? (
              <View style={styles.amberCard}>
                <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
                <Text style={styles.amberText}>
                  Voice not available right now — you'll get a normal reminder.
                </Text>
              </View>
            ) : null}

            {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose} disabled={saving} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
            >
              {saving && <ActivityIndicator size="small" color={colors.white} />}
              <Text style={styles.saveText}>{saveLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    maxHeight: '92%',
  },
  handleWrap: { alignItems: 'center', paddingTop: spacing.sm },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.gray300 },
  sheetTitle: {
    fontSize: fontSize.xl, fontFamily: fontFamily.headingSemiBold, color: colors.text,
    marginTop: spacing.sm, marginBottom: spacing.xs,
  },
  content: { paddingBottom: spacing.md },

  label: {
    fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary,
    marginBottom: 4, marginTop: spacing.md,
  },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  counter: { fontSize: fontSize.xs, fontFamily: fontFamily.regular, color: colors.textMuted, marginTop: spacing.md },
  input: {
    height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, fontSize: fontSize.md, fontFamily: fontFamily.regular,
    color: colors.text, backgroundColor: colors.white,
  },
  multiline: { height: 110, paddingTop: spacing.sm },

  dateRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  dateField: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, backgroundColor: colors.white,
  },
  dateText: { fontSize: fontSize.md, fontFamily: fontFamily.regular, color: colors.text },
  hint: {
    fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.textMuted, marginTop: spacing.xs,
  },
  errorText: {
    fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.error, marginTop: 4,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: borderRadius.full,
    backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.textSecondary },
  chipTextActive: { color: colors.white },

  callRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.lg, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  callIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8F8EF',
    alignItems: 'center', justifyContent: 'center',
  },
  callTitle: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.text },
  callSub: { fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },

  warnCard: {
    marginTop: spacing.sm, padding: spacing.md, borderRadius: borderRadius.md,
    backgroundColor: '#FEF3C7',
  },
  warnText: { fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.text },
  warnLink: {
    fontSize: fontSize.sm, fontFamily: fontFamily.semiBold, color: colors.primary, marginTop: 4,
  },

  previewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    height: 44, marginTop: spacing.md, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.white,
  },
  previewText: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.primary },

  amberCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.md,
    backgroundColor: '#FEF3C7',
  },
  amberText: { flex: 1, fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.text },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md,
    paddingTop: spacing.sm,
  },
  cancelBtn: { paddingHorizontal: spacing.md, height: 48, justifyContent: 'center' },
  cancelText: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.textSecondary },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    height: 48, minWidth: 150, paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md, backgroundColor: colors.primary,
  },
  saveBtnDisabled: { opacity: 0.8 },
  saveText: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.white },
});
