import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import ChapterChips from '../components/my-notes/ChapterChips';
import RuledNotebookEditor from '../components/my-notes/RuledNotebookEditor';
import {
  NotesEmptyState,
  NotesErrorState,
} from '../components/my-notes/NotesStateViews';
import { getNotebookChapters, SubjectChapter } from '../services/studentNotesService';
import { useStudentNoteEditor } from '../hooks/useStudentNoteEditor';
import { KeyboardShiftView } from '../components/keyboard/keyboardStick';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'MyNotesChapter'>;

export default function MyNotesChapterScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const { courseName, subjectId, subjectName, initialChapterId } = route.params;
  const { user } = useAuth();

  const [chapters, setChapters] = useState<SubjectChapter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialChapterId ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const loadChapters = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const data = await getNotebookChapters(subjectId);
      const list = data ?? [];
      setChapters(list);
      setSelectedId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to load chapters.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [subjectId]);

  useEffect(() => {
    loadChapters('initial');
  }, [loadChapters]);

  const selectedIndex = useMemo(
    () => chapters.findIndex((c) => c.id === selectedId),
    [chapters, selectedId]
  );
  const selectedChapter = selectedIndex >= 0 ? chapters[selectedIndex] : null;

  // Editor state driven by the shared hook. Context is stable per chapter.
  const editorContext = useMemo(
    () => (user?.id && selectedId ? { userId: user.id, subjectId, chapterId: selectedId } : null),
    [user?.id, subjectId, selectedId]
  );

  const {
    content,
    setContent,
    status,
    isLoading: isEditorLoading,
    clearNotes,
    flush,
    hasPendingCloudSave,
  } = useStudentNoteEditor(editorContext);

  const selectChapter = useCallback(async (chapterId: string) => {
    if (chapterId === selectedId) return;
    if (hasPendingCloudSave) await flush().catch(() => {});
    setSelectedId(chapterId);
  }, [flush, hasPendingCloudSave, selectedId]);

  const goPrev = async () => {
    if (selectedIndex > 0) await selectChapter(chapters[selectedIndex - 1].id);
  };
  const goNext = async () => {
    if (selectedIndex >= 0 && selectedIndex < chapters.length - 1) {
      await selectChapter(chapters[selectedIndex + 1].id);
    }
  };

  // Header back, Android back, and swipe-back all attempt a final cloud save.
  // Every keystroke is already cached locally, so navigation is never blocked
  // permanently by an offline request.
  const allowExitRef = useRef(false);
  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (allowExitRef.current || !hasPendingCloudSave) return;
      event.preventDefault();
      void flush().catch(() => {}).finally(() => {
        allowExitRef.current = true;
        navigation.dispatch(event.data.action);
      });
    });
  }, [navigation, hasPendingCloudSave, flush]);

  const confirmClear = () => {
    Alert.alert(
      'Clear this page?',
      'This permanently removes all notes for this chapter. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearNotes();
            } catch (e: any) {
              Alert.alert('Could not clear', e?.message || 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const renderToolbar = (inFullscreen: boolean) => (
    <View style={styles.toolbar}>
      <View style={styles.chapterIndicator}>
        <Ionicons name="reader-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.chapterIndicatorText} testID="chapter-indicator">
          {selectedIndex >= 0 ? `${selectedIndex + 1} of ${chapters.length}` : '—'}
        </Text>
      </View>
      <View style={styles.toolbarActions}>
        <TouchableOpacity onPress={confirmClear} style={styles.toolbarBtn} testID="button-clear-page">
          <Ionicons name="trash-outline" size={18} color={colors.error} />
          <Text style={[styles.toolbarBtnText, { color: colors.error }]}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setFullscreen(!inFullscreen)}
          style={styles.toolbarBtn}
          testID="button-fullscreen"
        >
          <Ionicons name={inFullscreen ? 'contract-outline' : 'expand-outline'} size={18} color={colors.primary} />
          <Text style={styles.toolbarBtnText}>{inFullscreen ? 'Exit' : 'Full screen'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderNav = () => (
    <View style={styles.navRow}>
      <TouchableOpacity
        onPress={goPrev}
        disabled={selectedIndex <= 0}
        style={[styles.navBtn, selectedIndex <= 0 && styles.navBtnDisabled]}
        testID="button-prev-chapter"
      >
        <Ionicons name="chevron-back" size={18} color={selectedIndex <= 0 ? colors.textMuted : colors.primary} />
        <Text style={[styles.navBtnText, selectedIndex <= 0 && styles.navBtnTextDisabled]}>Previous</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={goNext}
        disabled={selectedIndex < 0 || selectedIndex >= chapters.length - 1}
        style={[
          styles.navBtn,
          (selectedIndex < 0 || selectedIndex >= chapters.length - 1) && styles.navBtnDisabled,
        ]}
        testID="button-next-chapter"
      >
        <Text
          style={[
            styles.navBtnText,
            (selectedIndex < 0 || selectedIndex >= chapters.length - 1) && styles.navBtnTextDisabled,
          ]}
        >
          Next
        </Text>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={selectedIndex < 0 || selectedIndex >= chapters.length - 1 ? colors.textMuted : colors.primary}
        />
      </TouchableOpacity>
    </View>
  );

  const editorBlock = (inFullscreen: boolean) => (
    <>
      {selectedChapter && (
        <View style={styles.selectedTitleWrap}>
          <Text style={styles.selectedTitle} numberOfLines={2}>
            Ch. {selectedChapter.chapter_number}: {selectedChapter.title}
          </Text>
        </View>
      )}
      {renderToolbar(inFullscreen)}
      {isEditorLoading ? (
        <View style={styles.editorLoading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.editorLoadingText}>Loading saved notes...</Text>
        </View>
      ) : (
        <RuledNotebookEditor
          value={content}
          onChangeText={setContent}
          status={status}
          editable={!!editorContext}
        />
      )}
      {renderNav()}
    </>
  );

  // Loading / error / empty for the chapter list itself.
  const renderBody = () => {
    if (isLoading) {
      return (
        <View style={styles.fullCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    if (error) {
      return (
        <ScrollView
          contentContainerStyle={styles.flexGrow}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => loadChapters('refresh')} tintColor={colors.primary} />
          }
        >
          <NotesErrorState message={error} onRetry={() => loadChapters('initial')} />
        </ScrollView>
      );
    }
    if (chapters.length === 0) {
      return (
        <ScrollView
          contentContainerStyle={styles.flexGrow}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => loadChapters('refresh')} tintColor={colors.primary} />
          }
        >
          <NotesEmptyState
            icon="documents-outline"
            title="No chapters yet"
            message="This subject does not have chapters to take notes on yet."
            testID="empty-chapters"
          />
        </ScrollView>
      );
    }
    return (
      <KeyboardShiftView
        style={styles.flex}
        iosKeyboardVerticalOffset={90}
      >
        <ChapterChips chapters={chapters} selectedId={selectedId} onSelect={selectChapter} />
        <View style={styles.flex}>{editorBlock(false)}</View>
      </KeyboardShiftView>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} testID="button-back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerEyebrow} numberOfLines={1}>
            {courseName ? `${courseName} · ` : ''}{subjectName || 'Subject'}
          </Text>
          <Text style={styles.headerTitle} numberOfLines={1}>Chapter notebook</Text>
        </View>
      </View>

      <View style={styles.flex}>{renderBody()}</View>

      {/* Fullscreen editor */}
      <Modal visible={fullscreen} animationType="slide" onRequestClose={() => setFullscreen(false)}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <KeyboardShiftView
            style={styles.flex}
          >
            <ChapterChips chapters={chapters} selectedId={selectedId} onSelect={selectChapter} />
            <View style={styles.flex}>{editorBlock(true)}</View>
          </KeyboardShiftView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  flex: {
    flex: 1,
  },
  flexGrow: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerEyebrow: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  headerTitle: {
    fontFamily: fontFamily.headingSemiBold,
    fontSize: fontSize.xl,
    color: colors.text,
  },
  selectedTitleWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  selectedTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  chapterIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chapterIndicatorText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toolbarBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  editorLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 200,
  },
  editorLoadingText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray100,
  },
  navBtnDisabled: {
    opacity: 0.5,
  },
  navBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.primary,
  },
  navBtnTextDisabled: {
    color: colors.textMuted,
  },
  fullCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
});
