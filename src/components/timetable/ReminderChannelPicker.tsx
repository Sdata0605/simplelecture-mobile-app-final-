import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReminderChannel, ReminderChoice } from '../../types/reminder';
import { colors, spacing, fontSize, fontFamily } from '../../constants/theme';
import { KIND_STYLE, EMAIL_STYLE, TINT } from '../reminders/palette';

// How a study session should remind the student.
// layout 'grid' (default): 2 x 2 tiles, used by DayDetailModal. "No reminder" writes null (legacy), as before.
// layout 'list': full-width cards for the plan wizard and reminder settings. "No reminders" writes 'none'.

const CHANNELS: ReadonlyArray<{
  value: ReminderChannel;
  label: string;
  sub: string;
  listSub: string;
  icon: string;
  fg: string;
  bg: string;
}> = [
  {
    value: 'call',
    label: KIND_STYLE.call.label,
    sub: 'Rings + AI voice',
    listSub: 'The phone rings and your AI teacher speaks',
    icon: KIND_STYLE.call.icon,
    fg: KIND_STYLE.call.fg,
    bg: KIND_STYLE.call.bg,
  },
  {
    value: 'message',
    label: KIND_STYLE.message.label,
    sub: 'Message notification',
    listSub: 'A chat-style message on this phone',
    icon: KIND_STYLE.message.icon,
    fg: KIND_STYLE.message.fg,
    bg: KIND_STYLE.message.bg,
  },
  {
    value: 'notification',
    label: KIND_STYLE.notification.label,
    sub: 'Quiet alert',
    listSub: 'A quiet alert at the top of your screen',
    icon: KIND_STYLE.notification.icon,
    fg: KIND_STYLE.notification.fg,
    bg: KIND_STYLE.notification.bg,
  },
  {
    value: 'email',
    label: EMAIL_STYLE.label,
    sub: 'Sent to your inbox',
    listSub: 'In your inbox, even if your phone is off',
    icon: EMAIL_STYLE.icon,
    fg: EMAIL_STYLE.fg,
    bg: EMAIL_STYLE.bg,
  },
];

interface ReminderChannelPickerProps {
  value: ReminderChoice | null;
  onChange: (choice: ReminderChoice | null) => void;
  disabled?: boolean;
  layout?: 'grid' | 'list';
  /** Show the "No reminder(s)" option. Default true. */
  allowNone?: boolean;
  noneLabel?: string;
  /** When set, the Email card is disabled and this line explains why. */
  emailDisabledReason?: string;
  /** Shows a small "Recommended" pill on this channel (list layout). */
  recommended?: ReminderChoice;
}

export default function ReminderChannelPicker({
  value,
  onChange,
  disabled,
  layout = 'grid',
  allowNone = true,
  noneLabel,
  emailDisabledReason,
  recommended,
}: ReminderChannelPickerProps) {
  const isList = layout === 'list';
  // Grid callers keep the legacy null; list callers write the explicit 'none'.
  const noneValue: ReminderChoice | null = isList ? 'none' : null;
  const noneText = noneLabel ?? (isList ? 'No reminders' : 'No reminder');
  const noneSelected = allowNone && value === noneValue;

  return (
    <View>
      <View style={isList ? styles.list : styles.grid} accessibilityRole="radiogroup">
        {CHANNELS.map(c => {
          const selected = c.value === value;
          const isEmail = c.value === 'email';
          const tileDisabled = !!disabled || (isEmail && !!emailDisabledReason);
          const sub = isEmail && emailDisabledReason ? emailDisabledReason : isList ? c.listSub : c.sub;
          const a11yLabel = `${c.label}. ${sub}${recommended === c.value ? '. Recommended' : ''}`;

          if (isList) {
            return (
              <TouchableOpacity
                key={c.value}
                style={[
                  styles.card,
                  selected && { borderColor: c.fg, backgroundColor: c.bg },
                  tileDisabled && styles.disabled,
                ]}
                onPress={() => onChange(c.value)}
                disabled={tileDisabled}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: tileDisabled }}
                accessibilityLabel={a11yLabel}
              >
                <View style={[styles.iconCircle, { backgroundColor: c.bg }]}>
                  <Ionicons name={c.icon as keyof typeof Ionicons.glyphMap} size={22} color={c.fg} />
                </View>
                <View style={styles.cardText}>
                  <View style={styles.labelRow}>
                    <Text style={styles.cardLabel}>{c.label}</Text>
                    {recommended === c.value ? (
                      <View style={styles.recommendedPill}>
                        <Text style={styles.recommendedText}>Recommended</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardSub}>{sub}</Text>
                </View>
                <View style={[styles.radio, { borderColor: selected ? c.fg : colors.border }]}>
                  {selected ? <View style={[styles.radioDot, { backgroundColor: c.fg }]} /> : null}
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={c.value}
              style={[
                styles.tile,
                selected && { borderColor: c.fg, backgroundColor: c.bg },
                tileDisabled && styles.disabled,
              ]}
              onPress={() => onChange(c.value)}
              disabled={tileDisabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: tileDisabled }}
              accessibilityLabel={a11yLabel}
            >
              {selected ? (
                <View style={[styles.check, { backgroundColor: c.fg }]}>
                  <Ionicons name="checkmark" size={12} color={colors.white} />
                </View>
              ) : null}
              <Ionicons
                name={c.icon as keyof typeof Ionicons.glyphMap}
                size={24}
                color={selected ? c.fg : colors.textSecondary}
              />
              <Text style={styles.label} numberOfLines={1}>{c.label}</Text>
              <Text style={styles.sub} numberOfLines={2}>{sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {allowNone ? (
        <TouchableOpacity
          onPress={() => onChange(noneValue)}
          disabled={disabled}
          style={[styles.noneBtn, isList && styles.noneBtnList]}
          accessibilityRole="radio"
          accessibilityState={{ checked: noneSelected, disabled: !!disabled }}
          accessibilityLabel={noneText}
        >
          <Text style={[styles.noneText, noneSelected && styles.noneTextSelected]}>{noneText}</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.helper}>
        {value === 'message'
          ? "Message is a notification on this phone. We don't send SMS."
          : value === 'call'
            ? "Calls ring on this phone at the set time. On iPhone, open the app once a day so the teacher's voice is ready. Works best when the app has been opened today."
            : value === 'email'
              ? 'The email comes from Simple Lecture, so it arrives even when the phone is off.'
              : value === 'none'
                ? 'No reminders for these sessions. You can change this later.'
                : 'Choose how you want to be reminded for this session.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // grid (unchanged look, minHeight so large font scales do not clip)
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: '48%',
    minHeight: 84,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  disabled: { opacity: 0.5 },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },
  sub: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // list (wizard and reminder settings)
  list: {
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  cardLabel: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },
  cardSub: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  recommendedPill: {
    backgroundColor: TINT.greenSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
  },
  recommendedText: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.medium,
    color: colors.primaryDark,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  noneBtn: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  noneBtnList: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  noneText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.medium,
    color: colors.textMuted,
  },
  noneTextSelected: {
    color: colors.text,
    textDecorationLine: 'underline',
  },
  helper: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
