import type { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, layout, spacing, typography } from '../../theme';
import { IconButton } from './IconButton';

export interface AppHeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function AppHeader({ title, onBack, rightAction, style }: AppHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      {onBack ? (
        <IconButton
          accessibilityLabel="Volver"
          icon="arrow-back"
          onPress={onBack}
        />
      ) : (
        <View style={styles.spacer} />
      )}

      <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
        {title}
      </Text>

      {rightAction ? (
        <View style={styles.rightAction}>{rightAction}</View>
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: layout.headerHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  spacer: {
    height: layout.touchTarget,
    width: layout.touchTarget,
  },
  rightAction: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    minWidth: layout.touchTarget,
  },
});
