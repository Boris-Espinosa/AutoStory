import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { colors } from '../../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  accessibilityLabel?: string;
}

export function Icon({
  name,
  size = 24,
  color = colors.textPrimary,
  accessibilityLabel,
}: IconProps) {
  return (
    <Ionicons
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessible={Boolean(accessibilityLabel)}
      color={color}
      name={name}
      size={size}
    />
  );
}
