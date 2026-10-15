import { TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';

type HeaderMenuVariant = 'default' | 'light' | 'overlay';

interface HeaderMenuButtonProps {
  onPress: () => void;
  variant?: HeaderMenuVariant;
  style?: StyleProp<ViewStyle>;
}

export default function HeaderMenuButton({
  onPress,
  variant = 'default',
  style,
}: HeaderMenuButtonProps) {
  const iconColor = variant === 'light' ? colors.text : colors.white;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        variant === 'light' && styles.buttonLight,
        variant === 'overlay' && styles.buttonOverlay,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      data-testid="button-open-sidebar"
    >
      <Ionicons name="menu" size={20} color={iconColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLight: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  buttonOverlay: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
