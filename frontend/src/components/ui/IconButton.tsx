import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { colors, layout, radius } from '../../theme';
import { Icon, IconName } from './Icon';

export interface IconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  color = colors.textPrimary,
  size = 22,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Icon color={color} name={icon} size={size} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: layout.touchTarget,
    justifyContent: 'center',
    width: layout.touchTarget,
  },
  pressed: {
    backgroundColor: colors.primarySoft,
  },
  disabled: {
    opacity: 0.6,
  },
});
