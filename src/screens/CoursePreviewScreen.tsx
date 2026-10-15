import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  SafeAreaView,
  Linking,
  TextInput,
  Platform,
  Keyboard,
  Alert,
  Image,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../services/supabase';
import { getFreePreviewChapterIds, getTopicLectureVisibility, filterLecturesByVisibility } from '../services/aiLectureService';
import { useCourseFreeAccess, useCourseFreePreviewLimits } from '../hooks/useCourseFreeAccess';
import { getQuotaCount, incrementQuota } from '../utils/previewQuota';
import { RootStackParamList } from '../navigation/AppNavigator';
import DoubtsTab from '../components/DoubtsTab';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardShiftView, isKeyboardControlled } from '../components/keyboard/keyboardStick';
import PYQTab from '../components/PYQTab';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'CoursePreview'>;

const REST_HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

// Free-preview & visibility helpers come from the shared aiLectureService.

const PREVIEW_TABS = ['Classes', 'AI', 'Questions', 'Assignments', 'DPP', 'Results', 'Doubts', "PYQ's"] as const;
type PreviewTab = typeof PREVIEW_TABS[number];

interface Subject { id: string; name: string; slug?: string }
interface Topic {
  id: string; title: string; topic_number: number;
  estimated_duration_minutes?: number; video_id?: string;
  video_platform?: string; ai_generated_video_url?: string;
  ai_presentation_json?: any;
}
interface Chapter { id: string; title: string; chapter_number: number; topics: Topic[] }
interface TopicVideoItem { id: string; video_name: string | null; language: string; video_platform: string; video_id: string; description: string | null; display_order: number; is_active: boolean }
interface AiLecturePreviewItem { id: string; document_name: string | null; external_job_id: string | null; video_url: string | null; is_marketing?: boolean }
interface AiLectureItem { id: string; document_name: string | null; video_url: string | null; presentation_json: any }
interface QuestionItem { id: string; question: string; options: string[] | null; correct_answer?: string }
interface AssignmentItem { id: string; title: string; description: string | null; due_date: string | null }

// ──────────────────────────────────────────
// Shared feedback components
// ──────────────────────────────────────────
function TabLoadingCard() {
  return (
    <View style={tabStyles.feedbackCard}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
function TabEmptyCard({ message }: { message: string }) {
  return (
    <View style={tabStyles.feedbackCard}>
      <Ionicons name="document-text-outline" size={32} color={colors.textMuted} />
      <Text style={tabStyles.feedbackText}>{message}</Text>
    </View>
  );
}
function TabErrorCard() {
  return (
    <View style={tabStyles.feedbackCard}>
      <Ionicons name="cloud-offline-outline" size={32} color={colors.error} />
      <Text style={tabStyles.feedbackText}>Could not load content. Please try again.</Text>
    </View>
  );
}

// ──────────────────────────────────────────
// Classes tab — rich cards matching the paid course
// ──────────────────────────────────────────
function ClassesTabContent({ topicId, chapterId, topicVideoId, topicVideoPlatform, aiGeneratedVideoUrl, courseId, topicTitle, onBuy, navigation }: {
  topicId: string; chapterId: string;
  topicVideoId?: string; topicVideoPlatform?: string; aiGeneratedVideoUrl?: string;
  courseId: string; topicTitle: string;
  onBuy: () => void; navigation: NavigationProp;
}) {
  const [topicVideos, setTopicVideos] = useState<TopicVideoItem[]>([]);
  const [aiLectures, setAiLectures] = useState<AiLecturePreviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadingLectureId, setLoadingLectureId] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [isChapterFree, setIsChapterFree] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const videosUrl = `${SUPABASE_URL}/rest/v1/topic_videos?topic_id=eq.${topicId}&select=*&order=language.asc,display_order.asc`;
    const aiUrl = `${SUPABASE_URL}/rest/v1/video_generation_jobs?select=id,document_name,external_job_id,video_url,is_marketing,created_at,ai_assistant_documents!inner(topic_id,chapter_id)&is_published=eq.true&status=eq.completed&ai_assistant_documents.topic_id=eq.${topicId}&order=created_at.desc`;
    console.log('[Preview][Classes] fetching topic_videos + ai_lectures for topicId:', topicId);
    Promise.all([
      fetch(videosUrl, { headers: REST_HEADERS }),
      fetch(aiUrl, { headers: REST_HEADERS }),
      getFreePreviewChapterIds(courseId),
      getTopicLectureVisibility(topicId),
    ])
      .then(async ([vRes, aRes, freeIds, visMode]) => {
        console.log('[Preview][Classes] topic_videos status:', vRes.status, '| ai_lectures status:', aRes.status);
        const vData = vRes.ok ? await vRes.json().catch(() => []) : [];
        const aData = aRes.ok ? await aRes.json().catch(() => []) : [];
        if (!cancelled) {
          setTopicVideos(Array.isArray(vData) ? vData.filter((v: any) => v.is_active !== false) : []);
          const chapterFree = (freeIds as string[]).length === 0 || (freeIds as string[]).includes(chapterId);
          setIsChapterFree(chapterFree);
          const rawLectures: AiLecturePreviewItem[] = Array.isArray(aData) ? aData : [];
          setAiLectures(filterLecturesByVisibility(rawLectures, visMode as string));
          if (!vRes.ok && !aRes.ok && !topicVideoId && !aiGeneratedVideoUrl) setError(true);
        }
      })
      .catch(e => { if (!cancelled && !topicVideoId && !aiGeneratedVideoUrl) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topicId, courseId, chapterId]);

  const handleWatchAILecture = useCallback((lec: AiLecturePreviewItem) => {
    // Gate: only free chapters are playable on the preview screen
    if (!isChapterFree) {
      onBuy();
      return;
    }
    // Marketing lectures use the V5 player; normal lectures use the AI Lecture Player.
    // external_job_id is the required identifier for both.
    if (lec.external_job_id) {
      if (lec.is_marketing === true) {
        (navigation.navigate as any)('V5Player', {
          jobId: lec.external_job_id,
          title: lec.document_name || topicTitle,
          // Preview cards have no language picker — start deterministically in English.
          initialLanguage: 'english',
        });
        return;
      }
      (navigation.navigate as any)('AILecturePlayer', {
        jobId: lec.external_job_id,
        topicId,
        chapterId,
        courseId,
        topicTitle: lec.document_name || topicTitle,
      });
      return;
    }
    // No external_job_id — lecture not yet available in V4.
    Alert.alert(
      'Content Unavailable',
      'This lecture is not available in the new player yet.',
      [{ text: 'OK' }],
    );
  }, [topicId, chapterId, courseId, topicTitle, navigation, isChapterFree, onBuy]);

  const openVideo = useCallback((platform: string, videoId: string) => {
    const url = platform === 'vimeo' ? `https://vimeo.com/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`;
    Linking.openURL(url).catch(() => {});
  }, []);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60), s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) return <TabLoadingCard />;
  if (error) return <TabErrorCard />;

  const hasDirectVideo = !!topicVideoId;
  const showLegacyAI = aiLectures.length === 0 && !!aiGeneratedVideoUrl;
  const hasContent = aiLectures.length > 0 || topicVideos.length > 0 || hasDirectVideo || showLegacyAI;
  if (!hasContent) return <TabEmptyCard message="No videos available for this topic yet." />;

  // Language filter for topic_videos
  const availableLangs = Array.from(new Set(topicVideos.map(v => v.language || 'english').filter(Boolean)));
  const showLangFilter = availableLangs.length > 1;
  const filteredVideos = selectedLanguage === 'all' ? topicVideos : topicVideos.filter(v => (v.language || 'english') === selectedLanguage);

  return (
    <View>
      {/* AI Lecture cards — purple gradient SimpleLectures style */}
      {aiLectures.map(lec => (
        <TouchableOpacity
          key={lec.id}
          style={classStyles.aiCard}
          disabled={loadingLectureId === lec.id}
          activeOpacity={0.9}
          onPress={() => handleWatchAILecture(lec)}
        >
          <LinearGradient colors={['#1a1a2e', '#2d1b4e', '#4a2c6e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={classStyles.aiHeader}>
            <View style={classStyles.aiBranding}>
              <View style={classStyles.aiLogo}>
                <View style={[classStyles.aiLogoSq, { backgroundColor: '#FF6B6B' }]} />
                <View style={[classStyles.aiLogoSq, { backgroundColor: '#4ECDC4' }]} />
                <View style={[classStyles.aiLogoSq, { backgroundColor: '#FFE66D' }]} />
                <View style={[classStyles.aiLogoSq, { backgroundColor: '#95E1D3' }]} />
              </View>
              <Text style={classStyles.aiBrandName}>
                <Text style={{ color: '#A78BFA' }}>Simple</Text>
                <Text style={{ color: '#fff' }}>Lectures</Text>
              </Text>
            </View>
            <View style={classStyles.aiPlayWrap}>
              {loadingLectureId === lec.id
                ? <ActivityIndicator size="large" color="#fff" />
                : (
                  <View style={classStyles.aiPlayBtn}>
                    <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 4 }} />
                  </View>
                )}
            </View>
            <View style={classStyles.aiBadge}>
              <Ionicons name="sparkles" size={14} color="#A78BFA" />
              <Text style={classStyles.aiBadgeText}>AI-Powered Learning</Text>
            </View>
          </LinearGradient>
          <View style={classStyles.aiBody}>
            <Text style={classStyles.aiTitle} numberOfLines={2}>{lec.document_name || topicTitle}</Text>
            <Text style={classStyles.aiDesc}>AI-generated lecture with interactive slides and narration</Text>
          </View>
        </TouchableOpacity>
      ))}

      {/* Legacy ai_generated_video_url fallback */}
      {showLegacyAI && (
        <TouchableOpacity
          style={classStyles.aiCard}
          activeOpacity={0.9}
          onPress={() => handleWatchAILecture({ id: '', document_name: topicTitle, external_job_id: null, video_url: aiGeneratedVideoUrl! })}
        >
          <LinearGradient colors={['#1a1a2e', '#2d1b4e', '#4a2c6e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={classStyles.aiHeader}>
            <View style={classStyles.aiPlayWrap}>
              <View style={classStyles.aiPlayBtn}>
                <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 4 }} />
              </View>
            </View>
            <View style={classStyles.aiBadge}>
              <Ionicons name="sparkles" size={14} color="#A78BFA" />
              <Text style={classStyles.aiBadgeText}>AI-Powered Learning</Text>
            </View>
          </LinearGradient>
          <View style={classStyles.aiBody}>
            <Text style={classStyles.aiTitle} numberOfLines={2}>{topicTitle}</Text>
            <Text style={classStyles.aiDesc}>AI-generated lecture with interactive slides and narration</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Legacy direct video on topic row */}
      {hasDirectVideo && (
        <TouchableOpacity style={classStyles.videoCard} onPress={() => openVideo(topicVideoPlatform || 'youtube', topicVideoId!)}>
          <View style={classStyles.thumbWrap}>
            <View style={classStyles.thumbPlaceholder}>
              <Ionicons name="videocam" size={28} color="#fff" />
            </View>
            <View style={classStyles.thumbOverlay}>
              <Ionicons name="play-circle" size={32} color="#fff" />
            </View>
          </View>
          <View style={classStyles.videoInfo}>
            <Text style={classStyles.videoTitle} numberOfLines={2}>{topicTitle}</Text>
            <Text style={classStyles.videoDesc}>{topicVideoPlatform === 'vimeo' ? 'Vimeo' : 'YouTube'} · Tap to watch</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Language filter tabs */}
      {showLangFilter && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={classStyles.langFilterScroll} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
          {['all', ...availableLangs].map(lang => (
            <TouchableOpacity
              key={lang}
              style={[classStyles.langTab, selectedLanguage === lang && classStyles.langTabActive]}
              onPress={() => setSelectedLanguage(lang)}
            >
              <Text style={[classStyles.langTabText, selectedLanguage === lang && classStyles.langTabTextActive]}>
                {lang === 'all' ? `All (${topicVideos.length})` : lang.charAt(0).toUpperCase() + lang.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Regular topic_videos (YouTube / Vimeo) */}
      {filteredVideos.map(v => (
        <TouchableOpacity key={v.id} style={classStyles.videoCard} onPress={() => openVideo(v.video_platform, v.video_id)}>
          <View style={classStyles.thumbWrap}>
            <View style={classStyles.thumbPlaceholder}>
              <Ionicons name={v.video_platform === 'vimeo' ? 'logo-vimeo' : 'logo-youtube'} size={28} color="#fff" />
            </View>
            <View style={classStyles.thumbOverlay}>
              <Ionicons name="play-circle" size={32} color="#fff" />
            </View>
            {!!v.language && (
              <View style={classStyles.langBadge}>
                <Text style={classStyles.langBadgeText}>{v.language.toUpperCase().slice(0, 2)}</Text>
              </View>
            )}
          </View>
          <View style={classStyles.videoInfo}>
            <Text style={classStyles.videoTitle} numberOfLines={2}>{v.video_name || topicTitle}</Text>
            <Text style={classStyles.videoDesc}>
              {v.video_platform === 'vimeo' ? 'Vimeo' : 'YouTube'}
              {v.description ? ` · ${v.description}` : ' · Tap to watch'}
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      <View style={tabStyles.buyPromptRow}>
        <Text style={tabStyles.buyPromptText}>Enroll to access all content</Text>
        <TouchableOpacity onPress={onBuy} style={tabStyles.buyPromptBtn}>
          <Text style={tabStyles.buyPromptBtnText}>Buy Course</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const classStyles = StyleSheet.create({
  aiCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 14, overflow: 'hidden', shadowColor: '#2BBD6E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  aiHeader: { paddingVertical: 28, paddingHorizontal: 16, alignItems: 'center' },
  aiBranding: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  aiLogo: { flexDirection: 'row', flexWrap: 'wrap', width: 24, height: 24, gap: 2 },
  aiLogoSq: { width: 10, height: 10, borderRadius: 2 },
  aiBrandName: { fontSize: 16, fontWeight: '700' },
  aiPlayWrap: { marginBottom: 12 },
  aiPlayBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiBadgeText: { fontSize: 13, color: '#A78BFA', fontWeight: '500' },
  aiBody: { padding: 14 },
  aiTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  aiDesc: { fontSize: 13, color: '#6B7280' },
  videoCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 10, marginBottom: 12, gap: 12, shadowColor: '#2BBD6E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3, borderWidth: 1, borderColor: 'rgba(43,189,110,0.08)' },
  thumbWrap: { width: 110, height: 76, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  thumbPlaceholder: { width: '100%', height: '100%', backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  thumbOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  langBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  langBadgeText: { fontSize: 9, color: '#fff', fontWeight: '700' },
  videoInfo: { flex: 1, justifyContent: 'center' },
  videoTitle: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 4, lineHeight: 18 },
  videoDesc: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  langFilterScroll: { marginBottom: 12 },
  langTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  langTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langTabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  langTabTextActive: { color: '#fff' },
});

// ──────────────────────────────────────────
// Shared markdown helpers (used by AI chat)
// ──────────────────────────────────────────
type MdElement = { type: string; content: string; level?: number };

function parseMd(text: string): MdElement[] {
  const out: MdElement[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) { out.push({ type: 'spacer', content: '' }); continue; }
    if (t.startsWith('### ')) { out.push({ type: 'h3', content: t.slice(4) }); continue; }
    if (t.startsWith('## '))  { out.push({ type: 'h2', content: t.slice(3) }); continue; }
    if (t.startsWith('# '))   { out.push({ type: 'h1', content: t.slice(2) }); continue; }
    const bulletMatch = t.match(/^[-*•]\s(.*)/);
    if (bulletMatch) { out.push({ type: 'bullet', content: bulletMatch[1] }); continue; }
    const numMatch = t.match(/^(\d+)\.\s(.*)/);
    if (numMatch) { out.push({ type: 'numbered', content: numMatch[2], level: parseInt(numMatch[1]) }); continue; }
    out.push({ type: 'text', content: t });
  }
  return out;
}

function renderInline(text: string) {
  const parts: { t: string; bold: boolean }[] = [];
  const re = /\*\*(.*?)\*\*/g;
  let last = 0; let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index), bold: false });
    parts.push({ t: m[1], bold: true });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ t: text.slice(last), bold: false });
  return parts.map((p, i) => <Text key={i} style={p.bold ? { fontWeight: '700' } : undefined}>{p.t}</Text>);
}

function MdContent({ content }: { content: string }) {
  return (
    <View>
      {parseMd(content).map((el, i) => {
        switch (el.type) {
          case 'h1': return <Text key={i} style={chatMd.h1}>{renderInline(el.content)}</Text>;
          case 'h2': return <Text key={i} style={chatMd.h2}>{renderInline(el.content)}</Text>;
          case 'h3': return <Text key={i} style={chatMd.h3}>{renderInline(el.content)}</Text>;
          case 'bullet': return (
            <View key={i} style={chatMd.row}>
              <Text style={chatMd.dot}>•</Text>
              <Text style={chatMd.rowText}>{renderInline(el.content)}</Text>
            </View>
          );
          case 'numbered': return (
            <View key={i} style={chatMd.row}>
              <Text style={chatMd.dot}>{el.level}.</Text>
              <Text style={chatMd.rowText}>{renderInline(el.content)}</Text>
            </View>
          );
          case 'spacer': return <View key={i} style={{ height: 6 }} />;
          default: return <Text key={i} style={chatMd.body}>{renderInline(el.content)}</Text>;
        }
      })}
    </View>
  );
}

const chatMd = StyleSheet.create({
  h1: { fontSize: 17, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  h2: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 3 },
  h3: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 2 },
  body: { fontSize: 14, color: '#1F2937', lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
  dot: { fontSize: 14, color: '#6B7280', marginRight: 6, marginTop: 2 },
  rowText: { fontSize: 14, color: '#1F2937', lineHeight: 21, flex: 1 },
});

// ──────────────────────────────────────────
// AI tab — preview chat with quota gating
// ──────────────────────────────────────────
type ChatMsg = { role: 'user' | 'assistant'; content: string };

const AI_SUGGESTIONS = [
  'Summarize this topic',
  'Give me 3 practice questions',
  'Explain the key concepts simply',
];

function PreviewAIChatTab({ topicId, subjectId, chapterId, courseId, topicTitle, presentationJson, aiLimit, onQuotaExceeded, onBuy }: {
  topicId: string; subjectId: string; chapterId: string; courseId: string; topicTitle: string;
  presentationJson?: any; aiLimit: number | null;
  onQuotaExceeded: () => void; onBuy: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [asksUsed, setAsksUsed] = useState(0);
  const [quotaLoaded, setQuotaLoaded] = useState(false);
  const [keyboardH, setKeyboardH] = useState(0);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  // Load current quota count on mount
  useEffect(() => {
    getQuotaCount(courseId, 'AI').then(c => { setAsksUsed(c); setQuotaLoaded(true); });
  }, [courseId]);

  // Keyboard handling
  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(show, e => setKeyboardH(e.endCoordinates.height));
    const h = Keyboard.addListener(hide, () => setKeyboardH(0));
    return () => { s.remove(); h.remove(); };
  }, []);

  const scrollToBottom = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);

  const quotaExceeded = aiLimit !== null && asksUsed >= aiLimit;

  const handleSend = useCallback(async (question?: string) => {
    const q = (question ?? input).trim();
    if (!q || loading) return;

    // Quota check
    if (aiLimit !== null) {
      const current = await getQuotaCount(courseId, 'AI');
      if (current >= aiLimit) { onQuotaExceeded(); return; }
    }

    const userMsg: ChatMsg = { role: 'user', content: q };
    const updatedMsgs = [...messages, userMsg];
    setMessages(updatedMsgs);
    setInput('');
    setLoading(true);
    scrollToBottom();

    try {
      const history = updatedMsgs.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${SUPABASE_URL}/functions/v1/lecture-context-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          question: q,
          topicId,
          chapterId,
          subjectId,
          topicTitle,
          presentationJson: presentationJson || null,
          history,
          previewMode: true,
        }),
      });

      if (res.status === 429) {
        setMessages(prev => prev.slice(0, -1));
        setInput(q);
        Alert.alert('Too many requests', 'Please wait a moment and try again.');
        return;
      }

      const data = res.ok ? await res.json().catch(() => null) : null;
      const answer = data?.answer;

      if (answer) {
        // Increment quota on success
        const newCount = await incrementQuota(courseId, 'AI');
        setAsksUsed(newCount);
        setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
      } else {
        setMessages(prev => prev.slice(0, -1));
        setInput(q);
        Alert.alert('Error', data?.error || 'Could not get a response. Please try again.');
      }
    } catch {
      setMessages(prev => prev.slice(0, -1));
      setInput(q);
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [input, loading, messages, topicId, chapterId, subjectId, courseId, topicTitle, presentationJson, aiLimit, onQuotaExceeded]);

  // When keyboard-controller drives the container's padding (EAS builds),
  // adding keyboardH here again would double-lift the input on iOS.
  // Keyboard closed: clear the gesture bar / home indicator via safe-area.
  const inputBottomPad =
    keyboardH > 0
      ? !isKeyboardControlled && Platform.OS === 'ios'
        ? keyboardH
        : 8
      : Math.max(insets.bottom, 8);

  if (!quotaLoaded) return <TabLoadingCard />;

  const remainingLabel = aiLimit !== null
    ? `${Math.max(0, aiLimit - asksUsed)} / ${aiLimit} asks left`
    : null;

  return (
    <KeyboardShiftView style={{ flex: 1 }} iosKeyboardVerticalOffset={120}>
      {/* Quota chip */}
      {remainingLabel && (
        <View style={aiChatStyles.quotaChip}>
          <Ionicons name="sparkles" size={13} color={colors.primary} />
          <Text style={aiChatStyles.quotaChipText}>{remainingLabel}</Text>
        </View>
      )}

      {/* Quota exceeded banner */}
      {quotaExceeded && (
        <View style={aiChatStyles.quotaBanner}>
          <Text style={aiChatStyles.quotaBannerText}>
            You've used all {aiLimit} free AI asks. Enroll to get unlimited AI tutor access.
          </Text>
          <TouchableOpacity onPress={onBuy} style={aiChatStyles.quotaBannerBtn}>
            <Text style={aiChatStyles.quotaBannerBtnText}>Unlock Course</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={aiChatStyles.msgList}
        contentContainerStyle={[
          aiChatStyles.msgListContent,
          { paddingBottom: 72 + inputBottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={scrollToBottom}
      >
        {messages.length === 0 ? (
          <View style={aiChatStyles.empty}>
            <View style={aiChatStyles.emptyIcon}>
              <Ionicons name="sparkles" size={36} color={colors.primary} />
            </View>
            <Text style={aiChatStyles.emptyTitle}>AI Tutor — {topicTitle}</Text>
            <Text style={aiChatStyles.emptySub}>
              Ask anything about this topic and get instant AI-powered answers.
            </Text>
            {!quotaExceeded && (
              <View style={aiChatStyles.suggestions}>
                {AI_SUGGESTIONS.map((s, i) => (
                  <TouchableOpacity key={i} style={aiChatStyles.suggChip} onPress={() => handleSend(s)}>
                    <Text style={aiChatStyles.suggText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : (
          messages.map((msg, i) => (
            <View key={i} style={[aiChatStyles.bubble, msg.role === 'user' ? aiChatStyles.userBubble : aiChatStyles.aiBubble]}>
              {msg.role === 'assistant'
                ? <MdContent content={msg.content} />
                : <Text style={aiChatStyles.userText}>{msg.content}</Text>
              }
            </View>
          ))
        )}
        {loading && (
          <View style={[aiChatStyles.bubble, aiChatStyles.aiBubble]}>
            <Text style={{ color: '#6B7280', fontStyle: 'italic' }}>Thinking…</Text>
          </View>
        )}
      </ScrollView>

      {/* Input bar */}
      <View style={[aiChatStyles.inputBar, { paddingBottom: inputBottomPad }]}>
        <TextInput
          style={aiChatStyles.textInput}
          placeholder={quotaExceeded ? 'Free asks used up — enroll for more' : 'Ask anything about this topic…'}
          placeholderTextColor="#9CA3AF"
          value={input}
          onChangeText={setInput}
          multiline
          editable={!quotaExceeded && !loading}
          returnKeyType="send"
          onSubmitEditing={() => handleSend()}
        />
        <TouchableOpacity
          style={[aiChatStyles.sendBtn, (!input.trim() || loading || quotaExceeded) && aiChatStyles.sendBtnDisabled]}
          onPress={() => handleSend()}
          disabled={!input.trim() || loading || quotaExceeded}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="send" size={18} color="#fff" />
          }
        </TouchableOpacity>
      </View>
    </KeyboardShiftView>
  );
}

const aiChatStyles = StyleSheet.create({
  quotaChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', backgroundColor: '#DCFCE7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, margin: 10, gap: 4 },
  quotaChipText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  quotaBanner: { backgroundColor: '#FEF9C3', borderLeftWidth: 4, borderLeftColor: '#F59E0B', marginHorizontal: 12, marginBottom: 8, borderRadius: 8, padding: 12 },
  quotaBannerText: { fontSize: 13, color: '#92400E', marginBottom: 8 },
  quotaBannerBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start' },
  quotaBannerBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  msgList: { flex: 1 },
  msgListContent: { padding: 12 },
  empty: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', textAlign: 'center', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  suggestions: { width: '100%', gap: 8 },
  suggChip: { borderWidth: 1, borderColor: '#D1FAE5', backgroundColor: '#F0FDF4', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  suggText: { fontSize: 13, color: colors.primary },
  bubble: { borderRadius: 14, padding: 12, marginBottom: 8, maxWidth: '85%' },
  userBubble: { backgroundColor: colors.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: '#F3F4F6', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  userText: { color: '#fff', fontSize: 14, lineHeight: 21 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#fff', gap: 8 },
  textInput: { flex: 1, minHeight: 40, maxHeight: 100, backgroundColor: '#F9FAFB', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1F2937', borderWidth: 1, borderColor: '#E5E7EB' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#D1D5DB' },
});

// ──────────────────────────────────────────
// Questions tab (read-only MCQs)
// ──────────────────────────────────────────
function QuestionsTabContent({ topicId }: { topicId: string }) {
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(
      `${SUPABASE_URL}/rest/v1/questions?select=id,question,options,correct_answer&topic_id=eq.${topicId}&or=(question_format.eq.single_choice,question_format.eq.multiple_choice,question_format.is.null)&options=not.is.null&order=created_at.asc&limit=5`,
      { headers: REST_HEADERS }
    )
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { if (!cancelled) setQuestions(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topicId]);

  if (loading) return <TabLoadingCard />;
  if (error) return <TabErrorCard />;
  if (!questions.length) return <TabEmptyCard message="No questions available for this topic." />;

  return (
    <View>
      {questions.map((q, idx) => (
        <View key={q.id} style={tabStyles.questionCard}>
          <Text style={tabStyles.questionLabel}>Q{idx + 1}</Text>
          <Text style={tabStyles.questionText}>{q.question}</Text>
          {Array.isArray(q.options) && q.options.map((opt, i) => (
            <View key={i} style={tabStyles.optionRow}>
              <View style={tabStyles.optionBubble}>
                <Text style={tabStyles.optionLetter}>{String.fromCharCode(65 + i)}</Text>
              </View>
              <Text style={tabStyles.optionText}>{opt}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={tabStyles.previewNotice}>Showing up to 5 questions · Enroll to attempt with scoring</Text>
    </View>
  );
}

// ──────────────────────────────────────────
// Assignments tab
// ──────────────────────────────────────────
function AssignmentsTabContent({ topicId }: { topicId: string }) {
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(
      `${SUPABASE_URL}/rest/v1/assignments?select=id,title,description,due_date&topic_id=eq.${topicId}&is_active=eq.true&order=created_at.desc&limit=5`,
      { headers: REST_HEADERS }
    )
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { if (!cancelled) setAssignments(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topicId]);

  if (loading) return <TabLoadingCard />;
  if (error) return <TabErrorCard />;
  if (!assignments.length) return <TabEmptyCard message="No assignments for this topic." />;

  return (
    <View>
      {assignments.map(a => (
        <View key={a.id} style={tabStyles.assignmentCard}>
          <View style={tabStyles.assignmentIconWrap}>
            <Ionicons name="clipboard-outline" size={20} color={colors.primary} />
          </View>
          <View style={tabStyles.assignmentInfo}>
            <Text style={tabStyles.assignmentTitle}>{a.title}</Text>
            {a.description ? <Text style={tabStyles.assignmentDesc} numberOfLines={2}>{a.description}</Text> : null}
            {a.due_date ? (
              <Text style={tabStyles.assignmentDue}>Due: {new Date(a.due_date).toLocaleDateString()}</Text>
            ) : null}
          </View>
        </View>
      ))}
      <Text style={tabStyles.previewNotice}>Submit assignments after enrolling in the course.</Text>
    </View>
  );
}

// ──────────────────────────────────────────
// DPP tab (read-only)
// ──────────────────────────────────────────
function DPPTabContent({ topicId }: { topicId: string }) {
  const [problems, setProblems] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(
      `${SUPABASE_URL}/functions/v1/extract-dpp-questions`,
      {
        method: 'POST',
        headers: { ...REST_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic_id: topicId, limit: 5 }),
      }
    )
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        if (!cancelled) {
          const list = Array.isArray(data) ? data : (data?.questions ?? data?.data ?? []);
          setProblems(Array.isArray(list) ? list.slice(0, 5) : []);
        }
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topicId]);

  if (loading) return <TabLoadingCard />;
  if (error) return <TabErrorCard />;
  if (!problems.length) return <TabEmptyCard message="No DPP problems for this topic." />;

  return (
    <View>
      {problems.map((q, idx) => (
        <View key={q.id} style={tabStyles.questionCard}>
          <Text style={tabStyles.questionLabel}>P{idx + 1}</Text>
          <Text style={tabStyles.questionText}>{q.question}</Text>
          {Array.isArray(q.options) && q.options.map((opt, i) => (
            <View key={i} style={tabStyles.optionRow}>
              <View style={tabStyles.optionBubble}>
                <Text style={tabStyles.optionLetter}>{String.fromCharCode(65 + i)}</Text>
              </View>
              <Text style={tabStyles.optionText}>{opt}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={tabStyles.previewNotice}>Showing up to 5 DPP problems · Enroll to attempt with AI grading</Text>
    </View>
  );
}

// ──────────────────────────────────────────
// Results tab — static info
// ──────────────────────────────────────────
function ResultsTabContent({ onBuy }: { onBuy: () => void }) {
  return (
    <View style={tabStyles.resultsCard}>
      <View style={tabStyles.resultsIconWrap}>
        <Ionicons name="bar-chart-outline" size={36} color={colors.primary} />
      </View>
      <Text style={tabStyles.resultsTitle}>Test Results</Text>
      <Text style={tabStyles.resultsSub}>
        Your test results will appear here after you enroll and take tests.
        Track your scores, performance trends, and improvement over time.
      </Text>
      <TouchableOpacity onPress={onBuy} style={tabStyles.watchBtnWrap}>
        <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={tabStyles.watchBtnGradient}>
          <Text style={tabStyles.watchBtnText}>Enroll to Start Taking Tests</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}


// ──────────────────────────────────────────────────────────
// Main Screen
// ──────────────────────────────────────────────────────────
export default function CoursePreviewScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { courseId, courseName } = route.params;

  const { freeChapters, isLoading: freeLoading } = useCourseFreeAccess(courseId);
  const { aiLimit, doubtsLimit } = useCourseFreePreviewLimits(courseId);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PreviewTab>('Classes');
  const [lectureDurations, setLectureDurations] = useState<Record<string, number>>({});

  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [chaptersLoading, setChaptersLoading] = useState(false);

  const [purchaseDialogVisible, setPurchaseDialogVisible] = useState(false);
  const [quotaDialogVisible, setQuotaDialogVisible] = useState(false);

  const freeChapterIds = new Set(freeChapters.map(f => f.chapter_id));

  const fetchSubjects = useCallback(async () => {
    setSubjectsLoading(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/course_subjects?select=display_order,popular_subjects:subject_id(id,name,slug)&course_id=eq.${courseId}&order=display_order.asc`,
        { headers: REST_HEADERS }
      );
      if (!res.ok) return;
      const data = await res.json();
      const mapped: Subject[] = (Array.isArray(data) ? data : []).map((r: any) => r.popular_subjects).filter(Boolean);
      setSubjects(mapped);
      if (mapped.length > 0) setSelectedSubject(mapped[0]);
    } catch { /* ignore */ } finally { setSubjectsLoading(false); }
  }, [courseId]);

  const fetchChaptersAndDurations = useCallback(async (subjectId: string) => {
    setChaptersLoading(true);
    setChapters([]);
    setSelectedTopic(null);
    setExpandedChapterId(null);
    try {
      const [chapRes, durRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/rpc/get_subject_chapters_with_topics`, {
          method: 'POST', headers: REST_HEADERS,
          body: JSON.stringify({ p_subject_id: subjectId }),
        }),
        fetch(`${SUPABASE_URL}/rest/v1/rpc/get_topic_lecture_durations`, {
          method: 'POST', headers: REST_HEADERS,
          body: JSON.stringify({ p_subject_id: subjectId }),
        }),
      ]);
      if (chapRes.ok) {
        const data = await chapRes.json();
        const mapped: Chapter[] = (Array.isArray(data) ? data : []).map((r: any) => ({
          id: r.chapter_id, title: r.title, chapter_number: r.chapter_number,
          topics: Array.isArray(r.topics) ? r.topics : [],
        }));
        setChapters(mapped);
        const firstFree = mapped.find(c => freeChapterIds.has(c.id));
        if (firstFree) setExpandedChapterId(firstFree.id);
      }
      if (durRes.ok) {
        const ddata = await durRes.json();
        const map: Record<string, number> = {};
        if (Array.isArray(ddata)) ddata.forEach((r: any) => { if (r.topic_id) map[r.topic_id] = r.total_duration_minutes ?? 0; });
        setLectureDurations(map);
      }
    } catch { /* ignore */ } finally { setChaptersLoading(false); }
  }, []);

  useEffect(() => { fetchSubjects(); }, [fetchSubjects]);
  useEffect(() => { if (selectedSubject) fetchChaptersAndDurations(selectedSubject.id); }, [selectedSubject, fetchChaptersAndDurations]);

  const handleSubjectPress = (subject: Subject) => {
    setSelectedSubject(subject);
    setSelectedTopic(null);
    setExpandedChapterId(null);
    setActiveTab('Classes');
  };

  const handleChapterPress = (chapter: Chapter) => {
    if (!freeChapterIds.has(chapter.id)) { setPurchaseDialogVisible(true); return; }
    setExpandedChapterId(prev => prev === chapter.id ? null : chapter.id);
  };

  const handleTopicPress = (topic: Topic, chapterId: string) => {
    navigation.navigate('TopicDetails', {
      topicId: topic.id,
      topicTitle: topic.title,
      chapterId,
      subjectId: selectedSubject?.id,
      subjectName: selectedSubject?.name,
      isPreview: true,
      courseId,
      courseName,
      previewAiLimit: aiLimit ?? 3,
      previewDoubtsLimit: doubtsLimit ?? 3,
    });
  };

  const handleTabPress = (tab: PreviewTab) => { setActiveTab(tab); };

  const handleBuyCourse = () => {
    setPurchaseDialogVisible(false);
    setQuotaDialogVisible(false);
    navigation.navigate('ViewCourse', { courseId });
  };

  const getDuration = (topic: Topic): string => {
    const mins = lectureDurations[topic.id] ?? topic.estimated_duration_minutes;
    return mins ? `${mins}m` : '—';
  };

  const showEmptyState = !freeLoading && !chaptersLoading && freeChapters.length === 0;

  const renderTabContent = () => {
    if (!selectedTopic || !selectedSubject) return null;
    const topicId = selectedTopic.id;

    switch (activeTab) {
      case 'Classes': {
        const chapterId = chapters.find(c => c.topics.some(t => t.id === topicId))?.id ?? '';
        return (
          <ClassesTabContent
            key={topicId}
            topicId={topicId}
            chapterId={chapterId}
            topicVideoId={selectedTopic.video_id}
            topicVideoPlatform={selectedTopic.video_platform}
            aiGeneratedVideoUrl={selectedTopic.ai_generated_video_url}
            courseId={courseId}
            topicTitle={selectedTopic.title}
            onBuy={handleBuyCourse}
            navigation={navigation}
          />
        );
      }
      case 'AI': {
        const aiChapterId = chapters.find(c => c.topics.some(t => t.id === topicId))?.id ?? '';
        return (
          <PreviewAIChatTab
            key={topicId}
            topicId={topicId}
            subjectId={selectedSubject.id}
            chapterId={aiChapterId}
            courseId={courseId}
            topicTitle={selectedTopic.title}
            presentationJson={selectedTopic.ai_presentation_json}
            aiLimit={aiLimit}
            onQuotaExceeded={() => setQuotaDialogVisible(true)}
            onBuy={handleBuyCourse}
          />
        );
      }
      case 'Questions':
        return <QuestionsTabContent key={topicId} topicId={topicId} />;
      case 'Assignments':
        return <AssignmentsTabContent key={topicId} topicId={topicId} />;
      case 'DPP':
        return <DPPTabContent key={topicId} topicId={topicId} />;
      case 'Results':
        return <ResultsTabContent onBuy={handleBuyCourse} />;
      case 'Doubts': {
        const onBeforeSend = async (): Promise<boolean> => {
          if (doubtsLimit === null) return true;
          const count = await getQuotaCount(courseId, 'Doubts');
          if (count >= doubtsLimit) { setQuotaDialogVisible(true); return false; }
          await incrementQuota(courseId, 'Doubts');
          return true;
        };
        return (
          <DoubtsTab
            key={topicId}
            subjectId={selectedSubject.id}
            subjectName={selectedSubject.name}
            onBeforeSend={onBeforeSend}
          />
        );
      }
      case "PYQ's":
        return <PYQTab key={topicId} subjectId={selectedSubject.id} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        {/* Sidebar toggle */}
        <TouchableOpacity onPress={() => setSidebarVisible(v => !v)} style={styles.sidebarToggleBtn}>
          <Ionicons name={sidebarVisible ? 'menu' : 'menu-outline'} size={22} color={sidebarVisible ? colors.primary : colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{courseName}</Text>
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>Free Preview</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleBuyCourse} style={styles.buyCourseButton}>
          <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buyCourseGradient}>
            <Text style={styles.buyCourseText}>Buy Course</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Subject Pills */}
      {subjectsLoading ? (
        <View style={styles.pillsLoading}><ActivityIndicator size="small" color={colors.primary} /></View>
      ) : subjects.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll} contentContainerStyle={styles.pillsContent}>
          {subjects.map(subject => {
            const isSelected = selectedSubject?.id === subject.id;
            return (
              <TouchableOpacity key={subject.id} onPress={() => handleSubjectPress(subject)} style={[styles.pill, isSelected && styles.pillSelected]}>
                <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>{subject.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Empty state — no free chapters */}
      {showEmptyState ? (
        <View style={styles.emptyStateWrap}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="lock-open-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.emptyStateTitle}>Preview not available yet</Text>
          <Text style={styles.emptyStateSub}>The instructor hasn't enabled free preview chapters for this course yet.</Text>
          <TouchableOpacity onPress={handleBuyCourse} style={styles.emptyBuyButton}>
            <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyBuyGradient}>
              <Text style={styles.emptyBuyText}>Buy Course</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.body}>
          {/* Sidebar — collapsible */}
          {sidebarVisible && (
          <View style={styles.sidebar}>
            <Text style={styles.sidebarTitle}>Chapters</Text>
            {freeLoading || chaptersLoading ? (
              <View style={styles.sidebarLoading}><ActivityIndicator size="small" color={colors.primary} /></View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {chapters.length === 0 ? (
                  <Text style={styles.emptyText}>No chapters found</Text>
                ) : chapters.map(chapter => {
                  const isFree = freeChapterIds.has(chapter.id);
                  const isExpanded = expandedChapterId === chapter.id;
                  return (
                    <View key={chapter.id}>
                      <TouchableOpacity
                        onPress={() => handleChapterPress(chapter)}
                        style={[styles.chapterItem, isExpanded && styles.chapterItemExpanded, !isFree && styles.chapterItemLocked]}
                      >
                        <View style={[styles.chapterNumBubble, isExpanded && styles.chapterNumBubbleActive]}>
                          <Text style={[styles.chapterNumber, isExpanded && styles.chapterNumberActive]}>{chapter.chapter_number}</Text>
                        </View>
                        <Text style={[styles.chapterTitle, !isFree && styles.chapterTitleLocked]} numberOfLines={2}>{chapter.title}</Text>
                        {!isFree
                          ? <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
                          : <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={12} color={isExpanded ? colors.primary : colors.textMuted} />
                        }
                      </TouchableOpacity>
                      {isFree && isExpanded && chapter.topics.map(topic => {
                        const isActive = selectedTopic?.id === topic.id;
                        return (
                          <TouchableOpacity key={topic.id} onPress={() => handleTopicPress(topic, chapter.id)} style={[styles.topicItem, isActive && styles.topicItemActive]}>
                            <View style={[styles.topicNumBubble, isActive && styles.topicNumBubbleActive]}>
                              <Text style={[styles.topicNumber, isActive && styles.topicNumberActive]}>{topic.topic_number}</Text>
                            </View>
                            <View style={styles.topicTextWrap}>
                              <Text style={[styles.topicTitle, isActive && styles.topicTitleActive]} numberOfLines={2}>{topic.title}</Text>
                              <Text style={styles.topicDuration}>{getDuration(topic)}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
          )}

          {/* Main content */}
          <View style={styles.mainArea}>
            {selectedTopic ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
                  {PREVIEW_TABS.map(tab => {
                    const isActive = activeTab === tab;
                    return (
                      <TouchableOpacity key={tab} onPress={() => handleTabPress(tab)} style={[styles.tabPill, isActive && styles.tabPillActive]}>
                        <Text style={[styles.tabPillText, isActive && styles.tabPillTextActive]}>{tab}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabContentInner}>
                  {renderTabContent()}
                </ScrollView>
              </>
            ) : (
              <View style={styles.noSelectionWrap}>
                <Ionicons name="hand-left-outline" size={36} color={colors.textMuted} />
                <Text style={styles.noSelectionTitle}>Select a topic</Text>
                <Text style={styles.noSelectionSub}>Tap a free chapter to expand it, then choose a topic to preview.</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Purchase Dialog */}
      <Modal visible={purchaseDialogVisible} transparent animationType="fade" onRequestClose={() => setPurchaseDialogVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="lock-closed" size={32} color={colors.primary} />
            </View>
            <Text style={styles.modalTitle}>Chapter Locked</Text>
            <Text style={styles.modalMessage}>This chapter requires course purchase to access.</Text>
            <TouchableOpacity onPress={handleBuyCourse} style={styles.modalPrimaryButton}>
              <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalButtonGradient}>
                <Text style={styles.modalPrimaryText}>Buy Course</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPurchaseDialogVisible(false)} style={styles.modalSecondaryButton}>
              <Text style={styles.modalSecondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Quota Dialog */}
      <Modal visible={quotaDialogVisible} transparent animationType="fade" onRequestClose={() => setQuotaDialogVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIconWrap, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
              <Ionicons name="alert-circle-outline" size={32} color={colors.warning} />
            </View>
            <Text style={styles.modalTitle}>Preview Limit Reached</Text>
            <Text style={styles.modalMessage}>You've used up your free preview quota. Buy the course for unlimited access.</Text>
            <TouchableOpacity onPress={handleBuyCourse} style={styles.modalPrimaryButton}>
              <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalButtonGradient}>
                <Text style={styles.modalPrimaryText}>Buy Course</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setQuotaDialogVisible(false)} style={styles.modalSecondaryButton}>
              <Text style={styles.modalSecondaryText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────
// Tab-specific styles
// ──────────────────────────────────────────
const tabStyles = StyleSheet.create({
  feedbackCard: {
    margin: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 120,
    justifyContent: 'center',
  },
  feedbackText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Classes
  recordingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  thumbnail: { width: 72, height: 50, borderRadius: borderRadius.sm, backgroundColor: colors.gray100 },
  thumbnailPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  recordingInfo: { flex: 1 },
  recordingTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, lineHeight: 18 },
  recordingDuration: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  buyPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(43,189,110,0.06)',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(43,189,110,0.2)',
  },
  buyPromptText: { fontSize: fontSize.xs, color: colors.textSecondary, flex: 1 },
  buyPromptBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  buyPromptBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.white },
  // AI
  aiCard: {
    margin: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
  },
  aiIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(43,189,110,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  aiTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  aiSub: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  watchBtnWrap: { borderRadius: borderRadius.md, overflow: 'hidden', alignSelf: 'stretch', marginTop: spacing.xs },
  watchBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  watchBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.white },
  quotaNote: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center' },
  // Questions / DPP
  questionCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  questionLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },
  questionText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20, marginBottom: 4 },
  optionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginTop: 2 },
  optionBubble: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  optionLetter: { fontSize: 9, fontWeight: '700', color: colors.textSecondary },
  optionText: { flex: 1, fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 18 },
  previewNotice: {
    marginHorizontal: spacing.md, marginTop: spacing.sm, marginBottom: spacing.md,
    fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center',
  },
  // Classes — video cards
  videoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  videoCardThumb: {
    width: 44, height: 44, borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(43,189,110,0.1)',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  videoCardInfo: { flex: 1 },
  videoCardTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, lineHeight: 18 },
  videoCardPlatform: { fontSize: fontSize.xs, color: colors.primary, marginTop: 2, fontWeight: '500' },
  videoCardDesc: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  languageLabel: {
    marginHorizontal: spacing.md, marginTop: spacing.md, marginBottom: 2,
    fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  // Assignments
  assignmentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  assignmentIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(43,189,110,0.1)',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  assignmentInfo: { flex: 1 },
  assignmentTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  assignmentDesc: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  assignmentDue: { fontSize: fontSize.xs, color: colors.warning, marginTop: 4, fontWeight: '500' },
  // Results
  resultsCard: {
    margin: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
  },
  resultsIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(43,189,110,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  resultsTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  resultsSub: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});

// ──────────────────────────────────────────
// Screen-level styles
// ──────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.background, gap: spacing.sm,
  },
  backButton: { padding: spacing.xs },
  sidebarToggleBtn: { padding: spacing.xs, marginLeft: 2 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  headerTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, flexShrink: 1 },
  previewBadge: {
    backgroundColor: 'rgba(43,189,110,0.12)', borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(43,189,110,0.3)',
  },
  previewBadgeText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  buyCourseButton: { borderRadius: borderRadius.md, overflow: 'hidden' },
  buyCourseGradient: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: borderRadius.md },
  buyCourseText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.white },
  pillsLoading: { paddingVertical: spacing.sm, alignItems: 'center' },
  pillsScroll: { borderBottomWidth: 1, borderBottomColor: colors.border, maxHeight: 52 },
  pillsContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full, backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.border },
  pillSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: fontSize.sm, fontWeight: '500', color: colors.textSecondary },
  pillTextSelected: { color: colors.white, fontWeight: '700' },
  emptyStateWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  emptyIconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(43,189,110,0.1)', justifyContent: 'center', alignItems: 'center' },
  emptyStateTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyStateSub: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  emptyBuyButton: { borderRadius: borderRadius.md, overflow: 'hidden', alignSelf: 'stretch', marginTop: spacing.sm },
  emptyBuyGradient: { paddingVertical: spacing.sm + 2, alignItems: 'center', borderRadius: borderRadius.md },
  emptyBuyText: { fontSize: fontSize.md, fontWeight: '700', color: colors.white },
  body: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 145, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface, paddingTop: spacing.sm },
  sidebarTitle: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: spacing.sm, marginBottom: spacing.xs },
  sidebarLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: spacing.xl },
  chapterItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4 },
  chapterItemExpanded: { backgroundColor: 'rgba(43,189,110,0.06)' },
  chapterItemLocked: { opacity: 0.5 },
  chapterNumBubble: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.gray200, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  chapterNumBubbleActive: { backgroundColor: colors.primary },
  chapterNumber: { fontSize: 9, fontWeight: '700', color: colors.textSecondary },
  chapterNumberActive: { color: colors.white },
  chapterTitle: { flex: 1, fontSize: fontSize.xs, fontWeight: '500', color: colors.text, lineHeight: 15 },
  chapterTitleLocked: { color: colors.textMuted },
  topicItem: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background, paddingLeft: spacing.md, gap: 4 },
  topicItemActive: { backgroundColor: 'rgba(43,189,110,0.1)', borderLeftWidth: 3, borderLeftColor: colors.primary },
  topicNumBubble: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  topicNumBubbleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  topicNumber: { fontSize: 8, fontWeight: '700', color: colors.textSecondary },
  topicNumberActive: { color: colors.white },
  topicTextWrap: { flex: 1, gap: 2 },
  topicTitle: { fontSize: 11, fontWeight: '400', color: colors.textSecondary, lineHeight: 14 },
  topicTitleActive: { color: colors.primary, fontWeight: '600' },
  topicDuration: { fontSize: 9, color: colors.textMuted },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', padding: spacing.md },
  mainArea: { flex: 1, backgroundColor: colors.background },
  tabsScroll: { borderBottomWidth: 1, borderBottomColor: colors.border, maxHeight: 46 },
  tabsContent: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xs, flexDirection: 'row', alignItems: 'center' },
  tabPill: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  tabPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabPillText: { fontSize: fontSize.xs, fontWeight: '500', color: colors.textSecondary },
  tabPillTextActive: { color: colors.white, fontWeight: '700' },
  tabContent: { flex: 1 },
  tabContentInner: { paddingBottom: spacing.xl, paddingHorizontal: spacing.md },
  noSelectionWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  noSelectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  noSelectionSub: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalCard: { backgroundColor: colors.background, borderRadius: borderRadius.xl, padding: spacing.xl, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 10 },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(43,189,110,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  modalMessage: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  modalPrimaryButton: { borderRadius: borderRadius.md, overflow: 'hidden', alignSelf: 'stretch', marginBottom: spacing.sm },
  modalButtonGradient: { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  modalPrimaryText: { fontSize: fontSize.md, fontWeight: '700', color: colors.white },
  modalSecondaryButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  modalSecondaryText: { fontSize: fontSize.md, fontWeight: '500', color: colors.textSecondary },
});
