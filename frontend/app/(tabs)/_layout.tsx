import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, IconName } from '../../src/components/ui/Icon';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { colors, layout, radius, spacing, typography } from '../../src/theme';

interface Section {
  name: string;
  title: string;
  icon: IconName;
}

const SECTIONS: Section[] = [
  { name: 'index', title: 'Vehículos', icon: 'car-outline' },
  { name: 'account', title: 'Cuenta', icon: 'person-circle-outline' },
];

interface SideNavProps extends BottomTabBarProps {
  sections: Section[];
}

function SideNav({ state, navigateToTab, insets, sections }: SideNavProps) {
  return (
    <View
      style={[
        styles.sidebar,
        {
          paddingBottom: insets.bottom + spacing.lg,
          paddingTop: insets.top + spacing.xl,
        },
      ]}
    >
      <Text style={styles.brand}>AutoStory</Text>

      {state.routes.map((route, index) => {
        const section = sections.find((item) => item.name === route.name);

        if (!section) {
          return null;
        }

        const active = state.index === index;

        return (
          <Pressable
            accessibilityLabel={section.title}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={route.key}
            onPress={() => navigateToTab(route.key)}
            style={({ pressed }) => [
              styles.sidebarItem,
              active && styles.sidebarItemActive,
              pressed && !active && styles.sidebarItemPressed,
            ]}
          >
            <Icon
              color={active ? colors.primary : colors.textSecondary}
              name={section.icon}
              size={22}
            />
            <Text
              style={[
                styles.sidebarLabel,
                active && styles.sidebarLabelActive,
              ]}
            >
              {section.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { isWide } = useBreakpoint();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarPosition: isWide ? 'left' : 'bottom',
        tabBarStyle: styles.tabBar,
      }}
      tabBar={
        isWide
          ? (props) => <SideNav {...props} sections={SECTIONS} />
          : undefined
      }
    >
      {SECTIONS.map((section) => (
        <Tabs.Screen
          key={section.name}
          name={section.name}
          options={{
            title: section.title,
            tabBarIcon: ({ color, size }) => (
              <Icon color={color as string} name={section.icon} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.borderSubtle,
  },
  sidebar: {
    backgroundColor: colors.surface,
    borderRightColor: colors.borderSubtle,
    borderRightWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    width: layout.sidebarWidth,
  },
  brand: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '800',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  sidebarItem: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sidebarItemActive: {
    backgroundColor: colors.primarySoft,
  },
  sidebarItemPressed: {
    backgroundColor: colors.neutralBackground,
  },
  sidebarLabel: {
    ...typography.body,
    color: colors.textLabel,
    fontWeight: '600',
  },
  sidebarLabelActive: {
    color: colors.primary,
  },
});
