/**
 * Reusable editor hook for a single note (task #96).
 *
 * Two modes, selected by whether the context carries a real lecture jobId +
 * topicId:
 *
 *   Aggregate notebook (My Notes chapter screen; no override):
 *     - Loads the aggregate chapter note + all per-topic notes.
 *     - If topic notes are newer, rebuilds + resaves the aggregate.
 *     - Clear Page deletes ALL rows for the chapter.
 *
 *   Lecture note (lecture player; jobId + topicId provided):
 *     - Loads ONLY that exact lecture row (student+job+subject+chapter+topic).
 *     - Clear deletes ONLY that exact row.
 *
 * Persistence rules (both modes):
 *   1. Hydrate instantly from AsyncStorage (metadata JSON, legacy-tolerant).
 *   2. On EVERY keystroke, persist the local draft immediately (fire-and-forget)
 *      so a close/unmount before the debounce can never lose keystrokes.
 *   3. Autosave to the cloud 450ms after typing stops.
 *   4. On load, reconcile local vs cloud WITHOUT clobbering a newer, still
 *      unsynced local draft — a pending local draft wins and is retried.
 *   5. Realtime: reload on remote changes to THIS note, but never while there
 *      is pending local typing.
 *
 * This hook owns ONLY data/autosave — no UI.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import {
  fetchAggregateChapterNote,
  fetchChapterTopicNotes,
  fetchSingleNote,
  fetchTopicNames,
  saveAggregateChapterNote,
  upsertNote,
  aggregateJobId,
  deleteChapterNotes,
  deleteSingleNote,
  readLocalNoteMeta,
  writeLocalNoteMeta,
  removeLocalNoteMeta,
  buildAggregateContent,
  buildTopicTitleMap,
  isAggregateStale,
  noteRowMatchesContext,
  decideRealtimeNoteUpdate,
  subscribeToStudentNotes,
  countWords,
  type LocalNoteContext,
  type LocalNoteMeta,
  type NoteMatchContext,
  type RealtimeChange,
} from '../services/studentNotesService';

// Status strings map 1:1 to the labels rendered by RuledNotebookEditor:
//   'local' => "Saved locally - cloud sync will retry"
export type NoteSaveStatus =
  | 'idle'
  | 'loading' // "Loading saved notes..."
  | 'saving' // "Saving to your account..."
  | 'saved' // "Saved"
  | 'local' // "Saved locally - cloud sync will retry"
  | 'error';

export const AUTOSAVE_DEBOUNCE_MS = 450;

/**
 * Context identifying which note to edit. Null while the screen is still
 * resolving the user/chapter (the hook stays inert until it's non-null).
 */
export interface StudentNoteEditorContext {
  userId: string;
  subjectId: string;
  chapterId: string;
  /**
   * Lecture-player override: save to the real lecture job + topic instead of
   * the aggregate chapter notebook. Both jobId AND topicId must be present to
   * enter lecture mode; otherwise the hook edits the aggregate notebook.
   */
  jobId?: string;
  topicId?: string | null;
}

export interface UseStudentNoteEditorReturn {
  /** Current editor text. */
  content: string;
  /** Update text + schedule the 450ms debounced autosave. */
  setContent: (next: string) => void;
  status: NoteSaveStatus;
  wordCount: number;
  /** True while the initial load is in flight. */
  isLoading: boolean;
  /** True when there are unsaved changes not yet persisted to the cloud. */
  hasPendingCloudSave: boolean;
  /** Force an immediate save of the current text (bypasses the debounce). */
  flush: () => Promise<void>;
  /** Clear Page: delete cloud row(s), wipe local cache and editor text. */
  clearNotes: () => Promise<void>;
  /** Re-attempt a previously-failed cloud save. */
  retry: () => Promise<void>;
  /** Manually reload from cloud (e.g. after a realtime change). */
  reload: () => Promise<void>;
}

export function useStudentNoteEditor(
  context: StudentNoteEditorContext | null,
): UseStudentNoteEditorReturn {
  const userId = context?.userId;
  const subjectId = context?.subjectId;
  const chapterId = context?.chapterId;
  const overrideJobId = context?.jobId;
  const overrideTopicId = context?.topicId;

  const [text, setTextState] = useState('');
  const [status, setStatus] = useState<NoteSaveStatus>('idle');
  const [loading, setLoading] = useState(false);
  const [hasPendingCloudSave, setHasPendingCloudSave] = useState(false);

  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest text, so flush/timer callbacks always save the newest value.
  const latestTextRef = useRef('');
  // Guards against a stale async load overwriting newer user input.
  const loadTokenRef = useRef(0);
  // True while the user has unsynced local edits (used to gate realtime reloads
  // and drive reconciliation). Kept in a ref so callbacks see the latest value.
  const pendingRef = useRef(false);

  const ready = !!userId && !!subjectId && !!chapterId;
  // Lecture mode requires BOTH a real job id and topic id.
  const isLecture = !!overrideJobId && !!overrideTopicId;

  // Effective job/topic used for cloud reads/writes.
  const effectiveJobId =
    ready && subjectId && chapterId
      ? isLecture
        ? overrideJobId!
        : aggregateJobId(subjectId, chapterId)
      : '';
  const effectiveTopicId: string | null = isLecture ? overrideTopicId! : null;
  const contextKey = ready
    ? `${userId}|${effectiveJobId}|${subjectId}|${chapterId}|${effectiveTopicId ?? 'null'}`
    : '';
  // Updated during render so async work from an old chapter/lecture can verify
  // its result still belongs to the editor currently on screen.
  const activeContextKeyRef = useRef(contextKey);
  activeContextKeyRef.current = contextKey;

  const localCtx = useCallback((): LocalNoteContext | null => {
    if (!userId || !subjectId || !chapterId) return null;
    return isLecture
      ? {
          userId,
          subjectId,
          chapterId,
          jobId: overrideJobId,
          topicId: overrideTopicId,
        }
      : { userId, subjectId, chapterId };
  }, [
    userId,
    subjectId,
    chapterId,
    isLecture,
    overrideJobId,
    overrideTopicId,
  ]);

  const setPending = useCallback((val: boolean) => {
    pendingRef.current = val;
    if (mountedRef.current) setHasPendingCloudSave(val);
  }, []);

  const clearDebounce = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  // --- Persist a local draft (fire-and-forget on every keystroke) ---------
  const persistLocal = useCallback(
    (content: string, pendingSync: boolean) => {
      const ctx = localCtx();
      if (!ctx) return;
      const meta: LocalNoteMeta = {
        content,
        updatedAt: Date.now(),
        pendingSync,
      };
      // Intentionally not awaited: keystrokes must never block on storage.
      void writeLocalNoteMeta(ctx, meta);
    },
    [localCtx],
  );

  // --- Cloud save (single source of truth for cloud persistence) ----------
  // Deliberately NOT dependent on `mountedRef`: the request must be allowed to
  // finish even if the component unmounts mid-flight. Only state writes are
  // guarded by mountedRef.
  const saveNow = useCallback(
    async (content: string): Promise<void> => {
      if (!userId || !subjectId || !chapterId) return;
      const requestedContextKey = contextKey;
      // Persist the local copy first (still pending until the cloud confirms).
      persistLocal(content, true);
      if (
        mountedRef.current &&
        activeContextKeyRef.current === requestedContextKey
      ) {
        setStatus('saving');
      }
      const res = isLecture
        ? await upsertNote({
            student_id: userId,
            job_id: overrideJobId!,
            subject_id: subjectId,
            chapter_id: chapterId,
            topic_id: overrideTopicId!,
            content,
          })
        : await saveAggregateChapterNote(userId, subjectId, chapterId, content);

      if (res.success) {
        const isStillActive =
          activeContextKeyRef.current === requestedContextKey;
        // Once the editor has moved away, this completed request is the final
        // save for its old context. Mark that old local copy as synced, but do
        // not touch any state belonging to the newly selected note.
        if (!isStillActive || latestTextRef.current === content) {
          persistLocal(content, false);
          if (isStillActive) {
            setPending(false);
            if (mountedRef.current) setStatus('saved');
          }
        }
        // If newer text exists, its own debounced save will follow.
      } else {
        // Local copy already written above (pending) — safe to retry later.
        if (activeContextKeyRef.current === requestedContextKey) {
          setPending(true);
          if (mountedRef.current) setStatus('local');
        }
      }
    },
    [
      userId,
      subjectId,
      chapterId,
      isLecture,
      overrideJobId,
      overrideTopicId,
      contextKey,
      persistLocal,
      setPending,
    ],
  );

  // --- Apply a resolved value to the editor state -------------------------
  const applyValue = useCallback((value: string) => {
    setTextState(value);
    latestTextRef.current = value;
  }, []);

  // Reset synchronously when the full note identity changes. A layout effect
  // runs before the native view is painted, so the new chapter title can never
  // appear for a frame above the previous chapter's note.
  useLayoutEffect(() => {
    loadTokenRef.current++;
    clearDebounce();
    applyValue('');
    setPending(false);
    setStatus(ready ? 'loading' : 'idle');
    setLoading(ready);
  }, [contextKey, ready, clearDebounce, applyValue, setPending]);

  // --- Load: local-first, then cloud, reconciled --------------------------
  const reload = useCallback(async () => {
    if (!userId || !subjectId || !chapterId) return;
    const ctx = localCtx();
    if (!ctx) return;
    const token = ++loadTokenRef.current;
    setLoading(true);
    setStatus('loading');

    // 1. Instant local hydration from metadata (legacy-tolerant).
    const localMeta = await readLocalNoteMeta(ctx);
    if (loadTokenRef.current !== token || !mountedRef.current) return;
    if (localMeta) {
      applyValue(localMeta.content);
      setPending(localMeta.pendingSync);
    }

    // If the local draft is still pending sync, DON'T let cloud overwrite it —
    // keep the local text and retry the save. This is the anti-clobber rule.
    const localPending = !!localMeta && localMeta.pendingSync;

    try {
      if (isLecture) {
        // --- Lecture mode: load ONLY the exact lecture row ---------------
        const res = await fetchSingleNote(
          userId,
          overrideJobId!,
          subjectId,
          chapterId,
          overrideTopicId!,
        );
        if (loadTokenRef.current !== token || !mountedRef.current) return;
        const row = res.success ? res.data ?? null : null;

        if (localPending) {
          // Retry the unsynced local draft; never clobber it with cloud.
          void saveNow(latestTextRef.current);
          setStatus('local');
        } else if (!res.success) {
          // A failed request is not proof that this context has no note.
          // Preserve this context's own local copy when available.
          if (!localMeta) applyValue('');
          setPending(false);
          setStatus(localMeta ? 'local' : 'error');
        } else if (row) {
          applyValue(row.content);
          persistLocal(row.content, false);
          setPending(false);
          setStatus('saved');
        } else {
          applyValue('');
          setStatus(localMeta ? 'saved' : 'idle');
          setPending(false);
        }
      } else {
        // --- Aggregate mode: aggregate + all topic notes, with rebuild ---
        const [aggRes, topicRes] = await Promise.all([
          fetchAggregateChapterNote(userId, subjectId, chapterId),
          fetchChapterTopicNotes(userId, subjectId, chapterId),
        ]);
        if (loadTokenRef.current !== token || !mountedRef.current) return;

        const aggregate = aggRes.success ? aggRes.data ?? null : null;
        const topicNotes = topicRes.success ? topicRes.data ?? [] : [];

        if (localPending) {
          // Unsynced local draft wins; retry it and skip cloud overwrite.
          void saveNow(latestTextRef.current);
          setStatus('local');
        } else if (!aggRes.success || !topicRes.success) {
          // Avoid treating a partial/failed chapter fetch as an empty notebook.
          // The local value here belongs to the newly selected context.
          if (!localMeta) applyValue('');
          setPending(false);
          setStatus(localMeta ? 'local' : 'error');
        } else if (isAggregateStale(aggregate, topicNotes)) {
          const topicIds = Array.from(
            new Set(topicNotes.map((t) => t.topic_id).filter(Boolean)),
          );
          const namesRes = await fetchTopicNames(topicIds);
          if (loadTokenRef.current !== token || !mountedRef.current) return;
          const titleMap = buildTopicTitleMap(
            namesRes.success ? namesRes.data ?? [] : [],
          );
          const rebuilt = buildAggregateContent(topicNotes, titleMap);
          applyValue(rebuilt);
          persistLocal(rebuilt, true);
          const saveRes = await saveAggregateChapterNote(
            userId,
            subjectId,
            chapterId,
            rebuilt,
          );
          if (loadTokenRef.current !== token || !mountedRef.current) return;
          if (saveRes.success) {
            persistLocal(rebuilt, false);
            setPending(false);
            setStatus('saved');
          } else {
            setPending(true);
            setStatus('local');
          }
        } else if (aggregate) {
          applyValue(aggregate.content);
          persistLocal(aggregate.content, false);
          setPending(false);
          setStatus('saved');
        } else {
          applyValue('');
          setStatus(localMeta ? 'saved' : 'idle');
          setPending(false);
        }
      }
    } catch {
      if (loadTokenRef.current !== token || !mountedRef.current) return;
      // Cloud load failed — local content (if any) stands.
      if (!localMeta) applyValue('');
      setStatus(localMeta ? 'local' : 'error');
      setPending(localPending);
    } finally {
      if (loadTokenRef.current === token && mountedRef.current) {
        setLoading(false);
      }
    }
  }, [
    userId,
    subjectId,
    chapterId,
    isLecture,
    overrideJobId,
    overrideTopicId,
    localCtx,
    applyValue,
    persistLocal,
    setPending,
    saveNow,
  ]);

  // Fetch only the active cloud row and reconcile it in place. Unlike reload(),
  // this never toggles `loading` or `status: loading`, so the TextInput remains
  // mounted and focused while background sync happens.
  const syncFromCloudSilently = useCallback(async () => {
    if (!userId || !subjectId || !chapterId || pendingRef.current || debounceRef.current) return;
    const requestedContextKey = contextKey;
    try {
      const res = await fetchSingleNote(
        userId,
        effectiveJobId,
        subjectId,
        chapterId,
        effectiveTopicId,
      );
      if (
        !res.success ||
        !mountedRef.current ||
        activeContextKeyRef.current !== requestedContextKey ||
        pendingRef.current ||
        debounceRef.current
      ) return;
      const incoming = res.data?.content ?? '';
      if (incoming === latestTextRef.current) return;
      applyValue(incoming);
      persistLocal(incoming, false);
      setPending(false);
      setStatus('saved');
    } catch {
      // Background sync is best-effort; never disturb the active editor.
    }
  }, [
    userId,
    subjectId,
    chapterId,
    effectiveJobId,
    effectiveTopicId,
    contextKey,
    applyValue,
    persistLocal,
    setPending,
  ]);

  // Reload whenever the target note changes.
  useEffect(() => {
    if (!ready) return;
    reload();
    return () => clearDebounce();
  }, [ready, reload, clearDebounce]);

  // --- Realtime: reconcile in place without unmounting the editor ----------
  useEffect(() => {
    if (!ready || !userId) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;

    const matchCtx: NoteMatchContext = {
      userId,
      jobId: effectiveJobId,
      subjectId: subjectId!,
      chapterId: chapterId!,
      topicId: effectiveTopicId,
    };

    const onChange = (change: RealtimeChange) => {
      // An already-queued event from the subscription being torn down must not
      // touch the newly selected chapter/lecture.
      if (activeContextKeyRef.current !== contextKey) return;
      // Only react to changes for THIS exact note context.
      const matches =
        noteRowMatchesContext(change.new, matchCtx) ||
        noteRowMatchesContext(change.old, matchCtx);
      if (!matches) return;
      const decision = decideRealtimeNoteUpdate(
        change,
        latestTextRef.current,
        pendingRef.current || !!debounceRef.current,
      );
      if (decision.action === 'ignore') return;
      if (decision.action === 'fetch') {
        void syncFromCloudSilently();
        return;
      }
      const incoming = decision.action === 'clear' ? '' : decision.content;
      applyValue(incoming);
      persistLocal(incoming, false);
      setPending(false);
      setStatus('saved');
    };

    subscribeToStudentNotes(userId, onChange)
      .then((fn) => {
        if (cancelled) {
          // Unmounted before subscription resolved — tear down immediately.
          try {
            fn();
          } catch {
            // ignore
          }
        } else {
          unsub = fn;
        }
      })
      .catch(() => {
        // Realtime is best-effort; ignore failures.
      });

    return () => {
      cancelled = true;
      if (unsub) {
        try {
          unsub();
        } catch {
          // ignore
        }
        unsub = null;
      }
    };
  }, [
    ready,
    userId,
    subjectId,
    chapterId,
    effectiveJobId,
    effectiveTopicId,
    contextKey,
    applyValue,
    persistLocal,
    setPending,
    syncFromCloudSilently,
  ]);

  // --- Typing: persist local immediately + schedule debounced cloud save --
  const setContent = useCallback(
    (next: string) => {
      setTextState(next);
      latestTextRef.current = next;
      if (!ready) return;
      setPending(true);
      // Persist the latest keystrokes to local storage RIGHT NOW so a
      // close/unmount before the 450ms debounce cannot lose them.
      persistLocal(next, true);
      clearDebounce();
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void saveNow(latestTextRef.current);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [ready, saveNow, clearDebounce, persistLocal, setPending],
  );

  // --- Flush: save current text immediately -------------------------------
  const flush = useCallback(async () => {
    clearDebounce();
    if (!ready) return;
    await saveNow(latestTextRef.current);
  }, [ready, saveNow, clearDebounce]);

  // --- Retry a failed cloud save ------------------------------------------
  const retry = useCallback(async () => {
    if (!ready) return;
    await saveNow(latestTextRef.current);
  }, [ready, saveNow]);

  // --- Clear Page ---------------------------------------------------------
  // Throws on failure so the screen's try/catch can surface an alert.
  // Aggregate mode clears ALL chapter rows; lecture mode clears ONLY its row.
  const clearNotes = useCallback(async (): Promise<void> => {
    if (!userId || !subjectId || !chapterId) {
      throw new Error('Not ready');
    }
    const ctx = localCtx();
    clearDebounce();
    // Invalidate any in-flight load so it can't repopulate the editor.
    loadTokenRef.current++;
    const res = isLecture
      ? await deleteSingleNote(
          userId,
          overrideJobId!,
          subjectId,
          chapterId,
          overrideTopicId!,
        )
      : await deleteChapterNotes(userId, subjectId, chapterId);
    if (!res.success) {
      throw new Error(res.error || 'Failed to clear notes.');
    }
    if (ctx) await removeLocalNoteMeta(ctx);
    applyValue('');
    setPending(false);
    if (mountedRef.current) {
      setStatus('saved');
    }
  }, [
    userId,
    subjectId,
    chapterId,
    isLecture,
    overrideJobId,
    overrideTopicId,
    localCtx,
    applyValue,
    clearDebounce,
    setPending,
  ]);

  // --- Cleanup on unmount: cancel the pending autosave timer --------------
  // We don't await a final cloud save here (unmount cleanup can't reliably run
  // async work); the local copy is already written on every keystroke, and
  // screens call flush() before navigating away to persist to the cloud.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  return {
    content: text,
    setContent,
    status,
    wordCount: countWords(text),
    isLoading: loading,
    hasPendingCloudSave,
    flush,
    clearNotes,
    retry,
    reload,
  };
}
