import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ReelsTab from '../components/ReelsTab';
import ReelsFilterModal, {
  ReelsFilterSelection,
} from '../components/ReelsFilterModal';
import { useAuth } from '../context/AuthContext';

export default function ReelsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [filterVisible, setFilterVisible] = useState(false);
  const [filter, setFilter] = useState<ReelsFilterSelection | null>(null);

  return (
    <View
      style={[styles.container, { paddingTop: insets.top }]}
      data-testid="screen-reels"
    >
      <ReelsTab
        all
        filterChapterIds={filter ? filter.chapterIds : null}
        filterTopicIds={filter ? filter.topicIds : null}
      />

      <TouchableOpacity
        style={[styles.filterButton, { top: insets.top + 12 }]}
        onPress={() => setFilterVisible(true)}
        data-testid="button-open-filter"
        activeOpacity={0.8}
      >
        <Ionicons name="options-outline" size={20} color="#FFFFFF" />
        {filter ? <View style={styles.filterDot} /> : null}
      </TouchableOpacity>

      <ReelsFilterModal
        visible={filterVisible}
        userId={user?.id ?? null}
        onClose={() => setFilterVisible(false)}
        onApply={(selection) => setFilter(selection)}
        onClear={() => setFilter(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  filterButton: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  filterDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#2BBD6E',
    borderWidth: 1.5,
    borderColor: '#000000',
  },
});
