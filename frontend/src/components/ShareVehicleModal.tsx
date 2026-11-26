import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { ApiError } from '../api/client';
import {
  SharedVehicleMember,
  useCancelSharingRequest,
  usePendingSharingRequests,
  useRevokeSharingMember,
  useSendSharingRequest,
  useSharingMembers,
} from '../api/sharing';
import { MessageBanner } from './MessageBanner';
import { TextField } from './TextField';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ConfirmModal } from './ui/ConfirmModal';
import { IconButton } from './ui/IconButton';
import {
  colors,
  fontSizes,
  layout,
  radius,
  shadow,
  spacing,
  typography,
} from '../theme';
import { formatDisplayDate, getDeviceTimezone } from '../utils/datetime';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export interface ShareVehicleModalProps {
  visible: boolean;
  vehicleId: string;
  onClose: () => void;
}

export function ShareVehicleModal({
  visible,
  vehicleId,
  onClose,
}: ShareVehicleModalProps) {
  const pendingQuery = usePendingSharingRequests(vehicleId);
  const membersQuery = useSharingMembers(vehicleId);
  const sendMutation = useSendSharingRequest();
  const cancelMutation = useCancelSharingRequest();
  const revokeMutation = useRevokeSharingMember();
  const { height: windowHeight } = useWindowDimensions();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] =
    useState<SharedVehicleMember | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const timezone = getDeviceTimezone();
  const pending = pendingQuery.data?.items ?? [];
  const members = membersQuery.data?.items ?? [];
  const loadError =
    pendingQuery.isError || membersQuery.isError
      ? 'No se pudo cargar la información de compartir.'
      : null;

  const close = () => {
    if (
      sendMutation.isPending ||
      cancelMutation.isPending ||
      revokeMutation.isPending
    ) {
      return;
    }

    onClose();
  };

  const send = async () => {
    const trimmed = email.trim();

    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError('Ingresa un correo electrónico válido.');
      return;
    }

    setEmailError(null);
    setError(null);
    setNotice(null);

    try {
      const result = await sendMutation.mutateAsync({
        vehicleId,
        email: trimmed,
      });
      setEmail('');
      setNotice(result.message);
    } catch (caught) {
      setError(
        errorMessage(caught, 'No se pudo enviar la solicitud. Intenta nuevamente.'),
      );
    }
  };

  const cancel = async (requestId: string) => {
    setError(null);
    setNotice(null);

    try {
      await cancelMutation.mutateAsync({ vehicleId, requestId });
      setNotice('Solicitud cancelada.');
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudo cancelar la solicitud.'));
    }
  };

  const revoke = async () => {
    if (!revokeTarget) {
      return;
    }

    setRevokeError(null);

    try {
      await revokeMutation.mutateAsync({
        vehicleId,
        userId: revokeTarget.userId,
      });
      setRevokeTarget(null);
      setNotice('Acceso revocado.');
    } catch (caught) {
      setRevokeError(errorMessage(caught, 'No se pudo revocar el acceso.'));
    }
  };

  return (
    <>
      <Modal
        animationType="fade"
        onRequestClose={close}
        transparent
        visible={visible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.backdrop}
        >
          <View style={[styles.card, { maxHeight: windowHeight * 0.85 }]}>
            <View style={styles.header}>
              <Text style={styles.title}>Compartir vehículo</Text>
              <IconButton
                accessibilityLabel="Cerrar"
                icon="close"
                onPress={close}
              />
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              style={styles.body}
            >
              <TextField
                autoCapitalize="none"
                autoCorrect={false}
                error={emailError ?? undefined}
                keyboardType="email-address"
                label="Correo electrónico"
                maxLength={254}
                onChangeText={(text) => {
                  setEmail(text);
                  setEmailError(null);
                  setError(null);
                }}
                placeholder="correo@ejemplo.cl"
                value={email}
              />

              <Button
                label="Enviar solicitud"
                loading={sendMutation.isPending}
                onPress={() => void send()}
              />

              <MessageBanner message={notice} tone="success" />
              <MessageBanner message={loadError ?? error} tone="error" />

              <Text style={styles.sectionTitle}>Solicitudes pendientes</Text>

              {pendingQuery.isLoading ? <ActivityIndicator /> : null}

              {!pendingQuery.isLoading && pending.length === 0 ? (
                <Text style={styles.empty}>No hay solicitudes pendientes.</Text>
              ) : null}

              {pending.map((item) => (
                <Card key={item.id} style={styles.row}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle}>{item.receiverEmail}</Text>
                    <Text style={styles.rowSubtitle}>
                      Enviada el {formatDisplayDate(item.sentAt, timezone)}
                    </Text>
                  </View>
                  <Button
                    disabled={cancelMutation.isPending}
                    label="Cancelar solicitud"
                    onPress={() => void cancel(item.id)}
                    variant="secondary"
                  />
                </Card>
              ))}

              <Text style={styles.sectionTitle}>Invitados</Text>

              {membersQuery.isLoading ? <ActivityIndicator /> : null}

              {!membersQuery.isLoading && members.length === 0 ? (
                <Text style={styles.empty}>No hay invitados.</Text>
              ) : null}

              {members.map((member) => (
                <Card key={member.userId} style={styles.row}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle}>{member.email}</Text>
                    <Text style={styles.rowSubtitle}>
                      Desde el {formatDisplayDate(member.assignedAt, timezone)}
                    </Text>
                  </View>
                  <Button
                    label="Revocar acceso"
                    onPress={() => {
                      setRevokeError(null);
                      setRevokeTarget(member);
                    }}
                    variant="danger"
                  />
                </Card>
              ))}
            </ScrollView>

            <View style={styles.footer}>
              <Button label="Cerrar" onPress={close} variant="secondary" />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        confirmLabel="Revocar acceso"
        error={revokeError}
        loading={revokeMutation.isPending}
        message={`¿Revocar el acceso de ${revokeTarget?.email ?? ''}?`}
        onCancel={() => {
          if (revokeMutation.isPending) {
            return;
          }

          setRevokeError(null);
          setRevokeTarget(null);
        }}
        onConfirm={() => void revoke()}
        title="Revocar acceso"
        visible={revokeTarget !== null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    ...shadow,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    flexShrink: 1,
    maxWidth: layout.modalMaxWidth,
    overflow: 'hidden',
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  body: {
    flexShrink: 1,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  footer: {
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...typography.title,
    fontSize: fontSizes.xl,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  empty: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  row: {
    gap: spacing.sm,
  },
  rowInfo: {
    gap: spacing.xxs,
  },
  rowTitle: {
    ...typography.body,
    color: colors.textPrimary,
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
