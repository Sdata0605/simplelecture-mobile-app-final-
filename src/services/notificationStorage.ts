import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATIONS_KEY = 'app_notifications';

export interface StoredNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, any>;
  timestamp: number;
  read: boolean;
}

export async function saveNotification(notification: Omit<StoredNotification, 'id' | 'timestamp' | 'read'>): Promise<StoredNotification> {
  const stored: StoredNotification = {
    ...notification,
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    read: false,
  };

  const existing = await getNotifications();
  const updated = [stored, ...existing].slice(0, 100);
  await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
  return stored;
}

export async function getNotifications(): Promise<StoredNotification[]> {
  const raw = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StoredNotification[];
  } catch {
    return [];
  }
}

export async function getUnreadCount(): Promise<number> {
  const notifications = await getNotifications();
  return notifications.filter((n) => !n.read).length;
}

export async function markAsRead(id: string): Promise<void> {
  const notifications = await getNotifications();
  const updated = notifications.map((n) =>
    n.id === id ? { ...n, read: true } : n
  );
  await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
}

export async function markAllAsRead(): Promise<void> {
  const notifications = await getNotifications();
  const updated = notifications.map((n) => ({ ...n, read: true }));
  await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
}

export async function clearAll(): Promise<void> {
  await AsyncStorage.removeItem(NOTIFICATIONS_KEY);
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
