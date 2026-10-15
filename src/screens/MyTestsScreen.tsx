import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAllSelfTests, deriveStatus, SelfTestStatus, SelfTestWithLabels } from '../hooks/useMyTests';
import AutoChapterTestBanner from '../components/AutoChapterTestBanner';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const STATUS_META: Record<SelfTestStatus, { label: string; color: string; bg: string; icon: any }> = {
  upcoming: { label: 'Upcoming', color: '#2563EB', bg: '#EFF6FF', icon: 'time-outline' },
  live: { label: 'Live now', color: '#16A34A', bg: '#F0FDF4', icon: 'radio-outline' },
  missed: { label: 'Missed', color: '#DC2626', bg: '#FEF2F2', icon: 'close-circle-outline' },
  submitted: { label: 'Submitted', color: '#7C3AED', bg: '#F5F3FF', icon: 'checkmark-circle-outline' },
};

function formatStart(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

function formatCountdown(target: number, now: number): string {
  let secs = Math.max(0, Math.floor((target - now) / 1000));
  const d = Math.floor(secs / 86400);
  secs %= 86400;
  const h = Math.floor(secs / 3600);
  secs %= 3600;
  const m = Math.floor(secs / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function TestCard({ test, now, onStart, onResult }: {
  test: SelfTestWithLabels;
  now: number;
  onStart: () => void;
  onResult: () => void;
}) {
  const status = deriveStatus(test, now);
  const meta = STATUS_META[status];
  const start = new Date(test.scheduled_at).getTime();

  const names = test.test_type === 'topic' ? test.topic_names : test.chapter_names;
  const visibleChips = names.slice(0, 6);
  const extra = names.length - visibleChips.length;

  return (
    <View style={styles.card} testID={`card-test-${test.id}`}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWrap}>
          <Ionicons name="clipboard-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={2} testID={`text-test-title-${test.id}`}>{test.title}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{test.test_type === 'topic' ? 'Topic' : 'Chapter'}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
              <Ionicons name={meta.icon} size={12} color={meta.color} />
              <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
        <Text style={styles.metaText}>{formatStart(test.scheduled_at)}</Text>
        <Text style={styles.metaDot}>•</Text>
        <Ionicons name="hourglass-outline" size={14} color={colors.textMuted} />
        <Text style={styles.metaText}>{test.duration_minutes} min</Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="help-circle-outline" size={14} color={colors.textMuted} />
        <Text style={styles.metaText}>
          {test.total_questions} Qs ({test.mcq_count ?? 0} MCQ + {test.written_count ?? 0} written)
        </Text>
      </View>

      {visibleChips.length > 0 && (
        <View style={styles.chipRow}>
          {visibleChips.map((n, i) => (
            <View key={`${test.id}-chip-${i}`} style={styles.chip}>
              <Text style={styles.chipText} numberOfLines={1}>{n}</Text>
            </View>
          ))}
          {extra > 0 && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>+{extra} more</Text>
            </View>
          )}
        </View>
      )}

      {status === 'upcoming' && (
        <View style={[styles.cta, styles.ctaDisabled]} testID={`status-upcoming-${test.id}`}>
          <Ionicons name="time-outline" size={16} color={colors.textMuted} />
          <Text style={styles.ctaDisabledText}>Starts in {formatCountdown(start, now)}</Text>
        </View>
      )}
      {status === 'live' && (
        <TouchableOpacity style={[styles.cta, styles.ctaPrimary]} onPress={onStart} testID={`button-start-${test.id}`}>
          <Ionicons name="play" size={16} color={colors.white} />
          <Text style={styles.ctaPrimaryText}>Start Test</Text>
        </TouchableOpacity>
      )}
      {status === 'submitted' && (
        <TouchableOpacity style={[styles.cta, styles.ctaOutline]} onPress={onResult} testID={`button-result-${test.id}`}>
          <Ionicons name="bar-chart-outline" size={16} color={colors.primary} />
          <Text style={styles.ctaOutlineText}>
            View Result{test.percentage != null ? ` · ${test.percentage}%` : ''}
          </Text>
        </TouchableOpacity>
      )}
      {status === 'missed' && (
        <View style={[styles.cta, styles.ctaDisabled]} testID={`status-missed-${test.id}`}>
          <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.ctaDisabledText}>Missed — window closed</Text>
        </View>
      )}
    </View>
  );
}

export default function MyTestsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { openSidebar } = useSidebar();
  const { data, isLoading, error, refetch } = useAllSelfTests();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refetch();
      setNow(Date.now());
    }, [refetch])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ width: 36 }} />
        <Text style={styles.headerTitle}>My Tests</Text>
        <HeaderMenuButton onPress={openSidebar} variant="light" />
      </View>

      <AutoChapterTestBanner />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.emptyText}>Couldn't load your tests.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refetch} testID="button-retry">
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="clipboard-outline" size={56} color={colors.gray300} />
          <Text style={styles.emptyTitle}>No scheduled tests yet</Text>
          <Text style={styles.emptyText}>
            Schedule a test from your Study Timetable and it will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
        >
          {data.map((t) => (
            <TestCard
              key={t.id}
              test={t}
              now={now}
              onStart={() => navigation.navigate('MyTestTake', { testId: t.id })}
              onResult={() => navigation.navigate('MyTestResult', { testId: t.id })}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.xl, color: colors.text, fontFamily: fontFamily.heading },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.lg, color: colors.text, fontFamily: fontFamily.semiBold, marginTop: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', fontFamily: fontFamily.regular },
  retryBtn: { marginTop: spacing.md, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  retryBtnText: { color: colors.white, fontFamily: fontFamily.semiBold, fontSize: fontSize.md },
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  iconWrap: {
    width: 40, height: 40, borderRadius: borderRadius.md, backgroundColor: '#F0FDF4',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: fontSize.lg, color: colors.text, fontFamily: fontFamily.semiBold },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  typeBadge: { backgroundColor: colors.gray100, borderRadius: borderRadius.full, paddingHorizontal: 10, paddingVertical: 3 },
  typeBadgeText: { fontSize: fontSize.xs, color: colors.gray600, fontFamily: fontFamily.medium },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: borderRadius.full, paddingHorizontal: 10, paddingVertical: 3 },
  statusBadgeText: { fontSize: fontSize.xs, fontFamily: fontFamily.semiBold },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaText: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.regular },
  metaDot: { color: colors.gray300, marginHorizontal: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.gray50, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '100%' },
  chipText: { fontSize: fontSize.xs, color: colors.gray600, fontFamily: fontFamily.regular },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: borderRadius.md, paddingVertical: 12, marginTop: 4 },
  ctaPrimary: { backgroundColor: colors.primary },
  ctaPrimaryText: { color: colors.white, fontSize: fontSize.md, fontFamily: fontFamily.semiBold },
  ctaOutline: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: '#F0FDF4' },
  ctaOutlineText: { color: colors.primary, fontSize: fontSize.md, fontFamily: fontFamily.semiBold },
  ctaDisabled: { backgroundColor: colors.gray100 },
  ctaDisabledText: { color: colors.textMuted, fontSize: fontSize.md, fontFamily: fontFamily.medium },
});
