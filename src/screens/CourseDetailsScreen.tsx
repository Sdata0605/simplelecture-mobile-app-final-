import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';

const COURSE_DETAILS = {
  id: 1,
  title: 'Complete 10th Grade Science Bundle',
  subtitle: 'Master Physics, Chemistry, and Biology for Board Exams with top educators.',
  subjects: ['Physics', 'Chemistry', 'Biology'],
  rating: 4.9,
  reviewCount: 1240,
  duration: '120 Hours',
  originalPrice: 49.99,
  discountedPrice: 29.99,
  instructor: {
    name: 'Sarah Jenkins',
    role: 'Senior Science Faculty',
  },
  about: 'This comprehensive course is designed to help 10th-grade students master the entire Science syllabus. Whether you are preparing for CBSE, ICSE, or State Boards, this program covers every concept in depth with real-world examples, experiments, and problem-solving sessions.',
  included: [
    { icon: 'play-circle-outline', label: '250+ Hours of Live & Recorded Classes' },
    { icon: 'document-text-outline', label: 'Downloadable PDF Notes & Mind Maps' },
    { icon: 'help-circle-outline', label: '24/7 Doubt Solving Support' },
    { icon: 'book-outline', label: '10 Full-length Mock Tests' },
  ],
  whatYouLearn: [
    'Understand fundamental concepts of Physics, Chemistry, and Biology.',
    'Solve complex numerical problems with easy techniques.',
    'Perform virtual lab experiments to grasp practical applications.',
    'Master time management strategies for board exams.',
  ],
  subjectsMaster: [
    { name: 'Physics: Motion & Laws', desc: 'Master Newton\'s laws, force, and motion with practical examples.' },
    { name: 'Chemistry: Reactions', desc: 'Understand chemical equations, balancing, and types of reactions.' },
    { name: 'Biology: Life Processes', desc: 'Explore nutrition, respiration, and transport in living organisms.' },
    { name: 'Physics: Light & Optics', desc: 'Learn about reflection, refraction, lenses, and mirrors.' },
  ],
  features: [
    { icon: 'people-outline', title: 'Expert Faculty', desc: 'Learn from teachers with 10+ years of experience.' },
    { icon: 'bar-chart-outline', title: 'Performance Analysis', desc: 'Get detailed insights into your strengths and weaknesses.' },
    { icon: 'ribbon-outline', title: 'Certification', desc: 'Earn a certificate of completion upon finishing the course.' },
  ],
};

export default function CourseDetailsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i <= Math.floor(rating) ? 'star' : 'star-outline'}
          size={14}
          color={colors.yellow[400]}
        />
      );
    }
    return stars;
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <ImageBackground
          source={{ uri: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=800' }}
          style={styles.banner}
        >
          <View style={styles.bannerOverlay}>
            <View style={styles.bannerHeader}>
              <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                <Ionicons name="chevron-back" size={24} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.backButton}>
                <Ionicons name="checkmark-circle-outline" size={22} color={colors.white} />
              </TouchableOpacity>
            </View>

            <View style={styles.bannerContent}>
              <View style={styles.subjectTags}>
                {COURSE_DETAILS.subjects.map((subject) => (
                  <View key={subject} style={styles.subjectTag}>
                    <Text style={styles.subjectTagText}>{subject}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.courseTitle}>{COURSE_DETAILS.title}</Text>
              <Text style={styles.courseSubtitle}>{COURSE_DETAILS.subtitle}</Text>

              <View style={styles.ratingRow}>
                <Text style={styles.ratingText}>{COURSE_DETAILS.rating}</Text>
                <View style={styles.starsContainer}>{renderStars(COURSE_DETAILS.rating)}</View>
                <Text style={styles.reviewCount}>({COURSE_DETAILS.reviewCount} reviews)</Text>
                <View style={styles.durationContainer}>
                  <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.durationText}>{COURSE_DETAILS.duration}</Text>
                </View>
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.discountedPrice}>${COURSE_DETAILS.discountedPrice}</Text>
                <Text style={styles.originalPrice}>${COURSE_DETAILS.originalPrice}</Text>
                <View style={styles.discountBadge}>
                  <Text style={styles.discountBadgeText}>40% OFF</Text>
                </View>
              </View>
            </View>
          </View>
        </ImageBackground>

        <View style={styles.mainContent}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About this program</Text>
            <Text style={styles.aboutText}>{COURSE_DETAILS.about}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>This course includes</Text>
            {COURSE_DETAILS.included.map((item, idx) => (
              <View key={idx} style={styles.includeItem}>
                <View style={styles.includeIcon}>
                  <Ionicons name={item.icon as any} size={18} color={colors.primary} />
                </View>
                <Text style={styles.includeLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What you'll learn</Text>
            <View style={styles.learnCard}>
              {COURSE_DETAILS.whatYouLearn.map((point, idx) => (
                <View key={idx} style={styles.learnItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                  <Text style={styles.learnText}>{point}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Subjects you'll master</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.subjectsScroll}
            >
              {COURSE_DETAILS.subjectsMaster.map((subject, idx) => (
                <View key={idx} style={styles.subjectCard}>
                  <View style={styles.subjectImagePlaceholder}>
                    <Ionicons name="flask-outline" size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.subjectName}>{subject.name}</Text>
                  <Text style={styles.subjectDesc} numberOfLines={2}>{subject.desc}</Text>
                  <TouchableOpacity
                    style={styles.exploreButton}
                    onPress={() => navigation.navigate('Curriculum')}
                  >
                    <Text style={styles.exploreButtonText}>Explore Curriculum</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Course Features</Text>
            {COURSE_DETAILS.features.map((feature, idx) => (
              <View key={idx} style={styles.featureCard}>
                <View style={styles.featureIcon}>
                  <Ionicons name={feature.icon as any} size={24} color={colors.primary} />
                </View>
                <View style={styles.featureContent}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureDesc}>{feature.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity 
          style={styles.enrollButton}
          onPress={() => navigation.navigate('Curriculum', {})}
        >
          <LinearGradient
            colors={[colors.primary, '#4ADE80']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.enrollButtonGradient}
          >
            <Ionicons name="rocket-outline" size={20} color={colors.white} />
            <Text style={styles.enrollButtonText}>Enroll Now</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray50,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  banner: {
    height: 400,
  },
  bannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'space-between',
  },
  bannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingTop: 50,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  subjectTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.sm,
  },
  subjectTag: {
    backgroundColor: 'rgba(43, 189, 110, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  subjectTagText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  courseTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: spacing.xs,
  },
  courseSubtitle: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: spacing.md,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.md,
  },
  ratingText: {
    color: colors.white,
    fontWeight: 'bold',
    fontSize: fontSize.sm,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewCount: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: fontSize.xs,
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  durationText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  discountedPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.white,
  },
  originalPrice: {
    fontSize: fontSize.lg,
    color: 'rgba(255,255,255,0.6)',
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  discountBadge: {
    borderWidth: 1,
    borderColor: '#4ADE80',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginBottom: 2,
  },
  discountBadgeText: {
    color: '#4ADE80',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  mainContent: {
    backgroundColor: colors.gray50,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -24,
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: spacing.md,
  },
  aboutText: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    lineHeight: 22,
  },
  includeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: spacing.sm,
  },
  includeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  includeLabel: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    flex: 1,
  },
  learnCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: 12,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.06)',
  },
  learnItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  learnText: {
    fontSize: fontSize.sm,
    color: colors.gray500,
    flex: 1,
    lineHeight: 20,
  },
  subjectsScroll: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  subjectCard: {
    width: 200,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.06)',
  },
  subjectImagePlaceholder: {
    height: 100,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  subjectName: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 4,
  },
  subjectDesc: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  exploreButton: {
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.2)',
    borderRadius: borderRadius.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  exploreButtonText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.sm,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(43, 189, 110, 0.06)',
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(43, 189, 110, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: fontSize.base,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    lineHeight: 18,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    padding: spacing.lg,
    paddingBottom: 32,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 15,
  },
  enrollButton: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  enrollButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: borderRadius.lg,
  },
  enrollButtonText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
});
