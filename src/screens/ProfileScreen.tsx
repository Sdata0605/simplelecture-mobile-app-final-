import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';
import { supabase, User } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { openSidebar } = useSidebar();
  const { logout, refreshUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    setIsLoading(true);
    setError('');
    
    const userResult = await supabase.getUserProfile();
    
    if (userResult.success && userResult.user) {
      setUser(userResult.user);
      
      const profileResult = await supabase.getProfile(userResult.user.id);
      
      if (profileResult.success && profileResult.profile) {
        setFullName(profileResult.profile.full_name || '');
        setPhone(profileResult.profile.phone_number || '');
        setDateOfBirth(profileResult.profile.date_of_birth || '');
      } else {
        setFullName(userResult.user.full_name || '');
        setPhone(userResult.user.phone || '');
      }
    } else {
      setError(userResult.error || 'Failed to load profile');
    }
    
    setIsLoading(false);
  };

  const handleSaveChanges = async () => {
    if (!user) return;
    
    setIsSaving(true);
    setError('');
    setSuccessMessage('');
    
    const result = await supabase.updateProfile(user.id, {
      full_name: fullName,
      phone_number: phone,
      date_of_birth: dateOfBirth || null,
    });
    
    setIsSaving(false);
    
    if (result.success) {
      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
      await refreshUser();
    } else {
      setError(result.error || 'Failed to update profile');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Onboarding' }],
    });
  };

  const getInitial = () => {
    if (fullName) return fullName.charAt(0).toUpperCase();
    if (user?.email) return user.email.charAt(0).toUpperCase();
    return 'U';
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingIconContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primary, '#4ADE80']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIconContainer}>
              <Ionicons name="person" size={20} color={colors.primary} />
            </View>
            <Text style={styles.headerTitle}>My Profile</Text>
          </View>
        </View>
        <HeaderMenuButton onPress={openSidebar} />
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchUserProfile}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.profileCard}>
          <LinearGradient
            colors={[colors.primary, '#4ADE80']}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{getInitial()}</Text>
          </LinearGradient>
          <Text style={styles.profileName}>{fullName || 'User'}</Text>
          <View style={styles.emailRow}>
            <Ionicons name="mail-outline" size={16} color={colors.primary} />
            <Text style={styles.profileEmail}>{user?.email || ''}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconContainer}>
              <Ionicons name="person-circle" size={20} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Profile Information</Text>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <View style={styles.inputIconContainer}>
                <Ionicons name="person-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.labelText}>Full Name</Text>
            </View>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholderTextColor={colors.textSecondary}
              placeholder="Enter your name"
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <View style={styles.inputIconContainer}>
                <Ionicons name="mail-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.labelText}>Email Address</Text>
            </View>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={user?.email || ''}
              editable={false}
            />
            <Text style={styles.helperText}>Email cannot be changed</Text>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <View style={styles.inputIconContainer}>
                <Ionicons name="call-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.labelText}>Phone Number</Text>
            </View>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Enter phone number"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <View style={styles.inputIconContainer}>
                <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.labelText}>Date of Birth</Text>
            </View>
            <TextInput
              style={styles.input}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={styles.helperText}>Format: YYYY-MM-DD (e.g., 1990-05-15)</Text>
          </View>

          {successMessage ? (
            <View style={styles.successContainer}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          ) : null}

          <TouchableOpacity 
            onPress={handleSaveChanges}
            disabled={isSaving}
          >
            <LinearGradient
              colors={isSaving ? ['#86EFAC', '#86EFAC'] : [colors.primary, '#4ADE80']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveButton}
            >
              {isSaving ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color={colors.white} />
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconContainer}>
              <Ionicons name="settings" size={20} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Account</Text>
          </View>

          <TouchableOpacity
            style={styles.settingsItem}
            onPress={() => navigation.navigate('Notifications')}
            data-testid="button-notifications-settings"
          >
            <View style={styles.settingsLeft}>
              <View style={styles.settingsIconContainer}>
                <Ionicons name="notifications-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.settingsText}>Notifications</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsItem} onPress={() => navigation.navigate('PrivacySecurity')}>
            <View style={styles.settingsLeft}>
              <View style={styles.settingsIconContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.settingsText}>Privacy & Security</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsItem} onPress={() => navigation.navigate('Support')}>
            <View style={styles.settingsLeft}>
              <View style={styles.settingsIconContainer}>
                <Ionicons name="help-circle-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.settingsText}>Help & Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingsItem, styles.logoutItem]} onPress={handleLogout}>
            <View style={styles.settingsLeft}>
              <View style={[styles.settingsIconContainer, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              </View>
              <Text style={[styles.settingsText, { color: '#EF4444' }]}>Log Out</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl + 24,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
    marginTop: 2,
  },
  headerContent: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.white,
  },
  content: {
    flex: 1,
    marginTop: -spacing.md,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  contentContainer: {
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FEE2E2',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    flex: 1,
    color: '#EF4444',
    fontSize: fontSize.sm,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  profileCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.white,
  },
  profileName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  profileEmail: {
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  cardIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  inputIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  input: {
    backgroundColor: '#FAFAFA',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: colors.textSecondary,
  },
  helperText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#D1FAE5',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successText: {
    color: '#10B981',
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  settingsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingsIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsText: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
  },
  logoutItem: {
    borderBottomWidth: 0,
    marginTop: spacing.sm,
  },
  bottomSpacer: {
    height: 100,
  },
});
