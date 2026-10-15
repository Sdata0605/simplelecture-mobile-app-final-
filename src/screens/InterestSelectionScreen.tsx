import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase, Category } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontFamily } from '../constants/theme';

export default function InterestSelectionScreen({ navigation }: any) {
  const { markInterestsSelected } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    const result = await supabase.getCategories();
    if (result.success && result.categories) {
      const level1 = result.categories.filter((c) => c.level === 1);
      setCategories(level1);
    }
    setLoading(false);
  };

  const toggleCategory = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleContinue = async () => {
    setSaving(true);
    await AsyncStorage.setItem('@user_interests', JSON.stringify(selectedIds));
    setSaving(false);
    navigation.navigate('SubcategorySelection', { selectedCategoryIds: selectedIds });
  };

  const getCategoryIcon = (icon: string | null, name: string) => {
    if (icon && icon.length <= 2) return icon;
    const iconMap: Record<string, string> = {
      'Board Exams': '📚',
      'Medical Entrance': '🩺',
      'Engineering Entrance': '⚙️',
      'Pharmacy Courses': '💊',
      'Integrated Programs': '🎯',
      'Research': '🔬',
      'Business Studies': '💼',
      'Accounts': '📊',
      'Data Science': '📈',
      'Architecture': '🏛️',
      'Economics': '💰',
    };
    return iconMap[name] || '📖';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title} data-testid="text-interest-title">What are you interested in?</Text>
          <Text style={styles.subtitle} data-testid="text-interest-subtitle">
            Select topics to personalize your learning experience
          </Text>
        </View>

        <View style={styles.grid}>
          {categories.map((category) => {
            const isSelected = selectedIds.includes(category.id);
            return (
              <TouchableOpacity
                key={category.id}
                style={[styles.categoryCard, isSelected && styles.categoryCardSelected]}
                onPress={() => toggleCategory(category.id)}
                activeOpacity={0.7}
                data-testid={`button-category-${category.id}`}
              >
                <Text style={styles.categoryIcon}>
                  {getCategoryIcon(category.icon, category.name)}
                </Text>
                <Text style={[styles.categoryName, isSelected && styles.categoryNameSelected]}>
                  {category.name}
                </Text>
                {isSelected && (
                  <View style={styles.checkmark}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Text style={styles.selectedCount} data-testid="text-selected-count">
          {selectedIds.length} selected
        </Text>
        <TouchableOpacity
          style={[styles.continueButton, selectedIds.length === 0 && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={selectedIds.length === 0 || saving}
          data-testid="button-continue-interests"
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.continueText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  header: {
    marginBottom: spacing.xl,
    marginTop: spacing.md,
  },
  title: {
    fontSize: 28,
    fontFamily: fontFamily.heading,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  categoryCard: {
    width: '47%',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    position: 'relative',
  },
  categoryCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#F0FDF4',
  },
  categoryIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  categoryName: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    textAlign: 'center',
  },
  categoryNameSelected: {
    color: colors.primary,
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedCount: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  continueButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    minWidth: 140,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.4,
  },
  continueText: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.bold,
    color: colors.white,
  },
});
