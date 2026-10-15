import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Share,
  Clipboard,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase, BlogPostDetail, BlogSection } from '../services/supabase';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'BlogDetail'>;

const SECTION_ICONS = ['book-outline', 'flag-outline', 'bulb-outline', 'rocket-outline', 'pencil-outline', 'sparkles-outline'];

const GRADIENT_COLORS: [string, string][] = [
  ['rgba(43,189,110,0.20)', 'rgba(43,189,110,0.05)'],
  ['rgba(99,102,241,0.20)', 'rgba(99,102,241,0.05)'],
  ['rgba(43,189,110,0.15)', 'rgba(99,102,241,0.10)'],
  ['rgba(99,102,241,0.15)', 'rgba(43,189,110,0.10)'],
  ['rgba(43,189,110,0.10)', 'rgba(99,102,241,0.15)'],
  ['rgba(99,102,241,0.10)', 'rgba(43,189,110,0.05)'],
];

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function calculateReadingTime(sections: BlogSection[]): number {
  const totalWords = sections.reduce((acc, section) => {
    const headingWords = section.heading ? section.heading.split(/\s+/).length : 0;
    const contentWords = section.content ? section.content.split(/\s+/).length : 0;
    return acc + headingWords + contentWords;
  }, 0);
  return Math.max(1, Math.ceil(totalWords / 200));
}

export default function BlogDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { slug } = route.params;

  const [post, setPost] = useState<BlogPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const loadPost = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await supabase.getBlogPostBySlug(slug);
      if (result.success && result.post) {
        setPost(result.post);
      } else {
        setError(result.error || 'Failed to load blog post');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  const handleShare = async () => {
    if (!post) return;
    try {
      await Share.share({
        message: `${post.title} - SimpleLecture Blog\nhttps://simplelecture.com/blog/${post.slug}`,
        title: post.title,
      });
    } catch (err) {
      console.error('Share error:', err);
    }
  };

  const handleCopyLink = () => {
    if (!post) return;
    Clipboard.setString(`https://simplelecture.com/blog/${post.slug}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleViewCourse = () => {
    if (!post?.courses) return;
    navigation.navigate('CourseDetails', { courseId: post.courses.id });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading article...</Text>
      </View>
    );
  }

  if (error || !post) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorTitle}>Failed to load article</Text>
        <Text style={styles.errorMessage}>{error || 'Article not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadPost}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={18} color={colors.primary} />
          <Text style={styles.backLinkText}>All Blog Posts</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const readingTime = calculateReadingTime(post.sections || []);
  const showToc = (post.sections?.length || 0) > 2;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {post.featured_image_url ? (
          <View style={styles.heroContainer}>
            <Image source={{ uri: post.featured_image_url }} style={styles.heroImage} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)']}
              style={styles.heroOverlay}
            />
          </View>
        ) : (
          <LinearGradient
            colors={GRADIENT_COLORS[0]}
            style={styles.heroPlaceholder}
          >
            <Ionicons name="book-outline" size={64} color={colors.primary} />
          </LinearGradient>
        )}

        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>

        <View style={styles.contentContainer}>
          <View style={styles.breadcrumb}>
            <Text style={styles.breadcrumbText}>Home</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
            <Text style={styles.breadcrumbText}>Blog</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
            <Text style={styles.breadcrumbActive} numberOfLines={1}>{post.title}</Text>
          </View>

          <Text style={styles.postTitle}>{post.title}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>{formatDate(post.published_at)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>{readingTime} min read</Text>
            </View>
          </View>

          {post.courses && (
            <TouchableOpacity style={styles.courseBadge} onPress={handleViewCourse}>
              <Ionicons name="school-outline" size={12} color={colors.primary} />
              <Text style={styles.courseBadgeText}>{post.courses.name}</Text>
            </TouchableOpacity>
          )}

          {showToc && (
            <View style={styles.tocCard}>
              <Text style={styles.tocTitle}>In this article</Text>
              {post.sections.map((section, index) => (
                <View key={index} style={styles.tocItem}>
                  <View style={styles.tocDot} />
                  <Text style={styles.tocText}>{section.heading}</Text>
                </View>
              ))}
            </View>
          )}

          {post.sections?.map((section, index) => (
            <View key={index}>
              {renderSection(section, index)}
              {index < (post.sections?.length || 0) - 1 && renderDivider(index)}
            </View>
          ))}

          {post.keywords && post.keywords.length > 0 && (
            <View style={styles.keywordsSection}>
              <Text style={styles.keywordsTitle}>Topics</Text>
              <View style={styles.keywordsRow}>
                {post.keywords.map((keyword, index) => (
                  <View key={index} style={styles.keywordBadge}>
                    <Text style={styles.keywordText}>{keyword}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.shareSection}>
            <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={18} color={colors.primary} />
              <Text style={styles.shareButtonText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopyLink}>
              <Ionicons name={copiedLink ? 'checkmark' : 'link-outline'} size={18} color={copiedLink ? colors.success : colors.primary} />
              <Text style={[styles.copyButtonText, copiedLink && { color: colors.success }]}>
                {copiedLink ? 'Copied!' : 'Copy link'}
              </Text>
            </TouchableOpacity>
          </View>

          {post.courses && (
            <LinearGradient
              colors={['rgba(43,189,110,0.12)', 'rgba(99,102,241,0.08)']}
              style={styles.ctaCard}
            >
              <Ionicons name="book-outline" size={24} color={colors.primary} />
              <Text style={styles.ctaTitle}>Interested in {post.courses.name}?</Text>
              <Text style={styles.ctaDescription}>
                Explore the full course curriculum, video lectures, and practice problems.
              </Text>
              <TouchableOpacity style={styles.ctaButton} onPress={handleViewCourse}>
                <Text style={styles.ctaButtonText}>View Course Details</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>
          )}

          <TouchableOpacity style={styles.allPostsLink} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={colors.primary} />
            <Text style={styles.allPostsLinkText}>All Blog Posts</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function renderSection(section: BlogSection, index: number) {
  const gradientIdx = index % GRADIENT_COLORS.length;
  const iconName = SECTION_ICONS[index % SECTION_ICONS.length] as any;

  return (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionHeading}>{section.heading}</Text>

      {section.image_url ? (
        <Image
          source={{ uri: section.image_url }}
          style={styles.sectionImage}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={GRADIENT_COLORS[gradientIdx]}
          style={styles.sectionImagePlaceholder}
        >
          <Ionicons name={iconName} size={32} color={colors.primary} />
        </LinearGradient>
      )}

      {index === 0 ? renderDropCapContent(section.content) : (
        <Text style={styles.sectionContent}>{section.content}</Text>
      )}
    </View>
  );
}

function renderDropCapContent(content: string) {
  if (!content || content.length === 0) return null;
  const firstChar = content[0];
  const restContent = content.slice(1);

  return (
    <View style={styles.dropCapContainer}>
      <Text style={styles.dropCapLetter}>{firstChar}</Text>
      <Text style={styles.sectionContent}>{restContent}</Text>
    </View>
  );
}

function renderDivider(index: number) {
  const iconName = SECTION_ICONS[index % SECTION_ICONS.length] as any;

  return (
    <View style={styles.dividerContainer}>
      <LinearGradient
        colors={['transparent', colors.border, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.dividerLine}
      />
      <View style={styles.dividerIconContainer}>
        <Ionicons name={iconName} size={16} color={colors.primary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    marginTop: spacing.md,
  },
  errorMessage: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontFamily: fontFamily.regular,
  },
  retryButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
  },
  heroContainer: {
    width: '100%',
    height: 320,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  heroPlaceholder: {
    width: '100%',
    height: 320,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 48,
    left: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  contentContainer: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  breadcrumbText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontFamily: fontFamily.regular,
  },
  breadcrumbActive: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
    flex: 1,
  },
  postTitle: {
    fontSize: 26,
    fontFamily: fontFamily.heading,
    color: colors.text,
    marginBottom: spacing.sm,
    lineHeight: 34,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  courseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(43,189,110,0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
  },
  courseBadgeText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontFamily: fontFamily.medium,
  },
  tocCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
  },
  tocTitle: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  tocItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tocDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  tocText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    flex: 1,
  },
  sectionContainer: {
    marginBottom: spacing.md,
  },
  sectionHeading: {
    fontSize: 24,
    fontFamily: fontFamily.heading,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionImage: {
    width: '100%',
    height: 220,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  sectionImagePlaceholder: {
    width: '100%',
    height: 180,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionContent: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 28.8,
    fontFamily: fontFamily.regular,
  },
  dropCapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dropCapLetter: {
    fontSize: 64,
    fontFamily: fontFamily.heading,
    color: colors.primary,
    lineHeight: 64,
    marginRight: spacing.xs,
    marginTop: -4,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    position: 'relative',
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerIconContainer: {
    position: 'absolute',
    left: '50%',
    marginLeft: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keywordsSection: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  keywordsTitle: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  keywordsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  keywordBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  keywordText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  shareSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  shareButtonText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontFamily: fontFamily.medium,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyButtonText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontFamily: fontFamily.medium,
  },
  ctaCard: {
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(43,189,110,0.2)',
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  ctaDescription: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    fontFamily: fontFamily.regular,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  ctaButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
  },
  allPostsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
  },
  allPostsLinkText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontFamily: fontFamily.medium,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  backLinkText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontFamily: fontFamily.medium,
  },
});
