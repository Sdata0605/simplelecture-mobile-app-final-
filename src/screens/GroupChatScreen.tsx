import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { forumService, ForumGroup, ForumGroupMessage } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'GroupChat'>;

export default function GroupChatScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { groupId, groupName } = route.params;
  const scrollViewRef = useRef<ScrollView>(null);

  const [group, setGroup] = useState<ForumGroup | null>(null);
  const [messages, setMessages] = useState<ForumGroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ForumGroupMessage | null>(null);

  useEffect(() => {
    const loadUserId = async () => {
      const userData = await AsyncStorage.getItem('user_data');
      if (userData) {
        const user = JSON.parse(userData);
        setCurrentUserId(user.id);
      }
    };
    loadUserId();
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [groupRes, messagesRes] = await Promise.all([
        forumService.getGroupDetails(groupId),
        forumService.getGroupMessages(groupId),
      ]);

      if (groupRes.success && groupRes.group) {
        setGroup(groupRes.group);
      }
      if (messagesRes.success && messagesRes.messages) {
        setMessages(messagesRes.messages);
      }
    } catch (error) {
      console.error('Error loading group chat:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadData();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || sending) return;

    setSending(true);
    const result = await forumService.sendGroupMessage(
      groupId,
      messageText.trim(),
      'text',
      undefined,
      replyingTo?.id
    );
    setSending(false);

    if (result.success) {
      setMessageText('');
      setReplyingTo(null);
      loadData();
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await forumService.deleteGroupMessage(messageId);
            loadData();
          },
        },
      ]
    );
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSeparator = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const getMessageDate = (dateString: string) => {
    return new Date(dateString).toDateString();
  };

  const getAuthorInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!group?.is_member) {
    return (
      <View style={styles.notMemberContainer}>
        <Ionicons name="lock-closed-outline" size={64} color={colors.gray300} />
        <Text style={styles.notMemberTitle}>Not a Member</Text>
        <Text style={styles.notMemberText}>Join this group to view and send messages</Text>
        <TouchableOpacity style={styles.backButton2} onPress={() => navigation.goBack()}>
          <Text style={styles.backButton2Text}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  let lastDate = '';

  return (
    <View style={styles.container}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={[colors.primary, '#4ADE80']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          data-testid="button-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.headerCenter}
          onPress={() => navigation.navigate('GroupInfo', { groupId })}
        >
          {group?.avatar_url ? (
            <Image source={{ uri: group.avatar_url }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Ionicons name="people" size={20} color={colors.white} />
            </View>
          )}
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle} numberOfLines={1}>{groupName}</Text>
            <Text style={styles.headerSubtitle}>{group?.member_count} members</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.infoButton}
          onPress={() => navigation.navigate('GroupInfo', { groupId })}
          data-testid="button-group-info"
        >
          <Ionicons name="information-circle-outline" size={24} color={colors.white} />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyMessages}>
            <Ionicons name="chatbubbles-outline" size={64} color={colors.gray300} />
            <Text style={styles.emptyTitle}>No Messages Yet</Text>
            <Text style={styles.emptyText}>Start the conversation!</Text>
          </View>
        ) : (
          messages.map((message, index) => {
            const messageDate = getMessageDate(message.created_at);
            const showDateSeparator = messageDate !== lastDate;
            lastDate = messageDate;

            const isOwnMessage = message.sender_id === currentUserId;
            const isDeleted = message.is_deleted;

            return (
              <View key={message.id}>
                {showDateSeparator && (
                  <View style={styles.dateSeparator}>
                    <View style={styles.dateLine} />
                    <Text style={styles.dateText}>{formatDateSeparator(message.created_at)}</Text>
                    <View style={styles.dateLine} />
                  </View>
                )}

                <View style={[styles.messageRow, isOwnMessage && styles.messageRowOwn]}>
                  {!isOwnMessage && (
                    <View style={styles.messageAvatar}>
                      <Text style={styles.messageAvatarText}>
                        {getAuthorInitials(message.sender?.full_name || null)}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.messageBubble,
                      isOwnMessage ? styles.messageBubbleOwn : styles.messageBubbleOther,
                      isDeleted && styles.messageBubbleDeleted,
                    ]}
                    onLongPress={() => {
                      if (!isDeleted && isOwnMessage) {
                        Alert.alert(
                          'Message Options',
                          '',
                          [
                            { text: 'Reply', onPress: () => setReplyingTo(message) },
                            { text: 'Delete', style: 'destructive', onPress: () => handleDeleteMessage(message.id) },
                            { text: 'Cancel', style: 'cancel' },
                          ]
                        );
                      } else if (!isDeleted) {
                        setReplyingTo(message);
                      }
                    }}
                    data-testid={`message-${message.id}`}
                  >
                    {!isOwnMessage && !isDeleted && (
                      <Text style={styles.senderName}>{message.sender?.full_name || 'Anonymous'}</Text>
                    )}

                    {message.reply_to_id && (
                      <View style={styles.replyPreview}>
                        <Text style={styles.replyPreviewText} numberOfLines={1}>
                          Replying to a message
                        </Text>
                      </View>
                    )}

                    {isDeleted ? (
                      <View style={styles.deletedContent}>
                        <Ionicons name="trash-outline" size={14} color={colors.gray400} />
                        <Text style={styles.deletedText}>This message was deleted</Text>
                      </View>
                    ) : message.message_type === 'image' && message.file_url ? (
                      <Image source={{ uri: message.file_url }} style={styles.messageImage} />
                    ) : message.message_type === 'gif' && message.file_url ? (
                      <Image source={{ uri: message.file_url }} style={styles.messageGif} />
                    ) : (
                      <Text style={[styles.messageText, isOwnMessage && styles.messageTextOwn]}>
                        {message.content}
                      </Text>
                    )}

                    <Text style={[styles.messageTime, isOwnMessage && styles.messageTimeOwn]}>
                      {formatTime(message.created_at)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {replyingTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyInfo}>
            <Text style={styles.replyLabel}>Replying to {replyingTo.sender?.full_name || 'message'}</Text>
            <Text style={styles.replyContent} numberOfLines={1}>{replyingTo.content}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)}>
            <Ionicons name="close" size={20} color={colors.gray600} />
          </TouchableOpacity>
        </View>
      )}

      <SafeAreaView edges={['bottom']} style={styles.inputWrapper}>
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.attachButton}>
            <Ionicons name="attach" size={24} color={colors.gray500} />
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            value={messageText}
            onChangeText={setMessageText}
            multiline
            maxLength={2000}
          />

          <TouchableOpacity
            style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!messageText.trim() || sending}
            data-testid="button-send-message"
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="send" size={20} color={colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray50,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  notMemberContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.white,
  },
  notMemberTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.gray800,
    marginTop: spacing.lg,
  },
  notMemberText: {
    fontSize: fontSize.md,
    color: colors.gray500,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  backButton2: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  backButton2Text: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.md,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  infoButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  emptyMessages: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray800,
    marginTop: spacing.lg,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.gray500,
    marginTop: spacing.sm,
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.gray200,
  },
  dateText: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    marginHorizontal: spacing.md,
    backgroundColor: colors.gray50,
    paddingHorizontal: spacing.sm,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    alignItems: 'flex-end',
  },
  messageRowOwn: {
    flexDirection: 'row-reverse',
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  messageAvatarText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  messageBubbleOther: {
    backgroundColor: colors.white,
    borderBottomLeftRadius: 4,
  },
  messageBubbleOwn: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  messageBubbleDeleted: {
    backgroundColor: colors.gray100,
  },
  senderName: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 4,
  },
  replyPreview: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
  },
  replyPreviewText: {
    fontSize: fontSize.xs,
    color: colors.gray600,
  },
  deletedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  deletedText: {
    fontSize: fontSize.sm,
    color: colors.gray400,
    fontStyle: 'italic',
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: borderRadius.md,
  },
  messageGif: {
    width: 200,
    height: 150,
    borderRadius: borderRadius.md,
  },
  messageText: {
    fontSize: fontSize.md,
    color: colors.gray800,
    lineHeight: 22,
  },
  messageTextOwn: {
    color: colors.white,
  },
  messageTime: {
    fontSize: fontSize.xs,
    color: colors.gray400,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageTimeOwn: {
    color: 'rgba(255,255,255,0.7)',
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
  },
  replyInfo: {
    flex: 1,
  },
  replyLabel: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
  },
  replyContent: {
    fontSize: fontSize.sm,
    color: colors.gray600,
    marginTop: 2,
  },
  inputWrapper: {
    backgroundColor: colors.white,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
    gap: spacing.sm,
  },
  attachButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    fontSize: fontSize.md,
    color: colors.gray800,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.gray300,
  },
});
