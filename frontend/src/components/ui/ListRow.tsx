import type { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, layout, spacing, typography } from '../../theme';
import { Icon } from './Icon';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  badge?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function ListRow({
  title,
  subtitle,
  value,
  badge,
  leading,
  trailing,
  chevron = false,
  onPress,
  accessibilityLabel,
  style,
}: ListRowProps) {
  const content = (
    <>
      {leading}

      <View style={styles.main}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
        {badge}
      </View>

      {value ? <Text style={styles.value}>{value}</Text> : null}
      {trailing}
      {chevron ? (
        <Icon color={colors.textSecondary} name="chevron-forward" size={18} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, style]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.touchTarget + spacing.md,
    paddingVertical: spacing.md,
  },
  main: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  value: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  pressed: {
    backgroundColor: colors.primarySoft,
  },
});
