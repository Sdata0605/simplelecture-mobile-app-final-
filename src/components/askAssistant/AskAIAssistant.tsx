// "Ask AI" inside the V5 lecture player (landscape): the student talks, by voice, to the same live AI Teacher as
// the AI Teacher tab, and the teacher is told which lecture is paused and where. It explains every question from
// the basics as steps on a lesson board (left), next to the orb, captions, quick buttons and type box (right).
// Maths problems are solved line by line, typeset. There are no pre-recorded clips: every word the student hears
// is the teacher speaking.
//
// Mounted/unmounted by the parent (V5PlayerScreen), which also rotates the screen to landscape before opening it
// and back afterwards. Ported from the web app's src/components/learning/askAssistant.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useAITeacherSubscription } from '../../services/aiTeacherSubscription';
import { useTeacherPrefs } from '../../services/aiTeacherPrefs';
import { computeUseByok } from '../../services/aiTeacherScoping';
import type { TeacherSubject } from '../../services/aiTeacherService';
import { LiveTeacherClient, type LiveStatus, type QuizItem, type TranscriptItem } from '../../services/aiTeacherLiveService';
import { KEEP_LANGUAGE } from '../../services/aiTeacherVoice';
import {
  QUICK_REQUESTS,
  STUDENT_SPEAKING_LEVEL,
  buildLectureOpening,
  deriveLectureView,
  deriveLesson,
  nextStepNudge,
  withFirstQuestion,
  type LectureAskContext,
} from '../../services/askAssistant/lectureLesson';
import { useAutoContinue, useTurnSinceCard } from '../../hooks/useAutoContinue';
import { MicStreamer } from '../aiteacher/MicStreamer';
import { TeacherVoicePlayer } from '../aiteacher/TeacherVoicePlayer';
import { LessonBoard } from './LessonBoardNative';
import type { CardActions } from './LessonCardsNative';
import { RobotMascot } from './RobotMascot';
import { SubjectPicker } from './SubjectPickerNative';
import { ask } from './askTheme';

export interface AskAIAssistantProps {
  /**
   * "mid" = opened from the player's Ask AI button, "end" = lecture just finished, "ask" = opened from anywhere
   * else in the app (no lecture is paused).
   */
  trigger: 'mid' | 'end' | 'ask';
  onClose: () => void;
  /** The subject to teach. When null the student picks one first (see `choices`). */
  subject: TeacherSubject | null;
  /** What the picker shows while `subject` is null. */
  choices?: {
    /** null while the list loads. */
    subjects: TeacherSubject[] | null;
    failed?: boolean;
    /** subject id -> names of the courses it belongs to. */
    courses?: Record<string, string[]>;
    unknown?: string | null;
    onRetry?: () => void;
  };
  topicTitle?: string | null;
  /** Language the lecture is playing in, e.g. "kannada". */
  lectureLanguage?: string | null;
  /** Where the lecture was paused (mid-lecture only). */
  context?: LectureAskContext | null;
  /** The student has no AI Teacher plan: take them to the plans. */
  onOpenPlans?: () => void;
  /** Opens the teacher settings (their own API key, voice). Shown as a gear in the top bar when given. */
  onOpenSettings?: () => void;
}

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });


export function AskAIAssistant(props: AskAIAssistantProps) {
  const { onClose, topicTitle, onOpenPlans, onOpenSettings, choices } = props;
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const { hasActivePlan } = useAITeacherSubscription();
  const [picked, setPicked] = useState<TeacherSubject | null>(null);
  const subject = props.subject ?? picked;

  let body: React.ReactNode;
  if (!isAuthenticated) {
    body = <Gate icon="lock-closed" title="Log in to talk to your AI teacher" text="Your AI teacher answers your doubts by voice while you watch." />;
  } else if (!hasActivePlan) {
    body = (
      <Gate
        icon="lock-closed"
        title="Voice doubts need an AI Teacher plan"
        text="Talk to your AI teacher out loud and get answers from your own course notes, right in the lecture."
        action={onOpenPlans ? { label: 'See AI Teacher plans', onPress: onOpenPlans } : undefined}
      />
    );
  } else if (subject) {
    body = <LiveLecture {...props} subject={subject} />;
  } else {
    body = (
      <SubjectPicker
        subjects={choices?.subjects ?? null}
        failed={choices?.failed}
        courses={choices?.courses}
        unknown={choices?.unknown}
        onPick={setPicked}
        onRetry={choices?.onRetry}
      />
    );
  }

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          {
            paddingTop: Math.max(insets.top, 6),
            paddingBottom: Math.max(insets.bottom, 10),
            paddingLeft: Math.max(insets.left, 18),
            paddingRight: Math.max(insets.right, 18),
          },
        ]}
      >
        <View style={styles.topbar}>
          <View style={styles.titleRow}>
            <Ionicons name="sparkles" size={15} color={ask.gold} />
            <Text style={styles.title} numberOfLines={1}>
              ASK AI
              {!!subject && (
                <Text style={styles.titleSubject}>
                  {'  ·  '}
                  {subject.name}
                  {topicTitle ? `  ·  ${topicTitle}` : ''}
                </Text>
              )}
            </Text>
          </View>
          <View style={styles.topActions}>
            {isAuthenticated && !!onOpenSettings && (
              <Pressable onPress={onOpenSettings} accessibilityLabel="Teacher settings: your API key, voice and teacher style" style={styles.closeBtn} hitSlop={8}>
                <Ionicons name="settings-outline" size={18} color={ask.ink} />
              </Pressable>
            )}
            <Pressable onPress={onClose} accessibilityLabel="Close Ask AI" style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color={ask.ink} />
            </Pressable>
          </View>
        </View>
        {body}
      </View>
    </Modal>
  );
}

/** Starts the live call as soon as it opens and shows the lesson board beside the teacher. */
function LiveLecture({ trigger, subject, topicTitle, lectureLanguage, context }: AskAIAssistantProps & { subject: TeacherSubject }) {
  const { width, height } = useWindowDimensions();
  const [prefs] = useTeacherPrefs();
  const { isPlan500, isPlan1000 } = useAITeacherSubscription();
  const useByok = computeUseByok(isPlan500, isPlan1000, prefs.apiKey, prefs.apiMode);
  const [opening] = useState(() =>
    buildLectureOpening({
      trigger,
      subjectName: subject.name,
      topicTitle,
      lectureLanguage,
      replyInLectureLanguage: prefs.language === 'auto',
      context,
    }),
  );

  const clientRef = useRef<LiveTeacherClient | null>(null);
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [micAvailable, setMicAvailable] = useState(true);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [turnsCompleted, setTurnsCompleted] = useState(0);
  const [typed, setTyped] = useState('');

  // The orb is animated per frame from refs, so it never forces a re-render. The teacher's output has no level
  // meter, so while it speaks the orb follows a syllable-like envelope.
  const micLevelRef = useRef(0);
  const speakingRef = useRef(false);
  speakingRef.current = speaking;
  const lastMicShown = useRef(0);

  const start = useCallback(
    async (first: string) => {
      clientRef.current?.disconnect();
      clientRef.current = null;
      setError(null);
      setNotice(null);
      setTranscript([]);
      setSpeaking(false);
      setTurnsCompleted(0);

      if (isPlan500 && !prefs.apiKey.trim()) {
        setError('Your Plus plan needs your own Gemini API key. Add it in the AI Teacher settings, then try again.');
        setStatus('error');
        return;
      }

      try {
        const perm = await Audio.requestPermissionsAsync();
        setMicAvailable(perm.granted);
        if (!perm.granted) setNotice('Microphone is blocked, so you can type your questions and the teacher will answer by voice.');
      } catch {
        setMicAvailable(false);
      }

      const client = new LiveTeacherClient({
        prefs,
        isByok: useByok,
        apiKey: prefs.apiKey,
        // Speakers: the mic is closed while the teacher talks, and the student taps the orb to break in.
        echoGuard: true,
        // A lesson in steps: explain each aloud, then carry on without being told to.
        keepGoing: true,
        subjectId: subject.id,
        enrolledSubjects: subject.name,
        callbacks: {
          onStatusChange: setStatus,
          onSpeakingChange: setSpeaking,
          onTranscriptUpdate: (updater) => setTranscript((prev) => updater(prev)),
          onError: (message) => setError(message || null),
          onNotice: setNotice,
          onTurnComplete: setTurnsCompleted,
          onMicLevel: (rms) => {
            const level = Math.min(1, rms * 5);
            micLevelRef.current = level;
            // Re-render only when the level visibly changes.
            if (Math.abs(level - lastMicShown.current) >= 0.08) {
              lastMicShown.current = level;
              setMicLevel(level);
            }
          },
        },
      });
      clientRef.current = client;
      await client.connect(first);
    },
    [isPlan500, prefs, subject.id, subject.name, useByok],
  );

  // Deferred a tick so a remount cancels it instead of opening two calls.
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    // Recording and loudspeaker playback at once, with the platform's echo cancellation.
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
    const timer = setTimeout(() => void startRef.current(opening), 0);
    return () => {
      clearTimeout(timer);
      clientRef.current?.disconnect();
      clientRef.current = null;
      // Give the lecture video its normal playback route back.
      Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true }).catch(() => {});
    };
  }, [opening]);

  const view = deriveLectureView({ status, speaking, muted, micAvailable, micLevel, teacherName: prefs.teacherName.trim() || 'AI Teacher', transcript });
  const lesson = deriveLesson(transcript);

  // Backstop for the lesson flow: if the teacher still ends its turn after a step, and the student has said
  // nothing, tell it (silently) to go on, so nobody has to say "go ahead".
  const lastCardId = lesson.cards.length ? lesson.cards[lesson.cards.length - 1].id : null;
  const turnDone = useTurnSinceCard(turnsCompleted, lastCardId);
  const nudge = nextStepNudge({ inCall: status === 'live', speaking, turnDone, transcript });
  useAutoContinue(nudge, (text) => clientRef.current?.sendText(text, { silent: true }), {
    isStudentSpeaking: () => micLevelRef.current >= STUDENT_SPEAKING_LEVEL,
    turnsCompleted,
  });

  const getLevel = useCallback(() => {
    if (!speakingRef.current) return micLevelRef.current;
    const t = Date.now() / 1000;
    const syllables = Math.abs(Math.sin(t * 9.1)) * 0.55 + Math.abs(Math.sin(t * 3.7 + 1.3)) * 0.3;
    return Math.min(1, 0.15 + syllables);
  }, []);

  const onOrbPress = () => {
    const client = clientRef.current;
    if (view.orbAction === 'interrupt') client?.interrupt();
    else if (view.orbAction === 'mute') setMuted(client ? client.toggleMute() : false);
    else if (view.orbAction === 'restart') void start(opening);
  };

  // Typed text goes to the live call, or starts a new one that still carries the lecture context.
  const onSend = () => {
    const text = typed.trim();
    if (!text || !view.canType) return;
    setTyped('');
    if (status === 'live') clientRef.current?.sendText(text);
    else void start(withFirstQuestion(opening, text));
  };

  const actions: CardActions = useMemo(
    () => ({
      reportQuizAnswer: (quiz: QuizItem, i: number) => {
        const letter = 'ABCDEFGH'[i];
        const correct = i === quiz.correctIndex;
        clientRef.current?.sendText(
          `[Quiz result] My answer: option ${letter} "${quiz.options[i]}". That is ${correct ? 'correct' : `wrong; the right answer is "${quiz.options[quiz.correctIndex]}"`}. Please react to my answer and continue. ${KEEP_LANGUAGE}`,
          { silent: true },
        );
      },
      reportUnderstanding: (_topic, choice) => {
        const text =
          choice === 'got_it'
            ? '[Understanding check] I feel: Got it. Please praise me briefly and continue.'
            : choice === 'somewhat'
              ? '[Understanding check] I feel: Somewhat. Please clarify the tricky part and give one more example.'
              : '[Understanding check] I feel: Confused. Please explain again more simply with a new real-life example and a new visual.';
        clientRef.current?.sendText(`${text} ${KEEP_LANGUAGE}`, { silent: true });
      },
      answerBigQuestion: (_question, answer) =>
        clientRef.current?.sendText(`[Big question answer] ${answer} ${KEEP_LANGUAGE}`, { silent: true }),
    }),
    [],
  );

  // Landscape phone: the board takes the left and the teacher panel the right (about 40% of the width).
  // The orb reserves a layout box 2.1x its diameter for its glow, so it is sized from the square it may occupy and
  // that square is clipped to a circle, which keeps the glow inside the panel. On a short screen the orb sits beside
  // the captions instead of above them, so the quick buttons and the type box always have room.
  const panelWidth = Math.round(Math.min(420, Math.max(290, width * 0.4)));
  const compact = height < 440;
  const orbBox = compact ? Math.round(Math.min(112, Math.max(84, height * 0.3))) : Math.round(Math.min(160, Math.max(110, height * 0.28)));
  const problem = error || notice;
  const micLive = view.orbMode === 'listening';
  const left = compact ? styles.textLeft : null;

  return (
    <View style={styles.stage}>
      {/* The teacher's voice plays in a hidden WebView, loaded before the first word arrives. */}
      {(status === 'connecting' || status === 'live') && <TeacherVoicePlayer />}
      {/* Mic capture runs in a hidden WebView with the platform's echo cancellation. */}
      {status === 'live' && <MicStreamer isStreaming={!muted} isMuted={muted} onAudioChunk={(pcm, rms) => clientRef.current?.sendRealtimeAudio(pcm, rms)} onError={() => setMicAvailable(false)} />}

      <View style={styles.board}>
        <LessonBoard lesson={lesson} actions={actions} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.teacher, { width: panelWidth }]}>
        <View style={[styles.talk, compact && styles.talkCompact]}>
          <View style={[styles.orbWrap, { width: orbBox, height: orbBox }]}>
            <RobotMascot
              mode={view.orbMode}
              getLevel={getLevel}
              size={orbBox}
              onPress={view.orbAction === 'none' ? undefined : onOrbPress}
              accessibilityLabel={view.orbLabel}
            />
          </View>

          <ScrollView style={styles.textScroll} contentContainerStyle={[styles.textContent, compact && styles.textContentCompact]} showsVerticalScrollIndicator={false}>
            {!!problem && (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{problem}</Text>
              </View>
            )}
            {!!view.status && <Text style={[styles.status, left, view.statusTone === 'hearing' && { color: '#9dd7ff' }]}>{view.status}</Text>}
            {view.studentLine?.live && <Text style={[styles.transcript, left]}>{view.studentLine.text}</Text>}
            {!!view.studentLine && !view.studentLine.live && lesson.cards.length === 0 && (
              <View style={styles.question}>
                <Text style={styles.questionLabel}>YOU ASKED</Text>
                <Text style={styles.questionText}>{view.studentLine.text}</Text>
              </View>
            )}
            {!!view.teacherCaption && <Text style={[styles.caption, left]}>{view.teacherCaption}</Text>}
          </ScrollView>
        </View>

        {view.inCall && (
          // One scrolling row, so it never takes more than a line of the panel's height.
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {QUICK_REQUESTS.map((request) => (
              <Pressable key={request.id} style={styles.chip} onPress={() => clientRef.current?.sendText(request.prompt, { silent: true })}>
                <Text style={styles.chipText}>{request.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.composer}>
          <View style={[styles.micChip, micLive && styles.micChipLive]}>
            <Ionicons name={micLive ? 'mic' : !micAvailable || muted ? 'mic-off' : 'keypad'} size={15} color={micLive ? ask.onMint : ask.muted} />
          </View>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            editable={view.canType}
            placeholder="Prefer typing? Ask here…"
            placeholderTextColor="rgba(145, 167, 163, 0.8)"
            returnKeyType="send"
            onSubmitEditing={onSend}
            maxLength={500}
          />
          <Pressable
            onPress={onSend}
            disabled={!typed.trim() || !view.canType}
            accessibilityLabel="Send question"
            style={[styles.sendBtn, (!typed.trim() || !view.canType) && { opacity: 0.35 }]}
          >
            <Ionicons name="send" size={16} color={ask.onMint} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Gate({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  text?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.gate}>
      <View style={styles.gateIcon}>
        <Ionicons name={icon} size={18} color={ask.muted} />
      </View>
      <Text style={styles.gateTitle}>{title}</Text>
      {!!text && <Text style={styles.gateText}>{text}</Text>}
      {!!action && (
        <Pressable style={styles.gateButton} onPress={action.onPress}>
          <Text style={styles.gateButtonText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ask.bg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  title: { color: ask.mint, fontSize: 12, fontWeight: '800', letterSpacing: 1.6 },
  titleSubject: { color: ask.muted, fontWeight: '600', letterSpacing: 0.8 },
  closeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ask.line, backgroundColor: ask.panel },
  stage: { flex: 1, flexDirection: 'row', gap: 18, minHeight: 0 },
  board: { flex: 1, minWidth: 0 },
  // The panel is a column: the orb and captions take whatever height is left, and the quick buttons and type box
  // below them are always fully visible.
  teacher: { padding: 10, gap: 8, borderRadius: 24, borderWidth: 1, borderColor: ask.line, backgroundColor: 'rgba(255, 255, 255, 0.035)' },
  talk: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', gap: 4 },
  talkCompact: { flexDirection: 'row', gap: 10 },
  // The orb's glow box is bigger than its body; this square, clipped to a circle, keeps it inside the panel.
  orbWrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  textScroll: { flex: 1, minHeight: 0, minWidth: 0, alignSelf: 'stretch' },
  textContent: { alignItems: 'center', gap: 6, paddingVertical: 2 },
  textContentCompact: { alignItems: 'flex-start', justifyContent: 'center', flexGrow: 1 },
  textLeft: { textAlign: 'left' },
  status: { color: ask.mint, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textAlign: 'center', textTransform: 'uppercase' },
  transcript: { color: ask.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  caption: { color: 'rgba(238, 246, 244, 0.88)', fontFamily: SERIF, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  question: { padding: 8, borderRadius: 14, borderWidth: 1, borderColor: ask.line, backgroundColor: ask.panel },
  questionLabel: { color: ask.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginBottom: 2 },
  questionText: { color: ask.ink, fontSize: 14, lineHeight: 19 },
  notice: { padding: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(251, 113, 133, 0.3)', backgroundColor: 'rgba(251, 113, 133, 0.08)' },
  noticeText: { color: '#ffd9df', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  chipsScroll: { flexGrow: 0, flexShrink: 0 },
  chips: { alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  chip: { height: 30, paddingHorizontal: 11, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ask.line, backgroundColor: 'rgba(255, 255, 255, 0.04)' },
  chipText: { color: '#cfe3de', fontSize: 12, fontWeight: '600' },
  composer: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingLeft: 6, paddingRight: 5, borderRadius: 999, borderWidth: 1, borderColor: ask.line, backgroundColor: 'rgba(7, 16, 15, 0.82)' },
  micChip: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ask.panelStrong },
  micChipLive: { backgroundColor: ask.mint },
  input: { flex: 1, height: 34, paddingVertical: 0, color: ask.ink, fontSize: 14 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: ask.mint },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  gateIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: ask.panelStrong },
  gateTitle: { color: ask.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  gateText: { color: ask.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 420 },
  gateButton: { height: 40, paddingHorizontal: 18, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: ask.mint },
  gateButtonText: { color: ask.onMint, fontSize: 14, fontWeight: '800' },
});
