import type { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fontSizes, layout, spacing, typography } from '../../theme';

export interface SectionHeaderProps {
  title: string;
  badge?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({
  title,
  badge,
  actionLabel,
  onAction,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>
      {badge}

      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: layout.touchTarget,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flex: 1,
  },
  action: {
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.sm,
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionText: {
    color: colors.primary,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
});
