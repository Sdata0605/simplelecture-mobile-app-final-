/**
 * NotesBookReader — the primary AI Study Notes reading surface.
 *
 * Responsibilities:
 * - Loads notes via useTopicNotes
 * - Shows ONE SECTION PER SCREEN: pages are merged so each section becomes a
 *   single vertically-scrollable screen; the reader moves horizontally
 *   between sections (swipe or Prev/Next buttons)
 * - Renders topic title, Contents button, Download PDF button, section indicator
 * - Delegates section rendering to AnimatedBookPager
 * - Handles loading, empty, and error states
 * - Manages PDF generation (expo-print, with KaTeX so math typesets) and
 *   download: Android saves straight to a user-granted folder (SAF); iOS
 *   uses the share sheet ("Save to Files")
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  AccessibilityInfo,
  Platform,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

import { useTopicNotes } from '../../../hooks/useTopicNotes';
import { NotePage } from '../../../types/topicNotes';
import { mergePagesIntoSectionPages } from '../../../utils/notePagination';
import { AnimatedBookPager, LayoutMode } from './AnimatedBookPager';
import { NotesContentsModal } from './NotesContentsModal';
import { NotePage as NotePageComponent } from './NotePage';
import { colors, spacing } from '../../../constants/theme';
import { sanitizePdfBaseName } from '../../../utils/pdfFileName';
import { stripEmbeddedOptions, extractImageTokens } from '../../../utils/questionText';
import { normalizeOptions, resolveCorrectAnswer } from '../../../utils/questionOptions';

// ---------------------------------------------------------------------------
// Layout helper
// ---------------------------------------------------------------------------

function getLayoutMode(width: number): LayoutMode {
  if (width >= 1024) return 'spread';
  if (width >= 768) return 'tablet';
  return 'phone';
}

// ---------------------------------------------------------------------------
// PDF generation & download
//
// expo-print creates the PDF. What happens next is platform-specific:
// - Android: save directly into a user-granted folder (Downloads by default)
//   via the Storage Access Framework. Only the very first save shows a
//   one-time folder picker; the granted folder is persisted in AsyncStorage
//   so later saves are silent. If the user denies folder access, we fall
//   back to the share sheet so the feature never dead-ends.
// - iOS: there is no public Downloads folder; the share sheet ("Save to
//   Files") IS the platform's save mechanism, so it stays.
// ---------------------------------------------------------------------------

const PDF_DIR_KEY = 'notes.pdfDirUri';

async function sharePdf(uri: string, topicTitle: string): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share ${topicTitle} Notes`,
      UTI: 'com.adobe.pdf',
    });
  } else {
    Alert.alert('Sharing unavailable', 'PDF was generated but sharing is not available on this device.');
  }
}

/**
 * Save the generated PDF into a user-granted folder on Android.
 * Returns the display file name on success, or null when the user
 * declined folder access (caller falls back to the share sheet).
 */
async function savePdfToDeviceAndroid(
  sourceUri: string,
  baseName: string,
): Promise<string | null> {
  const SAF = FileSystem.StorageAccessFramework;

  const base64 = await FileSystem.readAsStringAsync(sourceUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const writeTo = async (dirUri: string): Promise<void> => {
    const fileUri = await SAF.createFileAsync(dirUri, baseName, 'application/pdf');
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  };

  // Try the previously granted folder first (silent save).
  const savedDir = await AsyncStorage.getItem(PDF_DIR_KEY).catch(() => null);
  if (savedDir) {
    try {
      await writeTo(savedDir);
      return `${baseName}.pdf`;
    } catch {
      // Permission revoked or folder gone — forget it and re-prompt below.
      await AsyncStorage.removeItem(PDF_DIR_KEY).catch(() => {});
    }
  }

  // One-time folder picker, hinted at Downloads when supported.
  let initialUri: string | undefined;
  try {
    initialUri = SAF.getUriForDirectoryInRoot('Download');
  } catch {
    initialUri = undefined;
  }
  const perm = await SAF.requestDirectoryPermissionsAsync(initialUri);
  if (!perm.granted) return null;

  await AsyncStorage.setItem(PDF_DIR_KEY, perm.directoryUri).catch(() => {});
  await writeTo(perm.directoryUri);
  return `${baseName}.pdf`;
}

async function generateAndDownloadPdf(
  pages: NotePage[],
  topicTitle: string,
): Promise<void> {
  try {
    const html = buildPrintHtml(pages, topicTitle);
    const { uri } = await Print.printToFileAsync({ html });

    if (Platform.OS === 'android') {
      const savedName = await savePdfToDeviceAndroid(uri, sanitizePdfBaseName(topicTitle));
      if (savedName) {
        Alert.alert('PDF Downloaded', `"${savedName}" was saved to your phone.`);
        return;
      }
      // User declined folder access — explain, then offer the share sheet.
      Alert.alert(
        'Folder access needed',
        'To download directly, allow folder access next time. Opening the share options instead so you can still save the PDF.',
      );
    }

    await sharePdf(uri, topicTitle);
  } catch (err) {
    Alert.alert(
      'PDF Export Failed',
      err instanceof Error ? err.message : 'An error occurred while generating the PDF.',
    );
  }
}

/** Escape note text for embedding in the print HTML (element AND attribute safe). */
function escapePrintHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPrintHtml(pages: NotePage[], title: string): string {
  const pageHtml = pages
    .map((page) => {
      const calloutsHtml = page.callouts
        .map((c) => `<div class="callout callout-${c.type}"><strong>${c.type}:</strong> ${escapePrintHtml(c.text)}</div>`)
        .join('');
      const bulletsHtml =
        page.bullets.length > 0
          ? `<ul>${page.bullets.map((b) => `<li>${escapePrintHtml(b.text)}</li>`).join('')}</ul>`
          : '';
      const imagesHtml = page.images
        .map((img) => `<img src="${img.url}" style="max-width:100%;height:auto;margin:8px 0;" />`)
        .join('');
      // Valid http(s) image tokens become <img>; broken refs are dropped.
      const imgTags = (urls: string[]) =>
        urls
          .map((u) => `<img src="${escapePrintHtml(u)}" class="q-img" onerror="this.style.display='none'" />`)
          .join('');
      const questionHtml = (q: NotePage['questions']['important'][0], important: boolean) => {
        const qParts = extractImageTokens(stripEmbeddedOptions(q.question_text, q.options));
        const options = normalizeOptions(q.options).map((o) => ({
          ...o,
          ...extractImageTokens(o.text),
        }));
        const optionsHtml = options.length
          ? `<ul class="q-options">${options
              .map((o) => `<li><strong>${escapePrintHtml(o.key)}.</strong> ${escapePrintHtml(o.text)}${imgTags(o.images)}</li>`)
              .join('')}</ul>`
          : '';
        const answerParts = extractImageTokens(
          resolveCorrectAnswer(q.correct_answer, options.map((o) => ({ key: o.key, text: o.text }))),
        );
        const answerHtml = answerParts.text
          ? `<p class="q-answer"><strong>Answer:</strong> ${escapePrintHtml(answerParts.text)}</p>`
          : '';
        const expParts = extractImageTokens(q.explanation);
        const explanationHtml = expParts.text
          ? `<p class="q-explanation">${escapePrintHtml(expParts.text)}</p>`
          : '';
        return `<div class="q${important ? ' important' : ''}">
          ${qParts.text ? `<p>${important ? '★ ' : ''}${escapePrintHtml(qParts.text)}</p>` : ''}
          ${imgTags(qParts.images)}
          ${optionsHtml}${answerHtml}${imgTags(answerParts.images)}${explanationHtml}${imgTags(expParts.images)}
        </div>`;
      };
      const qHtml = [
        ...page.questions.important.map((q) => questionHtml(q, true)),
        ...page.questions.practice.map((q) => questionHtml(q, false)),
      ].join('');
      return `
        <div class="page">
          ${page.isFirstPageOfSection ? `<h2>${escapePrintHtml(page.sectionTitle)}</h2>` : `<h3>${escapePrintHtml(page.sectionTitle)} (continued)</h3>`}
          ${calloutsHtml}
          ${page.prose ? `<p>${escapePrintHtml(page.prose).replace(/\n\n/g, '</p><p>')}</p>` : ''}
          ${bulletsHtml}
          ${imagesHtml}
          ${qHtml}
        </div>`;
    })
    .join('<hr/>');

  // KaTeX scripts are loaded synchronously (plain <script src>), and the
  // render call runs inline at the end of <body>, so math is typeset before
  // the document's load event — which is what expo-print waits for.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>${escapePrintHtml(title)}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/mhchem.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
    <style>
      body { font-family: Georgia, serif; font-size: 14px; color: #1F2937; padding: 24px; max-width: 800px; margin: auto; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      h2 { font-size: 18px; color: #111827; margin-top: 24px; margin-bottom: 8px; }
      h3 { font-size: 14px; color: #6B7280; font-style: italic; }
      p { line-height: 1.7; margin-bottom: 10px; }
      ul { margin: 0 0 12px 20px; }
      li { line-height: 1.7; margin-bottom: 4px; }
      .callout { border-left: 3px solid #3B82F6; padding: 8px 12px; background: #EFF6FF; margin-bottom: 10px; border-radius: 4px; }
      .callout-formula { border-color: #8B5CF6; background: #F5F3FF; }
      .callout-equation { border-color: #10B981; background: #ECFDF5; }
      .q { background: #F9FAFB; border: 1px solid #E5E7EB; padding: 8px; border-radius: 4px; margin-bottom: 6px; }
      .q.important { background: #FFFBEB; border-color: #FBBF24; }
      .q p { margin-bottom: 4px; }
      .q-options { margin: 0 0 4px 20px; list-style: none; padding: 0; }
      .q-options li { line-height: 1.6; margin-bottom: 2px; }
      .q-answer { color: #059669; margin-bottom: 2px; }
      .q-explanation { color: #6B7280; font-size: 13px; margin-bottom: 0; }
      .q-img { display: block; max-width: 100%; height: auto; margin: 6px 0; }
      hr { border: none; border-top: 1px solid #E5E7EB; margin: 24px 0; }
      .page { margin-bottom: 24px; }
    </style>
  </head><body>
    <h1>${escapePrintHtml(title)} — Study Notes</h1>
    ${pageHtml}
    <script>
      if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.body, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\\\[', right: '\\\\]', display: true },
            { left: '\\\\(', right: '\\\\)', display: false }
          ],
          throwOnError: false,
          errorColor: '#cc0000',
          trust: false
        });
      }
    </script>
  </body></html>`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface NotesBookReaderProps {
  topicId?: string;
  chapterId?: string;
  subjectId?: string;
  topicTitle?: string;
}

export function NotesBookReader({
  topicId,
  topicTitle,
}: NotesBookReaderProps) {
  const [sectionIndex, setSectionIndex] = useState(0);
  const [contentsVisible, setContentsVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const { width } = Dimensions.get('window');
  const layoutMode = getLayoutMode(width);
  const insets = useSafeAreaInsets();

  const {
    loading,
    pages,
    sectionTitles,
    error,
    jobTitle,
    isEmpty,
    refetch,
  } = useTopicNotes(topicId);

  // One screen per SECTION: merge the paginated pages back into whole-section
  // pages. Each section scrolls vertically inside its screen; the pager moves
  // horizontally between sections.
  const sectionPages = useMemo(() => mergePagesIntoSectionPages(pages), [pages]);

  // Contents modal jumps map 1:1 to section indexes now.
  const sectionFirstPageIndexes = useMemo(
    () => sectionPages.map((_, i) => i),
    [sectionPages],
  );

  // Load preferences
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReducedMotion)
      .catch(() => {});
  }, []);

  // Clamp section index to valid range when sections change
  useEffect(() => {
    if (sectionPages.length > 0) {
      setSectionIndex((i) => Math.min(Math.max(i, 0), sectionPages.length - 1));
    }
  }, [sectionPages.length]);

  const safeSectionIndex = useMemo(
    () => Math.min(Math.max(sectionIndex, 0), Math.max(sectionPages.length - 1, 0)),
    [sectionIndex, sectionPages.length],
  );

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const goNext = useCallback(() => {
    setSectionIndex((i) => Math.min(i + 1, sectionPages.length - 1));
  }, [sectionPages.length]);

  const goPrev = useCallback(() => {
    setSectionIndex((i) => Math.max(i - 1, 0));
  }, []);

  const jumpTo = useCallback((idx: number) => {
    setSectionIndex(Math.min(Math.max(idx, 0), sectionPages.length - 1));
  }, [sectionPages.length]);

  // ---------------------------------------------------------------------------
  // PDF
  // ---------------------------------------------------------------------------

  const handleDownloadPdf = useCallback(async () => {
    if (pdfLoading || pages.length === 0) return;
    setPdfLoading(true);
    await generateAndDownloadPdf(pages, topicTitle ?? jobTitle ?? 'Study Notes');
    setPdfLoading(false);
  }, [pdfLoading, pages, topicTitle, jobTitle]);

  // ---------------------------------------------------------------------------
  // Section renderer for AnimatedBookPager
  // ---------------------------------------------------------------------------

  const renderPage = useCallback(
    (page: NotePage, _index: number) => (
      <NotePageComponent key={page.id} page={page} scrollable />
    ),
    [],
  );

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={s.loadingText}>Loading study notes…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={s.emptyTitle}>Could not load notes</Text>
        <Text style={s.emptyBody}>{error}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={refetch}>
          <Text style={s.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isEmpty || sectionPages.length === 0) {
    return (
      <View style={s.center}>
        <Ionicons name="document-text-outline" size={52} color={colors.gray300} />
        <Text style={s.emptyTitle}>No study notes yet</Text>
        <Text style={s.emptyBody}>
          Study notes are not available for this topic yet.
        </Text>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Full reader
  // ---------------------------------------------------------------------------

  const displayTitle = topicTitle ?? jobTitle ?? 'Study Notes';

  return (
    <View style={s.container}>
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity
          style={s.topBarBtn}
          onPress={() => setContentsVisible(true)}
          accessibilityLabel="Open contents"
        >
          <Ionicons name="list-outline" size={18} color={colors.primary} />
          <Text style={s.topBarBtnText}>Contents</Text>
        </TouchableOpacity>

        <Text style={s.topBarTitle} numberOfLines={1}>
          {displayTitle}
        </Text>

        <TouchableOpacity
          style={s.topBarBtn}
          onPress={handleDownloadPdf}
          disabled={pdfLoading}
          accessibilityLabel="Download PDF"
        >
          {pdfLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="download-outline" size={18} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* ── Section indicator ───────────────────────────────────────── */}
      <View style={s.pageIndicator}>
        <Text
          style={s.pageIndicatorText}
          accessibilityLabel={`Section ${safeSectionIndex + 1} of ${sectionPages.length}`}
        >
          {safeSectionIndex + 1} / {sectionPages.length}
        </Text>
        <Text style={s.sectionIndicatorText} numberOfLines={1}>
          {sectionPages[safeSectionIndex]?.sectionTitle ?? ''}
        </Text>
      </View>

      {/* ── Reader body — one section per screen, swipe horizontally ── */}
      <View style={s.readerBody}>
        <AnimatedBookPager
          pages={sectionPages}
          currentPageIndex={safeSectionIndex}
          onPageIndexChange={setSectionIndex}
          renderPage={renderPage}
          layoutMode={layoutMode}
          reducedMotion={reducedMotion}
        />
      </View>

      {/* ── Prev / Next below the note card ─────────────────────────── */}
      {/* Safe-area bottom inset keeps the bar above the system nav buttons
          even when Android re-lays the window edge-to-edge on resume. */}
      <View style={[s.navBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <TouchableOpacity
          style={[s.navBtn, safeSectionIndex === 0 && s.navBtnDisabled]}
          onPress={goPrev}
          disabled={safeSectionIndex === 0}
          accessibilityLabel="Previous section"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={safeSectionIndex === 0 ? colors.gray300 : colors.primary}
          />
          <Text
            style={[
              s.navBtnText,
              safeSectionIndex === 0 && s.navBtnTextDisabled,
            ]}
          >
            Previous
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            s.navBtn,
            s.navBtnRight,
            safeSectionIndex === sectionPages.length - 1 && s.navBtnDisabled,
          ]}
          onPress={goNext}
          disabled={safeSectionIndex === sectionPages.length - 1}
          accessibilityLabel="Next section"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text
            style={[
              s.navBtnText,
              safeSectionIndex === sectionPages.length - 1 && s.navBtnTextDisabled,
            ]}
          >
            Next
          </Text>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={
              safeSectionIndex === sectionPages.length - 1
                ? colors.gray300
                : colors.primary
            }
          />
        </TouchableOpacity>
      </View>

      {/* ── Contents modal ───────────────────────────────────────────── */}
      <NotesContentsModal
        visible={contentsVisible}
        sectionTitles={sectionTitles}
        sectionFirstPageIndexes={sectionFirstPageIndexes}
        currentPageIndex={safeSectionIndex}
        totalPages={sectionPages.length}
        onJump={jumpTo}
        onClose={() => setContentsVisible(false)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 21,
  },
  retryBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  topBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 72,
    paddingVertical: 6,
  },
  topBarBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginHorizontal: 4,
  },

  pageIndicator: {
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pageIndicatorText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  sectionIndicatorText: {
    fontSize: 10,
    color: colors.textMuted,
    maxWidth: '80%',
  },

  readerBody: { flex: 1 },

  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 88,
  },
  navBtnRight: { justifyContent: 'flex-end' },
  navBtnDisabled: { opacity: 0.4 },
  navBtnText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  navBtnTextDisabled: { color: colors.gray300 },
});
