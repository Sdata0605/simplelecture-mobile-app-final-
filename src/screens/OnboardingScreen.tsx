import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');

const studentsImage = require('../../assets/two_students_learning.png');
const graduateImage = require('../../assets/student_graduate_waving.png');

const slides = [
  {
    id: '1',
    title: 'Start learning now!',
    description: 'Interested in to learn from the best teachers around the world?',
    image: studentsImage,
  },
  {
    id: '2',
    title: 'Start learning now',
    description: 'Start learning from the best instructors in different topics.',
    image: graduateImage,
  },
];

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const navigation = useNavigation<NavigationProp>();
  const flatListRef = useRef<FlatList>(null);
  const { markOnboardingSeen } = useAuth();

  const navigateToLogin = async () => {
    await markOnboardingSeen();
    navigation.navigate('Login');
  };

  const navigateToSignup = async () => {
    await markOnboardingSeen();
    navigation.navigate('Signup');
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      navigateToLogin();
    }
  };

  const handleSkip = () => {
    navigateToLogin();
  };

  const renderSlide = ({ item }: { item: typeof slides[0] }) => (
    <View style={styles.slide}>
      <View style={styles.imageContainer}>
        <View style={styles.imageCircle}>
          <Image source={item.image} style={styles.slideImage} resizeMode="contain" />
        </View>
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
      </View>
    </View>
  );

  const isLastSlide = currentIndex === slides.length - 1;

  return (
    <View style={styles.container}>
      {/* Decorative Background Circles */}
      <View style={styles.decorativeCircle1} />
      <View style={styles.decorativeCircle2} />

      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
        keyExtractor={(item) => item.id}
      />

      <View style={styles.footer}>
        {isLastSlide ? (
          <View style={styles.authButtons}>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={navigateToLogin}
            >
              <Text style={styles.loginButtonText}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.signupButton}
              onPress={navigateToSignup}
            >
              <Text style={styles.signupButtonText}>Sign up</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSkip} style={styles.skipLoginButton}>
              <Text style={styles.skipLoginText}>Skip login</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.navigation}>
            <TouchableOpacity onPress={handleSkip} style={styles.navButton}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>

            <View style={styles.dots}>
              {slides.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    currentIndex === index && styles.activeDot,
                  ]}
                />
              ))}
            </View>

            <TouchableOpacity onPress={handleNext} style={styles.navButton}>
              <Text style={styles.nextText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    position: 'relative',
    overflow: 'hidden',
  },
  decorativeCircle1: {
    position: 'absolute',
    top: -height * 0.1,
    left: -width * 0.2,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: `${colors.primary}15`,
  },
  decorativeCircle2: {
    position: 'absolute',
    bottom: height * 0.2,
    right: -width * 0.1,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: `${colors.primary}08`,
  },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  imageContainer: {
    width: width * 0.75,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  imageCircle: {
    width: '85%',
    aspectRatio: 1,
    borderRadius: 1000,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    alignItems: 'center',
    maxWidth: 280,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  authButtons: {
    alignItems: 'center',
    gap: spacing.md,
  },
  loginButton: {
    width: '100%',
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  loginButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  signupButton: {
    width: '100%',
    height: 52,
    backgroundColor: 'transparent',
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: `${colors.primary}30`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  skipLoginButton: {
    paddingVertical: spacing.sm,
  },
  skipLoginText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  navButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  skipText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  nextText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: `${colors.primary}30`,
  },
  activeDot: {
    backgroundColor: colors.primary,
  },
});
