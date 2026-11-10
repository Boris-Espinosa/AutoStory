import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Notification,
  NotificationType,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from '../../src/api/notifications';
import { AppHeader } from '../../src/components/ui/AppHeader';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Icon, IconName } from '../../src/components/ui/Icon';
import { SegmentedTabs } from '../../src/components/ui/SegmentedTabs';
import { MessageBanner } from '../../src/components/MessageBanner';
import {
  colors,
  layout,
  radius,
  spacing,
  typography,
} from '../../src/theme';

type NotificationFilter = 'all' | 'unread';

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Sin leer' },
];

const TYPE_ICONS: Record<NotificationType, IconName> = {
  APPOINTMENT_REMINDER: 'alarm-outline',
  APPOINTMENT_CREATED: 'calendar-outline',
  APPOINTMENT_RESCHEDULED: 'refresh-outline',
  APPOINTMENT_CANCELLED: 'close-circle-outline',
};

/** "hace 5 min", "hace 2 h", "ayer" o dd/mm/aaaa. */
function relativeTime(isoInstant: string, now: Date = new Date()): string {
  const date = new Date(isoInstant);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);

  if (minutes < 60) {
    return `hace ${Math.max(1, minutes)} min`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `hace ${hours} h`;
  }

  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );

  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return 'ayer';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `${day}/${month}/${date.getFullYear()}`;
}

function MarkAllAction({
  disabled,
  onPress,
}: {
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel="Marcar todas como leídas"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.markAll,
        pressed && !disabled && styles.markAllPressed,
      ]}
    >
      <Text
        numberOfLines={2}
        style={[styles.markAllText, disabled && styles.markAllTextDisabled]}
      >
        Marcar todas como leídas
      </Text>
    </Pressable>
  );
}

function NotificationRow({
  notification,
  onPress,
}: {
  notification: Notification;
  onPress: () => void;
}) {
  const unread = !notification.readAt;
  const time = relativeTime(notification.createdAt);

  return (
    <Pressable
      accessibilityLabel={`${notification.title}. ${notification.body}. ${time}${unread ? '. No leída' : ''}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        unread && styles.rowUnread,
        pressed && styles.rowPressed,
      ]}
    >
      <Icon
        color={unread ? colors.primary : colors.textSecondary}
        name={TYPE_ICONS[notification.type]}
        size={22}
      />

      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {notification.title}
          </Text>
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>

        <Text numberOfLines={2} style={styles.rowBody}>
          {notification.body}
        </Text>
        <Text style={styles.rowTime}>{time}</Text>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [missingAppointment, setMissingAppointment] = useState<string | null>(
    null,
  );

  const notificationsQuery = useNotifications(filter === 'unread');
  const unreadQuery = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications =
    notificationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = notificationsQuery.data?.pages[0]?.total ?? 0;
  const unreadCount = unreadQuery.data ?? 0;

  const refresh = async () => {
    setRefreshing(true);

    try {
      await queryClient.refetchQueries({ queryKey: ['notifications'] });
    } finally {
      setRefreshing(false);
    }
  };

  const openNotification = (notification: Notification) => {
    setMissingAppointment(null);

    if (!notification.readAt) {
      markRead.mutate(notification.id);
    }

    if (!notification.appointmentId) {
      setMissingAppointment('Esta cita ya no existe');
      return;
    }

    router.push({
      pathname: '/appointments/[appointmentId]',
      params: { appointmentId: notification.appointmentId },
    });
  };

  const markAll = () => {
    if (unreadCount === 0 || markAllRead.isPending) {
      return;
    }

    markAllRead.mutate();
  };

  const isLoading = notificationsQuery.isLoading;
  const isError = notificationsQuery.isError;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <Head>
        <title>Notificaciones · AutoStory</title>
      </Head>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          Platform.OS !== 'web' ? (
            <RefreshControl
              colors={[colors.primary]}
              onRefresh={() => void refresh()}
              refreshing={refreshing}
              tintColor={colors.primary}
            />
          ) : undefined
        }
      >
        <View style={styles.container}>
          <AppHeader
            rightAction={
              <MarkAllAction
                disabled={unreadCount === 0 || markAllRead.isPending}
                onPress={markAll}
              />
            }
            title="Notificaciones"
          />

          <SegmentedTabs
            activeKey={filter}
            items={FILTERS}
            onChange={(key) => setFilter(key as NotificationFilter)}
          />

          <MessageBanner message={missingAppointment} tone="error" />

          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}

          {isError ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>
                No se pudieron cargar las notificaciones.
              </Text>
              <Button
                label="Reintentar"
                onPress={() => void notificationsQuery.refetch()}
                variant="secondary"
              />
            </View>
          ) : null}

          {!isLoading && !isError && notifications.length === 0 ? (
            <EmptyState
              icon="notifications-outline"
              title={
                filter === 'unread'
                  ? 'No tienes notificaciones sin leer'
                  : 'No tienes notificaciones'
              }
            />
          ) : null}

          {notifications.length > 0 ? (
            <Card style={styles.listCard}>
              {notifications.map((notification, index) => (
                <View
                  key={notification.id}
                  style={index > 0 ? styles.rowBorder : undefined}
                >
                  <NotificationRow
                    notification={notification}
                    onPress={() => openNotification(notification)}
                  />
                </View>
              ))}
            </Card>
          ) : null}

          {!isLoading &&
          !isError &&
          notifications.length > 0 &&
          notifications.length < total ? (
            <Button
              label="Cargar más"
              loading={notificationsQuery.isFetchingNextPage}
              onPress={() => void notificationsQuery.fetchNextPage()}
              style={styles.moreButton}
              variant="secondary"
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing.md,
    maxWidth: layout.detailMaxWidth,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    width: '100%',
  },
  markAll: {
    justifyContent: 'center',
    maxWidth: 128,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.xs,
  },
  markAllPressed: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
  },
  markAllText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    textAlign: 'right',
  },
  markAllTextDisabled: {
    color: colors.textSecondary,
  },
  centered: {
    alignItems: 'center',
    gap: spacing.lg,
    justifyContent: 'center',
    minHeight: layout.emptyMinHeight,
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.dangerText,
    textAlign: 'center',
  },
  listCard: {
    paddingVertical: spacing.none,
  },
  rowBorder: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: layout.borderWidth,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.touchTarget + spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowUnread: {
    backgroundColor: colors.primarySoft,
  },
  rowPressed: {
    backgroundColor: colors.neutralBackground,
  },
  rowMain: {
    flex: 1,
    gap: spacing.xs,
  },
  rowTitleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowTitle: {
    ...typography.body,
    color: colors.textPrimary,
    flexShrink: 1,
    fontWeight: '600',
  },
  unreadDot: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: spacing.sm,
    width: spacing.sm,
  },
  rowBody: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rowTime: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  moreButton: {
    alignSelf: 'center',
    maxWidth: layout.buttonMaxWidth,
  },
});
