import { useAuth } from '@clerk/expo';
import type { QueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import {
  apiRequest,
  setTokenProvider,
} from '../../api/client';
import { clearLocalReminders } from '../../notifications/local';

/**
 * Conecta Clerk con el cliente del API y la caché de TanStack Query.
 * No renderiza nada; debe vivir en la raíz de la app.
 */
export function AuthBridge({ queryClient }: { queryClient: QueryClient }) {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useAuth();
  const previousUserId = useRef<string | null | undefined>(undefined);

  const closeExpiredSession = useCallback(async () => {
    queryClient.clear();
    await clearLocalReminders().catch(() => undefined);
    // Cierre local: si Clerk no responde, la app sigue hacia /sign-in.
    await signOut().catch(() => undefined);
    router.replace({ pathname: '/sign-in', params: { reason: 'expired' } });
  }, [queryClient, signOut]);

  useEffect(() => {
    setTokenProvider(async (options) =>
      isLoaded && isSignedIn ? getToken(options) : null,
    );
  }, [isLoaded, isSignedIn, getToken]);

  // Al volver al primer plano se comprueba que la sesión siga vigente.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    let active = true;

    const verifySession = async (): Promise<void> => {
      let token: string | null;

      try {
        token = await getToken({ skipCache: true });
      } catch {
        // Sin red no se puede distinguir una sesión revocada: no se cierra.
        return;
      }

      if (!active) {
        return;
      }

      if (!token) {
        await closeExpiredSession();
        return;
      }

      // Si el servidor rechaza el token se avisa al usuario; no se cierra la sesión.
      await apiRequest<unknown>('/me').catch(() => undefined);
    };

    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') {
        return;
      }

      const onFocus = () => void verifySession();
      window.addEventListener('focus', onFocus);

      return () => {
        active = false;
        window.removeEventListener('focus', onFocus);
      };
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void verifySession();
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [isLoaded, isSignedIn, getToken, closeExpiredSession]);

  // Cambio de usuario o cierre de sesión: la caché no puede mostrar
  // datos del usuario anterior.
  useEffect(() => {
    if (previousUserId.current !== userId) {
      queryClient.clear();
      previousUserId.current = userId;
    }
  }, [userId, queryClient]);

  return null;
}
