import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { apiRequest } from '../api/client';

const STORAGE_KEY = 'localRemindersEnabled';
const IDENTIFIER_PREFIX = 'reminder:';
const ANDROID_CHANNEL_ID = 'citas';
const MAX_LOCAL_REMINDERS = 40;

export interface PendingReminder {
  reminderId: string;
  appointmentId: string;
  remindAt: string;
  title: string;
  body: string;
}

/** Pide el permiso del sistema; solo se llama al activar el interruptor. */
export async function ensurePermission(): Promise<boolean> {
  const settings = await Notifications.requestPermissionsAsync();
  return settings.granted;
}

export async function isPermissionGranted(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Handler de primer plano y, en Android, el canal de los avisos de citas. */
export function configure(): void {
  if (Platform.OS === 'web') {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Citas',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

export async function isLocalRemindersEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(STORAGE_KEY)) === 'true';
}

export async function setLocalRemindersEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, String(enabled));
}

async function cancelAllLocalReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();

  await Promise.all(
    scheduled
      .filter((request) => request.identifier.startsWith(IDENTIFIER_PREFIX))
      .map((request) =>
        Notifications.cancelScheduledNotificationAsync(request.identifier),
      ),
  );
}

/** Borra los avisos programados por esta app; se usa al desactivar el interruptor. */
export async function clearLocalReminders(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  await cancelAllLocalReminders();
}

let syncPromise: Promise<void> | null = null;

/**
 * Reprograma los avisos del teléfono con los recordatorios pendientes del
 * servidor. Llamadas simultáneas comparten la misma ejecución para no
 * duplicar avisos.
 */
export function syncLocalReminders(): Promise<void> {
  syncPromise ??= doSyncLocalReminders().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

async function doSyncLocalReminders(): Promise<void> {
  if (Platform.OS === 'web' || !(await isLocalRemindersEnabled())) {
    return;
  }

  const reminders = await apiRequest<PendingReminder[]>(
    `/me/reminders?limit=${MAX_LOCAL_REMINDERS}`,
  );

  await cancelAllLocalReminders();

  const now = Date.now();

  for (const reminder of reminders.slice(0, MAX_LOCAL_REMINDERS)) {
    const date = new Date(reminder.remindAt);

    if (date.getTime() <= now) {
      continue;
    }

    await Notifications.scheduleNotificationAsync({
      identifier: `${IDENTIFIER_PREFIX}${reminder.reminderId}`,
      content: {
        title: reminder.title,
        body: reminder.body,
        data: { appointmentId: reminder.appointmentId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        ...(Platform.OS === 'android'
          ? { channelId: ANDROID_CHANNEL_ID }
          : {}),
      },
    });
  }
}

function openAppointment(
  response: Notifications.NotificationResponse | null,
): void {
  const appointmentId = response?.notification.request.content.data
    ?.appointmentId;

  if (typeof appointmentId === 'string') {
    router.push(`/appointments/${appointmentId}`);
  }
}

/**
 * Arranca los avisos locales: configuración, apertura de la cita al tocar un
 * aviso y sincronización al abrir la app y al volver al primer plano.
 */
export function useLocalReminders(): void {
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    configure();

    const lastResponse = Notifications.getLastNotificationResponse();
    openAppointment(lastResponse);
    Notifications.clearLastNotificationResponse();

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        openAppointment(response);
        Notifications.clearLastNotificationResponse();
      });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncLocalReminders().catch(() => undefined);
      }
    });

    void syncLocalReminders().catch(() => undefined);

    return () => {
      responseSubscription.remove();
      appStateSubscription.remove();
    };
  }, []);
}
