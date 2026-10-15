import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontFamily } from '../constants/theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAutoChapterTests, deriveStatus } from '../hooks/useMyTests';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** Persistent CTA shown when a chapter has been completed and an auto-generated
 *  self-test is waiting to be taken. Hidden when there are none. */
export default function AutoChapterTestBanner() {
  const navigation = useNavigation<NavigationProp>();
  const { data, refetch } = useAutoChapterTests();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  if (data.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {data.map((t) => {
        const test = t.self_tests;
        if (!test) return null;
        const live = deriveStatus(test as any) === 'live';
        const title = t.chapter_title || test.title;
        return (
          <TouchableOpacity
            key={t.id}
            style={styles.banner}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('MyTestTake', { testId: t.self_test_id })}
            testID={`banner-auto-chapter-test-${t.id}`}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="ribbon-outline" size={20} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1} testID={`text-auto-test-title-${t.id}`}>
                Chapter Test Ready
              </Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                {title} · {test.total_questions} Qs · {test.duration_minutes} min
              </Text>
            </View>
            <View style={styles.cta}>
              <Text style={styles.ctaText}>{live ? 'Start' : 'View'}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: fontSize.md, color: colors.white, fontFamily: fontFamily.semiBold },
  subtitle: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.9)', fontFamily: fontFamily.regular, marginTop: 2 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.white,
    borderRadius: borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ctaText: { fontSize: fontSize.sm, color: colors.primary, fontFamily: fontFamily.semiBold },
});
