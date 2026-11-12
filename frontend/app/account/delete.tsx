import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { deleteAccount, useDeletionPreview } from '../../src/api/me';
import { MessageBanner } from '../../src/components/MessageBanner';
import { AppHeader } from '../../src/components/ui/AppHeader';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Screen } from '../../src/components/ui/Screen';
import { TextField } from '../../src/components/TextField';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { clearLocalReminders } from '../../src/notifications/local';
import {
  colors,
  layout,
  spacing,
  typography,
} from '../../src/theme';

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const { isWide } = useBreakpoint();
  const preview = useDeletionPreview();
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete =
    preview.data !== undefined && confirmation === 'ELIMINAR' && !deleting;

  const confirmDelete = async (): Promise<void> => {
    if (!canDelete) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      await deleteAccount();
    } catch {
      setError(
        'No pudimos eliminar tu cuenta. Revisa tu conexión e inténtalo de nuevo.',
      );
      setDeleting(false);
      return;
    }

    // La cuenta ya no existe en el servidor: se cierra la sesión igualmente.
    await signOut().catch(() => undefined);
    queryClient.clear();
    await clearLocalReminders().catch(() => undefined);
    router.replace({ pathname: '/sign-in', params: { reason: 'deleted' } });
  };

  return (
    <Screen edges={['top']} maxWidth={layout.formMaxWidth} scroll>
      <AppHeader title="Eliminar cuenta" onBack={() => router.back()} />

      {preview.isError ? (
        <Card>
          <EmptyState
            action={{ label: 'Reintentar', onPress: () => void preview.refetch() }}
            icon="alert-circle-outline"
            text="Revisa tu conexión e inténtalo de nuevo."
            title="No pudimos cargar el resumen"
          />
        </Card>
      ) : null}

      {preview.data ? (
        <Card>
          <Text style={styles.summary}>
            Se eliminarán {preview.data.ownedVehicles} vehículos y todo su
            historial. {preview.data.ownedVehiclesWithGuests} de ellos están
            compartidos: esas personas perderán el acceso. Esta acción no se
            puede deshacer.
          </Text>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.label}>
          Escribe ELIMINAR para confirmar
        </Text>
        <TextField
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!deleting}
          label="Confirmación"
          onChangeText={setConfirmation}
          placeholder="ELIMINAR"
          value={confirmation}
        />
      </Card>

      <MessageBanner message={error} tone="error" />

      <View style={[styles.actions, isWide && styles.actionsWide]}>
        <Button
          disabled={deleting}
          label="Cancelar"
          onPress={() => router.back()}
          variant="secondary"
        />
        <Button
          disabled={!canDelete}
          label="Eliminar definitivamente"
          loading={deleting}
          onPress={() => void confirmDelete()}
          variant="danger"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: {
    ...typography.body,
    color: colors.textPrimary,
  },
  label: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actions: {
    gap: spacing.md,
  },
  actionsWide: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
