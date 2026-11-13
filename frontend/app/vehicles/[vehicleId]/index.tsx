import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { resolvePhotoUrl, ApiError } from '../../../src/api/client';
import { useAppointments } from '../../../src/api/appointments';
import {
  useExpensesSummary,
  useLatestMaintenances,
} from '../../../src/api/maintenances';
import {
  Vehicle,
  uploadVehiclePhoto,
  useDeleteVehicle,
  useVehicles,
  vehiclesQueryKey,
} from '../../../src/api/vehicles';
import { MessageBanner } from '../../../src/components/MessageBanner';
import { AppHeader } from '../../../src/components/ui/AppHeader';
import { Badge } from '../../../src/components/ui/Badge';
import { Button } from '../../../src/components/ui/Button';
import { Card } from '../../../src/components/ui/Card';
import { ConfirmModal } from '../../../src/components/ui/ConfirmModal';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Icon } from '../../../src/components/ui/Icon';
import { ListRow } from '../../../src/components/ui/ListRow';
import { OverflowMenu } from '../../../src/components/ui/OverflowMenu';
import { Screen } from '../../../src/components/ui/Screen';
import { SectionHeader } from '../../../src/components/ui/SectionHeader';
import { SegmentedTabs } from '../../../src/components/ui/SegmentedTabs';
import { AppointmentsList } from '../../../src/features/appointments/AppointmentsList';
import { MaintenancesTab } from '../../../src/features/vehicle/MaintenancesTab';
import { PartsTab } from '../../../src/features/vehicle/PartsTab';
import { useBreakpoint } from '../../../src/hooks/useBreakpoint';
import {
  colors,
  fontSizes,
  layout,
  radius,
  spacing,
  typography,
} from '../../../src/theme';
import {
  formatDayMonth,
  formatRelativeDay,
  formatTime24,
} from '../../../src/utils/datetime';
import {
  formatChileanAmount,
  isoDateToDisplay,
} from '../../../src/utils/format';
import { photoUploadErrorMessage } from '../../../src/utils/photo';

const DELETE_WARNING =
  'Se eliminará el vehículo y todo su historial. Esta acción no se puede deshacer.';
const FLASH_DURATION_MS = 5000;

const TABS = [
  { key: 'summary', label: 'Resumen' },
  { key: 'maintenances', label: 'Mantenciones' },
  { key: 'parts', label: 'Repuestos' },
  { key: 'appointments', label: 'Citas' },
];

type TabKey = 'summary' | 'maintenances' | 'parts' | 'appointments';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

function SummaryTab({
  vehicle,
  isWide,
  onShowAllMaintenances,
}: {
  vehicle: Vehicle;
  isWide: boolean;
  onShowAllMaintenances: () => void;
}) {
  const summaryQuery = useExpensesSummary(vehicle.id);
  const latestQuery = useLatestMaintenances(vehicle.id);
  const appointmentsQuery = useAppointments('upcoming', vehicle.id);
  const summary = summaryQuery.data;
  const maintenances = latestQuery.data?.items ?? [];
  const nextAppointment = appointmentsQuery.data?.pages[0]?.items[0] ?? null;
  const isLoading =
    summaryQuery.isLoading ||
    latestQuery.isLoading ||
    appointmentsQuery.isLoading;
  const isError =
    summaryQuery.isError || latestQuery.isError || appointmentsQuery.isError;

  const retry = () => {
    void summaryQuery.refetch();
    void latestQuery.refetch();
    void appointmentsQuery.refetch();
  };

  const openNewAppointment = () =>
    router.push({
      pathname: '/appointments/new',
      params: { vehicleId: vehicle.id },
    });

  const openAppointment = (appointmentId: string) =>
    router.push({
      pathname: '/appointments/[appointmentId]',
      params: { appointmentId },
    });

  const openNewMaintenance = () =>
    router.push({
      pathname: '/vehicles/[vehicleId]/maintenances/new',
      params: { vehicleId: vehicle.id },
    });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          No se pudo cargar el resumen del vehículo.
        </Text>
        <Button label="Reintentar" onPress={retry} variant="secondary" />
      </View>
    );
  }

  const nextDayMonth = nextAppointment
    ? formatDayMonth(nextAppointment.scheduledAt, nextAppointment.timezone)
    : null;
  const nextTime = nextAppointment
    ? formatTime24(nextAppointment.scheduledAt, nextAppointment.timezone)
    : null;
  const nextRelative = nextAppointment
    ? formatRelativeDay(nextAppointment.scheduledAt, nextAppointment.timezone)
    : null;

  return (
    <View style={styles.tabContent}>
      <Card style={styles.totalCard}>
        <Text style={styles.totalLabel}>Gasto total</Text>
        <Text style={styles.totalValue}>
          ${formatChileanAmount(String(summary?.grandTotal ?? 0))}
        </Text>
        <Text style={styles.totalBreakdown}>
          Repuestos ${formatChileanAmount(String(summary?.partsTotal ?? 0))} ·{' '}
          Mano de obra ${formatChileanAmount(String(summary?.laborTotal ?? 0))}
        </Text>
      </Card>

      <View style={styles.statsRow}>
        <Stat
          label="Mantenciones"
          value={String(summary?.maintenanceCount ?? 0)}
        />
        <Stat label="Repuestos" value={String(summary?.partsCount ?? 0)} />
        <Stat
          label="Kilometraje"
          value={`${formatChileanAmount(String(vehicle.currentMileage))} km`}
        />
      </View>

      <Card
        accessibilityLabel={
          nextAppointment
            ? `Próxima cita: ${nextAppointment.reason}`
            : undefined
        }
        onPress={
          nextAppointment
            ? () => openAppointment(nextAppointment.id)
            : undefined
        }
        style={styles.nextCard}
      >
        <Text style={styles.nextLabel}>Próxima cita</Text>

        {nextAppointment && nextDayMonth && nextTime && nextRelative ? (
          <View style={styles.nextRow}>
            <View style={styles.nextInfo}>
              <Text style={styles.nextDate}>
                {nextDayMonth.day} {nextDayMonth.month.toLowerCase()} ·{' '}
                {nextTime}
              </Text>
              <Text numberOfLines={1} style={styles.nextReason}>
                {nextAppointment.reason}
              </Text>
            </View>
            <Badge label={nextRelative} />
          </View>
        ) : (
          <View style={styles.nextRow}>
            <Text style={styles.nextEmpty}>Sin citas próximas</Text>
            <Pressable
              accessibilityLabel="Programar cita"
              accessibilityRole="link"
              onPress={openNewAppointment}
              style={styles.linkTarget}
            >
              <Text style={styles.link}>Programar cita</Text>
            </Pressable>
          </View>
        )}
      </Card>

      <SectionHeader title="Acciones rápidas" />

      <View style={[styles.quickActions, isWide && styles.quickActionsWide]}>
        <Button
          label="Registrar mantención"
          onPress={openNewMaintenance}
          variant="secondary"
        />
        <Button
          label="Añadir repuesto"
          onPress={() =>
            router.push({
              pathname: '/vehicles/[vehicleId]/parts/new',
              params: { vehicleId: vehicle.id },
            })
          }
          variant="secondary"
        />
      </View>

      <SectionHeader
        actionLabel="Ver todas"
        onAction={onShowAllMaintenances}
        title="Últimas mantenciones"
      />

      {maintenances.length === 0 ? (
        <View style={styles.emptyState}>
          <EmptyState
            icon="construct-outline"
            title="Aún no hay mantenciones"
          />
          <Button
            label="Registrar mantención"
            onPress={openNewMaintenance}
            style={isWide ? styles.naturalButton : undefined}
            variant="secondary"
          />
        </View>
      ) : (
        <Card style={styles.latestCard}>
          {maintenances.map((maintenance, index) => (
            <View
              key={maintenance.id}
              style={index > 0 ? styles.latestRowBorder : undefined}
            >
              <ListRow
                onPress={() =>
                  router.push({
                    pathname:
                      '/vehicles/[vehicleId]/maintenances/[maintenanceId]',
                    params: {
                      vehicleId: vehicle.id,
                      maintenanceId: maintenance.id,
                      tab: 'summary',
                    },
                  })
                }
                subtitle={[
                  isoDateToDisplay(maintenance.serviceDate),
                  maintenance.workshop?.name,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                title={maintenance.description}
                value={`$${formatChileanAmount(String(maintenance.totalCost))}`}
              />
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

export default function VehicleDetailScreen() {
  const params = useLocalSearchParams<{
    vehicleId?: string | string[];
    tab?: string | string[];
    flash?: string | string[];
  }>();
  const vehicleId = Array.isArray(params.vehicleId)
    ? params.vehicleId[0] ?? ''
    : params.vehicleId ?? '';
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const activeTab: TabKey =
    tabParam === 'maintenances' ||
    tabParam === 'parts' ||
    tabParam === 'appointments'
      ? tabParam
      : 'summary';

  const queryClient = useQueryClient();
  const vehiclesQuery = useVehicles();
  const vehicle =
    vehiclesQuery.data?.find((item) => item.id === vehicleId) ?? null;
  const deleteMutation = useDeleteVehicle();
  const { isWide } = useBreakpoint();

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const flashParam = Array.isArray(params.flash) ? params.flash[0] : params.flash;

  useEffect(() => {
    if (!flashParam) {
      return;
    }

    setFlash(flashParam);
    router.setParams({ flash: '' });
  }, [flashParam]);

  useEffect(() => {
    if (!flash) {
      return;
    }

    const timer = setTimeout(() => setFlash(null), FLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  };

  const changeTab = (tab: string) => {
    router.setParams({ tab });
  };

  const confirmDelete = async () => {
    setDeleteError(null);

    try {
      await deleteMutation.mutateAsync(vehicleId);
    } catch (error) {
      setDeleteError(
        error instanceof ApiError
          ? error.message
          : 'No se pudo eliminar el vehículo. Intenta nuevamente.',
      );
      return;
    }

    setConfirmVisible(false);
    await queryClient.invalidateQueries({ queryKey: vehiclesQueryKey });
    router.replace({
      pathname: '/',
      params: { flash: 'Vehículo eliminado', flashTone: 'success' },
    });
  };

  const photoUri = vehicle?.photoUrl ? resolvePhotoUrl(vehicle.photoUrl) : null;

  const retryPhoto = async () => {
    if (!vehicle) {
      return;
    }

    setPhotoError(null);

    let asset: ImagePicker.ImagePickerAsset;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      asset = result.assets[0];
    } catch {
      setPhotoError('No se pudo abrir la galería');
      return;
    }

    setPhotoUploading(true);

    try {
      await uploadVehiclePhoto(vehicle.id, {
        uri: asset.uri,
        name: asset.fileName || 'foto.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
      setPhotoFailed(false);
      await queryClient.invalidateQueries({ queryKey: vehiclesQueryKey });
      setFlash('Foto actualizada');
    } catch (error) {
      setPhotoError(photoUploadErrorMessage(error));
    } finally {
      setPhotoUploading(false);
    }
  };

  return (
    <Screen maxWidth={layout.detailMaxWidth} scroll>
      <Head>
        <title>{`${vehicle?.licensePlate ?? 'Vehículo'} · AutoStory`}</title>
      </Head>

      <AppHeader
        onBack={goBack}
        rightAction={
          vehicle?.role === 'OWNER' ? (
            <OverflowMenu
              items={[
                {
                  key: 'delete',
                  label: 'Eliminar vehículo',
                  icon: 'trash-outline',
                  danger: true,
                  onPress: () => {
                    setDeleteError(null);
                    setConfirmVisible(true);
                  },
                },
              ]}
            />
          ) : undefined
        }
        title={vehicle?.licensePlate ?? 'Vehículo'}
      />

      <MessageBanner message={flash} tone="success" />

      {vehiclesQuery.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {vehiclesQuery.isError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            No se pudo cargar el vehículo.
          </Text>
          <Button
            label="Reintentar"
            onPress={() => void vehiclesQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}

      {!vehiclesQuery.isLoading && !vehiclesQuery.isError && !vehicle ? (
        <MessageBanner message="No se encontró el vehículo." tone="error" />
      ) : null}

      {vehicle ? (
        <>
          <View style={[styles.hero, isWide && styles.heroWide]}>
            {photoUri && !photoFailed ? (
              <Image
                onError={() => setPhotoFailed(true)}
                resizeMode="cover"
                source={{ uri: photoUri }}
                style={[styles.heroPhoto, isWide && styles.heroPhotoWide]}
              />
            ) : (
              <View
                style={[
                  styles.heroPhoto,
                  styles.heroPlaceholder,
                  isWide && styles.heroPhotoWide,
                ]}
              >
                <Icon
                  color={colors.textSecondary}
                  name="car-outline"
                  size={48}
                />
              </View>
            )}

            <View style={styles.heroInfo}>
              <Text style={styles.heroTitle}>
                {vehicle.brand} {vehicle.model} · {vehicle.year}
              </Text>

              <View style={styles.chips}>
                <Badge
                  label={`${formatChileanAmount(
                    String(vehicle.currentMileage),
                  )} km`}
                />
                {vehicle.vin ? (
                  <Badge label={`VIN ···${vehicle.vin.slice(-6)}`} />
                ) : null}
                {vehicle.role === 'GUEST' ? (
                  <Badge label="Invitado" tone="info" />
                ) : null}
              </View>
            </View>
          </View>

          {vehicle.role === 'OWNER' && (!photoUri || photoFailed) ? (
            <Button
              label="Subir foto"
              loading={photoUploading}
              onPress={() => void retryPhoto()}
              style={styles.photoAction}
              variant="secondary"
            />
          ) : null}

          <MessageBanner message={photoError} tone="error" />

          <SegmentedTabs
            activeKey={activeTab}
            items={TABS}
            onChange={changeTab}
          />

          {activeTab === 'summary' ? (
            <SummaryTab
              isWide={isWide}
              onShowAllMaintenances={() => changeTab('maintenances')}
              vehicle={vehicle}
            />
          ) : null}

          {activeTab === 'maintenances' ? (
            <MaintenancesTab vehicleId={vehicle.id} />
          ) : null}

          {activeTab === 'parts' ? <PartsTab vehicleId={vehicle.id} /> : null}

          {activeTab === 'appointments' ? (
            <AppointmentsList vehicleId={vehicle.id} />
          ) : null}
        </>
      ) : null}

      <ConfirmModal
        error={deleteError}
        loading={deleteMutation.isPending}
        message={DELETE_WARNING}
        onCancel={() => {
          if (deleteMutation.isPending) {
            return;
          }

          setDeleteError(null);
          setConfirmVisible(false);
        }}
        onConfirm={() => void confirmDelete()}
        title="Eliminar vehículo"
        visible={confirmVisible}
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
    gap: spacing.lg,
  },
  heroWide: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  heroPhoto: {
    borderRadius: radius.lg,
    height: layout.heroPhotoHeight,
    width: '100%',
  },
  heroPhotoWide: {
    flexShrink: 0,
    width: layout.heroPhotoWideWidth,
  },
  heroPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.neutralBackground,
    justifyContent: 'center',
  },
  heroInfo: {
    flex: 1,
    gap: spacing.sm,
  },
  photoAction: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },
  heroTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tabContent: {
    gap: spacing.md,
  },
  totalCard: {
    gap: spacing.xs,
  },
  totalLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  totalValue: {
    color: colors.primaryDark,
    fontSize: fontSizes.hero,
    fontWeight: '800',
  },
  totalBreakdown: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  statValue: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  nextCard: {
    gap: spacing.xs,
  },
  nextLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  nextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  nextInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  nextDate: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  nextReason: {
    ...typography.body,
    color: colors.textSecondary,
  },
  nextEmpty: {
    ...typography.body,
    color: colors.textSecondary,
  },
  linkTarget: {
    justifyContent: 'center',
    minHeight: layout.touchTarget,
  },
  link: {
    color: colors.primary,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  quickActions: {
    gap: spacing.sm,
  },
  quickActionsWide: {
    flexDirection: 'row',
  },
  naturalButton: {
    alignSelf: 'center',
    maxWidth: layout.buttonMaxWidth,
  },
  emptyState: {
    gap: spacing.sm,
  },
  latestCard: {
    paddingVertical: spacing.none,
  },
  latestRowBorder: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: layout.borderWidth,
  },
});
