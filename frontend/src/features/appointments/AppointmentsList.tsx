import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Appointment, useAppointments } from '../../api/appointments';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Fab } from '../../components/ui/Fab';
import { ListRow } from '../../components/ui/ListRow';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  colors,
  fontSizes,
  layout,
  spacing,
  tracking,
  typography,
} from '../../theme';
import {
  formatDayMonth,
  formatRelativeDay,
  formatTime24,
} from '../../utils/datetime';

export interface AppointmentsListProps {
  vehicleId?: string;
  showFab?: boolean;
}

function AppointmentRow({
  appointment,
  history,
}: {
  appointment: Appointment;
  history: boolean;
}) {
  const dayMonth = formatDayMonth(
    appointment.scheduledAt,
    appointment.timezone,
  );
  const time = formatTime24(appointment.scheduledAt, appointment.timezone);
  const subtitle = appointment.workshop
    ? `${appointment.workshop.name} · ${appointment.vehicle.licensePlate}`
    : appointment.vehicle.licensePlate;
  const statusLabel =
    appointment.status === 'COMPLETED' ? 'Completada' : 'Cancelada';
  const badgeLabel = history
    ? statusLabel
    : formatRelativeDay(appointment.scheduledAt, appointment.timezone);
  const badgeTone =
    history && appointment.status === 'CANCELLED' ? 'warning' : 'neutral';

  return (
    <ListRow
      accessibilityLabel={`${dayMonth.day} de ${dayMonth.month.toLowerCase()}, ${time}, ${appointment.reason}, ${subtitle}, ${badgeLabel}`}
      leading={
        <View style={styles.dayBlock}>
          <Text style={styles.day}>{dayMonth.day}</Text>
          <Text style={styles.month}>{dayMonth.month}</Text>
        </View>
      }
      onPress={() =>
        router.push({
          pathname: '/appointments/[appointmentId]',
          params: { appointmentId: appointment.id },
        })
      }
      subtitle={subtitle}
      title={appointment.reason}
      trailing={
        <View style={styles.trailing}>
          <Text style={styles.time}>{time}</Text>
          <Badge
            label={badgeLabel}
            style={styles.trailingBadge}
            tone={badgeTone}
          />
        </View>
      }
    />
  );
}

function AppointmentGroup({
  appointments,
  history = false,
}: {
  appointments: Appointment[];
  history?: boolean;
}) {
  return (
    <Card style={styles.listCard}>
      {appointments.map((appointment, index) => (
        <View
          key={appointment.id}
          style={index > 0 ? styles.rowBorder : undefined}
        >
          <AppointmentRow appointment={appointment} history={history} />
        </View>
      ))}
    </Card>
  );
}

/** Lista compartida entre la sección Citas y la pestaña Citas del vehículo. */
export function AppointmentsList({
  vehicleId,
  showFab = true,
}: AppointmentsListProps) {
  const upcomingQuery = useAppointments('upcoming', vehicleId);
  const overdueQuery = useAppointments('overdue', vehicleId);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const historyQuery = useAppointments('history', vehicleId, historyExpanded);
  const { size } = useBreakpoint();

  const upcoming =
    upcomingQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const overdue =
    overdueQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const history =
    historyQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const overdueTotal = overdueQuery.data?.pages[0]?.total ?? overdue.length;
  const historyTotal = historyQuery.data?.pages[0]?.total ?? 0;

  const openNewAppointment = () =>
    router.push({
      pathname: '/appointments/new',
      params: vehicleId ? { vehicleId } : {},
    });

  if (upcomingQuery.isLoading || overdueQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (upcomingQuery.isError || overdueQuery.isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          No se pudieron cargar las citas.
        </Text>
        <Button
          label="Reintentar"
          onPress={() => {
            void upcomingQuery.refetch();
            void overdueQuery.refetch();
          }}
          variant="secondary"
        />
      </View>
    );
  }

  return (
    <View style={styles.content}>
      {upcoming.length === 0 && overdue.length === 0 ? (
        <EmptyState
          action={{
            label: 'Programar cita',
            onPress: openNewAppointment,
          }}
          icon="calendar-outline"
          title="Aún no tienes citas programadas"
        />
      ) : null}

      {upcoming.length > 0 ? (
        <View style={styles.group}>
          <SectionHeader title="Próximas" />
          <AppointmentGroup appointments={upcoming} />
        </View>
      ) : null}

      {overdue.length > 0 ? (
        <View style={styles.group}>
          <SectionHeader
            badge={<Badge label={String(overdueTotal)} tone="warning" />}
            title="Sin cerrar"
          />
          <AppointmentGroup appointments={overdue} />
        </View>
      ) : null}

      <SectionHeader
        actionLabel={historyExpanded ? 'Ocultar' : 'Mostrar'}
        onAction={() => setHistoryExpanded((value) => !value)}
        title="Historial"
      />

      {historyExpanded ? (
        historyQuery.isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : historyQuery.isError ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>
              No se pudo cargar el historial de citas.
            </Text>
            <Button
              label="Reintentar"
              onPress={() => void historyQuery.refetch()}
              variant="secondary"
            />
          </View>
        ) : history.length === 0 ? (
          <Text style={styles.emptyHistory}>
            No hay citas en el historial.
          </Text>
        ) : (
          <>
            <AppointmentGroup appointments={history} history />
            {history.length < historyTotal ? (
              <Button
                label="Cargar más"
                loading={historyQuery.isFetchingNextPage}
                onPress={() => void historyQuery.fetchNextPage()}
                style={size === 'compact' ? undefined : styles.naturalButton}
                variant="secondary"
              />
            ) : null}
          </>
        )
      ) : null}

      {showFab ? (
        <Fab
          accessibilityLabel="Programar cita"
          bottomOffset={spacing.xxl}
          label={size === 'expanded' ? 'Programar cita' : undefined}
          onPress={openNewAppointment}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: layout.fabSize + spacing.xxl,
  },
  group: {
    gap: spacing.sm,
  },
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
  emptyHistory: {
    ...typography.body,
    color: colors.textSecondary,
  },
  listCard: {
    paddingVertical: spacing.none,
  },
  rowBorder: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: layout.borderWidth,
  },
  dayBlock: {
    alignItems: 'center',
    minWidth: layout.touchTarget,
  },
  day: {
    color: colors.textPrimary,
    fontSize: fontSizes.display,
    fontWeight: '800',
  },
  month: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: '700',
    letterSpacing: tracking.wide,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  time: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  trailingBadge: {
    alignSelf: 'flex-end',
  },
  naturalButton: {
    alignSelf: 'center',
    maxWidth: layout.buttonMaxWidth,
  },
});
