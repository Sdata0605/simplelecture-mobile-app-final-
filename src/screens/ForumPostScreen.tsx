import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { forumService, ForumPost, ForumReply, supabase } from '../services/supabase';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'ForumPost'>;

export default function ForumPostScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { postId } = route.params;

  const [post, setPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagTargetType, setFlagTargetType] = useState<'post' | 'reply'>('post');
  const [flagTargetId, setFlagTargetId] = useState<string | null>(null);
  const [submittingFlag, setSubmittingFlag] = useState(false);

  const loadData = useCallback(async () => {
    try {
      console.log('Loading forum post:', postId);
      const [postRes, repliesRes, userRes] = await Promise.all([
        forumService.getForumPost(postId),
        forumService.getForumReplies(postId),
        supabase.getUserProfile(),
      ]);

      console.log('[Forum] Post loaded:', postRes.success, 'Replies:', repliesRes.replies?.length || 0);

      if (postRes.success && postRes.post) {
        setPost(postRes.post);
      } else {
        console.error('Failed to load post:', postRes.error);
      }
      if (repliesRes.success && repliesRes.replies) {
        setReplies(repliesRes.replies);
      } else {
        console.error('Failed to load replies:', repliesRes.error);
      }
      if (userRes.success && userRes.user) {
        setCurrentUserId(userRes.user.id);
      }
    } catch (error) {
      console.error('Error loading post:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [postId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSubmitReply = async () => {
    if (!replyContent.trim()) return;
    
    setSubmittingReply(true);
    const result = await forumService.createForumReply(postId, replyContent.trim());
    setSubmittingReply(false);
    
    if (result.success) {
      setReplyContent('');
      loadData();
    }
  };

  const handleUpvote = async (replyId: string) => {
    await forumService.toggleUpvote(replyId);
    loadData();
  };

  const handleAcceptAnswer = async (replyId: string) => {
    await forumService.acceptAnswer(replyId, postId);
    loadData();
  };

  const handleFlag = (type: 'post' | 'reply', id: string) => {
    setFlagTargetType(type);
    setFlagTargetId(id);
    setShowFlagModal(true);
  };

  const submitFlag = async () => {
    if (!flagReason.trim() || !flagTargetId) return;
    
    setSubmittingFlag(true);
    const postIdToFlag = flagTargetType === 'post' ? flagTargetId : null;
    const replyIdToFlag = flagTargetType === 'reply' ? flagTargetId : null;
    
    await forumService.flagContent(postIdToFlag, replyIdToFlag, flagReason.trim());
    setSubmittingFlag(false);
    setShowFlagModal(false);
    setFlagReason('');
    setFlagTargetId(null);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getAuthorInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const isPostAuthor = post?.author_id === currentUserId;
  
  // Check if any reply is accepted (more reliable than post.is_answered flag)
  const hasAcceptedReply = replies.some(reply => reply.is_accepted_answer === true);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.gray300} />
        <Text style={styles.errorTitle}>Post Not Found</Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
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
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>Discussion</Text>
          <Text style={styles.headerSubtitle}>{replies.length} replies</Text>
        </View>
        <TouchableOpacity
          style={styles.flagButton}
          onPress={() => handleFlag('post', post.id)}
          data-testid="button-flag-post"
        >
          <Ionicons name="flag-outline" size={20} color={colors.white} />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.postCard}>
          <View style={styles.postHeader}>
            <View style={styles.authorAvatar}>
              <Text style={styles.authorInitials}>
                {getAuthorInitials(post.author?.full_name || null)}
              </Text>
            </View>
            <View style={styles.postMeta}>
              <Text style={styles.authorName}>{post.author?.full_name || 'Anonymous'}</Text>
              <View style={styles.postMetaRow}>
                <Text style={styles.postTime}>{formatTimeAgo(post.created_at)}</Text>
                <View style={styles.metaDot} />
                <Ionicons name="eye-outline" size={12} color={colors.gray500} />
                <Text style={styles.postTime}>{post.view_count} views</Text>
              </View>
            </View>
          </View>

          <Text style={styles.postTitle}>{post.title}</Text>
          <Text style={styles.postContent}>{post.content}</Text>

          {hasAcceptedReply && (
            <View style={styles.answeredBanner}>
              <Ionicons name="checkmark-circle" size={18} color="#059669" />
              <Text style={styles.answeredBannerText}>This question has an accepted answer</Text>
            </View>
          )}
        </View>

        <View style={styles.repliesHeader}>
          <Text style={styles.repliesTitle}>Replies ({replies.length})</Text>
        </View>

        {replies.length === 0 ? (
          <View style={styles.noReplies}>
            <Ionicons name="chatbubble-outline" size={48} color={colors.gray300} />
            <Text style={styles.noRepliesText}>No replies yet. Be the first to answer!</Text>
          </View>
        ) : (
          replies.map((reply) => (
            <View 
              key={reply.id} 
              style={[styles.replyCard, reply.is_accepted_answer && styles.acceptedReplyCard]}
              data-testid={`reply-${reply.id}`}
            >
              {reply.is_accepted_answer && (
                <View style={styles.acceptedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#059669" />
                  <Text style={styles.acceptedBadgeText}>Accepted Answer</Text>
                </View>
              )}
              
              <View style={styles.replyHeader}>
                {reply.is_ai_generated ? (
                  <View style={styles.aiAvatar}>
                    <Ionicons name="sparkles" size={18} color={colors.white} />
                  </View>
                ) : (
                  <View style={styles.authorAvatar}>
                    <Text style={styles.authorInitials}>
                      {getAuthorInitials(reply.author?.full_name || null)}
                    </Text>
                  </View>
                )}
                <View style={styles.replyMeta}>
                  <View style={styles.replyNameRow}>
                    <Text style={styles.authorName}>
                      {reply.is_ai_generated ? 'AI Assistant' : (reply.author?.full_name || 'Anonymous')}
                    </Text>
                    {reply.is_ai_generated && (
                      <View style={styles.aiBadge}>
                        <Ionicons name="sparkles" size={10} color={colors.primary} />
                        <Text style={styles.aiBadgeText}>AI</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.postTime}>{formatTimeAgo(reply.created_at)}</Text>
                </View>
              </View>

              <Text style={styles.replyContent}>{reply.content}</Text>

              <View style={styles.replyFooter}>
                <TouchableOpacity
                  style={[styles.upvoteButton, reply.has_upvoted && styles.upvotedButton]}
                  onPress={() => handleUpvote(reply.id)}
                  data-testid={`button-upvote-${reply.id}`}
                >
                  <Ionicons 
                    name={reply.has_upvoted ? 'thumbs-up' : 'thumbs-up-outline'} 
                    size={16} 
                    color={reply.has_upvoted ? colors.primary : colors.gray500} 
                  />
                  <Text style={[styles.upvoteText, reply.has_upvoted && styles.upvotedText]}>
                    {reply.upvotes || 0}
                  </Text>
                </TouchableOpacity>

                <View style={styles.replyActions}>
                  {isPostAuthor && !reply.is_accepted_answer && !hasAcceptedReply && (
                    <TouchableOpacity
                      style={styles.acceptButton}
                      onPress={() => handleAcceptAnswer(reply.id)}
                      data-testid={`button-accept-${reply.id}`}
                    >
                      <Ionicons name="checkmark-circle-outline" size={16} color="#059669" />
                      <Text style={styles.acceptButtonText}>Accept</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.flagSmallButton}
                    onPress={() => handleFlag('reply', reply.id)}
                    data-testid={`button-flag-reply-${reply.id}`}
                  >
                    <Ionicons name="flag-outline" size={14} color={colors.gray400} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.replyInputContainer}>
        <TextInput
          style={styles.replyInput}
          placeholder="Write your reply..."
          value={replyContent}
          onChangeText={setReplyContent}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendButton, !replyContent.trim() && styles.sendButtonDisabled]}
          onPress={handleSubmitReply}
          disabled={!replyContent.trim() || submittingReply}
          data-testid="button-send-reply"
        >
          {submittingReply ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="send" size={20} color={colors.white} />
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={showFlagModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFlagModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Content</Text>
              <TouchableOpacity onPress={() => setShowFlagModal(false)}>
                <Ionicons name="close" size={24} color={colors.gray600} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              Please describe why you're reporting this {flagTargetType}:
            </Text>

            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Enter your reason..."
              value={flagReason}
              onChangeText={setFlagReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitButton, !flagReason.trim() && styles.submitButtonDisabled]}
              onPress={submitFlag}
              disabled={!flagReason.trim() || submittingFlag}
            >
              {submittingFlag ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Submit Report</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
    backgroundColor: colors.gray50,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.gray50,
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray900,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  errorButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  errorButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  flagButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  postCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  authorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorInitials: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },
  postMeta: {
    flex: 1,
    marginLeft: spacing.md,
  },
  postMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.gray400,
    marginHorizontal: spacing.xs,
  },
  authorName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray900,
  },
  postTime: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  postTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.gray900,
    marginBottom: spacing.sm,
    lineHeight: 26,
  },
  postContent: {
    fontSize: fontSize.md,
    color: colors.gray700,
    lineHeight: 24,
  },
  answeredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  answeredBannerText: {
    fontSize: fontSize.sm,
    color: '#059669',
    fontWeight: '500',
  },
  repliesHeader: {
    marginBottom: spacing.md,
  },
  repliesTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.gray900,
  },
  noReplies: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  noRepliesText: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    marginTop: spacing.md,
  },
  replyCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  acceptedReplyCard: {
    borderWidth: 2,
    borderColor: '#10B981',
    backgroundColor: '#FFFFFF',
  },
  acceptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: 4,
  },
  acceptedBadgeText: {
    fontSize: fontSize.xs,
    color: '#059669',
    fontWeight: '600',
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  aiAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyMeta: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  replyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight + '30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    gap: 2,
  },
  aiBadgeText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '600',
  },
  replyContent: {
    fontSize: fontSize.sm,
    color: colors.gray700,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  replyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    paddingTop: spacing.sm,
  },
  upvoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray100,
    gap: 6,
  },
  upvotedButton: {
    backgroundColor: colors.primaryLight + '20',
  },
  upvoteText: {
    fontSize: fontSize.sm,
    color: colors.gray600,
    fontWeight: '500',
  },
  upvotedText: {
    color: colors.primary,
  },
  replyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: '#D1FAE5',
    gap: 4,
  },
  acceptButtonText: {
    fontSize: fontSize.xs,
    color: '#059669',
    fontWeight: '600',
  },
  flagSmallButton: {
    padding: spacing.xs,
  },
  replyInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    gap: spacing.sm,
  },
  replyInput: {
    flex: 1,
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    fontSize: fontSize.md,
    maxHeight: 100,
    color: colors.gray900,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.gray300,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.gray900,
  },
  modalDescription: {
    fontSize: fontSize.sm,
    color: colors.gray600,
    marginBottom: spacing.md,
  },
  textInput: {
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.gray900,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  submitButtonDisabled: {
    backgroundColor: colors.gray300,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
