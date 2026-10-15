import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Dimensions,
  Modal,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/AppNavigator';
import { SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_TOKEN_KEY, getValidAccessToken } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';

type NavProps = NativeStackNavigationProp<RootStackParamList>;

type BadgeType = 'bronze' | 'silver' | 'gold' | 'master' | 'course_complete';

interface StudentBadge {
  id: string;
  student_id: string;
  badge_type: BadgeType;
  topic_id?: string | null;
  chapter_id?: string | null;
  subject_id?: string | null;
  course_id?: string | null;
  title: string;
  description?: string | null;
  earned_at: string;
}

const BADGE_CONFIG: Record<BadgeType, { emoji: string; label: string; bg: string; border: string; text: string }> = {
  bronze:          { emoji: '🥉', label: 'Bronze',          bg: '#FEF3C7', border: '#D97706', text: '#92400E' },
  silver:          { emoji: '🥈', label: 'Silver',          bg: '#F3F4F6', border: '#6B7280', text: '#374151' },
  gold:            { emoji: '🥇', label: 'Gold',            bg: '#FEF9C3', border: '#CA8A04', text: '#713F12' },
  master:          { emoji: '⭐', label: 'Master',          bg: '#F5F3FF', border: '#7C3AED', text: '#4C1D95' },
  course_complete: { emoji: '🎓', label: 'Course Complete', bg: '#ECFDF5', border: '#059669', text: '#065F46' },
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BADGE_CARD_WIDTH = (SCREEN_WIDTH - spacing.md * 2 - spacing.sm) / 2;

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

// Generate HTML that draws a certificate on an HTML5 canvas and returns a data URL
function buildCertificateHtml(courseName: string, dateStr: string): string {
  const escaped = (s: string) => s.replace(/'/g, "\\'");
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><style>body{margin:0;background:#000;}</style></head>
<body>
<canvas id="c" width="1200" height="800"></canvas>
<script>
(function() {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const W = 1200, H = 800;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0F2027');
  bg.addColorStop(0.5, '#203A43');
  bg.addColorStop(1, '#2C5364');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Decorative circle top-right
  ctx.beginPath();
  ctx.arc(W - 80, 80, 160, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,184,166,0.10)';
  ctx.fill();

  // Decorative circle bottom-left
  ctx.beginPath();
  ctx.arc(80, H - 80, 130, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,184,166,0.08)';
  ctx.fill();

  // Outer border
  ctx.strokeStyle = 'rgba(20,184,166,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, W - 60, H - 60);

  // Inner border
  ctx.strokeStyle = 'rgba(20,184,166,0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(55, 55, W - 110, H - 110);

  // Trophy emoji (drawn as text)
  ctx.font = '80px serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏆', W / 2, 165);

  // CERTIFICATE heading
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#14B8A6';
  ctx.letterSpacing = '6px';
  ctx.textAlign = 'center';
  ctx.fillText('CERTIFICATE OF COMPLETION', W / 2, 215);

  // Divider line
  ctx.strokeStyle = 'rgba(20,184,166,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W/2 - 200, 235);
  ctx.lineTo(W/2 + 200, 235);
  ctx.stroke();

  // Sub-text
  ctx.font = '18px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('This is presented for successfully completing', W / 2, 270);

  // Course name (multi-line if long)
  ctx.font = 'bold 36px serif';
  ctx.fillStyle = '#FFFFFF';
  const words = '${escaped(courseName)}'.split(' ');
  let line = '', y = 340;
  for (let i = 0; i < words.length; i++) {
    const test = line + (line ? ' ' : '') + words[i];
    if (ctx.measureText(test).width > W - 200 && line) {
      ctx.fillText(line, W/2, y);
      line = words[i];
      y += 50;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, W/2, y);
  y += 50;

  // Divider
  ctx.strokeStyle = 'rgba(20,184,166,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W/2 - 120, y + 20);
  ctx.lineTo(W/2 + 120, y + 20);
  ctx.stroke();

  // Date
  ctx.font = '18px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('Completed: ${escaped(dateStr)}', W/2, y + 55);

  // Simple Lecture branding
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#14B8A6';
  ctx.fillText('Simple Lecture', W/2, H - 55);

  // Send data URL back to React Native
  const dataUrl = canvas.toDataURL('image/png');
  window.ReactNativeWebView.postMessage(dataUrl);
})();
</script>
</body>
</html>`;
}

// Hidden WebView that generates a certificate PNG and calls onCapture with the data URL
function CertificateCapture({
  courseName,
  dateStr,
  onCapture,
  onError,
}: {
  courseName: string;
  dateStr: string;
  onCapture: (dataUrl: string) => void;
  onError: () => void;
}) {
  const html = buildCertificateHtml(courseName, dateStr);
  return (
    <WebView
      style={{ width: 1, height: 1, opacity: 0 }}
      originWhitelist={['*']}
      source={{ html }}
      javaScriptEnabled
      onMessage={e => {
        const dataUrl = e.nativeEvent.data;
        if (dataUrl && dataUrl.startsWith('data:image/png')) {
          onCapture(dataUrl);
        } else {
          onError();
        }
      }}
      onError={() => onError()}
    />
  );
}

export default function MyRewardsScreen() {
  const navigation = useNavigation<NavProps>();
  const { openSidebar } = useSidebar();
  const insets = useSafeAreaInsets();

  const [badges, setBadges] = useState<StudentBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for certificate generation
  const [capturingBadge, setCapturingBadge] = useState<StudentBadge | null>(null);
  const [generatingPng, setGeneratingPng] = useState(false);

  const fetchBadges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getValidAccessToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/student_badges?select=*&order=earned_at.desc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { message?: string }).message || `Error ${res.status}`);
      }
      const data: StudentBadge[] = await res.json();
      setBadges(data);
    } catch (err) {
      console.error('[MyRewards] fetch error:', err);
      setError('Could not load badges. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBadges(); }, [fetchBadges]);

  const handleDownloadCertificate = useCallback((badge: StudentBadge) => {
    setCapturingBadge(badge);
    setGeneratingPng(true);
  }, []);

  const handleCaptureReady = useCallback(async (dataUrl: string) => {
    setGeneratingPng(false);
    const badge = capturingBadge;
    setCapturingBadge(null);
    if (!badge) return;

    try {
      // Strip "data:image/png;base64," prefix and save to cache
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      const fileName = `certificate_${badge.id}.png`;
      const fileUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Share the PNG file
      await Share.share({
        url: fileUri,
        title: `Certificate – ${badge.title.replace('Course Completed: ', '')}`,
        message: `I completed "${badge.title.replace('Course Completed: ', '')}" on Simple Lecture! 🎓`,
      });
    } catch (err) {
      console.error('[MyRewards] PNG save/share error:', err);
      // Fallback to text share
      const courseName = badge.title.replace('Course Completed: ', '');
      await Share.share({
        message:
          `🎓 Certificate of Completion\n\n` +
          `I have successfully completed:\n📚 ${courseName}\n\n` +
          `Completed on: ${formatDate(badge.earned_at)}\n\nSimple Lecture App 🏆`,
        title: `Certificate – ${courseName}`,
      }).catch(() => {});
    }
  }, [capturingBadge]);

  const handleCaptureError = useCallback(() => {
    setGeneratingPng(false);
    const badge = capturingBadge;
    setCapturingBadge(null);
    if (!badge) return;
    // Fallback to text share on canvas error
    const courseName = badge.title.replace('Course Completed: ', '');
    Share.share({
      message:
        `🎓 I completed "${courseName}" on Simple Lecture! 🏆\nCompleted: ${formatDate(badge.earned_at)}`,
      title: `Certificate – ${courseName}`,
    }).catch(() => {});
  }, [capturingBadge]);

  const summary = {
    bronze:          badges.filter(b => b.badge_type === 'bronze').length,
    silver:          badges.filter(b => b.badge_type === 'silver').length,
    gold:            badges.filter(b => b.badge_type === 'gold').length,
    master:          badges.filter(b => b.badge_type === 'master').length,
    course_complete: badges.filter(b => b.badge_type === 'course_complete').length,
    total:           badges.length,
  };

  const courseBadges = badges.filter(b => b.badge_type === 'course_complete');

  // All badges sorted by date for the grid (course_complete included)
  const badgePairs: [StudentBadge, StudentBadge | null][] = [];
  for (let i = 0; i < badges.length; i += 2) {
    badgePairs.push([badges[i], badges[i + 1] ?? null]);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <LinearGradient
        colors={['#F59E0B', '#D97706']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>My Rewards</Text>
          <Text style={styles.headerSubtitle}>Track your learning achievements</Text>
        </View>
        <HeaderMenuButton onPress={openSidebar} />
      </LinearGradient>

      {/* Hidden certificate PNG generator (runs when capturingBadge is set) */}
      {capturingBadge && (
        <CertificateCapture
          courseName={capturingBadge.title.replace('Course Completed: ', '')}
          dateStr={formatDate(capturingBadge.earned_at)}
          onCapture={handleCaptureReady}
          onError={handleCaptureError}
        />
      )}

      {/* Loading overlay during PNG generation */}
      {generatingPng && (
        <View style={styles.pngLoadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.pngLoadingText}>Generating certificate…</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your rewards…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchBadges}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary grid */}
          <View style={styles.summaryGrid}>
            {(Object.keys(BADGE_CONFIG) as BadgeType[]).map(type => (
              <View key={type} style={[styles.summaryCard, { borderColor: BADGE_CONFIG[type].border, backgroundColor: BADGE_CONFIG[type].bg }]}>
                <Text style={styles.summaryEmoji}>{BADGE_CONFIG[type].emoji}</Text>
                <Text style={[styles.summaryCount, { color: BADGE_CONFIG[type].text }]}>{summary[type]}</Text>
                <Text style={[styles.summaryLabel, { color: BADGE_CONFIG[type].text }]}>{BADGE_CONFIG[type].label}</Text>
              </View>
            ))}
          </View>

          {/* Total row */}
          <View style={styles.totalRow}>
            <Ionicons name="ribbon-outline" size={18} color={colors.primary} />
            <Text style={styles.totalText}>
              Total Badges Earned: <Text style={styles.totalCount}>{summary.total}</Text>
            </Text>
          </View>

          {/* Certificates */}
          {courseBadges.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🎓 Certificates</Text>
              {courseBadges.map(badge => (
                <CertificateCard
                  key={badge.id}
                  badge={badge}
                  onDownload={() => handleDownloadCertificate(badge)}
                />
              ))}
            </View>
          )}

          {/* All Badges — 2-column grid */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>All Badges</Text>
            {badges.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 48 }}>🏅</Text>
                <Text style={styles.emptyTitle}>No badges yet</Text>
                <Text style={styles.emptySubtitle}>Watch lecture videos to start earning badges!</Text>
              </View>
            ) : (
              <View style={styles.badgeGrid}>
                {badgePairs.map(([left, right], idx) => (
                  <View key={idx} style={styles.badgeRow}>
                    <BadgeCard badge={left} />
                    {right ? <BadgeCard badge={right} /> : <View style={{ width: BADGE_CARD_WIDTH }} />}
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function CertificateCard({ badge, onDownload }: { badge: StudentBadge; onDownload: () => void }) {
  const courseName = badge.title.replace('Course Completed: ', '');
  return (
    <View style={certStyles.container}>
      <LinearGradient
        colors={['#0F2027', '#203A43', '#2C5364']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={certStyles.gradient}
      >
        <View style={certStyles.decoCircle1} />
        <View style={certStyles.decoCircle2} />
        <View style={certStyles.innerBorder}>
          <Text style={certStyles.trophyEmoji}>🏆</Text>
          <Text style={certStyles.certLabel}>CERTIFICATE OF COMPLETION</Text>
          <Text style={certStyles.presentedTo}>This is presented for completing</Text>
          <Text style={certStyles.courseName}>{courseName}</Text>
          {badge.description && <Text style={certStyles.desc}>{badge.description}</Text>}
          <View style={certStyles.divider} />
          <Text style={certStyles.dateText}>Completed: {formatDate(badge.earned_at)}</Text>
        </View>
      </LinearGradient>
      {/* Download / Share PNG button */}
      <TouchableOpacity style={certStyles.downloadBtn} onPress={onDownload} activeOpacity={0.8}>
        <Ionicons name="download-outline" size={18} color="#fff" />
        <Text style={certStyles.downloadBtnText}>Download Certificate PNG</Text>
      </TouchableOpacity>
    </View>
  );
}

function BadgeCard({ badge }: { badge: StudentBadge }) {
  const cfg = BADGE_CONFIG[badge.badge_type] ?? BADGE_CONFIG.bronze;
  return (
    <View style={[badgeCardStyles.card, { borderColor: cfg.border, backgroundColor: cfg.bg, width: BADGE_CARD_WIDTH }]}>
      <Text style={badgeCardStyles.emoji}>{cfg.emoji}</Text>
      <Text style={[badgeCardStyles.type, { color: cfg.text }]}>{cfg.label}</Text>
      <Text style={badgeCardStyles.title} numberOfLines={2}>{badge.title}</Text>
      <Text style={badgeCardStyles.date}>{formatDate(badge.earned_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700', color: '#fff' },
  headerSubtitle: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  centerState: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md,
  },
  loadingText: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm },
  errorText: { fontSize: fontSize.sm, color: colors.error, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: fontSize.sm },
  pngLoadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  pngLoadingText: { fontSize: fontSize.sm, color: '#fff', marginTop: spacing.sm },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, gap: spacing.md },
  summaryGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between',
  },
  summaryCard: {
    width: '30%', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md, borderWidth: 1.5, gap: 4,
  },
  summaryEmoji: { fontSize: 24 },
  summaryCount: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  totalRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: '#DCFCE7', paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: borderRadius.md,
  },
  totalText: { fontSize: fontSize.sm, color: colors.text },
  totalCount: { fontWeight: '700', color: colors.primary },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  badgeGrid: { gap: spacing.sm },
  badgeRow: { flexDirection: 'row', gap: spacing.sm },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
});

const certStyles = StyleSheet.create({
  container: { gap: spacing.sm, marginBottom: spacing.xs },
  gradient: { borderRadius: borderRadius.lg, padding: 3, overflow: 'hidden' },
  decoCircle1: {
    position: 'absolute', top: -40, right: -40, width: 120, height: 120,
    borderRadius: 60, backgroundColor: 'rgba(20,184,166,0.12)',
  },
  decoCircle2: {
    position: 'absolute', bottom: -30, left: -30, width: 100, height: 100,
    borderRadius: 50, backgroundColor: 'rgba(20,184,166,0.08)',
  },
  innerBorder: {
    borderWidth: 1, borderColor: 'rgba(20,184,166,0.3)',
    borderRadius: 10, padding: spacing.lg, alignItems: 'center', gap: 8,
  },
  trophyEmoji: { fontSize: 40 },
  certLabel: { fontSize: 11, letterSpacing: 2, fontWeight: '700', color: '#14B8A6', textAlign: 'center' },
  presentedTo: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.6)' },
  courseName: { fontSize: fontSize.xl, fontWeight: '700', color: '#fff', textAlign: 'center' },
  desc: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  divider: { width: 60, height: 1, backgroundColor: 'rgba(20,184,166,0.4)', marginVertical: 4 },
  dateText: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.5)' },
  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, backgroundColor: '#0EA5E9',
    paddingVertical: spacing.sm + 2, borderRadius: borderRadius.md,
  },
  downloadBtnText: { color: '#fff', fontWeight: '600', fontSize: fontSize.sm },
});

const badgeCardStyles = StyleSheet.create({
  card: {
    alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md, borderWidth: 1.5, gap: 4,
  },
  emoji: { fontSize: 32, marginBottom: 2 },
  type: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { fontSize: fontSize.xs, fontWeight: '600', color: colors.text, textAlign: 'center' },
  date: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
});
