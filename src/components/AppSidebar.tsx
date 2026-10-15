import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';
import { navigationRef } from '../navigation/AppNavigator';
import { useAITeacherSubscription } from '../services/aiTeacherSubscription';
import { openAskAI } from '../services/askAIStore';

const { width } = Dimensions.get('window');
const PANEL_WIDTH = Math.min(width * 0.78, 320);

type MenuItem = { icon: string; label: string; route: string };

const MENU_ITEMS: MenuItem[] = [
  { icon: 'home', label: 'Home', route: 'Home' },
  { icon: 'grid', label: 'Dashboard', route: 'Dashboard' },
  { icon: 'document-text', label: 'My Courses', route: 'MyCourses' },
  { icon: 'create', label: 'My Notes', route: 'MyNotes' },
  { icon: 'school', label: 'AI Teacher', route: 'AITeacher' },
  { icon: 'compass', label: 'Explore Courses', route: 'Courses' },
  { icon: 'videocam', label: 'Live Classes', route: 'LiveClasses' },
  { icon: 'trophy', label: 'My Rewards', route: 'MyRewards' },
  { icon: 'calendar', label: 'Timetable', route: 'StudyTimetable' },
  { icon: 'clipboard', label: 'My Test', route: 'MyTests' },
  { icon: 'chatbubbles', label: 'Forum', route: 'Forum' },
  { icon: 'newspaper', label: 'Blog', route: 'Blog' },
  { icon: 'help-circle', label: 'Support', route: 'Support' },
];

// The bottom tabs, which are reached through MainTabs; everything else is a screen on the root stack.
// "Courses" (Explore Courses) is not one of them: it is a stack screen, so it must not be listed here.
const TAB_ROUTES = new Set(['Home', 'Dashboard', 'MyCourses', 'Reels', 'Profile', 'MyNotes']);

function navigateTo(route: string) {
  const nav = navigationRef.current;
  if (!nav) return;
  const navigate = nav.navigate as (...args: any[]) => void;
  if (TAB_ROUTES.has(route)) {
    navigate('MainTabs', { screen: route });
  } else {
    navigate(route);
  }
}

export default function AppSidebar() {
  const { isOpen, closeSidebar } = useSidebar();
  const { user, logout } = useAuth();
  const { hasActivePlan } = useAITeacherSubscription();

  const translateX = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          friction: 9,
          tension: 65,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -PANEL_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [isOpen, translateX, backdropOpacity]);

  if (!mounted) return null;

  const currentRoute = navigationRef.current?.getCurrentRoute()?.name;

  const handlePress = (route: string) => {
    closeSidebar();
    // "AI Teacher" opens the Ask AI screen (the one the lecture player has), not a screen of its own.
    if (route === 'AITeacher') openAskAI();
    else navigateTo(route);
  };

  const handleProfile = () => {
    closeSidebar();
    navigateTo('Profile');
  };

  const handleLogout = async () => {
    closeSidebar();
    await logout();
    navigationRef.current?.reset({ index: 0, routes: [{ name: 'Login' as never }] });
  };

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'S';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={closeSidebar}
          data-testid="backdrop-sidebar"
        />
      </Animated.View>

      <Animated.View style={[styles.sidebar, { width: PANEL_WIDTH, transform: [{ translateX }] }]}>
        <LinearGradient
          colors={[colors.primary, '#4ADE80', '#34D07B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.sidebarInner}
        >
          <TouchableOpacity
            style={styles.sidebarProfile}
            onPress={handleProfile}
            data-testid="button-sidebar-profile"
          >
            <View style={styles.sidebarAvatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View>
              <Text style={styles.sidebarName}>
                {user?.full_name || user?.email?.split('@')[0] || 'Student'}
              </Text>
              <Text style={styles.sidebarSubtext}>Let's start learning!</Text>
            </View>
          </TouchableOpacity>

          <ScrollView
            style={styles.sidebarScroll}
            contentContainerStyle={styles.sidebarScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sidebarMenu}>
              {MENU_ITEMS.filter((item) => item.route !== 'AITeacher' || hasActivePlan).map((item) => {
                const active = currentRoute === item.route;
                return (
                  <TouchableOpacity
                    key={item.label}
                    style={[styles.menuItem, active && styles.menuItemActive]}
                    onPress={() => handlePress(item.route)}
                    data-testid={`menu-item-${item.route}`}
                  >
                    <View style={styles.menuIconContainer}>
                      <Ionicons
                        name={item.icon as any}
                        size={20}
                        color={active ? colors.primary : colors.white}
                      />
                    </View>
                    <Text style={[styles.menuItemText, active && styles.menuItemTextActive]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.sidebarDivider} />

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              data-testid="button-logout"
            >
              <View style={styles.logoutIconContainer}>
                <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              </View>
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>
          </ScrollView>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
  sidebarInner: {
    flex: 1,
    paddingTop: 60,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
  },
  sidebarProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  sidebarAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarText: {
    color: colors.white,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  sidebarName: {
    color: colors.white,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  sidebarSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  sidebarScroll: {
    flex: 1,
  },
  sidebarScrollContent: {
    paddingBottom: 40,
  },
  sidebarMenu: {
    gap: 0,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.xl,
  },
  menuItemActive: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  menuIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  menuItemTextActive: {
    color: colors.primary,
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginHorizontal: spacing.md,
    marginTop: 16,
    marginBottom: 4,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginTop: 4,
  },
  logoutIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.md,
    fontWeight: '500',
  },
});
