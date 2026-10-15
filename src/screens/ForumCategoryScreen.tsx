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
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { forumService, ForumPost, ForumCategory } from '../services/supabase';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'ForumCategory'>;

export default function ForumCategoryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { categoryId, categoryName, isGeneral } = route.params;

  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      console.log('Loading posts for category:', categoryId);
      const result = await forumService.getForumPostsByCategory(categoryId);
      console.log('[Forum] Posts loaded:', result.success, 'count:', result.posts?.length || 0);
      if (result.success && result.posts) {
        setPosts(result.posts);
      } else {
        console.error('Failed to load posts:', result.error);
      }
    } catch (error) {
      console.error('Error loading posts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryId]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPosts();
  };

  const handleCreatePost = async () => {
    if (!postTitle.trim() || !postContent.trim()) return;
    
    setSubmitting(true);
    const result = await forumService.createForumPost(categoryId, postTitle.trim(), postContent.trim());
    setSubmitting(false);
    
    if (result.success) {
      setShowCreatePostModal(false);
      setPostTitle('');
      setPostContent('');
      if (result.post) {
        navigation.navigate('ForumPost', { postId: result.post.id });
      }
    }
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>{categoryName}</Text>
            {isGeneral && (
              <View style={styles.aiBadge}>
                <Ionicons name="sparkles" size={12} color={colors.white} />
                <Text style={styles.aiBadgeText}>AI Assisted</Text>
              </View>
            )}
          </View>
          <Text style={styles.headerSubtitle}>{posts.length} questions</Text>
        </View>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setShowCreatePostModal(true)}
          data-testid="button-new-question"
        >
          <Ionicons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {posts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={64} color={colors.gray300} />
            <Text style={styles.emptyTitle}>No Questions Yet</Text>
            <Text style={styles.emptyText}>Be the first to ask a question in this category!</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setShowCreatePostModal(true)}
            >
              <Ionicons name="add" size={20} color={colors.white} />
              <Text style={styles.emptyButtonText}>Ask a Question</Text>
            </TouchableOpacity>
          </View>
        ) : (
          posts.map((post) => (
            <TouchableOpacity
              key={post.id}
              style={styles.postCard}
              onPress={() => navigation.navigate('ForumPost', { postId: post.id })}
              data-testid={`card-post-${post.id}`}
            >
              <View style={styles.postHeader}>
                <View style={styles.authorAvatar}>
                  <Text style={styles.authorInitials}>
                    {getAuthorInitials(post.author?.full_name || null)}
                  </Text>
                </View>
                <View style={styles.postMeta}>
                  <Text style={styles.authorName}>{post.author?.full_name || 'Anonymous'}</Text>
                  <Text style={styles.postTime}>{formatTimeAgo(post.created_at)}</Text>
                </View>
                {post.is_pinned && (
                  <View style={styles.pinnedBadge}>
                    <Ionicons name="pin" size={12} color={colors.primary} />
                  </View>
                )}
              </View>

              <Text style={styles.postTitle} numberOfLines={2}>{post.title}</Text>
              <Text style={styles.postContent} numberOfLines={2}>{post.content}</Text>

              <View style={styles.postFooter}>
                <View style={styles.postStats}>
                  <View style={styles.stat}>
                    <Ionicons name="chatbubble-outline" size={14} color={colors.gray500} />
                    <Text style={styles.statText}>{post.reply_count || 0}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Ionicons name="eye-outline" size={14} color={colors.gray500} />
                    <Text style={styles.statText}>{post.view_count || 0}</Text>
                  </View>
                </View>
                {post.is_answered && (
                  <View style={styles.answeredBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                    <Text style={styles.answeredText}>Answered</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal
        visible={showCreatePostModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreatePostModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ask a Question</Text>
              <TouchableOpacity onPress={() => setShowCreatePostModal(false)}>
                <Ionicons name="close" size={24} color={colors.gray600} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.textInput}
              placeholder="What's your question?"
              value={postTitle}
              onChangeText={setPostTitle}
              maxLength={200}
            />

            <Text style={styles.inputLabel}>Details</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Provide more context about your question..."
              value={postContent}
              onChangeText={setPostContent}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitButton, (!postTitle.trim() || !postContent.trim()) && styles.submitButtonDisabled]}
              onPress={handleCreatePost}
              disabled={!postTitle.trim() || !postContent.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Post Question</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    backgroundColor: colors.gray50,
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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  aiBadgeText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  headerButton: {
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray900,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    marginBottom: spacing.lg,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.xs,
  },
  emptyButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  postCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  authorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorInitials: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  postMeta: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  authorName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray900,
  },
  postTime: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  pinnedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryLight + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray900,
    marginBottom: spacing.xs,
    lineHeight: 22,
  },
  postContent: {
    fontSize: fontSize.sm,
    color: colors.gray600,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  postFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    paddingTop: spacing.sm,
  },
  postStats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  answeredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  answeredText: {
    fontSize: fontSize.xs,
    color: '#059669',
    fontWeight: '600',
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
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.gray900,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray700,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
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
    height: 120,
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
