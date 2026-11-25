import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ApiError } from '../../../api/client';
import {
  useAcceptSharingRequest,
  useRejectSharingRequest,
  useSharingRequest,
} from '../../../api/sharing';
import { MessageBanner } from '../../../components/MessageBanner';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import {
  colors,
  fontSizes,
  layout,
  radius,
  shadow,
  spacing,
  typography,
} from '../../../theme';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export interface SharingRequestModalProps {
  requestId: string;
  onClose: () => void;
}

export function SharingRequestModal({
  requestId,
  onClose,
}: SharingRequestModalProps) {
  const requestQuery = useSharingRequest(requestId);
  const acceptMutation = useAcceptSharingRequest();
  const rejectMutation = useRejectSharingRequest();
  const [error, setError] = useState<string | null>(null);

  const detail = requestQuery.data;
  const busy = acceptMutation.isPending || rejectMutation.isPending;
  const queryError = requestQuery.isError
    ? requestQuery.error instanceof ApiError && requestQuery.error.status === 409
      ? 'Ya respondiste esta solicitud'
      : requestQuery.error instanceof ApiError && requestQuery.error.status === 404
        ? 'La solicitud ya no está disponible'
        : 'No se pudo cargar la solicitud.'
    : null;

  const close = () => {
    if (!busy) {
      onClose();
    }
  };

  const respond = async (accept: boolean) => {
    setError(null);

    try {
      if (accept) {
        await acceptMutation.mutateAsync(requestId);
      } else {
        await rejectMutation.mutateAsync(requestId);
      }

      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'No se pudo responder la solicitud.',
      );
    }
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={close}
      transparent
      visible
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>Solicitud de compartir</Text>

            {requestQuery.isLoading ? <ActivityIndicator /> : null}

            {queryError ? (
              <>
                <MessageBanner message={queryError} tone="error" />
                <Button
                  disabled={busy}
                  label="Cerrar"
                  onPress={close}
                  variant="secondary"
                />
              </>
            ) : (
              <>
                <MessageBanner message={error} tone="error" />

                {detail ? (
                  <>
                    <Card style={styles.detailCard}>
                      <DetailRow label="Marca" value={detail.vehicle.brand} />
                      <DetailRow label="Modelo" value={detail.vehicle.model} />
                      <DetailRow
                        label="Año"
                        value={String(detail.vehicle.year)}
                      />
                      <DetailRow label="Emisor" value={detail.senderName} />
                    </Card>

                    {detail.status === 'PENDING' ? (
                      <>
                        <Button
                          disabled={busy}
                          label="Aceptar"
                          loading={acceptMutation.isPending}
                          onPress={() => void respond(true)}
                        />
                        <Button
                          disabled={busy}
                          label="Rechazar"
                          loading={rejectMutation.isPending}
                          onPress={() => void respond(false)}
                          variant="danger"
                        />
                      </>
                    ) : (
                      <Text style={styles.responded}>
                        Ya respondiste esta solicitud
                      </Text>
                    )}
                  </>
                ) : null}

                <Button
                  disabled={busy}
                  label="Cerrar"
                  onPress={close}
                  variant="secondary"
                />
              </>
            )}
          </ScrollView>
        </View>
      </View>
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
    maxHeight: '85%',
    width: '100%',
    maxWidth: layout.modalMaxWidth,
  },
  content: {
    gap: spacing.md,
    padding: spacing.xl,
  },
  title: {
    ...typography.title,
    fontSize: fontSizes.xl,
  },
  detailCard: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.xxs,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  value: {
    ...typography.body,
    color: colors.textPrimary,
  },
  responded: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
