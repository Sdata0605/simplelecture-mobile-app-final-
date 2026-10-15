/**
 * Slide-in thread history drawer for the Doubts tab.
 *
 * Hidden by default; opens from the left over a dimmed backdrop. Contains the
 * "+ New doubt" button on top and the thread list sorted by most recent
 * activity. Long-press (or trash icon tap) deletes a thread after a native
 * confirm alert. Selecting a thread or tapping "+ New doubt" closes the
 * drawer automatically.
 */
import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Animated,
  Dimensions,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DoubtThread, formatRelativeTime } from '../../utils/doubtThreads';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_WIDTH * 0.8);

const colors = {
  primary: '#2BBD6E',
  primaryLight: '#DCFCE7',
  white: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#6B7280',
  textLight: '#9CA3AF',
  border: '#E5E7EB',
  backdrop: 'rgba(0,0,0,0.4)',
  danger: '#EF4444',
};

interface DoubtThreadDrawerProps {
  visible: boolean;
  threads: DoubtThread[];
  activeThreadId: string | null;
  onClose: () => void;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onDeleteThread: (threadId: string) => void;
}

export default function DoubtThreadDrawer({
  visible,
  threads,
  activeThreadId,
  onClose,
  onSelectThread,
  onNewThread,
  onDeleteThread,
}: DoubtThreadDrawerProps) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // Keep the Modal mounted during the closing animation.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -DRAWER_WIDTH, duration: 180, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, translateX, backdropOpacity]);

  const confirmDelete = (thread: DoubtThread) => {
    Alert.alert(
      'Delete this doubt?',
      'This will permanently remove the conversation from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDeleteThread(thread.id) },
      ]
    );
  };

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="drawer-backdrop" />
        </Animated.View>
        <Animated.View
          style={[
            styles.drawer,
            { width: DRAWER_WIDTH, paddingTop: insets.top + 8, transform: [{ translateX }] },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Doubt history</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Close history"
              testID="button-close-drawer"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.newDoubtButton}
            onPress={onNewThread}
            testID="button-new-doubt"
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.newDoubtText}>New doubt</Text>
          </TouchableOpacity>

          {threads.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-ellipses-outline" size={32} color={colors.textLight} />
              <Text style={styles.emptyText}>No past doubts yet. Ask something to start.</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
              showsVerticalScrollIndicator={false}
            >
              {threads.map((thread) => {
                const isActive = thread.id === activeThreadId;
                return (
                  <TouchableOpacity
                    key={thread.id}
                    style={[styles.threadRow, isActive && styles.threadRowActive]}
                    onPress={() => onSelectThread(thread.id)}
                    onLongPress={() => confirmDelete(thread)}
                    delayLongPress={400}
                    testID={`thread-row-${thread.id}`}
                  >
                    <Ionicons
                      name="chatbubble-outline"
                      size={16}
                      color={isActive ? colors.primary : colors.textSecondary}
                      style={{ marginTop: 2 }}
                    />
                    <View style={styles.threadInfo}>
                      <Text
                        style={[styles.threadTitle, isActive && { color: colors.primary }]}
                        numberOfLines={1}
                      >
                        {thread.title}
                      </Text>
                      <Text style={styles.threadTime}>{formatRelativeTime(thread.updatedAt)}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => confirmDelete(thread)}
                      style={styles.deleteButton}
                      accessibilityLabel="Delete doubt thread"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      testID={`button-delete-thread-${thread.id}`}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.textLight} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.backdrop },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  closeButton: { padding: 4 },
  newDoubtButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 11,
    borderRadius: 12,
  },
  newDoubtText: { color: colors.white, fontSize: 14, fontWeight: '600' },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 48,
    gap: 10,
  },
  emptyText: { fontSize: 13, color: colors.textLight, textAlign: 'center', lineHeight: 19 },
  list: { flex: 1 },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    borderRadius: 10,
  },
  threadRowActive: { backgroundColor: colors.primaryLight },
  threadInfo: { flex: 1 },
  threadTitle: { fontSize: 13.5, fontWeight: '600', color: colors.text },
  threadTime: { fontSize: 11.5, color: colors.textLight, marginTop: 2 },
  deleteButton: { padding: 4, marginTop: 1 },
});
