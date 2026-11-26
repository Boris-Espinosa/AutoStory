import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import { useBreakpoint } from '../hooks/useBreakpoint';
import { MessageBanner } from './MessageBanner';
import { TextField } from './TextField';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { IconButton } from './ui/IconButton';
import { ListRow } from './ui/ListRow';
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
  const { isWide } = useBreakpoint();

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
  const mutationPending =
    sendMutation.isPending ||
    cancelMutation.isPending ||
    revokeMutation.isPending;

  const close = () => {
    if (mutationPending) {
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

  const inviteForm = (
    <>
      <Text style={styles.sectionTitle}>Invitar a alguien</Text>

      <TextField
        autoCapitalize="none"
        autoCorrect={false}
        editable={!mutationPending}
        error={emailError ?? undefined}
        keyboardType="email-address"
        label="Correo electrónico"
        maxLength={254}
        onChangeText={(text) => {
          setEmail(text);
          setEmailError(null);
          setError(null);
          setNotice(null);
        }}
        onSubmitEditing={() => void send()}
        placeholder="correo@ejemplo.cl"
        value={email}
      />

      <Button
        disabled={mutationPending}
        label="Enviar solicitud"
        loading={sendMutation.isPending}
        onPress={() => void send()}
      />

      <Text style={styles.helpText}>
        La persona recibirá una notificación y deberá aceptar. Hasta entonces
        solo verá marca, modelo y año.
      </Text>

      <MessageBanner message={notice} tone="success" />
      <MessageBanner message={loadError ?? error} tone="error" />
    </>
  );

  const peopleList = (
    <>
      <Text style={styles.sectionTitle}>
        Personas con acceso ({pending.length + members.length})
      </Text>

      {pendingQuery.isLoading || membersQuery.isLoading ? (
        <ActivityIndicator />
      ) : null}

      {!pendingQuery.isLoading &&
      !membersQuery.isLoading &&
      !loadError &&
      pending.length === 0 &&
      members.length === 0 ? (
        <Text style={styles.empty}>
          Aún no compartiste este vehículo con nadie.
        </Text>
      ) : null}

      {pending.map((item) => (
        <Card key={item.id} style={styles.row}>
          <ListRow
            badge={
              <View style={styles.subtitleLine}>
                <Text numberOfLines={1} style={styles.subtitleText}>
                  {`Enviada el ${formatDisplayDate(item.sentAt, timezone)}`}
                </Text>
                <Badge
                  label="Pendiente"
                  style={styles.inlineBadge}
                  tone="info"
                />
              </View>
            }
            title={item.receiverEmail}
            trailing={
              <Pressable
                accessibilityRole="button"
                disabled={mutationPending}
                onPress={() => void cancel(item.id)}
                style={({ pressed }) => [
                  styles.compactButton,
                  styles.cancelButton,
                  pressed && !mutationPending && styles.pressed,
                  mutationPending && styles.disabled,
                ]}
              >
                <Text style={[styles.compactLabel, styles.cancelLabel]}>
                  Cancelar
                </Text>
              </Pressable>
            }
          />
        </Card>
      ))}

      {members.map((member) =>
        revokeTarget?.userId === member.userId ? (
          <Card key={member.userId} style={styles.row}>
            <View style={styles.confirm}>
              <Text style={styles.confirmText}>
                ¿Quitar el acceso a {member.email}?
              </Text>
              <MessageBanner message={revokeError} tone="error" />
              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={mutationPending}
                  onPress={() => void revoke()}
                  style={({ pressed }) => [
                    styles.compactButton,
                    styles.confirmButton,
                    pressed && !mutationPending && styles.pressed,
                    mutationPending && styles.disabled,
                  ]}
                >
                  <Text style={[styles.compactLabel, styles.confirmLabel]}>
                    Sí, revocar
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={mutationPending}
                  onPress={() => {
                    setRevokeError(null);
                    setRevokeTarget(null);
                  }}
                  style={({ pressed }) => [
                    styles.compactButton,
                    styles.cancelButton,
                    pressed && !mutationPending && styles.pressed,
                    mutationPending && styles.disabled,
                  ]}
                >
                  <Text style={[styles.compactLabel, styles.cancelLabel]}>
                    No
                  </Text>
                </Pressable>
              </View>
            </View>
          </Card>
        ) : (
          <Card key={member.userId} style={styles.row}>
            <ListRow
              badge={
                <View style={styles.subtitleLine}>
                  <Text numberOfLines={1} style={styles.subtitleText}>
                    {`Desde el ${formatDisplayDate(member.assignedAt, timezone)}`}
                  </Text>
                  <Badge
                    label="Invitado"
                    style={styles.inlineBadge}
                    tone="neutral"
                  />
                </View>
              }
              title={member.email}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  disabled={mutationPending}
                  onPress={() => {
                    setRevokeError(null);
                    setRevokeTarget(member);
                  }}
                  style={({ pressed }) => [
                    styles.compactButton,
                    styles.revokeButton,
                    pressed && !mutationPending && styles.pressed,
                    mutationPending && styles.disabled,
                  ]}
                >
                  <Text style={[styles.compactLabel, styles.revokeLabel]}>
                    Revocar
                  </Text>
                </Pressable>
              }
            />
          </Card>
        ),
      )}
    </>
  );

  return (
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
        <View
          style={[
            styles.card,
            isWide && styles.cardWide,
            { maxHeight: windowHeight * 0.85 },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Compartir vehículo</Text>
            <IconButton
              accessibilityLabel="Cerrar"
              disabled={mutationPending}
              icon="close"
              onPress={close}
            />
          </View>

          <View style={[styles.body, isWide && styles.bodyWide]}>
            {isWide ? (
              <>
                <ScrollView
                  contentContainerStyle={styles.columnContent}
                  keyboardShouldPersistTaps="handled"
                  style={styles.column}
                >
                  {inviteForm}
                </ScrollView>
                <ScrollView
                  contentContainerStyle={styles.columnContent}
                  keyboardShouldPersistTaps="handled"
                  style={styles.column}
                >
                  {peopleList}
                </ScrollView>
              </>
            ) : (
              <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                style={styles.column}
              >
                {inviteForm}
                {peopleList}
              </ScrollView>
            )}
          </View>

          <View style={styles.footer}>
            <Button
              disabled={mutationPending}
              label="Cerrar"
              onPress={close}
              style={styles.footerButton}
              variant="secondary"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  cardWide: {
    maxWidth: layout.detailMaxWidth,
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
  bodyWide: {
    flexDirection: 'row',
    gap: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  column: {
    flex: 1,
  },
  columnContent: {
    gap: spacing.md,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  footer: {
    alignItems: 'flex-end',
    borderTopColor: colors.border,
    borderTopWidth: layout.borderWidth,
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  footerButton: {
    minWidth: layout.buttonMinWidth,
    paddingHorizontal: spacing.lg,
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
  helpText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  subtitleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  subtitleText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  inlineBadge: {
    alignSelf: 'center',
  },
  row: {
    gap: spacing.sm,
  },
  compactButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: layout.borderWidth,
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    // parejo para Cancelar/Revocar sin quitarle espacio al correo en móvil
    minWidth: 96,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  cancelButton: {
    borderColor: colors.primary,
  },
  revokeButton: {
    borderColor: colors.danger,
  },
  confirmButton: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.6,
  },
  compactLabel: {
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  cancelLabel: {
    color: colors.primary,
  },
  revokeLabel: {
    color: colors.danger,
  },
  confirmLabel: {
    color: colors.primaryText,
  },
  confirm: {
    gap: spacing.md,
  },
  confirmText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
});
