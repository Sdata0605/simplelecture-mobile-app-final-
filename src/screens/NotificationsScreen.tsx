import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  clearAll,
  formatRelativeTime,
  StoredNotification,
} from '../services/notificationStorage';

const getIconForType = (type: string) => {
  switch (type) {
    case 'course': return 'book-outline';
    case 'class': return 'videocam-outline';
    case 'assignment': return 'document-text-outline';
    case 'result': return 'trophy-outline';
    case 'announcement': return 'megaphone-outline';
    case 'reminder': return 'alarm-outline';
    default: return 'notifications-outline';
  }
};

const getPriorityColor = (type: string) => {
  switch (type) {
    case 'result': return colors.error;
    case 'class': return colors.warning;
    case 'assignment': return '#F59E0B';
    default: return colors.primary;
  }
};

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    const stored = await getNotifications();
    setNotifications(stored);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const handleTapNotification = async (item: StoredNotification) => {
    if (!item.read) {
      await markAsRead(item.id);
      await loadNotifications();
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to remove all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearAll();
            await loadNotifications();
          },
        },
      ]
    );
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    await loadNotifications();
  };

  const renderNotification = ({ item }: { item: StoredNotification }) => (
    <TouchableOpacity
      style={[styles.notificationCard, !item.read && styles.unreadCard]}
      onPress={() => handleTapNotification(item)}
      data-testid={`notification-item-${item.id}`}
    >
      <View style={[styles.iconContainer, { backgroundColor: getPriorityColor(item.type) + '15' }]}>
        <Ionicons
          name={getIconForType(item.type) as any}
          size={22}
          color={getPriorityColor(item.type)}
        />
      </View>
      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <Text style={[styles.notifTitle, !item.read && styles.unreadTitle]} numberOfLines={1}>
            {item.title}
          </Text>
          {!item.read && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.notifMessage} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.notifTime}>{formatRelativeTime(item.timestamp)}</Text>
      </View>
    </TouchableOpacity>
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="notifications-off-outline" size={64} color={colors.gray300} />
      </View>
      <Text style={styles.emptyTitle}>No Notifications</Text>
      <Text style={styles.emptySubtitle}>
        You're all caught up! We'll notify you about important updates, class reminders, and results.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          data-testid="button-back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.length > 0 ? (
          <TouchableOpacity
            onPress={handleClearAll}
            data-testid="button-clear-all"
          >
            <Text style={styles.clearText}>Clear All</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {unreadCount > 0 && (
        <TouchableOpacity
          style={styles.markAllReadBar}
          onPress={handleMarkAllRead}
          data-testid="button-mark-all-read"
        >
          <Ionicons name="checkmark-done-outline" size={16} color={colors.primary} />
          <Text style={styles.markAllReadText}>Mark all as read ({unreadCount})</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        contentContainerStyle={notifications.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 50,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  clearText: {
    fontSize: fontSize.sm,
    color: colors.error,
    fontWeight: '600',
  },
  markAllReadBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryLight + '10',
    gap: 6,
  },
  markAllReadText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  list: {
    padding: spacing.md,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  unreadCard: {
    backgroundColor: '#F5F0FF',
    borderColor: colors.primary + '30',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  unreadTitle: {
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  notifMessage: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 4,
  },
  notifTime: {
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
});
