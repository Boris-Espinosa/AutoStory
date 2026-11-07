import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  colors,
  fontSizes,
  layout,
  radius,
  shadow,
  spacing,
} from '../../theme';
import { Icon, IconName } from './Icon';

export interface FabProps {
  onPress: () => void;
  label?: string;
  icon?: IconName;
  accessibilityLabel?: string;
  /** Espacio extra para no quedar tapado por una barra inferior. */
  bottomOffset?: number;
}

export function Fab({
  onPress,
  label,
  icon = 'add',
  accessibilityLabel,
  bottomOffset = 0,
}: FabProps) {
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label ?? 'Agregar'}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        label ? styles.extended : styles.circular,
        { bottom: insets.bottom + spacing.lg + bottomOffset },
        pressed && styles.pressed,
      ]}
    >
      <Icon color={colors.primaryText} name={icon} size={24} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: layout.fabSize,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.lg,
    zIndex: 10,
  },
  circular: {
    width: layout.fabSize,
  },
  extended: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  pressed: {
    backgroundColor: colors.primaryDark,
  },
  label: {
    color: colors.primaryText,
    fontSize: fontSizes.lg,
    fontWeight: '600',
  },
});
