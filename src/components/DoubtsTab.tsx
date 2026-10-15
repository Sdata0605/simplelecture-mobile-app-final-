import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  KeyboardScope,
  isKeyboardControlled,
  useKeyboardDrivenOffset,
} from './keyboard/keyboardStick';
import { supabase as supabaseService } from '../services/supabase';
import MathText, { buildKatexHtml } from './MathText';
import {
  containsLatex,
  convertMathpixToStandard,
  doubtsMarkdownToHtml,
  stripLatexToPlainText,
} from '../utils/latexFormat';
import DoubtThreadDrawer from './doubts/DoubtThreadDrawer';
import SlidePreviewPlayer from './doubts/SlidePreviewPlayer';
import RichTipText from './RichTipText';
import {
  DoubtThread,
  DoubtStoredMessage,
  DoubtSource,
  createThread,
  deriveTitle,
  loadThreads,
  saveThreads,
  sortThreads,
  mergeSuggestions,
} from '../utils/doubtThreads';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const colors = {
  primary: '#2BBD6E',
  primaryLight: '#DCFCE7',
  background: '#FFFFFF',
  white: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#6B7280',
  textLight: '#9CA3AF',
  border: '#E5E7EB',
  userBubble: '#2BBD6E',
  aiBubble: '#F3F4F6',
  error: '#EF4444',
};

type ChatMessage = DoubtStoredMessage;

interface DoubtsTabProps {
  subjectId: string;
  subjectName?: string;
  studentId?: string;
  onBeforeSend?: () => Promise<boolean>;
}

const formatMarkdown = (text: string) => {
  const lines = text.split('\n');
  const elements: { type: string; content: string; level?: number }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push({ type: 'spacer', content: '' });
    } else if (trimmed.startsWith('### ')) {
      elements.push({ type: 'h3', content: trimmed.slice(4) });
    } else if (trimmed.startsWith('## ')) {
      elements.push({ type: 'h2', content: trimmed.slice(3) });
    } else if (trimmed.startsWith('# ')) {
      elements.push({ type: 'h1', content: trimmed.slice(2) });
    } else if (trimmed.match(/^[-*•]\s/)) {
      elements.push({ type: 'bullet', content: trimmed.slice(2) });
    } else if (trimmed.match(/^\d+\.\s/)) {
      const match = trimmed.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push({ type: 'numbered', content: match[2], level: parseInt(match[1]) });
      }
    } else {
      elements.push({ type: 'text', content: trimmed });
    }
  }

  return elements;
};

const renderFormattedText = (text: string) => {
  const parts: { text: string; bold: boolean }[] = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    parts.push({ text: match[1], bold: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), bold: false });
  }

  return parts.map((part, i) => (
    <Text key={i} style={part.bold ? { fontWeight: '700' } : undefined}>{part.text}</Text>
  ));
};

const AIMessageContent = ({ content }: { content: string }) => {
  const elements = formatMarkdown(content);

  return (
    <View>
      {elements.map((el, i) => {
        switch (el.type) {
          case 'h1':
            return <Text key={i} style={mdStyles.h1}>{renderFormattedText(el.content)}</Text>;
          case 'h2':
            return <Text key={i} style={mdStyles.h2}>{renderFormattedText(el.content)}</Text>;
          case 'h3':
            return <Text key={i} style={mdStyles.h3}>{renderFormattedText(el.content)}</Text>;
          case 'bullet':
            return (
              <View key={i} style={mdStyles.bulletRow}>
                <Text style={mdStyles.bulletDot}>•</Text>
                <Text style={mdStyles.bulletText}>{renderFormattedText(el.content)}</Text>
              </View>
            );
          case 'numbered':
            return (
              <View key={i} style={mdStyles.bulletRow}>
                <Text style={mdStyles.numberedNum}>{el.level}.</Text>
                <Text style={mdStyles.bulletText}>{renderFormattedText(el.content)}</Text>
              </View>
            );
          case 'spacer':
            return <View key={i} style={{ height: 6 }} />;
          default:
            return <Text key={i} style={mdStyles.body}>{renderFormattedText(el.content)}</Text>;
        }
      })}
    </View>
  );
};

// Width the KaTeX WebView renders at: bubble max width minus its padding.
const MATH_CONTENT_WIDTH = SCREEN_WIDTH * 0.92 - 28;

/**
 * Assistant bubble content for answers that contain LaTeX. Renders the whole
 * message (markdown structure + math) in ONE KaTeX WebView, auto-sized to its
 * content. Falls back to the native plain-text renderer (with LaTeX stripped)
 * if the WebView never reports a height.
 */
const MathMessageContent = memo(({ content }: { content: string }) => {
  const [height, setHeight] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const html = useMemo(
    () => buildKatexHtml(doubtsMarkdownToHtml(convertMathpixToStandard(content)), colors.text),
    [content]
  );

  // Reset measurement whenever the rendered content changes (e.g. a reused
  // component instance after a thread switch) so stale heights never leak.
  useEffect(() => {
    setHeight(0);
    setTimedOut(false);
    timerRef.current = setTimeout(() => setTimedOut(true), 4000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [html]);

  const onMessage = useCallback((event: any) => {
    const h = parseInt(event.nativeEvent.data, 10);
    if (h && h > 0) {
      setHeight(h);
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  }, []);

  if (timedOut && height <= 0) {
    return <AIMessageContent content={stripLatexToPlainText(convertMathpixToStandard(content))} />;
  }

  return (
    <View style={{ width: MATH_CONTENT_WIDTH, height: height > 0 ? height : 48, overflow: 'hidden' }}>
      {height <= 0 && (
        <View style={mathStyles.loading}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={mathStyles.webView}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={onMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scalesPageToFit={false}
        cacheEnabled={true}
        startInLoadingState={false}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(request) =>
          // Only the inline HTML document itself may load; block any
          // navigation away (links, redirects) from untrusted AI content.
          request.url === 'about:blank' || request.url.startsWith('data:')
        }
      />
    </View>
  );
});

/** Chooses the WebView math renderer only when the answer needs it. */
const AssistantMessage = ({ content }: { content: string }) => {
  const needsMath = useMemo(() => containsLatex(convertMathpixToStandard(content)), [content]);
  return needsMath ? <MathMessageContent content={content} /> : <AIMessageContent content={content} />;
};

/** Suggestion chips are plain Text — clean any math noise for display only. */
const chipLabel = (text: string) => {
  const normalized = convertMathpixToStandard(text);
  return containsLatex(normalized) ? stripLatexToPlainText(normalized) : text;
};

/** Bulleted highlights under the answer. Math-aware per point. */
const KeyPointsList = ({ items }: { items: string[] }) => (
  <View style={kpStyles.container}>
    <Text style={kpStyles.heading}>Key points</Text>
    {items.map((point, i) => (
      <View key={i} style={kpStyles.row}>
        <Text style={kpStyles.dot}>•</Text>
        <View style={kpStyles.textWrap}>
          {/* MathText sizes itself to the available width, so LaTeX in key
              points renders correctly inside this narrower block. */}
          <MathText
            content={convertMathpixToStandard(point)}
            color={colors.text}
            textStyle={{ fontSize: 13, lineHeight: 19 }}
          />
        </View>
      </View>
    ))}
  </View>
);

/**
 * Small titled card for the optional exam-tip / real-life-example fields.
 * Math-aware: the content may contain bold text or LaTeX formulas.
 */
const InfoCard = ({ icon, title, content }: { icon: any; title: string; content: string }) => (
  <View style={kpStyles.container}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Ionicons name={icon} size={13} color={colors.primary} />
      <Text style={kpStyles.heading}>{title}</Text>
    </View>
    <RichTipText content={convertMathpixToStandard(content)} />
  </View>
);

/** Small "Doc title · Section" pills. Hidden when empty (caller checks). */
const SourceChips = ({ sources }: { sources: DoubtSource[] }) => (
  <View style={srcStyles.container}>
    {sources.map((s, i) => (
      <View key={i} style={srcStyles.chip}>
        <Ionicons name="document-text-outline" size={11} color={colors.textSecondary} />
        <Text style={srcStyles.chipText} numberOfLines={1}>
          {[s.docTitle, s.sectionTitle].filter(Boolean).join(' · ')}
        </Text>
      </View>
    ))}
  </View>
);

const TypingIndicator = () => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={[styles.messageBubble, styles.aiBubble]}>
      <Text style={styles.typingText}>Thinking{dots}</Text>
    </View>
  );
};

const INPUT_BAR_HEIGHT = 56;

/**
 * Wrapper: the keyboard-controller provider is mounted locally (not app-wide)
 * so the rest of the app keeps its existing native keyboard behavior. While
 * this tab is mounted, the library takes over keyboard handling and reports
 * the real keyboard height on every device — including Android phones where
 * the native "resize" mode is ignored (edge-to-edge / OEM skins), which used
 * to leave the input hidden behind the keyboard.
 */
export default function DoubtsTab(props: DoubtsTabProps) {
  return (
    <KeyboardScope>
      <DoubtsTabInner {...props} keyboardControlled={isKeyboardControlled} />
    </KeyboardScope>
  );
}

function DoubtsTabInner({
  subjectId,
  subjectName,
  studentId,
  onBeforeSend,
  keyboardControlled,
}: DoubtsTabProps & { keyboardControlled: boolean }) {
  const [threads, setThreads] = useState<DoubtThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Real-time keyboard offset (shared value) driving the input bar position.
  const keyboardOffset = useKeyboardDrivenOffset(keyboardControlled);
  const inputBarAnimatedStyle = useAnimatedStyle(() => ({
    bottom: keyboardOffset.value,
  }));
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  // Guards against a slow load for a previous subject clobbering the current one.
  const subjectRef = useRef(subjectId);
  subjectRef.current = subjectId;

  // Rehydrate threads whenever the subject changes; select the most recent.
  useEffect(() => {
    let cancelled = false;
    setThreads([]);
    setActiveThreadId(null);
    setInputText('');
    setDrawerVisible(false);
    if (!subjectId) return;
    (async () => {
      const loaded = await loadThreads(subjectId);
      if (cancelled || subjectRef.current !== subjectId) return;
      setThreads(loaded);
      setActiveThreadId(loaded.length > 0 ? loaded[0].id : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );
  const messages: ChatMessage[] = activeThread?.messages ?? [];

  /** Update thread state and persist in one step. */
  const commitThreads = (next: DoubtThread[]) => {
    const sorted = sortThreads(next);
    setThreads(sorted);
    saveThreads(subjectId, sorted);
    return sorted;
  };

  const handleNewThread = () => {
    const thread = createThread();
    commitThreads([thread, ...threads]);
    setActiveThreadId(thread.id);
    setDrawerVisible(false);
    setInputText('');
  };

  const handleSelectThread = (threadId: string) => {
    setActiveThreadId(threadId);
    setDrawerVisible(false);
    scrollToBottom();
  };

  const handleDeleteThread = (threadId: string) => {
    const remaining = threads.filter((t) => t.id !== threadId);
    const sorted = commitThreads(remaining);
    if (activeThreadId === threadId) {
      setActiveThreadId(sorted.length > 0 ? sorted[0].id : null);
    }
  };

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      if (!keyboardControlled) {
        // Legacy fallback (Expo Go): lift manually on iOS only; Android
        // relies on the native window resize.
        keyboardOffset.value = Platform.OS === 'ios' ? e.endCoordinates.height : 0;
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      if (!keyboardControlled) {
        keyboardOffset.value = 0;
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  useEffect(() => {
    if (keyboardHeight > 0) {
      scrollToBottom();
    }
  }, [keyboardHeight]);

  const sendQuestion = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || isLoading) return;

    if (onBeforeSend) {
      const allowed = await onBeforeSend();
      if (!allowed) return;
    }

    // Snapshot everything before any optimistic change so we can fully roll
    // back (thread list, titles, chips) on failure — including persistence.
    const prevThreads = threads;
    const prevActiveId = activeThreadId;
    // Bind this request to the subject it was sent for. If the user switches
    // subjects while the request is in flight, the late completion must only
    // touch the OLD subject's storage — never the new subject's UI state.
    const sendSubjectId = subjectId;
    const isCurrentSubject = () => subjectRef.current === sendSubjectId;

    // Send into the active thread, or create one on the fly (fresh install /
    // all threads deleted).
    const now = Date.now();
    const target: DoubtThread = activeThread ?? createThread(now);
    const userMessage: DoubtStoredMessage = { role: 'user', content: question };
    // Optimistically add the user bubble and clear suggestion chips + slide
    // previews from earlier assistant replies (only the newest reply shows them).
    const optimisticMessages = [
      ...target.messages.map((m) => ({ ...m, suggestions: undefined, slidePreview: undefined })),
      userMessage,
    ];
    const optimisticThread: DoubtThread = {
      ...target,
      messages: optimisticMessages,
      title: deriveTitle(target.title, optimisticMessages),
      updatedAt: now,
    };
    const withoutTarget = prevThreads.filter((t) => t.id !== target.id);
    commitThreads([optimisticThread, ...withoutTarget]);
    if (activeThreadId !== target.id) setActiveThreadId(target.id);
    setInputText('');
    setIsLoading(true);
    scrollToBottom();

    const rollback = () => {
      if (isCurrentSubject()) {
        commitThreads(prevThreads);
        setActiveThreadId(prevActiveId);
        setInputText(question);
      } else {
        // Subject changed mid-flight: undo the optimistic write in the old
        // subject's storage only; leave the current subject's UI untouched.
        saveThreads(sendSubjectId, prevThreads);
      }
    };

    try {
      // AI answer and DB similar-question matches run in parallel; the RPC is
      // best-effort and never blocks or fails the answer path.
      const [result, dbMatches] = await Promise.all([
        supabaseService.askAITextAnswer({
          question,
          subjectId,
          subjectName,
        }),
        supabaseService.findSimilarQuestions(question, subjectId),
      ]);

      if (result.ok || result.reason === 'no_content') {
        let assistantMessage: DoubtStoredMessage;
        if (result.ok) {
          const merged = mergeSuggestions(dbMatches, result.data.suggestions, 6);
          assistantMessage = {
            role: 'assistant',
            content: result.data.answer,
            suggestions: merged.length > 0 ? merged : undefined,
            keyPoints: result.data.keyPoints.length > 0 ? result.data.keyPoints : undefined,
            sources: result.data.sources.length > 0 ? result.data.sources : undefined,
            slidePreview: result.data.slidePreview ?? undefined,
            examTip: result.data.examTip,
            realLifeExample: result.data.realLifeExample,
          };
        } else {
          // Not in the course corpus — a normal assistant reply, not an error.
          assistantMessage = {
            role: 'assistant',
            content:
              result.message ||
              "This question doesn't seem to be part of your course. Please try the Forum for general questions.",
            noContent: true,
          };
        }
        if (isCurrentSubject()) {
          setThreads((current) => {
            const next = current.map((t) =>
              t.id === target.id
                ? { ...t, messages: [...t.messages, assistantMessage], updatedAt: Date.now() }
                : t
            );
            const sorted = sortThreads(next);
            saveThreads(sendSubjectId, sorted);
            return sorted;
          });
        } else {
          // Subject changed mid-flight: append the answer to the old
          // subject's storage only, so it's there when the user returns.
          const stored = await loadThreads(sendSubjectId);
          await saveThreads(
            sendSubjectId,
            stored.map((t) =>
              t.id === target.id
                ? { ...t, messages: [...t.messages, assistantMessage], updatedAt: Date.now() }
                : t
            )
          );
        }
      } else {
        // Roll back to the pre-send conversation (restores prior chips) and text.
        rollback();
        if (isCurrentSubject()) {
          Alert.alert('Error', result.message || 'Could not get a response. Please try again.');
        }
      }
    } catch {
      rollback();
      if (isCurrentSubject()) {
        Alert.alert('Error', 'Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  };

  const handleSend = () => sendQuestion(inputText);

  if (!subjectId) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textLight} />
        <Text style={styles.emptyTitle}>No Subject Selected</Text>
        <Text style={styles.emptyText}>Please select a subject to ask doubts.</Text>
      </View>
    );
  }

  const isKeyboardOpen = keyboardHeight > 0;
  const inputBottomPadding = isKeyboardOpen ? 4 : Math.max(insets.bottom, 8);
  // With the keyboard-controller provider active the window no longer resizes
  // on any platform, so when the keyboard is open the scroll content must also
  // clear the keyboard itself, not just the (lifted) input bar. In the legacy
  // fallback the window still resizes natively, so no extra padding.
  const scrollPaddingBottom =
    INPUT_BAR_HEIGHT + inputBottomPadding + 8 + (keyboardControlled ? keyboardHeight : 0);

  return (
    <View style={styles.container}>
      <View style={styles.threadHeader}>
        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => setDrawerVisible(true)}
          accessibilityLabel="Open doubt history"
          testID="button-open-history"
        >
          <Ionicons name="time-outline" size={17} color={colors.primary} />
          <Text style={styles.historyButtonText}>History</Text>
        </TouchableOpacity>
        <Text style={styles.threadHeaderTitle} numberOfLines={1}>
          {activeThread ? activeThread.title : 'New doubt'}
        </Text>
        <TouchableOpacity
          style={styles.headerNewButton}
          onPress={handleNewThread}
          accessibilityLabel="Start a new doubt"
          testID="button-header-new-doubt"
        >
          <Ionicons name="add" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {messages.length === 0 ? (
        <ScrollView
          style={styles.messagesContainer}
          contentContainerStyle={[styles.welcomeScrollContent, { paddingBottom: scrollPaddingBottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.welcomeInner}>
            <View style={styles.welcomeIcon}>
              <Ionicons name="chatbubbles" size={40} color={colors.primary} />
            </View>
            <Text style={styles.welcomeTitle}>Ask Your Doubts</Text>
            <Text style={styles.welcomeSubtitle}>
              Ask anything about your lectures — AI will answer based on your course content.
            </Text>
            <View style={styles.suggestionContainer}>
              {['Explain the key concepts', 'Summarize the important formulas', 'Give me practice questions'].map((suggestion, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.suggestionChip}
                  onPress={() => {
                    setInputText(suggestion);
                  }}
                  testID={`button-suggestion-${i}`}
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={[styles.messagesContent, { paddingBottom: scrollPaddingBottom }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((msg, index) => (
            // Scope keys to the thread so stateful math bubbles (WebView
            // height measurement) never inherit state across thread switches.
            <View key={`${activeThreadId ?? 'none'}:${index}`}>
              <View
                style={[
                  styles.messageRow,
                  msg.role === 'user' ? styles.userRow : styles.aiRow,
                ]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    msg.role === 'user' ? styles.userBubble : styles.aiBubble,
                  ]}
                >
                  {msg.role === 'user' ? (
                    <Text style={styles.userText}>{msg.content}</Text>
                  ) : (
                    <View>
                      <AssistantMessage content={msg.content} />
                      {!msg.noContent && msg.keyPoints && msg.keyPoints.length > 0 && (
                        <KeyPointsList items={msg.keyPoints} />
                      )}
                      {!msg.noContent && msg.sources && msg.sources.length > 0 && (
                        <SourceChips sources={msg.sources} />
                      )}
                      {!msg.noContent &&
                        msg.slidePreview &&
                        index === messages.length - 1 &&
                        !isLoading && <SlidePreviewPlayer preview={msg.slidePreview} />}
                      {!msg.noContent && !!msg.examTip?.trim() && (
                        <InfoCard icon="school" title="Exam tip" content={msg.examTip} />
                      )}
                      {!msg.noContent && !!msg.realLifeExample?.trim() && (
                        <InfoCard icon="earth" title="Real-life example" content={msg.realLifeExample} />
                      )}
                    </View>
                  )}
                </View>
              </View>
              {msg.role === 'assistant' &&
                msg.suggestions &&
                msg.suggestions.length > 0 &&
                index === messages.length - 1 &&
                !isLoading && (
                  <View style={styles.followupContainer}>
                    {msg.suggestions.map((suggestion, si) => (
                      <TouchableOpacity
                        key={si}
                        style={styles.followupChip}
                        onPress={() => sendQuestion(suggestion)}
                        testID={`button-followup-${si}`}
                      >
                        <Ionicons name="sparkles-outline" size={13} color={colors.primary} />
                        <Text style={styles.followupText}>{chipLabel(suggestion)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
            </View>
          ))}
          {isLoading && (
            <View style={[styles.messageRow, styles.aiRow]}>
              <TypingIndicator />
            </View>
          )}
        </ScrollView>
      )}

      <Reanimated.View style={[styles.inputContainer, inputBarAnimatedStyle, { paddingBottom: inputBottomPadding }]}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask a doubt..."
            placeholderTextColor={colors.textLight}
            multiline
            maxLength={2000}
            editable={!isLoading}
            blurOnSubmit={false}
            testID="input-doubt-text"
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}
            testID="button-send-doubt"
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="send" size={18} color={colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </Reanimated.View>

      <DoubtThreadDrawer
        visible={drawerVisible}
        threads={threads}
        activeThreadId={activeThreadId}
        onClose={() => setDrawerVisible(false)}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        onDeleteThread={handleDeleteThread}
      />
    </View>
  );
}

const kpStyles = StyleSheet.create({
  container: {
    marginTop: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  dot: {
    fontSize: 13,
    color: colors.primary,
    marginRight: 6,
    lineHeight: 20,
    fontWeight: '700',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
});

const srcStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    maxWidth: SCREEN_WIDTH * 0.8,
  },
  chipText: {
    fontSize: 11,
    color: colors.textSecondary,
    flexShrink: 1,
  },
});

const mathStyles = StyleSheet.create({
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

const mdStyles = StyleSheet.create({
  h1: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6, marginTop: 4 },
  h2: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4, marginTop: 4 },
  h3: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 3, marginTop: 3 },
  body: { fontSize: 13.5, lineHeight: 20, color: colors.text },
  bulletRow: { flexDirection: 'row', marginBottom: 3, paddingRight: 8 },
  bulletDot: { fontSize: 13.5, color: colors.primary, marginRight: 6, lineHeight: 20, fontWeight: '700' },
  numberedNum: { fontSize: 13.5, color: colors.primary, marginRight: 6, lineHeight: 20, fontWeight: '600', minWidth: 16 },
  bulletText: { flex: 1, fontSize: 13.5, lineHeight: 20, color: colors.text },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  historyButtonText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.primary,
  },
  threadHeaderTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  headerNewButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textLight,
    marginTop: 6,
    textAlign: 'center',
  },
  welcomeScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 20,
  },
  welcomeInner: {
    alignItems: 'center',
  },
  welcomeIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  suggestionContainer: {
    width: '100%',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  suggestionText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
  },
  followupContainer: {
    alignItems: 'flex-start',
    gap: 8,
    marginTop: -4,
    marginBottom: 12,
    maxWidth: '92%',
  },
  followupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  followupText: {
    fontSize: 12.5,
    color: colors.primary,
    fontWeight: '500',
    flexShrink: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
    maxWidth: '85%',
  },
  userRow: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  aiRow: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 2,
  },
  aiAvatarSmall: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  messageBubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: SCREEN_WIDTH * 0.92,
  },
  userBubble: {
    backgroundColor: colors.userBubble,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: colors.aiBubble,
    borderBottomLeftRadius: 4,
    flexDirection: 'column',
  },
  userText: {
    fontSize: 14,
    color: colors.white,
    lineHeight: 20,
  },
  typingText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  inputContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    maxHeight: 100,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.textLight,
    opacity: 0.6,
  },
});
