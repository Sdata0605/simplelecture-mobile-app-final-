import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Skeleton } from '../components/SkeletonLoader';
import { useCallReminders } from '../hooks/useCallReminders';
import { CallReminder } from '../types/callReminder';
import CallReminderRow from '../components/callReminder/CallReminderRow';
import CallReminderForm from '../components/callReminder/CallReminderForm';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

function sortByScheduled(list: CallReminder[]): CallReminder[] {
  return [...list].sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
}

export default function CallRemindersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { reminders, loading, error, refresh, remove } = useCallReminders();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CallReminder | undefined>(undefined);
  const [notifDenied, setNotifDenied] = useState(false);

  const checkPermission = useCallback(async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setNotifDenied(status !== 'granted');
    } catch {
      setNotifDenied(false);
    }
  }, []);

  // Re-check notification permission each time the screen comes into focus,
  // because the user may have changed it in system settings.
  useFocusEffect(
    useCallback(() => {
      checkPermission();
    }, [checkPermission])
  );

  const sorted = useMemo(() => sortByScheduled(reminders ?? []), [reminders]);

  function openNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(r: CallReminder) {
    setEditing(r);
    setFormOpen(true);
  }

  function playReminder(r: CallReminder) {
    // Cast until WP6 adds ReminderCall to RootStackParamList.
    navigation.navigate('ReminderCall', { reminderId: r.id, autoplay: true });
  }

  function confirmDelete(r: CallReminder) {
    Alert.alert('Delete reminder?', `"${r.title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove(r.id);
          } catch {
            Alert.alert("Couldn't delete", 'Please try again.');
          }
        },
      },
    ]);
  }

  function handleSaved() {
    setFormOpen(false);
    setEditing(undefined);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
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
        <Text style={styles.headerTitle}>Call reminders</Text>
        <View style={{ width: 32 }} />
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons name="call" size={20} color={colors.primary} />
          </View>
          <Text style={styles.infoText}>
            Your teacher will call you at study time with a short voice message.
          </Text>
        </View>

        {/* Notifications denied banner */}
        {notifDenied ? (
          <View style={styles.warnCard}>
            <Text style={styles.warnText}>Notifications are off, so we can't ring you.</Text>
            <TouchableOpacity onPress={() => Linking.openSettings()} accessibilityRole="button">
              <Text style={styles.warnLink}>Open settings</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Body states */}
        {loading && sorted.length === 0 ? (
          <View>
            {[0, 1, 2].map(i => (
              <View key={i} style={styles.skeletonRow}>
                <Skeleton width={44} height={44} borderRadius={22} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton width="60%" height={16} />
                  <Skeleton width="85%" height={12} />
                </View>
              </View>
            ))}
          </View>
        ) : error && sorted.length === 0 ? (
          <View style={styles.centerBlock}>
            <Ionicons name="cloud-offline-outline" size={48} color={colors.gray300} />
            <Text style={styles.stateTitle}>Couldn't load reminders</Text>
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => refresh()}
              accessibilityRole="button"
            >
              <Text style={styles.outlineBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : sorted.length === 0 ? (
          <View style={styles.centerBlock}>
            <Ionicons name="call-outline" size={56} color={colors.gray300} />
            <Text style={styles.stateTitle}>No reminders yet</Text>
            <Text style={styles.stateSub}>Set a study call and we'll ring you when it's time.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={openNew} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>Create reminder</Text>
            </TouchableOpacity>
          </View>
        ) : (
          sorted.map(r => (
            <CallReminderRow
              key={r.id}
              reminder={r}
              onPress={() => openEdit(r)}
              onPlay={() => playReminder(r)}
              onLongPress={() => confirmDelete(r)}
            />
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        onPress={openNew}
        accessibilityRole="button"
        accessibilityLabel="New reminder"
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>

      <CallReminderForm
        visible={formOpen}
        initial={editing}
        onClose={() => { setFormOpen(false); setEditing(undefined); }}
        onSaved={handleSaved}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4, gap: spacing.sm,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1, fontSize: fontSize.xl, fontFamily: fontFamily.heading, color: colors.white,
  },

  body: { flex: 1 },
  bodyContent: { padding: spacing.md, paddingBottom: 96 },

  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md,
  },
  infoIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F8EF',
    alignItems: 'center', justifyContent: 'center',
  },
  infoText: {
    flex: 1, fontSize: fontSize.md, fontFamily: fontFamily.regular, color: colors.textSecondary,
  },

  warnCard: {
    padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: '#FEF3C7',
    marginBottom: spacing.md,
  },
  warnText: { fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.text },
  warnLink: {
    fontSize: fontSize.sm, fontFamily: fontFamily.semiBold, color: colors.primary, marginTop: 4,
  },

  skeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm,
  },

  centerBlock: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  stateTitle: {
    fontSize: fontSize.xl, fontFamily: fontFamily.headingSemiBold, color: colors.text, marginTop: spacing.sm,
  },
  stateSub: {
    fontSize: fontSize.md, fontFamily: fontFamily.regular, color: colors.textSecondary,
    textAlign: 'center', paddingHorizontal: spacing.lg,
  },
  primaryBtn: {
    marginTop: spacing.md, height: 48, paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.white },
  outlineBtn: {
    marginTop: spacing.md, height: 44, paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  outlineBtnText: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.primary },

  fab: {
    position: 'absolute', right: spacing.lg,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
});
