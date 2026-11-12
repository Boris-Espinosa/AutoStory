import {
  isClerkAPIResponseError,
  isKnownError,
  useSSO,
} from '@clerk/expo';
import { useSignIn } from '@clerk/expo/legacy';
import * as AuthSession from 'expo-auth-session';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { MessageBanner } from '../../src/components/MessageBanner';
import { Card } from '../../src/components/ui/Card';
import { Icon, IconName } from '../../src/components/ui/Icon';
import {
  colors,
  fontSizes,
  layout,
  radius,
  spacing,
  typography,
} from '../../src/theme';
import { safeRedirect } from '../../src/utils/safeRedirect';

// Completa la sesión de autenticación si la app volvió del navegador con una redirección pendiente.
WebBrowser.maybeCompleteAuthSession();

const PAGE_TITLE = 'Iniciar sesión · AutoStory';
const SSO_CALLBACK_PATH = 'sso-callback';

const NETWORK_ERROR = 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
const INCOMPLETE_SIGN_IN =
  'No pudimos completar el inicio de sesión. Inténtalo de nuevo';
const APPLE_UNAVAILABLE_IN_EXPO_GO =
  'Apple no está disponible en Expo Go. Usa Google o una versión instalada de la app';

/** Tras este tiempo se rehabilita la pantalla aunque startSSOFlow no responda. */
const SSO_TIMEOUT_MS = 60_000;

type OAuthProvider = 'oauth_google' | 'oauth_apple';

/** En Expo Go el esquema se resuelve a exp://; en un build nativo, a autostory://. */
function makeRedirectUrl(): string {
  return AuthSession.makeRedirectUri({
    scheme: 'autostory',
    path: SSO_CALLBACK_PATH,
  });
}

export default function SignInScreen() {
  const { startSSOFlow } = useSSO();
  // Solo para web: flujo de redirección completa cuando la ventana emergente no puede abrirse.
  const { signIn } = useSignIn();
  const params = useLocalSearchParams<{ redirect?: string; reason?: string }>();
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  const redirect = typeof params.redirect === 'string' ? params.redirect : undefined;
  const target = safeRedirect(redirect);
  const sessionExpired = params.reason === 'expired';
  const accountDeleted = params.reason === 'deleted';

  // Android: precargar el navegador del sistema acelera la apertura del flujo.
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  // Garantiza que el indicador de carga termine aunque startSSOFlow no resuelva.
  useEffect(() => {
    if (!pending) {
      return;
    }

    const timer = setTimeout(() => {
      setPending(null);
      setError(INCOMPLETE_SIGN_IN);
    }, SSO_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [pending]);

  // Título de la pestaña en web.
  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const previousTitle = document.title;
    document.title = PAGE_TITLE;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const signInWith = async (provider: OAuthProvider): Promise<void> => {
    setError(null);

    if (provider === 'oauth_apple' && isExpoGo) {
      setError(APPLE_UNAVAILABLE_IN_EXPO_GO);
      return;
    }

    setPending(provider);

    try {
      const {
        createdSessionId,
        setActive,
        authSessionResult,
      } = await startSSOFlow({
        strategy: provider,
        redirectUrl: makeRedirectUrl(),
      });

      if (!createdSessionId) {
        // Sin sesión creada: quedan requisitos pendientes o el usuario canceló.
        const cancelled =
          authSessionResult?.type === 'cancel' || authSessionResult?.type === 'dismiss';

        if (!cancelled) {
          setError(INCOMPLETE_SIGN_IN);
        }

        return;
      }

      if (!setActive) {
        setError(INCOMPLETE_SIGN_IN);
        return;
      }

      await setActive({ session: createdSessionId });

      // La navegación la hace el efecto de _layout cuando isSignedIn pasa a true.
    } catch (caught) {
      if (
        isClerkAPIResponseError(caught) &&
        caught.errors.some(({ code }) => code === 'session_exists')
      ) {
        // Ya existe una sesión activa en este dispositivo: se continúa con ella.
        router.replace(target);
        return;
      }

      if (Platform.OS === 'web') {
        try {
          // La ventana emergente no completó (bloqueadores): flujo de redirección de Clerk para web.
          await signIn?.authenticateWithRedirect({
            strategy: provider,
            redirectUrl: `/${SSO_CALLBACK_PATH}`,
            redirectUrlComplete: target,
          });
          return;
        } catch (redirectError) {
          setError(userMessage(redirectError, provider));
          return;
        }
      }

      setError(userMessage(caught, provider));
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={styles.screen}>
      <Card style={styles.card}>
        <View style={styles.icon}>
          <Icon
            accessibilityLabel="AutoStory"
            color={colors.primary}
            name="car-sport-outline"
            size={fontSizes.hero}
          />
        </View>

        <Text style={styles.title}>AutoStory</Text>
        <Text style={styles.tagline}>
          Todo el historial de tus vehículos en un solo lugar
        </Text>

        {sessionExpired ? (
          <MessageBanner message="Tu sesión expiró" tone="error" />
        ) : null}

        {accountDeleted ? (
          <MessageBanner message="Tu cuenta fue eliminada" />
        ) : null}

        <ProviderButton
          disabled={pending !== null}
          label="Continuar con Google"
          loading={pending === 'oauth_google'}
          logo="logo-google"
          onPress={() => void signInWith('oauth_google')}
          variant="google"
        />

        <ProviderButton
          disabled={pending !== null}
          label="Continuar con Apple"
          loading={pending === 'oauth_apple'}
          logo="logo-apple"
          onPress={() => void signInWith('oauth_apple')}
          variant="apple"
        />

        <MessageBanner message={error} tone="error" />
      </Card>
    </View>
  );
}

/** Mensaje para el usuario según el error; nunca expone detalles técnicos. */
function userMessage(error: unknown, provider: OAuthProvider): string {
  const providerName = provider === 'oauth_google' ? 'Google' : 'Apple';
  return isKnownError(error)
    ? `No pudimos iniciar sesión con ${providerName}. Inténtalo de nuevo o usa el otro método.`
    : NETWORK_ERROR;
}

interface ProviderButtonProps {
  label: string;
  logo: IconName;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  variant: 'google' | 'apple';
}

function ProviderButton({
  label,
  logo,
  loading,
  disabled,
  onPress,
  variant,
}: ProviderButtonProps) {
  const dark = variant === 'apple';
  const labelColor = dark ? colors.primaryText : colors.textPrimary;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.providerButton,
        dark ? styles.providerButtonApple : styles.providerButtonGoogle,
        pressed && !disabled && styles.providerButtonPressed,
        disabled && styles.providerButtonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <>
          <Icon color={labelColor} name={logo} size={fontSizes.xxl} />
          <Text style={[styles.providerLabel, { color: labelColor }]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    gap: spacing.lg,
    maxWidth: layout.modalMaxWidth,
    width: '100%',
  },
  icon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: layout.iconCircleSize,
    justifyContent: 'center',
    width: layout.iconCircleSize,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '800',
    textAlign: 'center',
  },
  tagline: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  legal: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  providerButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: layout.borderWidth,
    flexDirection: 'row',
    gap: spacing.md,
    height: layout.inputMinHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  providerButtonGoogle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  providerButtonApple: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  providerButtonPressed: {
    opacity: 0.9,
  },
  providerButtonDisabled: {
    opacity: 0.6,
  },
  providerLabel: {
    ...typography.body,
    fontWeight: '700',
  },
});
