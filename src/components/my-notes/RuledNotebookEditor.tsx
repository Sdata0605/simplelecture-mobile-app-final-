import { useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily } from '../../constants/theme';

/**
 * Notebook-paper styled editable text area with ruled lines, a left margin
 * rule, a word-count footer and an autosave status indicator.
 *
 * The autosave status strings map to those emitted by the note editor hook:
 *   'loading' | 'saving' | 'saved' | 'local' | 'idle'
 */

export type NoteSaveStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'local' | 'error';

const LINE_HEIGHT = 32;

const STATUS_META: Record<NoteSaveStatus, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  idle: { label: '', icon: 'ellipse-outline', color: colors.textMuted },
  loading: { label: 'Loading saved notes...', icon: 'cloud-download-outline', color: colors.textSecondary },
  saving: { label: 'Saving to your account...', icon: 'sync-outline', color: colors.warning },
  saved: { label: 'Saved', icon: 'checkmark-circle', color: colors.success },
  local: { label: 'Saved locally - cloud sync will retry', icon: 'cloud-offline-outline', color: colors.warning },
  error: { label: 'Could not save', icon: 'alert-circle', color: colors.error },
};

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

interface RuledNotebookEditorProps {
  value: string;
  onChangeText: (text: string) => void;
  status: NoteSaveStatus;
  editable?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  /** Number of ruled lines rendered as the paper background. */
  lineCount?: number;
}

export default function RuledNotebookEditor({
  value,
  onChangeText,
  status,
  editable = true,
  autoFocus = false,
  placeholder = 'Start writing your notes...',
  lineCount = 40,
}: RuledNotebookEditorProps) {
  const words = useMemo(() => countWords(value), [value]);
  const meta = STATUS_META[status] ?? STATUS_META.idle;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.paper}
        contentContainerStyle={styles.paperContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Ruled line background */}
        <View style={styles.linesLayer} pointerEvents="none">
          {Array.from({ length: lineCount }).map((_, i) => (
            <View key={i} style={styles.ruledLine} />
          ))}
        </View>
        {/* Left margin rule */}
        <View style={styles.marginRule} pointerEvents="none" />

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          multiline
          autoFocus={autoFocus}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          textAlignVertical="top"
          spellCheck
          autoCorrect
          autoCapitalize="sentences"
          scrollEnabled={false}
          testID="notebook-editor-input"
        />
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.statusRow}>
          {!!meta.label && (
            <>
              <Ionicons name={meta.icon} size={14} color={meta.color} />
              <Text style={[styles.statusText, { color: meta.color }]} testID="notebook-save-status">
                {meta.label}
              </Text>
            </>
          )}
        </View>
        <Text style={styles.wordCount} testID="notebook-word-count">
          {words} {words === 1 ? 'word' : 'words'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF6',
  },
  paper: {
    flex: 1,
  },
  paperContent: {
    minHeight: '100%',
    position: 'relative',
  },
  linesLayer: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: spacing.md + LINE_HEIGHT - 8,
  },
  ruledLine: {
    height: LINE_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE7F0',
  },
  marginRule: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: spacing.xl,
    width: 1.5,
    backgroundColor: '#F4B8B8',
  },
  input: {
    flex: 1,
    minHeight: LINE_HEIGHT * 12,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    paddingLeft: spacing.xl + spacing.sm,
    paddingRight: spacing.md,
    fontFamily: 'Caveat_400Regular',
    fontSize: fontSize.lg,
    lineHeight: LINE_HEIGHT,
    color: '#2A3B4C',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  statusText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
  },
  wordCount: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
