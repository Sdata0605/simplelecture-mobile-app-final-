import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { useSidebar } from '../context/SidebarContext';
import HeaderMenuButton from '../components/HeaderMenuButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase, BlogPost } from '../services/supabase';
import { Skeleton } from '../components/SkeletonLoader';

const { width } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export default function BlogListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { openSidebar } = useSidebar();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    try {
      setError(null);
      const result = await supabase.getBlogPosts();
      if (result.success && result.posts) {
        setPosts(result.posts);
      } else {
        setError(result.error || 'Failed to load blog posts');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPosts();
  };

  const handlePostPress = (slug: string) => {
    navigation.navigate('BlogDetail', { slug });
  };

  const featuredPost = posts.length > 0 ? posts[0] : null;
  const remainingPosts = posts.length > 1 ? posts.slice(1) : [];

  const renderImageOrPlaceholder = (imageUrl: string | null, height: number, index: number = 0) => {
    if (imageUrl) {
      return (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: '100%', height, borderRadius: borderRadius.md }}
          resizeMode="cover"
        />
      );
    }
    const gradientSets: [string, string][] = [
      ['rgba(43,189,110,0.2)', 'rgba(43,189,110,0.05)'],
      ['rgba(74,222,128,0.2)', 'rgba(74,222,128,0.05)'],
      ['rgba(43,189,110,0.15)', 'rgba(74,222,128,0.05)'],
      ['rgba(74,222,128,0.15)', 'rgba(43,189,110,0.1)'],
      ['rgba(43,189,110,0.1)', 'rgba(74,222,128,0.15)'],
      ['rgba(74,222,128,0.1)', 'rgba(43,189,110,0.05)'],
    ];
    const gradientColors = gradientSets[index % gradientSets.length];
    return (
      <LinearGradient
        colors={gradientColors}
        style={{ width: '100%', height, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="book-outline" size={40} color={colors.primary} />
      </LinearGradient>
    );
  };

  const renderSkeleton = () => (
    <View style={styles.skeletonContainer}>
      <View style={styles.skeletonFeatured}>
        <Skeleton height={180} borderRadius={borderRadius.md} />
        <View style={{ marginTop: spacing.md }}>
          <Skeleton height={14} width="40%" />
          <Skeleton height={20} style={{ marginTop: spacing.sm }} />
          <Skeleton height={14} width="80%" style={{ marginTop: spacing.sm }} />
          <Skeleton height={14} width="30%" style={{ marginTop: spacing.sm }} />
        </View>
      </View>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <Skeleton height={140} borderRadius={borderRadius.md} />
          <Skeleton height={12} width="30%" style={{ marginTop: spacing.sm }} />
          <Skeleton height={16} style={{ marginTop: spacing.xs }} />
          <Skeleton height={12} width="90%" style={{ marginTop: spacing.xs }} />
          <Skeleton height={12} width="25%" style={{ marginTop: spacing.sm }} />
        </View>
      ))}
    </View>
  );

  const renderError = () => (
    <View style={styles.centerState}>
      <Ionicons name="alert-circle-outline" size={56} color={colors.error} />
      <Text style={styles.centerStateTitle}>Something went wrong</Text>
      <Text style={styles.centerStateSubtext}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={loadPosts} data-testid="button-retry">
        <Text style={styles.retryButtonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.centerState}>
      <Ionicons name="newspaper-outline" size={56} color={colors.textMuted} />
      <Text style={styles.centerStateTitle}>No blog posts yet</Text>
      <Text style={styles.centerStateSubtext}>Check back later for new content</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 36 }} />
        <Text style={styles.headerTitle}>Blog</Text>
        <HeaderMenuButton onPress={openSidebar} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        <LinearGradient
          colors={[colors.primary, '#4ADE80']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBanner}
        >
          <View style={styles.heroContent}>
            <Ionicons name="sparkles" size={24} color={colors.white} />
            <Text style={styles.heroTitle}>SimpleLecture Blog</Text>
            <Text style={styles.heroSubtitle}>Insights for Smarter Learning</Text>
            <Text style={styles.heroDescription}>
              Discover tips, strategies, and guides to excel in your studies
            </Text>
          </View>
        </LinearGradient>

        {loading ? (
          renderSkeleton()
        ) : error ? (
          renderError()
        ) : posts.length === 0 ? (
          renderEmpty()
        ) : (
          <View style={styles.postsContainer}>
            {featuredPost && (
              <TouchableOpacity
                style={styles.featuredCard}
                onPress={() => handlePostPress(featuredPost.slug)}
                activeOpacity={0.8}
                data-testid={`card-blog-featured-${featuredPost.id}`}
              >
                <View style={styles.featuredImageContainer}>
                  {renderImageOrPlaceholder(featuredPost.featured_image_url, 180, 0)}
                  <View style={styles.featuredBadge}>
                    <Ionicons name="star" size={12} color={colors.white} />
                    <Text style={styles.featuredBadgeText}>Featured</Text>
                  </View>
                </View>
                <View style={styles.featuredContent}>
                  <View style={styles.metaRow}>
                    <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.dateText}>{formatDate(featuredPost.published_at)}</Text>
                  </View>
                  {featuredPost.courses && (
                    <View style={styles.courseBadge}>
                      <Text style={styles.courseBadgeText}>{featuredPost.courses.name}</Text>
                    </View>
                  )}
                  <Text style={styles.featuredTitle} numberOfLines={2}>
                    {featuredPost.title}
                  </Text>
                  <Text style={styles.featuredDescription} numberOfLines={2}>
                    {featuredPost.meta_description}
                  </Text>
                  <View style={styles.readMoreRow}>
                    <Text style={styles.readMoreText}>Read more</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {remainingPosts.length > 0 && (
              <View style={styles.postsList}>
                {remainingPosts.map((post, index) => (
                  <TouchableOpacity
                    key={post.id}
                    style={styles.postCard}
                    onPress={() => handlePostPress(post.slug)}
                    activeOpacity={0.8}
                    data-testid={`card-blog-post-${post.id}`}
                  >
                    {renderImageOrPlaceholder(post.featured_image_url, 140, index + 1)}
                    <View style={styles.postCardContent}>
                      <View style={styles.metaRow}>
                        <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                        <Text style={styles.dateTextSmall}>{formatDate(post.published_at)}</Text>
                        {post.courses && (
                          <View style={styles.courseBadgeSmall}>
                            <Text style={styles.courseBadgeSmallText}>{post.courses.name}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.postTitle} numberOfLines={2}>
                        {post.title}
                      </Text>
                      <Text style={styles.postDescription} numberOfLines={2}>
                        {post.meta_description}
                      </Text>
                      <View style={styles.readMoreRow}>
                        <Text style={styles.readMoreTextSmall}>Read more</Text>
                        <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
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
    paddingTop: 48,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.bold,
    color: colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  heroBanner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  heroContent: {
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  heroTitle: {
    fontSize: fontSize.xxl,
    fontFamily: fontFamily.heading,
    color: colors.white,
    marginTop: spacing.sm,
  },
  heroSubtitle: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
    color: 'rgba(255,255,255,0.9)',
  },
  heroDescription: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.8)',
    marginTop: spacing.xs,
  },
  postsContainer: {
    padding: spacing.md,
  },
  featuredCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  featuredImageContainer: {
    position: 'relative',
  },
  featuredBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  featuredBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semiBold,
    color: colors.white,
  },
  featuredContent: {
    padding: spacing.md,
  },
  featuredTitle: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.heading,
    color: colors.text,
    marginTop: spacing.sm,
    lineHeight: 26,
  },
  featuredDescription: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  dateText: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
    color: colors.textMuted,
  },
  dateTextSmall: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.regular,
    color: colors.textMuted,
  },
  courseBadge: {
    backgroundColor: 'rgba(43,189,110,0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  courseBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.medium,
    color: colors.primary,
  },
  courseBadgeSmall: {
    backgroundColor: 'rgba(43,189,110,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginLeft: spacing.xs,
  },
  courseBadgeSmallText: {
    fontSize: 10,
    fontFamily: fontFamily.medium,
    color: colors.primary,
  },
  readMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  readMoreText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  readMoreTextSmall: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  postsList: {
    gap: spacing.md,
  },
  postCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  postCardContent: {
    padding: spacing.md,
  },
  postTitle: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    marginTop: spacing.xs,
    lineHeight: 22,
  },
  postDescription: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  skeletonContainer: {
    padding: spacing.md,
  },
  skeletonFeatured: {
    marginBottom: spacing.lg,
  },
  skeletonCard: {
    marginBottom: spacing.md,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
    paddingHorizontal: spacing.lg,
  },
  centerStateTitle: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    marginTop: spacing.md,
  },
  centerStateSubtext: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  retryButtonText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.white,
  },
});
