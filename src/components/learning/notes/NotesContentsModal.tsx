/**
 * Contents modal for the Notes book reader.
 * Shows section titles with their first-page number.
 * Tapping a section jumps to that page and closes the modal.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../../constants/theme';

interface Props {
  visible: boolean;
  sectionTitles: string[];
  sectionFirstPageIndexes: number[];
  currentPageIndex: number;
  totalPages: number;
  onJump: (pageIndex: number) => void;
  onClose: () => void;
}

export function NotesContentsModal({
  visible,
  sectionTitles,
  sectionFirstPageIndexes,
  currentPageIndex,
  totalPages,
  onJump,
  onClose,
}: Props) {
  function handleJump(pageIndex: number) {
    onJump(pageIndex);
    onClose();
  }

  function isCurrent(sectionIdx: number): boolean {
    const first = sectionFirstPageIndexes[sectionIdx];
    const next = sectionFirstPageIndexes[sectionIdx + 1] ?? totalPages;
    return currentPageIndex >= first && currentPageIndex < next;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={s.overlay}>
        <SafeAreaView style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.headerTitle}>Contents</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close contents"
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Section list */}
          <FlatList
            data={sectionTitles}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={s.list}
            renderItem={({ item, index }) => {
              const pageIdx = sectionFirstPageIndexes[index];
              const active = isCurrent(index);
              return (
                <TouchableOpacity
                  style={[s.item, active && s.itemActive]}
                  onPress={() => handleJump(pageIdx)}
                  accessibilityLabel={`Go to ${item}, page ${pageIdx + 1}`}
                  activeOpacity={0.7}
                >
                  <View style={s.itemLeft}>
                    {active && (
                      <View style={s.activeDot} />
                    )}
                    <Text
                      style={[s.itemTitle, active && s.itemTitleActive]}
                      numberOfLines={2}
                    >
                      {item}
                    </Text>
                  </View>
                  <Text style={[s.itemPage, active && s.itemPageActive]}>
                    p.{pageIdx + 1}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemActive: {
    backgroundColor: colors.primary + '10',
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
  },
  itemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: spacing.sm,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    flexShrink: 0,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  itemTitleActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  itemPage: {
    fontSize: 12,
    color: colors.textMuted,
    flexShrink: 0,
  },
  itemPageActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});
