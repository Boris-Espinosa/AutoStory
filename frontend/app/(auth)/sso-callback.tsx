import { useClerk } from '@clerk/expo';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../src/components/ui/Button';
import { colors, spacing, typography } from '../../src/theme';

/** Igual que el límite de sign-in: nunca se deja el indicador girando para siempre. */
const CALLBACK_TIMEOUT_MS = 60_000;
const INCOMPLETE_SIGN_IN =
  'No pudimos completar el inicio de sesión. Inténtalo de nuevo';

/**
 * Ruta de retorno del flujo OAuth. En Expo Go también se monta (la redirección
 * exp:// llega a esta ruta), pero no navega: la sesión la activa startSSOFlow y
 * el guardia de _layout redirige en cuanto isSignedIn pasa a true.
 */
export default function SsoCallbackScreen() {
  const clerk = useClerk();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    // Solo web: en nativo el callback lo completa openAuthSessionAsync.
    if (Platform.OS !== 'web') {
      return;
    }

    // En la ventana emergente la URL ya viajó a la pantalla que abrió el flujo.
    if (typeof window !== 'undefined' && window.opener) {
      return;
    }

    void clerk.handleRedirectCallback({});
  }, [clerk]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, CALLBACK_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={colors.primary} size="large" />

      {timedOut ? (
        <>
          <Text style={styles.message}>{INCOMPLETE_SIGN_IN}</Text>
          <Button
            label="Volver a iniciar sesión"
            onPress={() => router.replace('/sign-in')}
            variant="secondary"
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
