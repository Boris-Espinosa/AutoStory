import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { apiRequest } from './client';

export type NotificationType =
  | 'APPOINTMENT_REMINDER'
  | 'APPOINTMENT_CREATED'
  | 'APPOINTMENT_RESCHEDULED'
  | 'APPOINTMENT_CANCELLED';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  vehicleId: string | null;
  appointmentId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: Notification[];
  total: number;
  unreadCount: number;
}

export interface UnreadCount {
  unreadCount: number;
}

export const NOTIFICATIONS_PAGE_SIZE = 30;

export const notificationsQueryKey = ['notifications'] as const;
export const notificationListQueryKey = (unread: boolean) =>
  ['notifications', 'list', unread] as const;
export const unreadCountQueryKey = ['notifications', 'unread-count'] as const;

export function getNotifications(params: {
  unread: boolean;
  limit?: number;
  offset?: number;
}): Promise<NotificationList> {
  const query = `unread=${params.unread}&limit=${params.limit ?? NOTIFICATIONS_PAGE_SIZE}&offset=${params.offset ?? 0}`;

  return apiRequest<NotificationList>(`/notifications?${query}`);
}

export function getUnreadCount(): Promise<UnreadCount> {
  return apiRequest<UnreadCount>('/notifications/unread-count');
}

export function markNotificationRead(id: string): Promise<Notification> {
  return apiRequest<Notification>(`/notifications/${id}/read`, {
    method: 'POST',
  });
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return apiRequest<{ updated: number }>('/notifications/read-all', {
    method: 'POST',
  });
}

export function useNotifications(unread: boolean) {
  return useInfiniteQuery({
    queryKey: notificationListQueryKey(unread),
    queryFn: ({ pageParam }) =>
      getNotifications({ unread, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce(
        (total, page) => total + page.items.length,
        0,
      );

      return loaded < lastPage.total ? loaded : undefined;
    },
  });
}

/** El intervalo solo corre en primer plano; al volver se refresca de inmediato. */
function useIsForeground(): boolean {
  const [isForeground, setIsForeground] = useState(() =>
    Platform.OS === 'web'
      ? typeof document === 'undefined' || document.visibilityState === 'visible'
      : AppState.currentState === 'active',
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') {
        return;
      }

      const focus = () => setIsForeground(true);
      const blur = () => setIsForeground(false);

      window.addEventListener('focus', focus);
      window.addEventListener('blur', blur);

      return () => {
        window.removeEventListener('focus', focus);
        window.removeEventListener('blur', blur);
      };
    }

    const subscription = AppState.addEventListener('change', (state) =>
      setIsForeground(state === 'active'),
    );

    return () => subscription.remove();
  }, []);

  return isForeground;
}

export function useUnreadCount() {
  const isForeground = useIsForeground();
  const wasForeground = useRef(isForeground);
  const query = useQuery({
    queryKey: unreadCountQueryKey,
    queryFn: getUnreadCount,
    select: (data) => data.unreadCount,
    refetchInterval: isForeground ? 60_000 : false,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (isForeground && !wasForeground.current) {
      void query.refetch();
    }

    wasForeground.current = isForeground;
  }, [isForeground, query.refetch]);

  return query;
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markNotificationRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: unreadCountQueryKey });
      const previous = queryClient.getQueryData<UnreadCount>(
        unreadCountQueryKey,
      );

      queryClient.setQueryData<UnreadCount>(unreadCountQueryKey, (current) =>
        current
          ? { unreadCount: Math.max(0, current.unreadCount - 1) }
          : current,
      );

      return { previous };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData(unreadCountQueryKey, context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: unreadCountQueryKey });
      const previous = queryClient.getQueryData<UnreadCount>(
        unreadCountQueryKey,
      );

      queryClient.setQueryData<UnreadCount>(unreadCountQueryKey, {
        unreadCount: 0,
      });

      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(unreadCountQueryKey, context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });
}
