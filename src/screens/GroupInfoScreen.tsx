import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { forumService, ForumGroup, ForumGroupMember } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'GroupInfo'>;

export default function GroupInfoScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { groupId } = route.params;

  const [group, setGroup] = useState<ForumGroup | null>(null);
  const [members, setMembers] = useState<ForumGroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

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
      const [groupRes, membersRes] = await Promise.all([
        forumService.getGroupDetails(groupId),
        forumService.getGroupMembers(groupId),
      ]);

      if (groupRes.success && groupRes.group) {
        setGroup(groupRes.group);
        setEditName(groupRes.group.name);
        setEditDescription(groupRes.group.description || '');
      }
      if (membersRes.success && membersRes.members) {
        setMembers(membersRes.members);
      }
    } catch (error) {
      console.error('Error loading group info:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isAdmin = group?.role === 'admin';

  const handleLeaveGroup = () => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await forumService.leaveGroup(groupId);
            navigation.navigate('Forum');
          },
        },
      ]
    );
  };

  const handleRemoveMember = (member: ForumGroupMember) => {
    Alert.alert(
      'Remove Member',
      `Remove ${member.user?.full_name || 'this user'} from the group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await forumService.removeGroupMember(groupId, member.user_id);
            loadData();
          },
        },
      ]
    );
  };

  const handleToggleAdmin = async (member: ForumGroupMember) => {
    const newRole = member.role === 'admin' ? 'member' : 'admin';
    const action = newRole === 'admin' ? 'promote to admin' : 'demote to member';
    
    Alert.alert(
      'Change Role',
      `${action.charAt(0).toUpperCase() + action.slice(1)} ${member.user?.full_name || 'this user'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            await forumService.updateMemberRole(groupId, member.user_id, newRole);
            loadData();
          },
        },
      ]
    );
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    
    setSaving(true);
    await forumService.updateGroup(groupId, {
      name: editName.trim(),
      description: editDescription.trim(),
    });
    setSaving(false);
    setShowEditModal(false);
    loadData();
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.gray300} />
        <Text style={styles.errorTitle}>Group Not Found</Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const admins = members.filter(m => m.role === 'admin');
  const regularMembers = members.filter(m => m.role === 'member');

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
        <Text style={styles.headerTitle}>Group Info</Text>
        {isAdmin && (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setShowEditModal(true)}
            data-testid="button-edit-group"
          >
            <Ionicons name="create-outline" size={24} color={colors.white} />
          </TouchableOpacity>
        )}
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.groupHeader}>
          {group.avatar_url ? (
            <Image source={{ uri: group.avatar_url }} style={styles.groupAvatar} />
          ) : (
            <View style={styles.groupAvatarPlaceholder}>
              <Ionicons name="people" size={48} color={colors.primary} />
            </View>
          )}
          <Text style={styles.groupName}>{group.name}</Text>
          {group.description && (
            <Text style={styles.groupDescription}>{group.description}</Text>
          )}
          <View style={styles.groupMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={16} color={colors.gray500} />
              <Text style={styles.metaText}>{group.member_count} members</Text>
            </View>
            {group.is_private && (
              <View style={styles.privateBadge}>
                <Ionicons name="lock-closed" size={12} color={colors.gray600} />
                <Text style={styles.privateBadgeText}>Private</Text>
              </View>
            )}
          </View>
          <Text style={styles.createdText}>Created {formatDate(group.created_at)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Admins ({admins.length})</Text>
          {admins.map((member) => (
            <View key={member.id} style={styles.memberCard}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {getInitials(member.user?.full_name || null)}
                </Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.user?.full_name || 'Anonymous'}</Text>
                <Text style={styles.memberRole}>Admin</Text>
              </View>
              {isAdmin && member.user_id !== currentUserId && (
                <TouchableOpacity
                  style={styles.memberAction}
                  onPress={() => handleToggleAdmin(member)}
                >
                  <Ionicons name="arrow-down-circle-outline" size={20} color={colors.gray500} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members ({regularMembers.length})</Text>
          {regularMembers.length === 0 ? (
            <Text style={styles.emptyText}>No regular members yet</Text>
          ) : (
            regularMembers.map((member) => (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>
                    {getInitials(member.user?.full_name || null)}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.user?.full_name || 'Anonymous'}</Text>
                  <Text style={styles.memberJoined}>Joined {formatDate(member.joined_at)}</Text>
                </View>
                {isAdmin && (
                  <View style={styles.memberActions}>
                    <TouchableOpacity
                      style={styles.memberAction}
                      onPress={() => handleToggleAdmin(member)}
                    >
                      <Ionicons name="arrow-up-circle-outline" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.memberAction}
                      onPress={() => handleRemoveMember(member)}
                    >
                      <Ionicons name="remove-circle-outline" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          style={styles.leaveButton}
          onPress={handleLeaveGroup}
          data-testid="button-leave-group"
        >
          <Ionicons name="exit-outline" size={20} color={colors.error} />
          <Text style={styles.leaveButtonText}>Leave Group</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Group</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={colors.gray600} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Group Name</Text>
            <TextInput
              style={styles.textInput}
              value={editName}
              onChangeText={setEditName}
              maxLength={100}
            />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.saveButton, !editName.trim() && styles.saveButtonDisabled]}
              onPress={handleSaveEdit}
              disabled={!editName.trim() || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
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
    backgroundColor: colors.white,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.white,
  },
  errorTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.gray800,
    marginTop: spacing.lg,
  },
  errorButton: {
    marginTop: spacing.xl,
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
  headerTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.white,
    textAlign: 'center',
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  groupHeader: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  groupAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  groupAvatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.gray800,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  groupDescription: {
    fontSize: fontSize.md,
    color: colors.gray600,
    marginTop: spacing.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  groupMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  privateBadgeText: {
    fontSize: fontSize.xs,
    color: colors.gray600,
  },
  createdText: {
    fontSize: fontSize.xs,
    color: colors.gray400,
    marginTop: spacing.sm,
  },
  section: {
    backgroundColor: colors.white,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray800,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.gray400,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  memberInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  memberName: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.gray800,
  },
  memberRole: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '500',
  },
  memberJoined: {
    fontSize: fontSize.xs,
    color: colors.gray400,
  },
  memberActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  memberAction: {
    padding: spacing.xs,
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  leaveButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.error,
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
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray800,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray600,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  textInput: {
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.gray800,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  saveButtonDisabled: {
    backgroundColor: colors.gray300,
  },
  saveButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.white,
  },
});
