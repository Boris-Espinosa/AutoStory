import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  reminderLabel,
  useAppointment,
  useCancelAppointment,
  useCompleteAppointment,
} from '../../src/api/appointments';
import { ApiError, CURRENT_USER_ID } from '../../src/api/client';
import { AppHeader } from '../../src/components/ui/AppHeader';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { ConfirmModal } from '../../src/components/ui/ConfirmModal';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ListRow } from '../../src/components/ui/ListRow';
import { OverflowMenu } from '../../src/components/ui/OverflowMenu';
import { Screen } from '../../src/components/ui/Screen';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { MessageBanner } from '../../src/components/MessageBanner';
import {
  colors,
  fontSizes,
  layout,
  spacing,
  typography,
} from '../../src/theme';
import {
  formatDisplayDate,
  formatLongDate,
  formatRelativeDay,
  formatTime24,
} from '../../src/utils/datetime';

export default function AppointmentDetailScreen() {
  const params = useLocalSearchParams<{
    appointmentId?: string | string[];
    flash?: string | string[];
  }>();
  const appointmentId = Array.isArray(params.appointmentId)
    ? params.appointmentId[0] ?? ''
    : params.appointmentId ?? '';
  const flashParam = Array.isArray(params.flash)
    ? params.flash[0]
    : params.flash;

  const appointmentQuery = useAppointment(appointmentId || null);
  const cancelMutation = useCancelAppointment(appointmentId);
  const completeMutation = useCompleteAppointment(appointmentId);

  const [flash, setFlash] = useState<string | null>(null);
  const [cancelVisible, setCancelVisible] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!flashParam) {
      return;
    }

    setFlash(flashParam);
    router.setParams({ flash: '' });
  }, [flashParam]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/appointments');
  };

  const appointment = appointmentQuery.data;
  const status = appointment?.status ?? 'SCHEDULED';
  const isOverdue =
    status === 'SCHEDULED' &&
    Boolean(appointment) &&
    new Date(appointment!.scheduledAt).getTime() < Date.now();

  const statusLabel =
    status === 'COMPLETED'
      ? 'Completada'
      : status === 'CANCELLED'
        ? 'Cancelada'
        : isOverdue
          ? 'Sin cerrar'
          : 'Programada';
  const statusTone =
    status === 'CANCELLED' || isOverdue
      ? 'warning'
      : status === 'COMPLETED'
        ? 'neutral'
        : 'info';

  const createdBy = appointment?.createdBy;
  const createdByLabel = !createdBy
    ? 'Otro usuario'
    : createdBy.id === CURRENT_USER_ID
      ? 'Tú'
      : createdBy.name ?? 'Otro usuario';

  const openCancelModal = () => {
    setCancelError(null);
    setCancelVisible(true);
  };

  const closeCancelModal = () => {
    if (cancelMutation.isPending) {
      return;
    }

    setCancelError(null);
    setCancelVisible(false);
  };

  const confirmCancel = async () => {
    setCancelError(null);

    try {
      await cancelMutation.mutateAsync();
      setCancelVisible(false);
      setFlash('Cita cancelada');
    } catch (error) {
      setCancelError(
        error instanceof ApiError
          ? error.message
          : 'No se pudo cancelar la cita. Intenta nuevamente.',
      );
    }
  };

  const completeAppointment = async () => {
    setActionError(null);

    try {
      await completeMutation.mutateAsync();
      setFlash('Cita completada');
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : 'No se pudo completar la cita. Intenta nuevamente.',
      );
    }
  };

  const openMaintenance = () => {
    if (!appointment) {
      return;
    }

    router.push({
      pathname: '/vehicles/[vehicleId]/maintenances/new',
      params: {
        vehicleId: appointment.vehicle.id,
        appointmentId: appointment.id,
      },
    });
  };

  const openLinkedMaintenance = () => {
    if (!appointment?.maintenanceId) {
      return;
    }

    router.push({
      pathname: '/vehicles/[vehicleId]/maintenances/[maintenanceId]',
      params: {
        vehicleId: appointment.vehicle.id,
        maintenanceId: appointment.maintenanceId,
        tab: 'maintenances',
      },
    });
  };

  const callWorkshop = (phone: string) => {
    void Linking.openURL(`tel:${phone}`);
  };

  if (appointmentQuery.isLoading) {
    return (
      <Screen maxWidth={layout.detailMaxWidth} scroll>
        <Head>
          <title>Cita · AutoStory</title>
        </Head>
        <AppHeader onBack={goBack} title="Cita" />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (appointmentQuery.isError) {
    const notFound =
      appointmentQuery.error instanceof ApiError &&
      appointmentQuery.error.status === 404;

    return (
      <Screen maxWidth={layout.detailMaxWidth} scroll>
        <Head>
          <title>Cita · AutoStory</title>
        </Head>
        <AppHeader onBack={goBack} title="Cita" />

        {notFound ? (
          <EmptyState
            action={{ label: 'Volver', onPress: goBack }}
            icon="calendar-outline"
            title="Esta cita ya no existe"
          />
        ) : (
          <View style={styles.centered}>
            <Text style={styles.errorText}>No se pudo cargar la cita.</Text>
            <Button
              label="Reintentar"
              onPress={() => void appointmentQuery.refetch()}
              variant="secondary"
            />
          </View>
        )}
      </Screen>
    );
  }

  if (!appointment) {
    return null;
  }

  const day = formatDisplayDate(
    appointment.scheduledAt,
    appointment.timezone,
  );
  const time = formatTime24(appointment.scheduledAt, appointment.timezone);
  const longDate = formatLongDate(
    appointment.scheduledAt,
    appointment.timezone,
  );
  const relative = formatRelativeDay(
    appointment.scheduledAt,
    appointment.timezone,
  );
  const vehicleLabel = `${appointment.vehicle.brand} ${appointment.vehicle.model} · ${appointment.vehicle.licensePlate}`;
  const workshop = appointment.workshop;
  const canOpenActions =
    appointment.canEdit && appointment.status === 'SCHEDULED';

  return (
    <Screen maxWidth={layout.detailMaxWidth} scroll>
      <Head>
        <title>{`${appointment.reason} · AutoStory`}</title>
      </Head>

      <AppHeader
        onBack={goBack}
        rightAction={
          canOpenActions ? (
            <OverflowMenu
              items={[
                {
                  key: 'edit',
                  label: 'Editar',
                  icon: 'create-outline',
                  onPress: () =>
                    router.push({
                      pathname: '/appointments/[appointmentId]/edit',
                      params: { appointmentId: appointment.id },
                    }),
                },
                {
                  key: 'cancel',
                  label: 'Cancelar cita',
                  icon: 'close-circle-outline',
                  danger: true,
                  onPress: openCancelModal,
                },
              ]}
            />
          ) : undefined
        }
        title={appointment.reason}
      />

      <MessageBanner message={flash} tone="success" />
      <MessageBanner message={actionError} tone="error" />

      <Card style={styles.hero}>
        <Text style={styles.heroDate}>{longDate}</Text>

        <View style={styles.heroRow}>
          <Text style={styles.heroTime}>{time}</Text>
          <Badge label={statusLabel} tone={statusTone} />
        </View>

        <Text style={styles.heroRelative}>
          {day} · {relative}
        </Text>
      </Card>

      <Card style={styles.listCard}>
        <ListRow
          chevron
          onPress={() =>
            router.push({
              pathname: '/vehicles/[vehicleId]',
              params: { vehicleId: appointment.vehicle.id },
            })
          }
          subtitle="Vehículo"
          title={vehicleLabel}
        />

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Programada por</Text>
          <Text style={styles.rowValue}>{createdByLabel}</Text>
        </View>
      </Card>

      {workshop ? (
        <Card style={styles.card}>
          <Text style={styles.blockLabel}>Taller</Text>
          <Text style={styles.blockText}>{workshop.name}</Text>

          {workshop.address ? (
            <Text style={styles.blockMeta}>{workshop.address}</Text>
          ) : null}

          {workshop.phone ? (
            Platform.OS === 'web' ? (
              <Text style={styles.blockMeta}>{workshop.phone}</Text>
            ) : (
              <Pressable
                accessibilityLabel={`Llamar al taller ${workshop.name}`}
                accessibilityRole="link"
                onPress={() => callWorkshop(workshop.phone as string)}
                style={styles.phoneTarget}
              >
                <Text style={styles.phone}>{workshop.phone}</Text>
              </Pressable>
            )
          ) : null}
        </Card>
      ) : null}

      {appointment.notes ? (
        <Card style={styles.card}>
          <Text style={styles.blockLabel}>Observaciones</Text>
          <Text style={styles.blockText}>{appointment.notes}</Text>
        </Card>
      ) : null}

      <SectionHeader title="Recordatorios" />

      <Card style={styles.listCard}>
        {appointment.reminders.length === 0 ? (
          <Text style={styles.emptyText}>Sin recordatorios</Text>
        ) : (
          appointment.reminders.map((reminder, index) => (
            <View
              key={reminder.offsetMinutes}
              style={index > 0 ? styles.reminderBorder : undefined}
            >
              <ListRow
                subtitle={`${formatDisplayDate(
                  reminder.remindAt,
                  appointment.timezone,
                )} · ${formatTime24(
                  reminder.remindAt,
                  appointment.timezone,
                )}`}
                title={reminderLabel(reminder.offsetMinutes)}
                trailing={
                  <Badge
                    label={reminder.processed ? 'Enviado' : 'Pendiente'}
                    tone={reminder.processed ? 'neutral' : 'info'}
                  />
                }
              />
            </View>
          ))
        )}
      </Card>

      {isOverdue && appointment.canEdit ? (
        <View style={styles.actions}>
          <Button label="Registrar mantención" onPress={openMaintenance} />
          <Button
            label="Marcar como completada"
            loading={completeMutation.isPending}
            onPress={() => void completeAppointment()}
            variant="secondary"
          />
        </View>
      ) : null}

      {appointment.status === 'COMPLETED' && appointment.maintenanceId ? (
        <Card style={styles.listCard}>
          <ListRow
            chevron
            onPress={openLinkedMaintenance}
            subtitle="Ver detalle"
            title="Mantención asociada"
          />
        </Card>
      ) : null}

      <ConfirmModal
        cancelLabel="Volver"
        confirmLabel="Cancelar cita"
        error={cancelError}
        loading={cancelMutation.isPending}
        message="La cita se cancelará y se descartarán sus recordatorios"
        onCancel={closeCancelModal}
        onConfirm={() => void confirmCancel()}
        title="Cancelar cita"
        visible={cancelVisible}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    gap: spacing.lg,
    justifyContent: 'center',
    minHeight: layout.emptyMinHeight,
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.dangerText,
    textAlign: 'center',
  },
  hero: {
    gap: spacing.sm,
  },
  heroDate: {
    ...typography.subtitle,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  heroRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  heroTime: {
    color: colors.textPrimary,
    fontSize: fontSizes.hero,
    fontWeight: '800',
  },
  heroRelative: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    gap: spacing.sm,
  },
  listCard: {
    paddingVertical: spacing.none,
  },
  divider: {
    backgroundColor: colors.borderSubtle,
    height: layout.hairline,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: layout.touchTarget + spacing.md,
    paddingVertical: spacing.md,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  rowValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  blockLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  blockText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  blockMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  phoneTarget: {
    justifyContent: 'center',
    minHeight: layout.touchTarget,
  },
  phone: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  reminderBorder: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: layout.borderWidth,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
