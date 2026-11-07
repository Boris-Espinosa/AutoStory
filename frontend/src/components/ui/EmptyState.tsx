import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, layout, radius, spacing, typography } from '../../theme';
import { Button } from './Button';
import { Icon, IconName } from './Icon';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  text?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconCircle}>
        <Icon color={colors.textSecondary} name={icon} size={32} />
      </View>

      <Text style={styles.title}>{title}</Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}

      {action ? (
        <Button label={action.label} onPress={action.onPress} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: colors.neutralBackground,
    borderRadius: radius.pill,
    height: layout.iconCircleSize,
    justifyContent: 'center',
    width: layout.iconCircleSize,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  text: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
