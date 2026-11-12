import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SESSION_REJECTED_MESSAGE, setSessionRejectedHandler } from '../src/api/client';
import { Button } from '../src/components/ui/Button';
import { MessageBanner } from '../src/components/MessageBanner';
import { AuthBridge } from '../src/features/auth/AuthBridge';
import { useLocalReminders } from '../src/notifications/local';
import { colors, layout, spacing, typography } from '../src/theme';
import { safeRedirect } from '../src/utils/safeRedirect';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
    },
  },
});

/** Tiempo máximo de espera mientras Clerk carga la sesión. */
const AUTH_LOAD_TIMEOUT_MS = 10_000;

/** Rutas que se abandonan en cuanto hay sesión. */
const AUTH_ROUTES = ['/sign-in', '/sso-callback'];

export default function RootLayout() {
  const [attempt, setAttempt] = useState(0);
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return <ClerkKeyMissing />;
  }

  return (
    // tokenCache ya es undefined en web por diseño del paquete.
    // shortcut: "Reintentar" remonta el provider, lo que reinicia Clerk en web;
    // en nativo el singleton de Clerk persiste y reintenta al volver a primer plano.
    <ClerkProvider
      key={attempt}
      publishableKey={publishableKey}
      tokenCache={tokenCache}
    >
      <AppShell onRetry={() => setAttempt(attempt + 1)} />
    </ClerkProvider>
  );
}

function AppShell({ onRetry }: { onRetry: () => void }) {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ redirect?: string }>();
  const [timedOut, setTimedOut] = useState(false);
  useLocalReminders();

  // Navegación posterior al inicio de sesión: vive aquí para que funcione
  // aunque sign-in se haya desmontado (p. ej. al volver por /sso-callback).
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !AUTH_ROUTES.includes(pathname)) {
      return;
    }

    const target = safeRedirect(
      typeof params.redirect === 'string' ? params.redirect : undefined,
    );

    router.replace(target);
  }, [isLoaded, isSignedIn, pathname, params.redirect]);

  useEffect(() => {
    if (isLoaded) {
      return;
    }

    const timer = setTimeout(() => setTimedOut(true), AUTH_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <AuthBridge queryClient={queryClient} />

        {isLoaded ? (
          <RootNavigator />
        ) : timedOut ? (
          <AuthTimeout onRetry={onRetry} />
        ) : (
          <AuthLoading />
        )}

        <SessionRejectedBanner />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { isSignedIn } = useAuth();
  const pathname = usePathname();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Sin sesión, el resto de rutas va a /sign-in conservando la ruta pedida. */}
      <Stack.Protected
        guard={isSignedIn ?? false}
        redirectTo={{ pathname: '/sign-in', params: { redirect: pathname } }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="vehicles/new" />
        <Stack.Screen name="vehicles/[vehicleId]" />
        <Stack.Screen name="vehicles/[vehicleId]/maintenances" />
        <Stack.Screen name="vehicles/[vehicleId]/maintenances/new" />
        <Stack.Screen name="vehicles/[vehicleId]/maintenances/[maintenanceId]" />
        <Stack.Screen name="vehicles/[vehicleId]/maintenances/[maintenanceId]/edit" />
        <Stack.Screen name="vehicles/[vehicleId]/parts" />
        <Stack.Screen name="vehicles/[vehicleId]/parts/new" />
        <Stack.Screen name="appointments/new" />
        <Stack.Screen name="appointments/[appointmentId]" />
        <Stack.Screen name="appointments/[appointmentId]/edit" />
        <Stack.Screen name="account/delete" />
      </Stack.Protected>
    </Stack>
  );
}

/** Aviso persistente cuando el backend rechaza la sesión de Clerk. */
function SessionRejectedBanner() {
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setSessionRejectedHandler(() => setVisible(true));
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <View style={[styles.sessionRejected, { top: insets.top + spacing.sm }]}>
      <Pressable
        accessibilityLabel="Cerrar aviso"
        accessibilityRole="button"
        onPress={() => setVisible(false)}
      >
        <MessageBanner message={SESSION_REJECTED_MESSAGE} tone="error" />
      </Pressable>
    </View>
  );
}

function ClerkKeyMissing() {
  return (
    <View style={[styles.fill, styles.center]}>
      <Text style={styles.title}>Falta la clave de Clerk en el archivo .env</Text>
      <Text style={styles.message}>
        Agrega EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY y vuelve a iniciar la app.
      </Text>
    </View>
  );
}

function AuthLoading() {
  return (
    <View style={[styles.fill, styles.center]}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

function AuthTimeout({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={[styles.fill, styles.center]}>
      <Text style={styles.title}>No pudimos conectar</Text>
      <Text style={styles.message}>
        No se pudo cargar la información de tu sesión.
      </Text>
      <Button
        label="Reintentar"
        onPress={onRetry}
        style={styles.action}
        variant="secondary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    backgroundColor: colors.background,
    flex: 1,
  },
  center: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  action: {
    marginTop: spacing.sm,
    minWidth: layout.buttonMinWidth,
  },
  sessionRejected: {
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
    zIndex: 2,
  },
});
