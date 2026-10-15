/**
 * V4LectureNotesPanel — the in-player lecture-note editor for the V4 player
 * (Task #96: "Let students write lecture notes and manage them from My Notes").
 *
 * Two layout variants driven by `variant`:
 *   - "portrait"  → keyboard-safe bottom sheet that slides up over the player
 *                   (playback keeps running behind it).
 *   - "side"      → landscape / fullscreen side panel docked to the right edge
 *                   (playback keeps running to its left).
 *
 * The panel never pauses playback — it is purely additive UI. It reads/writes a
 * single free-text lecture notebook scoped to the current chapter via the
 * `useStudentNoteEditor` hook (owned by the notes-service agent).
 *
 * Persistence guarantees:
 *   - Autosaves on a debounce while typing (handled by the hook).
 *   - Flushes any pending edit when the panel closes (onRequestClose) and, since
 *     the editor unmounts with the player, the hook is driven to flush on player
 *     unmount / back-out too (the screen keeps the panel mounted until dismissed
 *     and calls flush via onRequestClose).
 *
 * Invalid / missing route IDs (jobId / subjectId / chapterId / topicId) or a
 * missing signed-in user render an explicit disabled message instead of a broken
 * editor, and the hook is never mounted with an incomplete scope.
 *
 * useStudentNoteEditor contract (as implemented by the hook agent):
 *   useStudentNoteEditor({ userId, subjectId, chapterId }) => {
 *     text, setText, status, wordCount, loading, hasPendingCloudSave,
 *     flush, clear, retry, reload
 *   }
 *   status ∈ 'idle'|'loading'|'saving'|'saved'|'saved_local'|'error'
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  Keyboard, Platform, Dimensions, KeyboardAvoidingView,
} from 'react-native';
import Reanimated, {
  useSharedValue, withSpring, withTiming, useAnimatedStyle,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { EdgeInsets } from 'react-native-safe-area-context';
import {
  KeyboardScope,
  useKeyboardDrivenOffset,
  isKeyboardControlled,
} from '../keyboard/keyboardStick';
import {
  useStudentNoteEditor,
  NoteSaveStatus,
} from '../../hooks/useStudentNoteEditor';
import { useAuth } from '../../context/AuthContext';

// Sheet may occupy up to 85% of whatever space is left above the keyboard.
const BOTTOM_SHEET_MAX_RATIO = 0.85;

const C = {
  bg: '#0d1117',
  surface: '#161b22',
  elevated: '#21262d',
  border: 'rgba(255,255,255,0.08)',
  text: '#e6edf3',
  muted: 'rgba(230,237,243,0.5)',
  faint: 'rgba(230,237,243,0.32)',
  gold: '#f6c44e',
  amber: '#ff9f43',
  rose: '#ff6b8a',
  green: '#7ee787',
};

export type V4NotesVariant = 'portrait' | 'side';

interface V4LectureNotesPanelProps {
  visible: boolean;
  variant: V4NotesVariant;
  /** Route IDs scoping the note. Any missing → disabled message. */
  jobId?: string;
  subjectId?: string;
  chapterId?: string;
  topicId?: string;
  /** Topic context shown in the header (falls back to a generic label). */
  topicTitle?: string;
  insets: EdgeInsets;
  /** Called after the pending edit is flushed on close. */
  onRequestClose: () => void;
  /** Lets the player flush notes before its own close/back action. */
  onFlushReady?: (flush: (() => Promise<void>) | null) => void;
}

function statusLabel(
  status: NoteSaveStatus,
  hasPending: boolean
): { text: string; color: string } {
  switch (status) {
    case 'error':
      return { text: 'Save failed', color: C.rose };
    case 'saving':
      return { text: 'Saving to your account…', color: C.muted };
    case 'loading':
      return { text: 'Loading saved notes…', color: C.muted };
    case 'local':
      return { text: 'Saved locally — cloud sync will retry', color: C.amber };
    case 'saved':
      return { text: 'Saved', color: C.green };
    default:
      return { text: hasPending ? 'Unsaved changes' : 'Not saved yet', color: C.faint };
  }
}

/**
 * Inner editor: only mounted once all IDs + the user are valid, so the hook
 * always runs with a real scope.
 */
function NotesEditor({
  userId, subjectId, chapterId, jobId, topicId, topicTitle,
  variant, insets, onRequestClose, onFlushReady,
}: {
  userId: string;
  subjectId: string;
  chapterId: string;
  jobId: string;
  topicId: string;
  topicTitle?: string;
  variant: V4NotesVariant;
  insets: EdgeInsets;
  onRequestClose: () => void;
  onFlushReady?: (flush: (() => Promise<void>) | null) => void;
}) {
  // Pass jobId + topicId so the hook saves against the real lecture topic note
  // (its documented lecture-player override) rather than the aggregate notebook.
  const editor = useStudentNoteEditor({ userId, subjectId, chapterId, jobId, topicId });

  // Real-time keyboard offset. Both paths write the SAME shared value, which is
  // consumed only inside useAnimatedStyle below — never read during render.
  // (Reading `.value` in render does not subscribe the component to changes, so
  // the offset silently never reached the layout.)
  //   - EAS builds: react-native-keyboard-controller drives it frame-by-frame.
  //   - Expo Go (native module absent): JS Keyboard events drive it, animated
  //     with withTiming so the sheet still rises smoothly rather than snapping.
  const keyboardControlled = variant === 'portrait' && isKeyboardControlled;
  const keyboardOffset = useKeyboardDrivenOffset(keyboardControlled);

  useEffect(() => {
    if (keyboardControlled) return;
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        keyboardOffset.value = withTiming(Math.max(e.endCoordinates?.height ?? 0, 0), {
          duration: Platform.OS === 'ios' ? Math.max(e.duration ?? 250, 120) : 220,
        });
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e: any) => {
        keyboardOffset.value = withTiming(0, {
          duration: Platform.OS === 'ios' ? Math.max(e?.duration ?? 200, 120) : 180,
        });
      },
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, [keyboardControlled, keyboardOffset]);

  // Android fires keyboardDidShow only once the keyboard has finished animating
  // in, and with edge-to-edge the first event can report a stale height — which
  // left the sheet stranded behind the keyboard until a keystroke triggered a
  // second event. Seeding from Keyboard.metrics() on focus closes that gap.
  const handleInputFocus = useCallback(() => {
    if (keyboardControlled) return;
    const height = Keyboard.metrics?.()?.height ?? 0;
    if (height > 0) {
      keyboardOffset.value = withTiming(height, { duration: 180 });
    }
  }, [keyboardControlled, keyboardOffset]);

  // Animated slide-up for the bottom sheet (Reanimated shared values, not Animated.Value)
  const slideY = useSharedValue(1);
  const screenH = Dimensions.get('window').height;

  useEffect(() => {
    slideY.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, []);

  // The sheet is bottom-anchored, so instead of padding its bottom (which the
  // 85% max-height cap could swallow, leaving content behind the keyboard) we
  // move its bottom edge to sit exactly on top of the keyboard and re-cap the
  // height against the space that actually remains above it.
  const sheetAnimatedStyle = useAnimatedStyle(() => {
    const kb = Math.max(keyboardOffset.value, 0);
    const available = Math.max(screenH - kb, 240);
    return {
      transform: [{ translateY: slideY.value === 1 ? 0 : screenH }],
      bottom: kb,
      maxHeight: available * BOTTOM_SHEET_MAX_RATIO,
      // Safe-area padding is only meaningful when the keyboard is down — while
      // it is up the system bars sit behind it.
      paddingBottom: kb > 0 ? 10 : Math.max(insets.bottom, 10),
    };
  });

  const stat = statusLabel(editor.status, editor.hasPendingCloudSave);
  const showRetry = editor.status === 'error' || editor.status === 'local';

  useEffect(() => {
    onFlushReady?.(editor.flush);
    return () => onFlushReady?.(null);
  }, [editor.flush, onFlushReady]);

  const handleClose = useCallback(() => {
    Promise.resolve(editor.flush()).catch(() => {}).finally(onRequestClose);
  }, [editor.flush, onRequestClose]);

  const header = (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.headerLabel}>LECTURE NOTES</Text>
        <Text style={styles.headerTopic} numberOfLines={1}>
          {topicTitle || 'This topic'}
        </Text>
      </View>
      <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
        <Ionicons name="close" size={18} color={C.rose} />
      </TouchableOpacity>
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      <Text style={styles.wordCount}>
        {editor.wordCount} {editor.wordCount === 1 ? 'word' : 'words'}
      </Text>
      <View style={styles.statusRow}>
        {editor.status === 'saving' && (
          <ActivityIndicator size="small" color={C.muted} style={{ marginRight: 6 }} />
        )}
        <Text style={[styles.statusText, { color: stat.color }]}>{stat.text}</Text>
        {showRetry && (
          <TouchableOpacity onPress={editor.retry} style={styles.retryBtn} activeOpacity={0.7}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const input = (
    <TextInput
      style={styles.input}
      value={editor.content}
      onChangeText={editor.setContent}
      editable={!editor.isLoading}
      placeholder="Jot down what you're learning… key ideas, questions, formulas."
      placeholderTextColor={C.faint}
      multiline
      textAlignVertical="top"
      spellCheck
      autoCorrect
      autoCapitalize="sentences"
      keyboardAppearance="dark"
      scrollEnabled
    />
  );

  const inputPortrait = (
    <TextInput
      style={styles.input}
      value={editor.content}
      onChangeText={editor.setContent}
      editable={!editor.isLoading}
      multiline
      textAlignVertical="top"
      spellCheck
      autoCorrect
      autoCapitalize="sentences"
      keyboardAppearance="dark"
      scrollEnabled
      placeholder="Jot down what you're learning…"
      placeholderTextColor={C.faint}
    />
  );

  if (variant === 'side') {
    return (
      <KeyboardAvoidingView
        style={[
          styles.sidePanel,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, paddingRight: insets.right },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {header}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="position">
          {input}
        </KeyboardAvoidingView>
        {footer}
      </KeyboardAvoidingView>
    );
  }

  // Portrait bottom sheet — sits on top of the keyboard, never behind it.
  // No KeyboardAvoidingView here: sheetAnimatedStyle already positions the sheet
  // against the keyboard, and a KAV with iOS 'padding' behavior on top of that
  // would shift it a second time.
  return (
    <View style={{ ...StyleSheet.absoluteFillObject, zIndex: 200 }} pointerEvents="box-none">
      <Reanimated.View style={[styles.bottomSheet, sheetAnimatedStyle]}>
        <View style={styles.grabber} />
        {header}
        <TextInput
          style={styles.input}
          value={editor.content}
          onChangeText={editor.setContent}
          onFocus={handleInputFocus}
          editable={!editor.isLoading}
          multiline
          textAlignVertical="top"
          placeholder="Start writing your notes..."
          placeholderTextColor={C.faint}
        />
        {footer}
      </Reanimated.View>
    </View>
  );
}

/**
 * Disabled state: shown when any route ID / the user is missing so the editor
 * never loads with an invalid scope. Explains explicitly why notes are off.
 */
function DisabledPanel({
  variant, insets, onRequestClose, reason,
}: {
  variant: V4NotesVariant;
  insets: EdgeInsets;
  onRequestClose: () => void;
  reason: string;
}) {
  const body = (
    <>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerLabel}>LECTURE NOTES</Text>
        </View>
        <TouchableOpacity onPress={onRequestClose} style={styles.closeBtn} activeOpacity={0.7}>
          <Ionicons name="close" size={18} color={C.rose} />
        </TouchableOpacity>
      </View>
      <View style={styles.disabledBody}>
        <Ionicons name="lock-closed-outline" size={28} color={C.faint} />
        <Text style={styles.disabledText}>{reason}</Text>
      </View>
    </>
  );

  if (variant === 'side') {
    return (
      <View
        style={[
          styles.sidePanel,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, paddingRight: insets.right },
        ]}
      >
        {body}
      </View>
    );
  }
  return (
    <View style={[styles.bottomSheet, { paddingBottom: insets.bottom }]}>
      <View style={styles.grabber} />
      {body}
    </View>
  );
}

export default function V4LectureNotesPanel({
  visible, variant, jobId, subjectId, chapterId, topicId,
  topicTitle, insets, onRequestClose, onFlushReady,
}: V4LectureNotesPanelProps) {
  const { user } = useAuth();
  const localFlushRef = useRef<(() => Promise<void>) | null>(null);
  const registerFlush = useCallback((flush: (() => Promise<void>) | null) => {
    localFlushRef.current = flush;
    onFlushReady?.(flush);
  }, [onFlushReady]);
  const flushThenClose = useCallback(() => {
    Promise.resolve(localFlushRef.current?.())
      .catch(() => {})
      .finally(onRequestClose);
  }, [onRequestClose]);

  if (!visible) return null;

  // The hook keys on user + subject + chapter; the player also requires job +
  // topic context to identify the lecture. Any missing → explicit disabled UI.
  const missingScope = !jobId || !subjectId || !chapterId || !topicId;
  const reason = missingScope
    ? "Notes aren't available for this lecture — it's missing the topic details needed to save them. Open this lecture from your course to take notes."
    : !user?.id
      ? 'Sign in to write and save lecture notes for this topic.'
      : '';
  const canEdit = !missingScope && !!user?.id;

  const container = (
    <View style={styles.overlay} pointerEvents="box-none">
      <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={flushThenClose} />
      {canEdit ? (
        <NotesEditor
          userId={user!.id}
          subjectId={subjectId!}
          chapterId={chapterId!}
          jobId={jobId!}
          topicId={topicId!}
          topicTitle={topicTitle}
          variant={variant}
          insets={insets}
          onRequestClose={onRequestClose}
          onFlushReady={registerFlush}
        />
      ) : (
        <DisabledPanel
          variant={variant}
          insets={insets}
          onRequestClose={onRequestClose}
          reason={reason}
        />
      )}
    </View>
  );

  // Only wrap in KeyboardScope for the portrait sheet (side panel doesn't need
  // keyboard tracking; landscape keyboards are handled natively).
  return variant === 'portrait' ? <KeyboardScope>{container}</KeyboardScope> : container;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  // Portrait bottom sheet
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flex: 1,
    maxHeight: '85%',
    backgroundColor: C.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(246,196,78,0.14)',
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: 'column',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 8,
  },
  // Landscape / fullscreen side panel — wide enough so keyboard (at bottom)
  // doesn't obscure the text input. Panel doesn't extend to the very bottom.
  sidePanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '50%',
    maxWidth: '60%',
    minWidth: 340,
    backgroundColor: C.bg,
    borderLeftWidth: 1,
    borderColor: 'rgba(246,196,78,0.14)',
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerText: {
    flex: 1,
  },
  headerLabel: {
    fontSize: 9,
    letterSpacing: 1,
    color: C.gold,
    fontFamily: 'Sora_700Bold',
    marginBottom: 2,
  },
  headerTopic: {
    fontSize: 14,
    color: C.text,
    fontFamily: 'Sora_600SemiBold',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,107,138,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  input: {
    flex: 1,
    marginTop: 12,
    marginBottom: 8,
    padding: 14,
    minHeight: 80,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Sora_400Regular',
    maxHeight: 400,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  wordCount: {
    fontSize: 11,
    color: C.faint,
    fontFamily: 'JetBrainsMono_400Regular',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Sora_400Regular',
  },
  retryBtn: {
    marginLeft: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.rose,
  },
  retryText: {
    fontSize: 11,
    color: C.rose,
    fontFamily: 'Sora_600SemiBold',
  },
  disabledBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 14,
  },
  disabledText: {
    fontSize: 13,
    color: C.muted,
    fontFamily: 'Sora_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
});
