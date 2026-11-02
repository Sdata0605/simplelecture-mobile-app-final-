import { View, Text, StyleSheet } from 'react-native';
import type { ReminderChoice } from '../../../types/reminder';
import { colors, spacing, fontSize, fontFamily } from '../../../constants/theme';
import ReminderChannelPicker from '../ReminderChannelPicker';
import { PermissionBanner } from '../../reminders/PermissionBanner';

// Plan wizard step: "How should we remind you?" Compulsory: nothing is selected until the student picks
// one option (Next stays disabled until then, see validateStep 'reminder').

interface StepReminderProps {
  value: ReminderChoice | null;
  onChange: (value: ReminderChoice) => void;
  hasEmail: boolean;
  permission: 'granted' | 'denied' | 'undetermined';
  exactAlarmOk: boolean;
  onOpenSettings: () => void;
}

export function StepReminder({
  value,
  onChange,
  hasEmail,
  permission,
  exactAlarmOk,
  onOpenSettings,
}: StepReminderProps) {
  const isSound = value === 'call' || value === 'message' || value === 'notification';
  // Both gates are false until a choice exists, so no banner shows on the untouched step.
  const showNotifBanner = isSound && permission === 'denied';
  const showExactBanner = value === 'call' && !exactAlarmOk;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">How should we remind you?</Text>
      <Text style={styles.subtitle}>Before each study session</Text>

      <ReminderChannelPicker
        layout="list"
        allowNone
        value={value}
        onChange={v => {
          if (v) onChange(v);
        }}
        recommended="notification"
        emailDisabledReason={hasEmail ? undefined : 'Add an email in Profile to use this'}
      />

      {showNotifBanner ? (
        <PermissionBanner variant="notifications-off" onAction={onOpenSettings} />
      ) : null}
      {showExactBanner ? (
        <PermissionBanner variant="exact-alarm" onAction={onOpenSettings} />
      ) : null}

      <Text style={styles.helper}>You can change this any time in Reminder settings.</Text>
    </View>
  );
}

export default StepReminder;

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.xxl,
    fontFamily: fontFamily.heading,
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
  },
  helper: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
