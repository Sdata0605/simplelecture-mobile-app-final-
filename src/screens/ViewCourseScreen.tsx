import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { supabase, ExploreCourse, CourseSubjectItem } from '../services/supabase';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useCourseFreeAccess, useCourseFreePreviewLimits } from '../hooks/useCourseFreeAccess';
import FreePreviewCard from '../components/course/FreePreviewCard';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ViewCourseRouteProp = RouteProp<RootStackParamList, 'ViewCourse'>;

export default function ViewCourseScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ViewCourseRouteProp>();
  const { courseId } = route.params;
  const { addToCart, isInCart } = useCart();
  const { user } = useAuth();

  const [course, setCourse] = useState<ExploreCourse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [addedToCart, setAddedToCart] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);

  const { freeChapterCount } = useCourseFreeAccess(courseId);
  const { aiLimit, doubtsLimit } = useCourseFreePreviewLimits(courseId);

  useEffect(() => {
    fetchCourseDetails();
    checkEnrollment();
  }, [courseId, user?.id]);

  const fetchCourseDetails = async () => {
    setIsLoading(true);
    setError(null);
    const result = await supabase.getCourseDetails(courseId);
    if (result.success && result.course) {
      setCourse(result.course);
    } else {
      setError(result.error || 'Failed to load course details');
    }
    setIsLoading(false);
  };

  const checkEnrollment = async () => {
    if (!user?.id) {
      setIsEnrolled(false);
      return;
    }
    const result = await supabase.getEnrolledCourses(user.id);
    if (result.success && result.enrollments) {
      const enrolled = result.enrollments.some((e: any) => e.course_id === courseId);
      setIsEnrolled(enrolled);
    } else {
      setIsEnrolled(false);
    }
  };

  const handleStartLearning = () => {
    navigation.navigate('LearningPath', { courseId });
  };

  const handleFreePreview = async () => {
    if (!course) return;
    const result = await supabase.getCourseSubjects(courseId);
    if (result.success && result.subjects && result.subjects.length > 0) {
      navigation.navigate('LearningPath', {
        courseId,
        courseName: course.name,
        isPreview: true,
        previewAiLimit: aiLimit ?? 3,
        previewDoubtsLimit: doubtsLimit ?? 3,
      });
    } else {
      Alert.alert('Not Available', 'No content found for this course yet.');
    }
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return 'Free';
    return `₹${price.toLocaleString('en-IN')}`;
  };

  const getDiscountPercent = (original: number | null, current: number | null) => {
    if (!original || !current || original <= current) return null;
    return Math.round(((original - current) / original) * 100);
  };

  const handleAddToCart = () => {
    if (!course) return;
    if (course.is_coming_soon) return;
    
    if (isInCart(course.id)) {
      Alert.alert('Already in Cart', 'This course is already in your cart.');
      return;
    }
    
    addToCart({
      id: course.id,
      name: course.name,
      price: course.price_inr || 0,
      originalPrice: course.original_price_inr || undefined,
      thumbnail_url: course.thumbnail_url,
    });
    
    setAddedToCart(true);
    Alert.alert('Added to Cart', `${course.name} has been added to your cart.`, [
      { text: 'Continue Shopping', style: 'cancel' },
      { text: 'Go to Cart', onPress: () => navigation.navigate('Cart', {}) },
    ]);
  };

  const handleBuyNow = () => {
    if (!course) return;
    if (course.is_coming_soon) return;
    
    if (!isInCart(course.id)) {
      addToCart({
        id: course.id,
        name: course.name,
        price: course.price_inr || 0,
        originalPrice: course.original_price_inr || undefined,
        thumbnail_url: course.thumbnail_url,
      });
    }
    
    navigation.navigate('Cart', {});
  };

  const handleSubjectPress = (subject: CourseSubjectItem) => {
    navigation.navigate('Curriculum', {
      subjectId: subject.id,
      subjectName: subject.name,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading course details...</Text>
      </View>
    );
  }

  if (error || !course) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorIconContainer}>
          <Ionicons name="alert-circle" size={40} color="#EF4444" />
        </View>
        <Text style={styles.errorText}>{error || 'Course not found'}</Text>
        <TouchableOpacity onPress={fetchCourseDetails}>
          <LinearGradient colors={[colors.primary, '#4ADE80']} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const discount = getDiscountPercent(course.original_price_inr, course.price_inr);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.headerImageContainer}>
          {course.thumbnail_url && !course.thumbnail_url.startsWith('data:') ? (
            <Image source={{ uri: course.thumbnail_url }} style={styles.headerImage} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[colors.primary, '#4ADE80', '#86EFAC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerImage}
            >
              <View style={styles.placeholderIcon}>
                <Ionicons name="book" size={32} color={colors.white} />
              </View>
            </LinearGradient>
          )}
          
          <LinearGradient
            colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.7)']}
            locations={[0, 0.3, 1]}
            style={styles.headerOverlayFull}
          />
          
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
            data-testid="button-back"
          >
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </TouchableOpacity>
          
          {!!discount && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>{discount}% OFF</Text>
            </View>
          )}

          <View style={styles.headerTitleOverlay}>
            <Text style={styles.headerTitle} numberOfLines={2}>{course.name}</Text>
            <View style={styles.headerStatsRow}>
              {!!course.rating && (
                <View style={styles.headerStatItem}>
                  <Ionicons name="star" size={13} color="#F59E0B" />
                  <Text style={styles.headerStatText}>{course.rating.toFixed(1)}</Text>
                </View>
              )}
              {!!course.student_count && (
                <View style={styles.headerStatItem}>
                  <Ionicons name="people" size={13} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.headerStatText}>{course.student_count.toLocaleString()}</Text>
                </View>
              )}
              {!!course.duration_months && (
                <View style={styles.headerStatItem}>
                  <Ionicons name="time" size={13} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.headerStatText}>{course.duration_months}mo</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.compactInfoRow}>
            <View style={styles.badgesRow}>
              {course.categories && course.categories.length > 0 && course.categories.map((cat, index) => (
                <View key={`cat-${index}`} style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>{cat.name}</Text>
                </View>
              ))}
              {course.subjects && course.subjects.length > 0 && course.subjects.slice(0, 3).map((subject, index) => (
                <View key={`sub-${index}`} style={styles.subjectBadge}>
                  <Text style={styles.subjectBadgeText}>{subject.name}</Text>
                </View>
              ))}
              {course.subjects && course.subjects.length > 3 && (
                <View style={styles.subjectBadge}>
                  <Text style={styles.subjectBadgeText}>+{course.subjects.length - 3}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.priceCard}>
            {isEnrolled ? (
              <TouchableOpacity onPress={handleStartLearning} data-testid="button-start-learning">
                <LinearGradient
                  colors={[colors.primary, '#4ADE80']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.startLearningButton}
                >
                  <Ionicons name="play-circle" size={20} color={colors.white} />
                  <Text style={styles.startLearningText}>Start Learning</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.white} />
                </LinearGradient>
              </TouchableOpacity>
            ) : course.is_coming_soon ? (
              <View style={styles.comingSoonRow}>
                <Ionicons name="time-outline" size={20} color={colors.primary} />
                <Text style={styles.comingSoonLabel}>Coming Soon</Text>
              </View>
            ) : (
              <View style={styles.compactPriceRow}>
                <View style={styles.priceLeft}>
                  <Text style={styles.price}>{formatPrice(course.price_inr)}</Text>
                  {!!course.original_price_inr && course.original_price_inr > (course.price_inr || 0) && (
                    <Text style={styles.originalPrice}>{formatPrice(course.original_price_inr)}</Text>
                  )}
                </View>
                <View style={styles.compactButtons}>
                  <TouchableOpacity 
                    onPress={handleAddToCart} 
                    style={[styles.compactCartButton, isInCart(course.id) && styles.addToCartButtonDisabled]}
                    data-testid="button-add-to-cart"
                  >
                    <Ionicons name={isInCart(course.id) ? "checkmark-circle" : "cart-outline"} size={20} color={isInCart(course.id) ? "#10B981" : colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleBuyNow} data-testid="button-buy-now">
                    <LinearGradient
                      colors={[colors.primary, '#4ADE80']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.compactBuyButton}
                    >
                      <Text style={styles.buyNowButtonText}>Buy Now</Text>
                      <Ionicons name="arrow-forward" size={16} color={colors.white} />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {freeChapterCount > 0 && (
            <View style={{ paddingHorizontal: 0 }}>
              <FreePreviewCard
                courseId={courseId}
                courseSlug={course.slug}
                chapterCount={freeChapterCount}
                onPress={handleFreePreview}
              />
            </View>
          )}

          {course.short_description && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconContainer}>
                  <Ionicons name="document-text" size={18} color={colors.primary} />
                </View>
                <Text style={styles.sectionTitle}>About This Course</Text>
              </View>
              <Text style={styles.description}>{course.short_description}</Text>
              {course.detailed_description && course.detailed_description !== course.short_description && (
                <Text style={styles.descriptionFull}>{course.detailed_description}</Text>
              )}
            </View>
          )}

          {course.what_you_learn && course.what_you_learn.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconContainer}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                </View>
                <Text style={styles.sectionTitle}>What You'll Learn</Text>
              </View>
              <View style={styles.featuresList}>
                {course.what_you_learn.map((item, index) => (
                  <View key={index} style={styles.featureItem}>
                    <View style={styles.featureCheck}>
                      <Ionicons name="checkmark" size={14} color={colors.white} />
                    </View>
                    <Text style={styles.featureText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {(() => {
            const includes = (course.course_includes ?? [])
              .map((item) =>
                typeof item === 'string' ? item : item?.text ?? item?.label ?? ''
              )
              .map((text) => (typeof text === 'string' ? text.trim() : ''))
              .filter((text) => text.length > 0);

            if (includes.length === 0) return null;

            return (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconContainer}>
                    <Ionicons name="gift" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.sectionTitle}>What's Included</Text>
                </View>
                <View style={styles.featuresList}>
                  {includes.map((text, index) => (
                    <View key={index} style={styles.featureItem}>
                      <View style={styles.featureCheck}>
                        <Ionicons name="checkmark" size={14} color={colors.white} />
                      </View>
                      <Text style={styles.featureText}>{text}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}

          {course.instructor_name && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconContainer}>
                  <Ionicons name="school" size={18} color={colors.primary} />
                </View>
                <Text style={styles.sectionTitle}>Instructor</Text>
              </View>
              <View style={styles.instructorsList}>
                <View style={styles.instructorCard}>
                  {course.instructor_avatar_url ? (
                    <Image 
                      source={{ uri: course.instructor_avatar_url }} 
                      style={styles.instructorAvatar}
                    />
                  ) : (
                    <View style={styles.instructorAvatarPlaceholder}>
                      <Text style={styles.instructorInitial}>
                        {course.instructor_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.instructorInfo}>
                    <Text style={styles.instructorName}>{course.instructor_name}</Text>
                    {course.instructor_bio && (
                      <Text style={styles.instructorSpec}>{course.instructor_bio}</Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
          )}

          {course.categories && course.categories.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconContainer}>
                  <Ionicons name="pricetags" size={18} color={colors.primary} />
                </View>
                <Text style={styles.sectionTitle}>Categories</Text>
              </View>
              <View style={styles.categoriesList}>
                {course.categories.map((cat, index) => (
                  <View key={index} style={styles.categoryChip}>
                    <Text style={styles.categoryText}>{cat.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {course.subjects && course.subjects.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconContainer}>
                  <Ionicons name="library" size={18} color={colors.primary} />
                </View>
                <Text style={styles.sectionTitle}>Subjects You'll Master</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectsScroll}>
                {course.subjects.map((subject, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.subjectCard}
                    activeOpacity={0.8}
                    onPress={() => handleSubjectPress(subject)}
                    data-testid={`subject-card-${subject.slug}`}
                  >
                    {subject.thumbnail_url ? (
                      <Image source={{ uri: subject.thumbnail_url }} style={styles.subjectThumbnail} />
                    ) : (
                      <View style={styles.subjectThumbnailPlaceholder}>
                        <Ionicons name="book" size={24} color={colors.primary} />
                      </View>
                    )}
                    <Text style={styles.subjectName} numberOfLines={2}>{subject.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconContainer}>
                <Ionicons name="star" size={18} color={colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Course Features</Text>
            </View>
            <View style={styles.featuresGrid}>
              <View style={styles.featureCard}>
                <View style={styles.featureIconContainer}>
                  <Ionicons name="videocam" size={24} color={colors.primary} />
                </View>
                <Text style={styles.featureCardTitle}>Video Lectures</Text>
                <Text style={styles.featureCardDesc}>HD quality lessons</Text>
              </View>
              <View style={styles.featureCard}>
                <View style={styles.featureIconContainer}>
                  <Ionicons name="clipboard" size={24} color={colors.primary} />
                </View>
                <Text style={styles.featureCardTitle}>Practice Tests</Text>
                <Text style={styles.featureCardDesc}>Regular mock exams</Text>
              </View>
              <View style={styles.featureCard}>
                <View style={styles.featureIconContainer}>
                  <Ionicons name="document-text" size={24} color={colors.primary} />
                </View>
                <Text style={styles.featureCardTitle}>Study Material</Text>
                <Text style={styles.featureCardDesc}>Comprehensive notes</Text>
              </View>
              <View style={styles.featureCard}>
                <View style={styles.featureIconContainer}>
                  <Ionicons name="chatbubbles" size={24} color={colors.primary} />
                </View>
                <Text style={styles.featureCardTitle}>Doubt Support</Text>
                <Text style={styles.featureCardDesc}>Expert assistance</Text>
              </View>
              <View style={styles.featureCard}>
                <View style={styles.featureIconContainer}>
                  <Ionicons name="analytics" size={24} color={colors.primary} />
                </View>
                <Text style={styles.featureCardTitle}>Progress Tracking</Text>
                <Text style={styles.featureCardDesc}>Performance insights</Text>
              </View>
              <View style={styles.featureCard}>
                <View style={styles.featureIconContainer}>
                  <Ionicons name="trophy" size={24} color={colors.primary} />
                </View>
                <Text style={styles.featureCardTitle}>Certification</Text>
                <Text style={styles.featureCardDesc}>Course completion</Text>
              </View>
            </View>
          </View>

          {course.faqs && course.faqs.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconContainer}>
                  <Ionicons name="help-circle" size={18} color={colors.primary} />
                </View>
                <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
              </View>
              <View style={styles.faqList}>
                {course.faqs.map((faq) => (
                  <TouchableOpacity
                    key={faq.id}
                    style={styles.faqItem}
                    onPress={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                    activeOpacity={0.7}
                    data-testid={`faq-${faq.id}`}
                  >
                    <View style={styles.faqQuestion}>
                      <Text style={styles.faqQuestionText}>{faq.question}</Text>
                      <Ionicons 
                        name={expandedFaq === faq.id ? 'chevron-up' : 'chevron-down'} 
                        size={20} 
                        color={colors.primary} 
                      />
                    </View>
                    {expandedFaq === faq.id && (
                      <Text style={styles.faqAnswer}>{faq.answer}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>

      <View style={styles.floatingFooter}>
        {isEnrolled ? (
          <TouchableOpacity onPress={handleStartLearning} style={{ flex: 1 }} data-testid="button-start-learning-footer">
            <LinearGradient
              colors={[colors.primary, '#4ADE80']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.footerStartLearningGradient}
            >
              <Ionicons name="play-circle" size={22} color={colors.white} />
              <Text style={styles.footerBuyText}>Start Learning</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.white} />
            </LinearGradient>
          </TouchableOpacity>
        ) : course.is_coming_soon ? (
          <View style={styles.footerComingSoon}>
            <Ionicons name="time-outline" size={22} color={colors.primary} />
            <Text style={styles.footerComingSoonText}>Coming Soon</Text>
          </View>
        ) : (
          <>
            <View style={styles.footerPrice}>
              <Text style={styles.footerPriceLabel}>Total</Text>
              <Text style={styles.footerPriceValue}>{formatPrice(course.price_inr)}</Text>
            </View>
            <View style={styles.footerButtons}>
              <TouchableOpacity 
                onPress={handleAddToCart} 
                style={styles.footerAddToCartButton}
                data-testid="button-add-to-cart-footer"
              >
                <Ionicons name={isInCart(course.id) ? "checkmark-circle" : "cart-outline"} size={20} color={isInCart(course.id) ? "#10B981" : colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleBuyNow} style={styles.footerBuyButton} data-testid="button-buy-now-footer">
                <LinearGradient
                  colors={[colors.primary, '#4ADE80']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.footerBuyGradient}
                >
                  <Text style={styles.footerBuyText}>Buy Now</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: spacing.xl,
  },
  errorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: fontSize.md,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  retryButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
  backLink: {
    marginTop: spacing.md,
  },
  backLinkText: {
    color: colors.primary,
    fontWeight: '600',
  },
  headerImageContainer: {
    height: 180,
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerOverlayFull: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backButton: {
    position: 'absolute',
    top: 48,
    left: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountBadge: {
    position: 'absolute',
    top: 48,
    right: spacing.sm,
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
  },
  discountText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  headerTitleOverlay: {
    position: 'absolute',
    bottom: 12,
    left: spacing.md,
    right: spacing.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  headerStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  headerStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  headerStatText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  content: {
    paddingHorizontal: spacing.md,
    backgroundColor: '#FFFFFF',
    paddingTop: spacing.sm,
  },
  compactInfoRow: {
    marginBottom: spacing.sm,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  heroBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
  },
  subjectBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  subjectBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.primary,
  },
  priceCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  comingSoonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E8F8F0',
    borderRadius: borderRadius.md,
    paddingVertical: 14,
  },
  comingSoonLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
  footerComingSoon: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E8F8F0',
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
  },
  footerComingSoonText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
  },
  compactPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactCartButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
  },
  compactBuyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  priceLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  priceValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  price: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.primary,
  },
  originalPrice: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  enrollButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  enrollButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  addToCartButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  addToCartButtonDisabled: {
    borderColor: '#10B981',
    backgroundColor: '#FFFFFF',
  },
  addToCartButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },
  addToCartButtonTextSuccess: {
    color: '#10B981',
  },
  buyNowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  startLearningButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: borderRadius.lg,
  },
  startLearningText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  buyNowButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  description: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  descriptionFull: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
    marginTop: spacing.sm,
  },
  featuresList: {
    gap: spacing.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  featureText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 22,
  },
  subjectsList: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.15)',
  },
  subjectText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
  },
  instructorsList: {
    gap: spacing.sm,
  },
  instructorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  instructorAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  instructorAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructorInitial: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
  },
  instructorInfo: {
    flex: 1,
  },
  instructorName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  instructorSpec: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  categoriesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryChip: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  categoryText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  subjectsScroll: {
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
  },
  subjectCard: {
    width: 120,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    marginRight: spacing.md,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  subjectThumbnail: {
    width: '100%',
    height: 80,
    backgroundColor: '#DCFCE7',
  },
  subjectThumbnailPlaceholder: {
    width: '100%',
    height: 80,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    padding: spacing.sm,
    textAlign: 'center',
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  featureCard: {
    width: '48%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  featureIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  featureCardTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  featureCardDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  faqList: {
    gap: spacing.sm,
  },
  faqItem: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  faqQuestion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  faqQuestionText: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  faqAnswer: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  bottomSpacer: {
    height: 100,
  },
  floatingFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  footerPrice: {
    flex: 1,
  },
  footerPriceLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  footerPriceValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.primary,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    flex: 1,
  },
  footerAddToCartButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBuyButton: {
    flex: 1,
  },
  footerBuyGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  footerStartLearningGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    gap: 8,
  },
  footerBuyText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
});
