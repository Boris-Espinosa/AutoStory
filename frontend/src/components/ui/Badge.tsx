import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';

export type BadgeTone = 'neutral' | 'info' | 'warning';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

const toneStyles: Record<BadgeTone, { background: string; text: string }> = {
  neutral: { background: colors.neutralBackground, text: colors.neutral },
  info: { background: colors.infoBackground, text: colors.info },
  warning: { background: colors.warningBackground, text: colors.warning },
};

export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const toneStyle = toneStyles[tone];

  return (
    <View
      style={[styles.badge, { backgroundColor: toneStyle.background }, style]}
    >
      <Text style={[styles.label, { color: toneStyle.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
  },
});
