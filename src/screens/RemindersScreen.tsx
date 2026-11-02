// Reminders screen: Calendar (one-off reminders) and Daily (time-of-day reminders).
// Spec: _scratch/reminders-v2-plan.md E.2 to E.8 and E.10; route params in G (WP5).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useReminders } from '../hooks/useReminders';
import { useReminderPermissions } from '../hooks/useReminderPermissions';
import { localDateKey } from '../utils/calendar';
import { Skeleton } from '../components/SkeletonLoader';
import type { Reminder, ReminderMode } from '../types/reminder';
import SegmentedTabs, { RemindersTab } from '../components/reminders/SegmentedTabs';
import MonthCalendar from '../components/reminders/MonthCalendar';
import DayAgenda from '../components/reminders/DayAgenda';
import DailyReminderRow from '../components/reminders/DailyReminderRow';
import EmptyState from '../components/reminders/EmptyState';
import UndoSnackbar from '../components/reminders/UndoSnackbar';
import { PermissionBanner, PermissionBannerVariant } from '../components/reminders/PermissionBanner';
import ReminderEditorSheet from '../components/reminders/ReminderEditorSheet';
import { formatClock } from '../components/reminders/ReminderCard';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/** Params this screen accepts. Registered in AppNavigator by WP8. */
export type RemindersRouteParams = { tab?: RemindersTab; focusDate?: string; highlightId?: string };
type RemindersRouteMap = { Reminders: RemindersRouteParams | undefined };

type ReminderHook = ReturnType<typeof useReminders>;
type UndoToken = Parameters<ReminderHook['undo']>[0];
type SaveResult = Awaited<ReturnType<ReminderHook['save']>>;
type BannerVariant = PermissionBannerVariant;

const LAST_TAB_KEY = 'reminders.lastTab';

interface Snack {
  id: number;
  message: string;
  actionLabel?: string;
  undoToken?: UndoToken;
}

interface EditorState {
  open: boolean;
  initial?: Reminder;
  preset?: { mode: ReminderMode; date?: string };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "Sat 15 Nov, 9:30 AM" */
function whenLabel(d: Date): string {
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
  return `${day}, ${formatClock(d)}`;
}

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProp<RemindersRouteMap, 'Reminders'>>();
  const {
    snapshot: snap,
    reminders,
    daily,
    dotsForMonth,
    agendaFor,
    stateOf,
    remove,
    undo,
    commit,
    setEnabled,
    refresh,
  } = useReminders();
  const perms = useReminderPermissions();

  const todayKey = localDateKey(new Date().toISOString());
  const [todayY, todayM1] = todayKey.split('-').map(Number);

  const [tab, setTab] = useState<RemindersTab>(route.params?.tab ?? 'calendar');
  const [year, setYear] = useState(todayY);
  const [month, setMonth] = useState(todayM1 - 1);
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const [snack, setSnack] = useState<Snack | null>(null);
  const snackRef = useRef<Snack | null>(null);
  const snackSeq = useRef(0);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [queuedSeen, setQueuedSeen] = useState(0);
  const [showSyncBar, setShowSyncBar] = useState(false);

  // Last tab is remembered, unless the route names one.
  useEffect(() => {
    if (route.params?.tab) return;
    AsyncStorage.getItem(LAST_TAB_KEY)
      .then((v) => {
        if (v === 'calendar' || v === 'daily') setTab(v);
      })
      .catch(() => {});
  }, [route.params?.tab]);

  // Deep links: tab, focusDate (selects that day), highlightId (briefly marks the card).
  useEffect(() => {
    const p = route.params;
    if (!p) return;
    if (p.tab) setTab(p.tab);
    if (p.focusDate && /^\d{4}-\d{2}-\d{2}$/.test(p.focusDate)) {
      const [y, m] = p.focusDate.split('-').map(Number);
      setYear(y);
      setMonth(m - 1);
      setSelectedKey(p.focusDate);
      setTab('calendar');
    }
    if (p.highlightId) setHighlightId(p.highlightId);
  }, [route.params?.tab, route.params?.focusDate, route.params?.highlightId]);

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 1500);
    return () => clearTimeout(t);
  }, [highlightId]);

  // Sync bar appears only if the sync is slow (over 300 ms).
  useEffect(() => {
    if (!snap.syncing) {
      setShowSyncBar(false);
      return;
    }
    const t = setTimeout(() => setShowSyncBar(true), 300);
    return () => clearTimeout(t);
  }, [snap.syncing]);

  // Snackbar helpers. Only one snackbar at a time; a new one commits the previous pending delete.
  const showSnack = useCallback((next: Omit<Snack, 'id'>) => {
    const prev = snackRef.current;
    if (prev?.undoToken) void commitRef.current(prev.undoToken).catch(() => {});
    snackSeq.current += 1;
    const s: Snack = { ...next, id: snackSeq.current };
    snackRef.current = s;
    setSnack(s);
  }, []);

  const hideSnack = useCallback(() => {
    const s = snackRef.current;
    snackRef.current = null;
    setSnack(null);
    if (s?.undoToken) void commitRef.current(s.undoToken).catch(() => {});
  }, []);

  const undoSnack = useCallback(() => {
    const s = snackRef.current;
    snackRef.current = null;
    setSnack(null);
    if (s?.undoToken) {
      void undo(s.undoToken).catch(() => showSnack({ message: "Couldn't undo. Try again." }));
    }
  }, [undo, showSnack]);

  // Leaving the screen commits any pending delete.
  useFocusEffect(
    useCallback(() => {
      return () => {
        const s = snackRef.current;
        snackRef.current = null;
        setSnack(null);
        if (s?.undoToken) void commitRef.current(s.undoToken).catch(() => {});
      };
    }, []),
  );

  const deleteReminder = useCallback(
    async (r: Reminder) => {
      try {
        const token = await remove(r.id);
        showSnack({ message: 'Reminder deleted', actionLabel: 'Undo', undoToken: token });
      } catch {
        showSnack({ message: "Couldn't delete. Try again." });
      }
    },
    [remove, showSnack],
  );

  // Editor.
  function openNew() {
    if (tab === 'calendar') {
      const date = selectedKey < todayKey ? todayKey : selectedKey;
      setEditor({ open: true, preset: { mode: 'once', date } });
    } else {
      setEditor({ open: true, preset: { mode: 'daily' } });
    }
  }

  function openEdit(r: Reminder) {
    setEditor({ open: true, initial: r });
  }

  function closeEditor() {
    setEditor({ open: false });
  }

  function onSaved(result: SaveResult) {
    closeEditor();
    const fire = result.fireAt ? new Date(result.fireAt) : null;
    setHighlightId(result.reminder.id);
    if (result.reminder.section === 'calendar' && fire) {
      setYear(fire.getFullYear());
      setMonth(fire.getMonth());
      setSelectedKey(`${fire.getFullYear()}-${pad(fire.getMonth() + 1)}-${pad(fire.getDate())}`);
      setTab('calendar');
    }
    const when = fire ?? new Date(result.reminder.scheduled_at);
    let message = `Reminder set for ${whenLabel(when)}`;
    if (result.state === 'queued') message = 'Reminder saved. It will be set the next time you open the app.';
    if (result.state === 'no-permission') message = "Reminder saved. Notifications are off, so it won't ring.";
    showSnack({ message });
  }

  function onDeleteConfirmed(r: Reminder) {
    closeEditor();
    void deleteReminder(r);
  }

  // Overflow menu on a reminder: Edit, Play voice (calls only), Delete (undo is the safety net).
  function openMore(r: Reminder) {
    const options: { label: string; run(): void; destructive?: boolean }[] = [
      { label: 'Edit', run: () => openEdit(r) },
    ];
    if (r.kind === 'call') {
      options.push({
        label: 'Play voice',
        run: () => navigation.navigate('ReminderCall', { reminderId: r.id, autoplay: true }),
      });
    }
    options.push({ label: 'Delete', run: () => void deleteReminder(r), destructive: true });

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...options.map((o) => o.label), 'Cancel'],
          cancelButtonIndex: options.length,
          destructiveButtonIndex: options.findIndex((o) => o.destructive),
        },
        (index) => {
          if (index < options.length) options[index].run();
        },
      );
    } else {
      Alert.alert(
        r.message_text.trim().split('\n')[0].slice(0, 60),
        undefined,
        [
          ...options.map((o) => ({
            text: o.label,
            style: o.destructive ? ('destructive' as const) : ('default' as const),
            onPress: o.run,
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    }
  }

  async function toggleDaily(r: Reminder, enabled: boolean) {
    setBusyIds((b) => ({ ...b, [r.id]: true }));
    try {
      await setEnabled(r.id, enabled);
    } catch {
      showSnack({ message: enabled ? "Couldn't turn on. Try again." : "Couldn't turn off. Try again." });
    } finally {
      setBusyIds((b) => {
        const next = { ...b };
        delete next[r.id];
        return next;
      });
    }
  }

  function changeTab(next: RemindersTab) {
    setTab(next);
    AsyncStorage.setItem(LAST_TAB_KEY, next).catch(() => {});
  }

  // Derived data.
  const audioOf = (id: string) => snap.audio[id] ?? 'none';
  const fireAtOf = (id: string): Date | null => {
    const p = snap.plan[id];
    return p?.fireAt ? new Date(p.fireAt) : null;
  };
  const dots = dotsForMonth(year, month);
  const agenda = agendaFor(selectedKey);
  const selectedIsPast = selectedKey < todayKey;
  const minMonth = useMemo(() => {
    const d = new Date(todayY, todayM1 - 1 - 12, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  }, [todayY, todayM1]);
  const maxMonth = useMemo(() => {
    const d = new Date(todayY, todayM1 - 1 + 24, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  }, [todayY, todayM1]);
  const dailyActive = daily.upcoming.length + daily.paused.length;
  const dailyEmpty = dailyActive + daily.earlierToday.length === 0;
  const queuedCount = useMemo(
    () => Object.values(snap.plan).filter((p) => p.state === 'queued').length,
    [snap.plan],
  );

  const banners: BannerVariant[] = [];
  if (perms.notifications === 'denied') banners.push('notifications-off');
  if (perms.exactAlarms === 'denied' && reminders.length > 0) banners.push('exact-alarm');
  if (snap.syncError === 'server') banners.push('sync-error');
  else if (snap.syncError === 'network' || snap.outboxSize > 0) banners.push('offline');
  if (queuedCount > queuedSeen) banners.push('queued');
  const visibleBanners = banners.slice(0, 2);

  function onBannerAction(v: BannerVariant) {
    if (v === 'notifications-off') perms.openNotificationSettings();
    else if (v === 'exact-alarm') perms.openExactAlarmSettings();
    else if (v === 'offline' || v === 'sync-error') void refresh();
  }

  const loading = (snap.status === 'loading' || snap.status === 'idle') && reminders.length === 0;
  const loadFailed = snap.status === 'error' && reminders.length === 0;

  function renderDailyGroup(title: string, list: Reminder[]) {
    if (list.length === 0) return null;
    return (
      <View>
        <Text style={styles.groupHeader} maxFontSizeMultiplier={1.3}>{title}</Text>
        {list.map((r) => (
          <DailyReminderRow
            key={r.id}
            reminder={r}
            fireAt={fireAtOf(r.id)}
            state={stateOf(r.id)}
            audio={audioOf(r.id)}
            busy={!!busyIds[r.id]}
            onToggle={(enabled) => void toggleDaily(r, enabled)}
            onPress={() => openEdit(r)}
            onMore={() => openMore(r)}
          />
        ))}
      </View>
    );
  }

  function renderLoadFailed() {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Couldn't load reminders"
        body="Check your connection and try again."
        actionLabel="Retry"
        onAction={() => void refresh()}
      />
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[colors.primary, '#4ADE80']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Reminders</Text>
        <View style={styles.headerSpacer} />
      </LinearGradient>

      <SegmentedTabs value={tab} onChange={changeTab} dailyCount={dailyActive} />

      {showSyncBar ? <View style={styles.syncBar} accessibilityLabel="Syncing reminders" /> : null}

      {visibleBanners.length > 0 ? (
        <View style={styles.banners}>
          {visibleBanners.map((v) => (
            <PermissionBanner
              key={v}
              variant={v}
              onAction={v === 'queued' ? undefined : () => onBannerAction(v)}
              onDismiss={v === 'queued' ? () => setQueuedSeen(queuedCount) : undefined}
            />
          ))}
        </View>
      ) : null}

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={snap.syncing}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {loadFailed ? (
          renderLoadFailed()
        ) : tab === 'calendar' ? (
          <>
            <MonthCalendar
              year={year}
              month={month}
              selectedKey={selectedKey}
              todayKey={todayKey}
              dots={dots}
              onSelect={setSelectedKey}
              onChangeMonth={(y, m) => {
                setYear(y);
                setMonth(m);
              }}
              minMonth={minMonth}
              maxMonth={maxMonth}
            />
            <DayAgenda
              dateKey={selectedKey}
              isPast={selectedIsPast}
              oneOffs={agenda.oneOffs}
              daily={agenda.daily}
              stateOf={stateOf}
              audioOf={audioOf}
              loading={loading}
              highlightId={highlightId}
              onPress={openEdit}
              onMore={openMore}
              onAdd={openNew}
            />
          </>
        ) : loading ? (
          <View>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skeletonRow}>
                <Skeleton width={84} height={36} borderRadius={18} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="85%" height={12} />
                </View>
              </View>
            ))}
          </View>
        ) : dailyEmpty ? (
          <EmptyState
            icon="alarm-outline"
            title="No daily reminders"
            body="Set a time like 5:30 AM to wake up or 6:00 AM for the gym."
            actionLabel="Add daily reminder"
            onAction={openNew}
          />
        ) : (
          <>
            {renderDailyGroup('UPCOMING', daily.upcoming)}
            {renderDailyGroup('PAUSED', daily.paused)}
            {renderDailyGroup('EARLIER TODAY', daily.earlierToday)}
            <Text style={styles.footerHint} maxFontSizeMultiplier={1.3}>
              Daily reminders ring at this time wherever you are.
            </Text>
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        onPress={openNew}
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        accessibilityRole="button"
        accessibilityLabel="Add reminder"
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>

      {snack ? (
        <UndoSnackbar
          key={snack.id}
          visible
          message={snack.message}
          actionLabel={snack.actionLabel}
          onAction={snack.undoToken ? undoSnack : undefined}
          onHide={hideSnack}
        />
      ) : null}

      <ReminderEditorSheet
        visible={editor.open}
        initial={editor.initial}
        preset={editor.preset}
        onClose={closeEditor}
        onSaved={onSaved}
        onDeleteConfirmed={onDeleteConfirmed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamily.heading,
    fontSize: fontSize.xl,
    color: colors.white,
  },
  headerSpacer: {
    width: 44,
  },
  syncBar: {
    height: 2,
    backgroundColor: colors.primaryLight,
  },
  banners: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: spacing.md,
    paddingBottom: 112,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  groupHeader: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    letterSpacing: 0.6,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  footerHint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  fab: {
    position: 'absolute',
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
