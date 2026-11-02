import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import OptionPicker from '../callReminder/OptionPicker';
import { VOICE_LANGUAGES, VOICES, type VoiceLanguage, type VoiceName } from '../../types/reminder';
import { previewVoice } from '../../services/reminders';
import { spokenScript, detectScriptLanguage } from '../../services/reminders/spokenScript';
import { colors, spacing, borderRadius, fontSize, fontFamily } from '../../constants/theme';
import { TINT } from './palette';

// Spec: _scratch/reminders-v2-plan.md E.4 (VoiceSettings) and D.5 (language hint).
// Shown for Call reminders only.

type PreviewState = 'idle' | 'loading' | 'playing' | 'error';

/** Hint shown when the text script does not match the chosen voice language. Null when no hint applies. */
export function languageHint(text: string, language: VoiceLanguage): string | null {
  const detected = detectScriptLanguage(text);
  if (detected.ambiguous && language === 'en-IN') {
    return 'Looks like Hindi or Marathi. Choose the voice language.';
  }
  return null;
}

export function voiceLabel(voice: VoiceName): string {
  return VOICES.find(v => v.value === voice)?.label ?? voice;
}

export function languageLabel(language: VoiceLanguage): string {
  return VOICE_LANGUAGES.find(l => l.value === language)?.label ?? language;
}

interface VoiceSettingsProps {
  text: string;
  language: VoiceLanguage;
  voice: VoiceName;
  onChangeLanguage: (language: VoiceLanguage) => void;
  onChangeVoice: (voice: VoiceName) => void;
  open: boolean;
  onToggleOpen: () => void;
  disabled?: boolean;
}

export default function VoiceSettings({
  text, language, voice, onChangeLanguage, onChangeVoice, open, onToggleOpen, disabled,
}: VoiceSettingsProps) {
  const [preview, setPreview] = useState<PreviewState>('idle');
  const [previewError, setPreviewError] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const mountedRef = useRef(true);
  // Bumped on every stop, so a load that started before a stop is discarded when it resolves.
  const generationRef = useRef(0);
  const hint = languageHint(text, language);
  const script = spokenScript(text, language);

  async function stopSound() {
    generationRef.current += 1;
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) {
      try { await sound.unloadAsync(); } catch { /* already unloaded */ }
    }
  }

  // Stop playback when the voice, the language or the panel changes, and on unmount.
  useEffect(() => {
    setPreview('idle');
    void stopSound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice, language, open]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stopSound();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function togglePreview() {
    if (preview === 'playing' || preview === 'loading') {
      setPreview('idle');
      await stopSound();
      return;
    }
    if (!script) return;
    setPreview('loading');
    setPreviewError(false);
    const generation = generationRef.current;
    try {
      const uri = await previewVoice(script, voice, language);
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      if (!mountedRef.current || generation !== generationRef.current) {
        // Sheet closed or preview stopped while loading: release the sound right away.
        try { await sound.unloadAsync(); } catch { /* already unloaded */ }
        return;
      }
      soundRef.current = sound;
      setPreview('playing');
      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) {
          setPreview('idle');
          void stopSound();
        }
      });
    } catch {
      setPreview('error');
      setPreviewError(true);
    }
  }

  return (
    <View style={[styles.wrapper, disabled && styles.disabled]}>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <TouchableOpacity
        style={styles.header}
        onPress={onToggleOpen}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Voice: ${voiceLabel(voice)}, ${languageLabel(language)}`}
      >
        <Text style={styles.headerText}>
          Voice: {voiceLabel(voice)} · {languageLabel(language)}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      {open ? (
        <View style={styles.body}>
          <OptionPicker<VoiceLanguage>
            label="Language"
            value={language}
            options={VOICE_LANGUAGES}
            onChange={onChangeLanguage}
            disabled={disabled}
          />
          <OptionPicker<VoiceName>
            label="Voice"
            value={voice}
            options={VOICES}
            onChange={onChangeVoice}
            disabled={disabled}
          />
          <TouchableOpacity
            style={[styles.previewButton, (!script || disabled) && styles.previewDisabled]}
            onPress={togglePreview}
            disabled={!script || disabled}
            accessibilityRole="button"
            accessibilityLabel={preview === 'playing' ? 'Stop preview' : 'Preview voice'}
          >
            {preview === 'loading' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons
                name={preview === 'playing' ? 'stop' : 'play'}
                size={16}
                color={colors.primary}
              />
            )}
            <Text style={styles.previewText}>
              {preview === 'playing' ? 'Stop preview' : 'Preview voice'}
            </Text>
          </TouchableOpacity>
          {previewError ? (
            <Text style={styles.error}>Couldn't play the preview. Check your connection.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: spacing.lg },
  disabled: { opacity: 0.5 },
  hint: {
    fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: TINT.amberText,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 44, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white, paddingHorizontal: spacing.md,
  },
  headerText: { fontSize: fontSize.lg, fontFamily: fontFamily.regular, color: colors.text },
  body: { marginTop: spacing.sm },
  previewButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    minHeight: 44, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.primary,
    marginTop: spacing.sm,
  },
  previewDisabled: { opacity: 0.5 },
  previewText: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.primary },
  error: {
    fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.error, marginTop: spacing.sm,
  },
});
