import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useMe } from '../../src/api/me';
import { AppHeader } from '../../src/components/ui/AppHeader';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { ConfirmModal } from '../../src/components/ui/ConfirmModal';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Screen } from '../../src/components/ui/Screen';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { clearLocalReminders } from '../../src/notifications/local';
import {
  colors,
  fontSizes,
  layout,
  radius,
  spacing,
  typography,
} from '../../src/theme';

const AVATAR_SIZE = layout.avatarSize;

export default function AccountScreen() {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const me = useMe();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const version = Constants.expoConfig?.version ?? '—';
  const displayName = me.data?.name ?? 'Usuario';
  const initial = displayName.charAt(0).toUpperCase();

  const confirmSignOut = async (): Promise<void> => {
    setSigningOut(true);
    setSignOutError(null);

    try {
      await signOut();
      queryClient.clear();
      await clearLocalReminders().catch(() => undefined);
      router.replace('/sign-in');
    } catch {
      setSignOutError(
        'No pudimos cerrar la sesión. Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Screen edges={['top']} maxWidth={layout.formMaxWidth} scroll>
      <AppHeader title="Cuenta" />

      {me.isLoading ? (
        <Card style={styles.profile}>
          <View style={[styles.avatar, styles.skeleton]} />
          <View style={styles.profileText}>
            <View style={[styles.skeletonLine, styles.skeletonName]} />
            <View style={[styles.skeletonLine, styles.skeletonEmail]} />
          </View>
        </Card>
      ) : me.isError ? (
        <Card>
          <EmptyState
            action={{ label: 'Reintentar', onPress: () => void me.refetch() }}
            icon="person-circle-outline"
            text="Revisa tu conexión e inténtalo de nuevo."
            title="No pudimos cargar tu cuenta"
          />
        </Card>
      ) : (
        <Card style={styles.profile}>
          {me.data?.imageUrl ? (
            <Image
              accessibilityLabel="Foto de perfil"
              source={{ uri: me.data.imageUrl }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}

          <View style={styles.profileText}>
            <Text style={styles.profileName}>{displayName}</Text>
            {me.data?.email ? (
              <Text style={styles.profileEmail}>{me.data.email}</Text>
            ) : null}
          </View>
        </Card>
      )}

      <Card>
        <View style={styles.versionRow}>
          <Text style={styles.versionLabel}>Versión de la aplicación</Text>
          <Text style={styles.versionValue}>{version}</Text>
        </View>
      </Card>

      <View style={styles.logout}>
        <Button
          label="Cerrar sesión"
          onPress={() => {
            setSignOutError(null);
            setConfirmVisible(true);
          }}
          variant="secondary"
        />
      </View>

      <View style={styles.dangerZone}>
        <SectionHeader title="Zona de peligro" />
        <Button
          label="Eliminar cuenta"
          onPress={() => router.push('/account/delete')}
          variant="danger"
        />
      </View>

      <ConfirmModal
        cancelLabel="Cancelar"
        confirmLabel="Cerrar sesión"
        error={signOutError}
        loading={signingOut}
        message="Tendrás que volver a ingresar con Google o Apple"
        onCancel={() => {
          if (signingOut) {
            return;
          }

          setConfirmVisible(false);
        }}
        onConfirm={() => void confirmSignOut()}
        title="¿Cerrar sesión?"
        visible={confirmVisible}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: AVATAR_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: AVATAR_SIZE,
  },
  avatarImage: {
    borderRadius: radius.pill,
    height: AVATAR_SIZE,
    width: AVATAR_SIZE,
  },
  avatarText: {
    ...typography.title,
    color: colors.primary,
    fontWeight: '800',
  },
  profileText: {
    flex: 1,
    gap: spacing.xs,
  },
  profileName: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  profileEmail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  skeleton: {
    backgroundColor: colors.borderSubtle,
  },
  skeletonLine: {
    backgroundColor: colors.borderSubtle,
    borderRadius: radius.sm,
    height: fontSizes.sm,
  },
  skeletonName: {
    height: fontSizes.lg,
    width: '60%',
  },
  skeletonEmail: {
    width: '40%',
  },
  versionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: layout.touchTarget,
  },
  versionLabel: {
    ...typography.body,
    color: colors.textLabel,
  },
  versionValue: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  logout: {
    gap: spacing.xs,
  },
  dangerZone: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
