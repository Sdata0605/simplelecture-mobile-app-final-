import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export const Skeleton: React.FC<SkeletonProps> = ({ 
  width = '100%', 
  height = 20, 
  borderRadius = 8,
  style 
}) => {
  const shimmerAnim = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    );
    shimmer.start();
    return () => shimmer.stop();
  }, []);

  const translateX = shimmerAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
  });

  return (
    <View 
      style={[
        { 
          width: typeof width === 'number' ? width : undefined,
          height, 
          borderRadius,
          backgroundColor: '#E5E7EB',
          overflow: 'hidden',
        },
        typeof width === 'string' && { width: width as any },
        style
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX }] }
        ]}
      >
        <LinearGradient
          colors={['#E5E7EB', '#F3F4F6', '#E5E7EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
};

export const CourseCardSkeleton: React.FC<{ variant?: 'featured' | 'compact' | 'horizontal' }> = ({ 
  variant = 'compact' 
}) => {
  if (variant === 'featured') {
    return (
      <View style={styles.featuredCard}>
        <Skeleton height={180} borderRadius={0} style={styles.featuredImage} />
        <View style={styles.featuredContent}>
          <Skeleton width={240} height={20} style={styles.marginBottom8} />
          <Skeleton width={180} height={16} style={styles.marginBottom8} />
          <View style={styles.row}>
            <Skeleton width={24} height={24} borderRadius={12} />
            <Skeleton width={100} height={14} style={styles.marginLeft8} />
          </View>
          <View style={[styles.row, { marginTop: 12 }]}>
            <Skeleton width={120} height={40} borderRadius={8} />
          </View>
        </View>
      </View>
    );
  }

  if (variant === 'horizontal') {
    return (
      <View style={styles.horizontalCard}>
        <Skeleton width={100} height={80} borderRadius={12} />
        <View style={styles.horizontalContent}>
          <Skeleton width={150} height={16} style={styles.marginBottom6} />
          <Skeleton width={100} height={14} style={styles.marginBottom6} />
          <View style={styles.row}>
            <Skeleton width={60} height={14} />
            <Skeleton width={40} height={14} style={styles.marginLeft8} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.compactCard}>
      <Skeleton height={120} borderRadius={0} style={styles.compactImage} />
      <View style={styles.compactContent}>
        <Skeleton width={140} height={14} style={styles.marginBottom6} />
        <Skeleton width={100} height={12} style={styles.marginBottom6} />
        <View style={styles.row}>
          <Skeleton width={50} height={12} />
          <Skeleton width={40} height={12} style={styles.marginLeft8} />
        </View>
      </View>
    </View>
  );
};

export const CourseListSkeleton: React.FC<{ 
  count?: number; 
  variant?: 'featured' | 'compact' | 'horizontal';
  horizontal?: boolean;
}> = ({ count = 3, variant = 'compact', horizontal = false }) => {
  return (
    <View style={horizontal ? styles.horizontalList : styles.verticalList}>
      {Array.from({ length: count }).map((_, index) => (
        <CourseCardSkeleton key={index} variant={variant} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  featuredCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  featuredImage: {
    width: '100%',
  },
  featuredContent: {
    padding: 16,
  },
  compactCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    width: 180,
    marginRight: 12,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  compactImage: {
    width: '100%',
  },
  compactContent: {
    padding: 12,
  },
  horizontalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    marginBottom: 12,
    shadowColor: '#2BBD6E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  horizontalContent: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  horizontalList: {
    flexDirection: 'row',
    paddingHorizontal: 4,
  },
  verticalList: {
    flexDirection: 'column',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  marginBottom6: {
    marginBottom: 6,
  },
  marginBottom8: {
    marginBottom: 8,
  },
  marginLeft8: {
    marginLeft: 8,
  },
});

export default { Skeleton, CourseCardSkeleton, CourseListSkeleton };
