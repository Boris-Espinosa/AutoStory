import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { API_BASE_URL, ApiError } from '../../../src/api/client';
import {
  useExpensesSummary,
  useLatestMaintenances,
} from '../../../src/api/maintenances';
import {
  Vehicle,
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
  formatChileanAmount,
  isoDateToDisplay,
} from '../../../src/utils/format';

const DELETE_WARNING =
  'Se eliminará el vehículo y todo su historial. Esta acción no se puede deshacer.';
const FLASH_DURATION_MS = 5000;

const TABS = [
  { key: 'summary', label: 'Resumen' },
  { key: 'maintenances', label: 'Mantenciones' },
  { key: 'parts', label: 'Repuestos' },
];

type TabKey = 'summary' | 'maintenances' | 'parts';

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
  const summary = summaryQuery.data;
  const maintenances = latestQuery.data?.items ?? [];
  const isLoading = summaryQuery.isLoading || latestQuery.isLoading;
  const isError = summaryQuery.isError || latestQuery.isError;

  const retry = () => {
    void summaryQuery.refetch();
    void latestQuery.refetch();
  };

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

      <SectionHeader title="Acciones rápidas" />

      <View style={[styles.quickActions, isWide && styles.quickActionsWide]}>
        <Button
          label="Registrar mantención"
          onPress={openNewMaintenance}
          style={isWide ? styles.quickAction : undefined}
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
          style={isWide ? styles.quickAction : undefined}
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
    tabParam === 'maintenances' || tabParam === 'parts' ? tabParam : 'summary';

  const queryClient = useQueryClient();
  const vehiclesQuery = useVehicles();
  const vehicle =
    vehiclesQuery.data?.find((item) => item.id === vehicleId) ?? null;
  const deleteMutation = useDeleteVehicle();
  const { isWide } = useBreakpoint();

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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

  const photoUri = vehicle?.photoUrl
    ? `${API_BASE_URL}${vehicle.photoUrl}`
    : null;

  return (
    <Screen maxWidth={layout.detailMaxWidth} scroll>
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
            {photoUri ? (
              <Image
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
  quickActions: {
    gap: spacing.sm,
  },
  quickActionsWide: {
    flexDirection: 'row',
  },
  quickAction: {
    flex: 1,
  },
  emptyState: {
    gap: spacing.sm,
  },
  latestCard: {
    paddingVertical: spacing.none,
  },
  latestRowBorder: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: 1,
  },
});
