import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import {
  colors,
  layout,
  radius,
  spacing,
  typography,
} from '../../theme';

export interface SegmentedTabItem {
  key: string;
  label: string;
  count?: number;
}

export interface SegmentedTabsProps {
  items: SegmentedTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedTabs({
  items,
  activeKey,
  onChange,
  style,
}: SegmentedTabsProps) {
  return (
    <View style={[styles.container, style]}>
      <ScrollView
        contentContainerStyle={styles.content}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {items.map((item) => {
          const active = item.key === activeKey;

          return (
            <Pressable
              accessibilityLabel={item.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={item.key}
              onPress={() => onChange(item.key)}
              style={({ pressed }) => [
                styles.tab,
                active && styles.tabActive,
                pressed && styles.tabPressed,
              ]}
            >
              <Text style={[styles.label, active && styles.labelActive]}>
                {item.label}
              </Text>

              {typeof item.count === 'number' ? (
                <View style={[styles.count, active && styles.countActive]}>
                  <Text
                    style={[styles.countText, active && styles.countTextActive]}
                  >
                    {item.count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: layout.borderWidth,
  },
  content: {
    flexGrow: 1,
  },
  tab: {
    alignItems: 'center',
    borderBottomColor: colors.transparent,
    borderBottomWidth: layout.borderWidthStrong,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabPressed: {
    backgroundColor: colors.primarySoft,
  },
  label: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.primary,
  },
  count: {
    alignItems: 'center',
    backgroundColor: colors.neutralBackground,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minWidth: layout.countBadgeMinWidth,
    paddingHorizontal: spacing.xxs,
    paddingVertical: layout.hairline,
  },
  countActive: {
    backgroundColor: colors.primarySoft,
  },
  countText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  countTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});
