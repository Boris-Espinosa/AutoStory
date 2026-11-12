import Constants from 'expo-constants';
import {
  AndroidImportance,
  setNotificationChannelAsync,
  setNotificationHandler,
} from 'expo-notifications';
import { Platform } from 'react-native';

export const ANDROID_CHANNEL_ID = 'citas';

/** `appOwnership` vale 'expo' únicamente dentro de Expo Go. */
export const isExpoGo = Constants.appOwnership === 'expo';

/** En web y en Expo Go los avisos locales no se usan. */
export const canUseLocalReminders = Platform.OS !== 'web' && !isExpoGo;

/** Los fallos de avisos solo se registran en desarrollo y nunca rompen la app. */
export function logNotificationError(message: string): void {
  if (__DEV__) {
    console.warn(message);
  }
}

/** Configuración única de avisos; nunca lanza ni bloquea el arranque. */
export function setupNotifications(): void {
  if (!canUseLocalReminders) {
    return;
  }

  try {
    setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    logNotificationError('No se pudo configurar el manejador de avisos');
  }

  if (Platform.OS !== 'android') {
    return;
  }

  // En Expo Go el canal no existe y setNotificationChannelAsync lanza
  // NullPointerException; el guard de canUseLocalReminders lo evita.
  try {
    void setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Citas',
      importance: AndroidImportance.HIGH,
    }).catch(() => {
      logNotificationError('No se pudo crear el canal de avisos');
    });
  } catch {
    logNotificationError('No se pudo crear el canal de avisos');
  }
}
