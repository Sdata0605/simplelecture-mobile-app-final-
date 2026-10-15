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
  Switch,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { forumService, ForumCategory, ForumGroup } from '../services/supabase';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ForumScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { openSidebar } = useSidebar();
  const [activeTab, setActiveTab] = useState<'categories' | 'groups'>('categories');
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [groups, setGroups] = useState<ForumGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupIsPrivate, setGroupIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [categoriesRes, groupsRes] = await Promise.all([
        forumService.getForumCategories(),
        forumService.getForumGroups(),
      ]);

      if (categoriesRes.success && categoriesRes.categories) {
        setCategories(categoriesRes.categories);
      }
      if (groupsRes.success && groupsRes.groups) {
        setGroups(groupsRes.groups);
      }
    } catch (error) {
      console.error('Error loading forum data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleJoinGroup = async (groupId: string, isMember: boolean) => {
    if (isMember) {
      await forumService.leaveGroup(groupId);
    } else {
      await forumService.joinGroup(groupId);
    }
    loadData();
  };

  const handleCreatePost = async () => {
    if (!selectedCategoryId || !postTitle.trim() || !postContent.trim()) return;
    
    setSubmitting(true);
    const result = await forumService.createForumPost(selectedCategoryId, postTitle.trim(), postContent.trim());
    setSubmitting(false);
    
    if (result.success) {
      setShowCreatePostModal(false);
      setPostTitle('');
      setPostContent('');
      setSelectedCategoryId('');
      if (result.post) {
        navigation.navigate('ForumPost', { postId: result.post.id });
      }
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    
    setSubmitting(true);
    const result = await forumService.createForumGroup(groupName.trim(), groupDescription.trim(), groupIsPrivate);
    setSubmitting(false);
    
    if (result.success) {
      setShowCreateGroupModal(false);
      setGroupName('');
      setGroupDescription('');
      setGroupIsPrivate(false);
      loadData();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const generalCategory = categories.find(c => c.is_general);
  const subjectCategories = categories.filter(c => !c.is_general);

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
        <View style={{ width: 36 }} />
        <Text style={styles.headerTitle}>Forum</Text>
        <View style={styles.headerActions}>
          <HeaderMenuButton onPress={openSidebar} />
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowCreatePostModal(true)}
            data-testid="button-new-question"
          >
            <Ionicons name="add" size={20} color={colors.white} />
            <Text style={styles.headerButtonText}>New Question</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'categories' && styles.activeTab]}
          onPress={() => setActiveTab('categories')}
          data-testid="tab-categories"
        >
          <Ionicons 
            name="grid-outline" 
            size={18} 
            color={activeTab === 'categories' ? colors.primary : colors.gray500} 
          />
          <Text style={[styles.tabText, activeTab === 'categories' && styles.activeTabText]}>
            Categories
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'groups' && styles.activeTab]}
          onPress={() => setActiveTab('groups')}
          data-testid="tab-groups"
        >
          <Ionicons 
            name="people-outline" 
            size={18} 
            color={activeTab === 'groups' ? colors.primary : colors.gray500} 
          />
          <Text style={[styles.tabText, activeTab === 'groups' && styles.activeTabText]}>
            Discussion Groups
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'categories' && (
          <>
            <View style={styles.infoCard}>
              <Ionicons name="information-circle" size={24} color={colors.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>How the Forum Works</Text>
                <Text style={styles.infoText}>
                  Ask questions, share knowledge, and learn from your peers. General questions 
                  may receive AI-assisted answers if left unanswered.
                </Text>
              </View>
            </View>

            {generalCategory && (
              <TouchableOpacity
                style={styles.generalCategoryCard}
                onPress={() => navigation.navigate('ForumCategory', {
                  categoryId: generalCategory.id,
                  categorySlug: generalCategory.slug,
                  categoryName: generalCategory.name,
                  isGeneral: true,
                })}
                data-testid="card-general-category"
              >
                <LinearGradient
                  colors={['#2BBD6E', '#4ADE80']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.generalCategoryGradient}
                >
                  <View style={styles.generalCategoryHeader}>
                    <Ionicons name="help-circle" size={32} color={colors.white} />
                    <View style={styles.aiBadge}>
                      <Ionicons name="sparkles" size={12} color={colors.white} />
                      <Text style={styles.aiBadgeText}>AI Assisted</Text>
                    </View>
                  </View>
                  <Text style={styles.generalCategoryTitle}>{generalCategory.name}</Text>
                  <Text style={styles.generalCategoryDescription}>
                    {generalCategory.description || 'Ask any question and get help from the community or AI'}
                  </Text>
                  <View style={styles.generalCategoryFooter}>
                    <Text style={styles.postCount}>{generalCategory.post_count || 0} questions</Text>
                    <Ionicons name="arrow-forward" size={20} color={colors.white} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}

            <Text style={styles.sectionTitle}>Subject Categories</Text>
            <View style={styles.categoriesGrid}>
              {subjectCategories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={styles.categoryCard}
                  onPress={() => navigation.navigate('ForumCategory', {
                    categoryId: category.id,
                    categorySlug: category.slug,
                    categoryName: category.name,
                    isGeneral: false,
                  })}
                  data-testid={`card-category-${category.slug}`}
                >
                  <View style={styles.categoryIcon}>
                    <Ionicons name="book-outline" size={24} color={colors.primary} />
                  </View>
                  <Text style={styles.categoryName}>{category.name}</Text>
                  <Text style={styles.categoryPostCount}>{category.post_count || 0} posts</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {activeTab === 'groups' && (
          <>
            <TouchableOpacity
              style={styles.createGroupButton}
              onPress={() => setShowCreateGroupModal(true)}
              data-testid="button-create-group"
            >
              <Ionicons name="add-circle" size={24} color={colors.primary} />
              <Text style={styles.createGroupText}>Create New Group</Text>
            </TouchableOpacity>

            {groups.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={64} color={colors.gray300} />
                <Text style={styles.emptyTitle}>No Discussion Groups Yet</Text>
                <Text style={styles.emptyText}>Be the first to create a discussion group!</Text>
              </View>
            ) : (
              groups.map((group) => (
                <TouchableOpacity 
                  key={group.id} 
                  style={styles.groupCard} 
                  data-testid={`card-group-${group.id}`}
                  onPress={() => {
                    if (group.is_member) {
                      navigation.navigate('GroupChat', { groupId: group.id, groupName: group.name });
                    } else {
                      handleJoinGroup(group.id, false);
                    }
                  }}
                >
                  <View style={styles.groupHeader}>
                    {group.avatar_url ? (
                      <Image source={{ uri: group.avatar_url }} style={styles.groupAvatar} />
                    ) : (
                      <View style={styles.groupIconContainer}>
                        <Ionicons name="people" size={24} color={colors.primary} />
                      </View>
                    )}
                    <View style={styles.groupInfo}>
                      <View style={styles.groupTitleRow}>
                        <Text style={styles.groupName}>{group.name}</Text>
                        {group.is_private && (
                          <View style={styles.privateBadge}>
                            <Ionicons name="lock-closed" size={10} color={colors.gray600} />
                            <Text style={styles.privateBadgeText}>Private</Text>
                          </View>
                        )}
                        {group.is_member && (
                          <View style={styles.memberBadge}>
                            <Ionicons name="checkmark-circle" size={10} color="#10B981" />
                            <Text style={styles.memberBadgeText}>Joined</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.groupDescription} numberOfLines={2}>
                        {group.description || 'No description'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.groupFooter}>
                    <Text style={styles.groupMeta}>
                      <Ionicons name="people-outline" size={14} color={colors.gray500} /> {group.member_count} members
                    </Text>
                    {group.is_member ? (
                      <View style={styles.openChatButton}>
                        <Ionicons name="chatbubbles-outline" size={16} color={colors.primary} />
                        <Text style={styles.openChatText}>Open Chat</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.joinButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleJoinGroup(group.id, false);
                        }}
                        data-testid={`button-join-group-${group.id}`}
                      >
                        <Text style={styles.joinButtonText}>Join</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
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

            <Text style={styles.inputLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categorySelector}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryChip, selectedCategoryId === cat.id && styles.categoryChipSelected]}
                  onPress={() => setSelectedCategoryId(cat.id)}
                >
                  <Text style={[styles.categoryChipText, selectedCategoryId === cat.id && styles.categoryChipTextSelected]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

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
              style={[styles.submitButton, (!selectedCategoryId || !postTitle.trim() || !postContent.trim()) && styles.submitButtonDisabled]}
              onPress={handleCreatePost}
              disabled={!selectedCategoryId || !postTitle.trim() || !postContent.trim() || submitting}
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

      <Modal
        visible={showCreateGroupModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateGroupModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Discussion Group</Text>
              <TouchableOpacity onPress={() => setShowCreateGroupModal(false)}>
                <Ionicons name="close" size={24} color={colors.gray600} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Group Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter group name"
              value={groupName}
              onChangeText={setGroupName}
              maxLength={100}
            />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="What is this group about?"
              value={groupDescription}
              onChangeText={setGroupDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Private Group</Text>
              <Switch
                value={groupIsPrivate}
                onValueChange={setGroupIsPrivate}
                trackColor={{ false: colors.gray200, true: colors.primaryLight }}
                thumbColor={groupIsPrivate ? colors.primary : colors.gray400}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, !groupName.trim() && styles.submitButtonDisabled]}
              onPress={handleCreateGroup}
              disabled={!groupName.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>Create Group</Text>
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
  headerTitle: {
    flex: 1,
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.white,
    marginLeft: spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  headerButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray500,
  },
  activeTabText: {
    color: colors.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.primaryLight + '20',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray900,
    marginBottom: 4,
  },
  infoText: {
    fontSize: fontSize.sm,
    color: colors.gray600,
    lineHeight: 20,
  },
  generalCategoryCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  generalCategoryGradient: {
    padding: spacing.lg,
  },
  generalCategoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  aiBadgeText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  generalCategoryTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.white,
    marginBottom: spacing.xs,
  },
  generalCategoryDescription: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  generalCategoryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  postCount: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.gray900,
    marginBottom: spacing.md,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  categoryCard: {
    width: '47%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  categoryName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray900,
    textAlign: 'center',
    marginBottom: 4,
  },
  categoryPostCount: {
    fontSize: fontSize.xs,
    color: colors.gray500,
  },
  createGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  createGroupText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },
  groupCard: {
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
  groupHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  groupIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  groupInfo: {
    flex: 1,
  },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  groupName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray900,
  },
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    gap: 2,
  },
  privateBadgeText: {
    fontSize: fontSize.xs,
    color: colors.gray600,
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    gap: 2,
  },
  memberBadgeText: {
    fontSize: fontSize.xs,
    color: '#10B981',
    fontWeight: '500',
  },
  openChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight + '30',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  openChatText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  groupDescription: {
    fontSize: fontSize.sm,
    color: colors.gray600,
    lineHeight: 18,
  },
  groupFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    paddingTop: spacing.md,
  },
  groupMeta: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  joinButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  leaveButton: {
    backgroundColor: colors.gray200,
  },
  joinButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  leaveButtonText: {
    color: colors.gray600,
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
  categorySelector: {
    maxHeight: 44,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  categoryChipSelected: {
    backgroundColor: colors.primary,
  },
  categoryChipText: {
    fontSize: fontSize.sm,
    color: colors.gray700,
    fontWeight: '500',
  },
  categoryChipTextSelected: {
    color: colors.white,
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  switchLabel: {
    fontSize: fontSize.md,
    color: colors.gray700,
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
