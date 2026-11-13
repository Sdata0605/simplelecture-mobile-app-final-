import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, fontSize, borderRadius } from '../../constants/theme';
import type { AnswerStatus, IconName } from '../../utils/resultHelpers';

interface StatusChipProps {
  status: AnswerStatus;
}

const STATUS_META: Record<AnswerStatus, { label: string; icon: IconName; fg: string; bg: string }> = {
  correct: { label: 'Correct', icon: 'checkmark-circle', fg: colors.success, bg: colors.successBg },
  wrong: { label: 'Wrong', icon: 'close-circle', fg: colors.error, bg: colors.errorBg },
  unanswered: { label: 'Not answered', icon: 'remove-circle-outline', fg: colors.gray500, bg: colors.gray100 },
  recorded: { label: 'Answer recorded', icon: 'create-outline', fg: colors.info, bg: colors.infoBg },
};

export default function StatusChip({ status }: StatusChipProps) {
  const meta = STATUS_META[status];
  return (
    <View style={[styles.chip, { backgroundColor: meta.bg }]} accessibilityLabel={meta.label}>
      <Ionicons name={meta.icon} size={14} color={meta.fg} />
      <Text style={[styles.text, { color: meta.fg }]}>{meta.label}</Text>
    </View>
  );
}

export function getStatusColor(status: AnswerStatus): string {
  return STATUS_META[status].fg;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  text: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
  },
});
