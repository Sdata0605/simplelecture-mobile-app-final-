import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MathText from '../../MathText';
import {
  useImportantNotes,
  buildBookPages,
  getImageUrl,
  getQuestionText,
  getFormulaText,
  type BookPage,
  type SectionBookPage,
  type ImportantNoteAnswer,
  type ImportantNoteQuestion,
  type ImportantTopicNotes,
} from '../../../hooks/useImportantNotes';

/**
 * Important Notes — React Native port of the web app's
 * `components/learning/notes/ImportantNotesTab.tsx`.
 *
 * Same data, same pagination (buildBookPages is shared logic ported into
 * hooks/useImportantNotes), and the same book-styled reading UI: a parchment
 * header, then one "page" at a time — lesson sections, a formula reference
 * page, then practice questions — with page controls at the bottom.
 *
 * Text runs through MathText so LaTeX in notes/answers typesets; MathText only
 * spins up a KaTeX WebView when the string actually contains LaTeX, so plain
 * prose stays cheap native <Text>.
 */

// Palette lifted from the web tab so both platforms read identically.
const C = {
  parchment: '#f5f0df',
  emerald900: '#064e3b',
  emerald950: '#022c22',
  emerald800: '#065f46',
  emerald600: '#059669',
  emerald100: '#d1fae5',
  emerald50: '#ecfdf5',
  amber600: '#d97706',
  amber200: '#fde68a',
  amber50: '#fffbeb',
  amber950: '#451a03',
  stone800: '#292524',
  stone700: '#44403c',
  stone500: '#78716c',
  border: 'rgba(6, 78, 59, 0.12)',
  white: '#ffffff',
};

const Md = ({
  children,
  color = C.stone700,
  size = 13.5,
}: {
  children?: string;
  color?: string;
  size?: number;
}) => (
  <MathText content={children || ''} color={color} textStyle={{ fontSize: size, lineHeight: size * 1.5 }} />
);

// ---------------------------------------------------------------------------
// Question card — collapsible answer, mirrors the web QuestionCard
// ---------------------------------------------------------------------------

const QuestionCard = ({
  question,
  answer,
  index,
}: {
  question: ImportantNoteQuestion;
  answer?: ImportantNoteAnswer;
  index: number;
}) => {
  const [open, setOpen] = useState(false);
  const options = Object.entries(question.options || {});
  const formulas = (answer?.formulas_used || []).map(getFormulaText).filter(Boolean);

  return (
    <View style={styles.qCard}>
      <View style={styles.qRow}>
        <View style={styles.qNumber}>
          <Text style={styles.qNumberText}>{index + 1}</Text>
        </View>
        <View style={styles.qBody}>
          <Md color={C.stone800}>{getQuestionText(question)}</Md>

          {options.length > 0 && (
            <View style={styles.qOptions}>
              {options.map(([key, option]) => {
                const text = typeof option === 'string' ? option : option?.text;
                return (
                  <View key={key} style={styles.qOption}>
                    <Text style={styles.qOptionKey}>{key}.</Text>
                    <View style={styles.qOptionText}>
                      <Md size={12.5}>{text}</Md>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {!!answer?.answer && (
            <>
              <TouchableOpacity
                style={styles.qToggle}
                onPress={() => setOpen((v) => !v)}
                data-testid={`button-toggle-answer-${index}`}
              >
                <Text style={styles.qToggleText}>{open ? 'Hide answer' : 'Show answer'}</Text>
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color={C.emerald800}
                />
              </TouchableOpacity>

              {open && (
                <View style={styles.qAnswer}>
                  <Md>{answer.answer}</Md>

                  {(answer.key_points?.length || 0) > 0 && (
                    <View style={styles.qKeyPoints}>
                      <View style={styles.qKeyPointsHead}>
                        <Ionicons name="list-outline" size={14} color={C.emerald800} />
                        <Text style={styles.qKeyPointsTitle}>KEY POINTS</Text>
                      </View>
                      {answer.key_points!.map((point, i) => (
                        <View key={i} style={styles.bulletRow}>
                          <Ionicons
                            name="checkmark-circle"
                            size={15}
                            color={C.emerald600}
                            style={styles.bulletIcon}
                          />
                          <View style={styles.bulletBody}>
                            <Md size={12.5}>{point}</Md>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {formulas.length > 0 && (
                    <View style={styles.qFormulas}>
                      {formulas.map((formula, i) => (
                        <MathText
                          key={i}
                          content={formula}
                          mathOnly
                          color={C.stone800}
                          textStyle={{ fontSize: 13 }}
                        />
                      ))}
                    </View>
                  )}

                  {(answer.answer_images?.length || 0) > 0 && (
                    <View style={styles.qImages}>
                      {answer.answer_images!.map((image, i) => {
                        const uri = getImageUrl(image);
                        if (!uri) return null;
                        return (
                          <Image
                            key={`${uri}-${i}`}
                            source={{ uri }}
                            style={styles.qImage}
                            resizeMode="contain"
                          />
                        );
                      })}
                    </View>
                  )}

                  {!!answer.memory_tip && (
                    <View style={styles.tipBox}>
                      <Ionicons name="bulb-outline" size={15} color={C.amber600} />
                      <View style={styles.tipBody}>
                        <Text style={styles.tipTitle}>Memory tip</Text>
                        <Md color={C.amber950} size={12.5}>{answer.memory_tip}</Md>
                      </View>
                    </View>
                  )}

                  {!!answer.estimated_study_time && (
                    <View style={styles.studyTime}>
                      <Ionicons name="time-outline" size={13} color={C.stone500} />
                      <Text style={styles.studyTimeText}>
                        Estimated study time: {answer.estimated_study_time}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Page bodies
// ---------------------------------------------------------------------------

const SectionPageView = ({ page }: { page: SectionBookPage }) => {
  const [activeImage, setActiveImage] = useState(0);
  const { width } = useWindowDimensions();
  const image = page.images[activeImage];
  const imageDescription = page.section.image_descriptions?.[activeImage];
  const imageUri = getImageUrl(image);

  return (
    <View>
      <Text style={styles.eyebrow}>
        LESSON {String(page.sectionIndex + 1).padStart(2, '0')}
      </Text>
      <Text style={styles.sectionHeading}>
        {page.section.heading || `Section ${page.sectionIndex + 1}`}
      </Text>

      {!!page.section.explanation && (
        <View style={styles.explanation}>
          <Md>{page.section.explanation}</Md>
        </View>
      )}

      {(page.section.key_points?.length || 0) > 0 && (
        <View style={styles.rememberBox}>
          <View style={styles.rememberHead}>
            <Ionicons name="list-outline" size={15} color={C.emerald800} />
            <Text style={styles.rememberTitle}>Remember</Text>
          </View>
          {page.section.key_points!.map((point, i) => (
            <View key={i} style={styles.bulletRow}>
              <Ionicons
                name="checkmark-circle"
                size={15}
                color={C.emerald600}
                style={styles.bulletIcon}
              />
              <View style={styles.bulletBody}>
                <Md size={12.5}>{point}</Md>
              </View>
            </View>
          ))}
        </View>
      )}

      {!!imageUri && (
        <View style={styles.visual}>
          {/* Taped-photo frame, same idea as the web .important-book-photo-frame */}
          <View style={styles.photoFrame}>
            <View style={[styles.tape, styles.tapeLeft]} />
            <View style={[styles.tape, styles.tapeRight]} />
            <Image
              source={{ uri: imageUri }}
              style={[styles.photo, { height: Math.min(260, width * 0.55) }]}
              resizeMode="contain"
            />
          </View>
          {!!imageDescription && <Text style={styles.caption}>{imageDescription}</Text>}

          {page.images.length > 1 && (
            <View style={styles.imageNav}>
              <TouchableOpacity
                style={styles.imageNavBtn}
                onPress={() =>
                  setActiveImage((c) => (c === 0 ? page.images.length - 1 : c - 1))
                }
                accessibilityLabel="Previous illustration"
              >
                <Ionicons name="chevron-back" size={16} color={C.emerald900} />
              </TouchableOpacity>
              <View style={styles.imageDots}>
                {page.images.map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setActiveImage(i)}
                    accessibilityLabel={`Show illustration ${i + 1}`}
                    style={[styles.imageDot, i === activeImage && styles.imageDotActive]}
                  />
                ))}
              </View>
              <TouchableOpacity
                style={styles.imageNavBtn}
                onPress={() =>
                  setActiveImage((c) => (c === page.images.length - 1 ? 0 : c + 1))
                }
                accessibilityLabel="Next illustration"
              >
                <Ionicons name="chevron-forward" size={16} color={C.emerald900} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const ReferenceTitle = ({
  icon,
  eyebrow,
  title,
}: {
  icon: any;
  eyebrow: string;
  title: string;
}) => (
  <View style={styles.refTitle}>
    <View style={styles.refIcon}>
      <Ionicons name={icon} size={17} color={C.white} />
    </View>
    <View>
      <Text style={styles.refEyebrow}>{eyebrow}</Text>
      <Text style={styles.refHeading}>{title}</Text>
    </View>
  </View>
);

// ---------------------------------------------------------------------------
// The book itself
// ---------------------------------------------------------------------------

const TopicNotesBook = ({ topic }: { topic: ImportantTopicNotes }) => {
  const pages = useMemo(() => buildBookPages(topic), [topic]);
  const [pageIndex, setPageIndex] = useState(0);
  const answersByQuestion = useMemo(
    () => new Map((topic.question_answers || []).map((a) => [a.question_id, a])),
    [topic.question_answers],
  );

  const page: BookPage | undefined = pages[pageIndex];

  if (!page) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>
          This topic does not have any generated note pages yet.
        </Text>
      </View>
    );
  }

  const turnPage = (next: number) => {
    if (next < 0 || next >= pages.length || next === pageIndex) return;
    setPageIndex(next);
  };

  return (
    <View style={styles.bookShell}>
      <View style={styles.spine} />
      <View style={styles.page}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageHeaderText} numberOfLines={1}>
            {topic.topic_title || 'Important Notes'}
          </Text>
          <Text style={styles.pageHeaderNum}>Page {pageIndex + 1}</Text>
        </View>

        <View style={styles.pageContent}>
          {page.kind === 'section' && <SectionPageView page={page} />}

          {page.kind === 'formulas' && (
            <View>
              <ReferenceTitle icon="sparkles" eyebrow="Quick reference" title="Important formulas" />
              <View style={styles.formulaList}>
                {page.formulas.map((formula, i) => (
                  <View key={i} style={styles.formulaItem}>
                    <MathText
                      content={formula}
                      mathOnly
                      color={C.stone800}
                      textStyle={{ fontSize: 14 }}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}

          {page.kind === 'questions' && (
            <View>
              <ReferenceTitle icon="school-outline" eyebrow="Test yourself" title="Important questions" />
              <View style={{ gap: 12 }}>
                {page.questions.map((question, i) => (
                  <QuestionCard
                    key={question.id || i}
                    question={question}
                    answer={answersByQuestion.get(question.id)}
                    index={page.startIndex + i}
                  />
                ))}
              </View>
            </View>
          )}
        </View>

        <Text style={styles.pageNumber}>{pageIndex + 1}</Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.navBtn, pageIndex === 0 && styles.navBtnDisabled]}
          onPress={() => turnPage(pageIndex - 1)}
          disabled={pageIndex === 0}
          data-testid="button-prev-page"
        >
          <Ionicons
            name="arrow-back"
            size={15}
            color={pageIndex === 0 ? C.stone500 : C.emerald900}
          />
          <Text style={[styles.navBtnText, pageIndex === 0 && styles.navBtnTextDisabled]}>
            Previous
          </Text>
        </TouchableOpacity>

        <View style={styles.progress}>
          <Text style={styles.progressText}>
            {pageIndex + 1} of {pages.length}
          </Text>
          <View style={styles.dots}>
            {pages.map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => turnPage(i)}
                accessibilityLabel={`Open page ${i + 1}`}
                style={[styles.dot, i === pageIndex && styles.dotActive]}
              />
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.navBtn,
            styles.navBtnPrimary,
            pageIndex === pages.length - 1 && styles.navBtnDisabled,
          ]}
          onPress={() => turnPage(pageIndex + 1)}
          disabled={pageIndex === pages.length - 1}
          data-testid="button-next-page"
        >
          <Text
            style={[
              styles.navBtnText,
              styles.navBtnTextPrimary,
              pageIndex === pages.length - 1 && styles.navBtnTextDisabled,
            ]}
          >
            Next
          </Text>
          <Ionicons
            name="arrow-forward"
            size={15}
            color={pageIndex === pages.length - 1 ? C.stone500 : C.white}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Tab entry point
// ---------------------------------------------------------------------------

interface ImportantNotesTabProps {
  chapterId?: string | null;
  topicId?: string | null;
  topicTitle?: string;
}

export default function ImportantNotesTab({
  chapterId,
  topicId,
  topicTitle,
}: ImportantNotesTabProps) {
  const { data, isLoading, error, refetch, isFetching } = useImportantNotes(chapterId);
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  const visibleTopics = useMemo(() => {
    const topics = data?.topics || [];
    if (!topicId) return topics;
    return topics.filter((t) => t.topic_id === topicId);
  }, [data?.topics, topicId]);

  if (isLoading) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator size="large" color={C.emerald900} />
        <Text style={styles.loadingText}>Loading important notes…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerFill}>
        <Ionicons name="alert-circle-outline" size={38} color="#dc2626" />
        <Text style={styles.errorTitle}>Couldn't load important notes</Text>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : 'Please try again.'}
        </Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => refetch()}
          disabled={isFetching}
          data-testid="button-retry-important-notes"
        >
          <Ionicons name="refresh" size={15} color={C.emerald900} />
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (visibleTopics.length === 0) {
    return (
      <View style={styles.centerFill}>
        <Ionicons name="bookmark-outline" size={40} color={C.stone500} />
        <Text style={styles.errorTitle}>Important notes are not available yet</Text>
        <Text style={styles.errorText}>
          {topicId
            ? `Generated notes for ${topicTitle || 'this topic'} will appear here once they are ready.`
            : 'Generated notes for this chapter will appear here once they are ready.'}
        </Text>
      </View>
    );
  }

  const single = visibleTopics.length === 1;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.rootContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Parchment header */}
      <View style={styles.header}>
        <View style={styles.headerBlobA} />
        <View style={styles.headerBlobB} />
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <Ionicons name="bookmark" size={22} color={C.white} />
          </View>
          <View style={styles.headerCopy}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>Important Notes</Text>
              <Ionicons name="sparkles" size={14} color={C.amber600} />
            </View>
            <Text style={styles.headerSubtitle}>
              Carefully generated study notes, key points and revision questions
            </Text>
          </View>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>
            {visibleTopics.length} topic{visibleTopics.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      {single ? (
        <View>
          <View style={styles.topicHead}>
            {!!visibleTopics[0].topic_number && (
              <View style={styles.topicNumBadge}>
                <Text style={styles.topicNumBadgeText}>Topic {visibleTopics[0].topic_number}</Text>
              </View>
            )}
            <Text style={styles.topicTitle} numberOfLines={2}>
              {visibleTopics[0].topic_title || topicTitle || 'Topic notes'}
            </Text>
          </View>
          {!!visibleTopics[0].generated_at && (
            <View style={styles.generatedRow}>
              <Ionicons name="time-outline" size={12} color={C.stone500} />
              <Text style={styles.generatedText}>
                Generated {new Date(visibleTopics[0].generated_at).toLocaleDateString()}
              </Text>
            </View>
          )}
          <TopicNotesBook topic={visibleTopics[0]} />
        </View>
      ) : (
        // Multiple topics (chapter-wide): accordion, same as web.
        visibleTopics.map((topic, index) => {
          const expanded = openTopic === topic.topic_note_id;
          return (
            <View key={topic.topic_note_id} style={styles.accordionItem}>
              <TouchableOpacity
                style={styles.accordionTrigger}
                onPress={() => setOpenTopic(expanded ? null : topic.topic_note_id)}
                data-testid={`button-topic-${index}`}
              >
                <View style={styles.accordionNum}>
                  <Text style={styles.accordionNumText}>{topic.topic_number || index + 1}</Text>
                </View>
                <View style={styles.accordionCopy}>
                  <Text style={styles.accordionTitle} numberOfLines={2}>
                    {topic.topic_title || `Topic ${index + 1}`}
                  </Text>
                  <Text style={styles.accordionMeta}>
                    {topic.note_sections?.length || 0} sections · {topic.questions?.length || 0} questions
                  </Text>
                </View>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={C.stone500}
                />
              </TouchableOpacity>
              {expanded && (
                <View style={styles.accordionBody}>
                  <TopicNotesBook topic={topic} />
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  rootContent: { padding: 14, paddingBottom: 32, gap: 16 },

  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 8,
  },
  loadingText: { fontSize: 13, color: C.stone500 },
  errorTitle: { fontSize: 15, fontWeight: '700', color: C.stone800, textAlign: 'center' },
  errorText: { fontSize: 13, color: C.stone500, textAlign: 'center', lineHeight: 19 },
  retryBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  retryText: { fontSize: 13, fontWeight: '600', color: C.emerald900 },

  // Header
  header: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.parchment,
    padding: 16,
    overflow: 'hidden',
  },
  headerBlobA: {
    position: 'absolute',
    right: -48,
    top: -48,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(252, 211, 77, 0.20)',
  },
  headerBlobB: {
    position: 'absolute',
    right: 80,
    bottom: -64,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(16, 185, 129, 0.10)',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: C.emerald900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerTitle: { fontSize: 19, fontWeight: '700', color: C.emerald950 },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(6, 78, 59, 0.65)',
  },
  headerBadge: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(6, 78, 59, 0.20)',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  headerBadgeText: { fontSize: 11.5, fontWeight: '600', color: C.emerald900 },

  // Topic heading
  topicHead: { flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap' },
  topicNumBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: C.emerald900,
  },
  topicNumBadgeText: { fontSize: 11, fontWeight: '700', color: C.white },
  topicTitle: { flex: 1, fontSize: 16.5, fontWeight: '700', color: C.stone800 },
  generatedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  generatedText: { fontSize: 11.5, color: C.stone500 },

  // Book
  bookShell: { marginTop: 12 },
  spine: {
    height: 5,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: C.emerald900,
    opacity: 0.85,
  },
  page: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: C.border,
    backgroundColor: '#fffdf7',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    padding: 15,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 9,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  pageHeaderText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(6, 78, 59, 0.7)',
  },
  pageHeaderNum: { fontSize: 10.5, fontWeight: '600', color: C.stone500 },
  pageContent: { minHeight: 220 },
  pageNumber: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(6, 78, 59, 0.45)',
  },

  // Section page
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: C.amber600,
    marginBottom: 5,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: C.emerald950,
    marginBottom: 10,
    lineHeight: 24,
  },
  explanation: { marginBottom: 12 },
  rememberBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 78, 59, 0.15)',
    backgroundColor: C.emerald50,
    padding: 12,
  },
  rememberHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 9 },
  rememberTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: C.emerald800,
  },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 7 },
  bulletIcon: { marginTop: 2 },
  bulletBody: { flex: 1 },

  // Visual
  visual: { marginTop: 14, alignItems: 'center' },
  photoFrame: {
    width: '100%',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    padding: 9,
    paddingTop: 14,
  },
  tape: {
    position: 'absolute',
    top: -7,
    width: 54,
    height: 16,
    backgroundColor: 'rgba(252, 211, 77, 0.45)',
    borderRadius: 2,
    zIndex: 2,
  },
  tapeLeft: { left: 16, transform: [{ rotate: '-4deg' }] },
  tapeRight: { right: 16, transform: [{ rotate: '3deg' }] },
  photo: { width: '100%', backgroundColor: C.white },
  caption: {
    marginTop: 8,
    fontSize: 11.5,
    fontStyle: 'italic',
    color: C.stone500,
    textAlign: 'center',
    lineHeight: 17,
  },
  imageNav: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  imageNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageDots: { flexDirection: 'row', gap: 5 },
  imageDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(6, 78, 59, 0.22)',
  },
  imageDotActive: { backgroundColor: C.emerald900, width: 18 },

  // Reference title (formulas / questions pages)
  refTitle: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 13 },
  refIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.emerald900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: C.amber600,
  },
  refHeading: { fontSize: 16, fontWeight: '700', color: C.emerald950, marginTop: 1 },

  formulaList: { gap: 9 },
  formulaItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // Question card
  qCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.75)',
    padding: 12,
  },
  qRow: { flexDirection: 'row', gap: 10 },
  qNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.emerald900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qNumberText: { fontSize: 11.5, fontWeight: '700', color: C.white },
  qBody: { flex: 1 },
  qOptions: { marginTop: 10, gap: 7 },
  qOption: {
    flexDirection: 'row',
    gap: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  qOptionKey: { fontSize: 12.5, fontWeight: '700', color: C.emerald800 },
  qOptionText: { flex: 1 },
  qToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  qToggleText: { fontSize: 12.5, fontWeight: '700', color: C.emerald800 },
  qAnswer: {
    marginTop: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(236, 253, 245, 0.8)',
    padding: 12,
  },
  qKeyPoints: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(6, 78, 59, 0.18)',
    backgroundColor: 'rgba(255,255,255,0.7)',
    padding: 11,
  },
  qKeyPointsHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  qKeyPointsTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.9,
    color: C.emerald800,
  },
  qFormulas: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: 10,
    gap: 6,
  },
  qImages: { marginTop: 12, gap: 10 },
  qImage: {
    width: '100%',
    height: 190,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  tipBox: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.amber200,
    backgroundColor: C.amber50,
    padding: 11,
  },
  tipBody: { flex: 1 },
  tipTitle: { fontSize: 12, fontWeight: '700', color: C.amber950, marginBottom: 2 },
  studyTime: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  studyTimeText: { fontSize: 11.5, fontWeight: '500', color: C.stone500 },

  // Controls
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 14,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  navBtnPrimary: { backgroundColor: C.emerald900, borderColor: C.emerald900 },
  navBtnDisabled: { opacity: 0.45 },
  navBtnText: { fontSize: 12.5, fontWeight: '600', color: C.emerald900 },
  navBtnTextPrimary: { color: C.white },
  navBtnTextDisabled: { color: C.stone500 },
  progress: { alignItems: 'center', gap: 5 },
  progressText: { fontSize: 11, color: C.stone500, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 120 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(6, 78, 59, 0.22)',
  },
  dotActive: { backgroundColor: C.emerald900, width: 16 },

  // Accordion (multi-topic)
  accordionItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    overflow: 'hidden',
  },
  accordionTrigger: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 },
  accordionNum: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.emerald100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accordionNumText: { fontSize: 13, fontWeight: '700', color: C.emerald900 },
  accordionCopy: { flex: 1 },
  accordionTitle: { fontSize: 14.5, fontWeight: '700', color: C.stone800 },
  accordionMeta: { fontSize: 11.5, color: C.stone500, marginTop: 2 },
  accordionBody: { paddingHorizontal: 14, paddingBottom: 16 },

  emptyBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.border,
    padding: 28,
  },
  emptyText: { fontSize: 13, color: C.stone500, textAlign: 'center' },
});
