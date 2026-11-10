import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useUnreadCount } from '../../src/api/notifications';
import { Icon, IconName } from '../../src/components/ui/Icon';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import {
  colors,
  fontSizes,
  layout,
  radius,
  spacing,
  typography,
} from '../../src/theme';

interface Section {
  name: string;
  label: string;
  icon: IconName;
  badgeCount?: number;
}

const SECTIONS: Section[] = [
  { name: 'index', label: 'Vehículos', icon: 'car-outline' },
  { name: 'appointments', label: 'Citas', icon: 'calendar-outline' },
  { name: 'notifications', label: 'Avisos', icon: 'notifications-outline' },
  { name: 'account', label: 'Cuenta', icon: 'person-circle-outline' },
];

function badgeLabel(count: number): string {
  return count > 9 ? '9+' : String(count);
}

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
            accessibilityLabel={section.label}
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
              {section.label}
            </Text>

            {section.badgeCount ? (
              <View style={styles.sidebarBadge}>
                <Text style={styles.sidebarBadgeText}>
                  {badgeLabel(section.badgeCount)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { isWide } = useBreakpoint();
  const unreadCount = useUnreadCount().data ?? 0;
  const sections = SECTIONS.map((section) =>
    section.name === 'notifications'
      ? { ...section, badgeCount: unreadCount }
      : section,
  );

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
          ? (props) => <SideNav {...props} sections={sections} />
          : undefined
      }
    >
      {sections.map((section) => (
        <Tabs.Screen
          key={section.name}
          name={section.name}
          options={{
            title: section.label,
            tabBarBadge:
              section.badgeCount && section.badgeCount > 0
                ? badgeLabel(section.badgeCount)
                : undefined,
            tabBarBadgeStyle: styles.tabBarBadge,
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
  tabBarBadge: {
    backgroundColor: colors.primary,
    color: colors.primaryText,
    fontSize: fontSizes.xs,
    fontWeight: '700',
  },
  sidebar: {
    backgroundColor: colors.surface,
    borderRightColor: colors.borderSubtle,
    borderRightWidth: layout.borderWidth,
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
  sidebarBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    marginLeft: 'auto',
    minWidth: layout.countBadgeMinWidth,
    paddingHorizontal: spacing.xxs,
    paddingVertical: layout.hairline,
  },
  sidebarBadgeText: {
    ...typography.caption,
    color: colors.primaryText,
    fontWeight: '700',
  },
});
