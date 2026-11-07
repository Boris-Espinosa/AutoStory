import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ApiError, CURRENT_USER_ID } from '../../../../src/api/client';
import {
  useDeleteMaintenance,
  useMaintenance,
} from '../../../../src/api/maintenances';
import { useVehicles } from '../../../../src/api/vehicles';
import { useWorkshops } from '../../../../src/api/workshops';
import { AppHeader } from '../../../../src/components/ui/AppHeader';
import { Button } from '../../../../src/components/ui/Button';
import { Card } from '../../../../src/components/ui/Card';
import { ConfirmModal } from '../../../../src/components/ui/ConfirmModal';
import { ListRow } from '../../../../src/components/ui/ListRow';
import { OverflowMenu } from '../../../../src/components/ui/OverflowMenu';
import { Screen } from '../../../../src/components/ui/Screen';
import { colors, layout, spacing, typography } from '../../../../src/theme';
import {
  formatChileanAmount,
  isoDateToDisplay,
} from '../../../../src/utils/format';

function formatAmount(value: number): string {
  return `$${formatChileanAmount(String(value))}`;
}

export default function MaintenanceDetailScreen() {
  const params = useLocalSearchParams<{
    vehicleId?: string | string[];
    maintenanceId?: string | string[];
    tab?: string | string[];
  }>();
  const vehicleId = Array.isArray(params.vehicleId)
    ? params.vehicleId[0] ?? ''
    : params.vehicleId ?? '';
  const maintenanceId = Array.isArray(params.maintenanceId)
    ? params.maintenanceId[0] ?? ''
    : params.maintenanceId ?? '';
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab = tabParam === 'summary' ? 'summary' : 'maintenances';

  const maintenanceQuery = useMaintenance(
    vehicleId || null,
    maintenanceId || null,
  );
  const workshopsQuery = useWorkshops();
  const vehiclesQuery = useVehicles();
  const deleteMutation = useDeleteMaintenance(vehicleId);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace({
      pathname: '/vehicles/[vehicleId]',
      params: { vehicleId, tab },
    });
  };

  const maintenance = maintenanceQuery.data;
  const vehicle = vehiclesQuery.data?.find((item) => item.id === vehicleId);
  const canModify =
    Boolean(maintenance) &&
    (vehicle?.role === 'OWNER' ||
      maintenance?.registeredBy?.id === CURRENT_USER_ID);
  const maintenanceWorkshop = maintenance?.workshop ?? null;
  const workshop = maintenanceWorkshop
    ? workshopsQuery.data?.find((item) => item.id === maintenanceWorkshop.id)
    : undefined;

  const registeredBy = maintenance?.registeredBy;
  const registeredByLabel = !registeredBy
    ? 'Otro usuario'
    : registeredBy.id === CURRENT_USER_ID
      ? 'Tú'
      : registeredBy.name ?? 'Otro usuario';

  const openDeleteModal = () => {
    setDeleteError(null);
    setDeleteModalVisible(true);
  };

  const closeDeleteModal = () => {
    if (deleteMutation.isPending) {
      return;
    }

    setDeleteModalVisible(false);
  };

  const confirmDelete = async () => {
    setDeleteError(null);

    try {
      await deleteMutation.mutateAsync(maintenanceId);
      router.dismissTo({
        pathname: '/vehicles/[vehicleId]',
        params: { vehicleId, tab, flash: 'Mantención eliminada' },
      });
    } catch (error) {
      setDeleteError(
        error instanceof ApiError
          ? error.message
          : 'No se pudo eliminar la mantención. Intenta nuevamente.',
      );
    }
  };

  return (
    <Screen maxWidth={layout.detailMaxWidth} scroll>
      <AppHeader
        onBack={goBack}
        rightAction={
          canModify ? (
            <OverflowMenu
              items={[
                {
                  key: 'edit',
                  label: 'Editar',
                  icon: 'create-outline',
                  onPress: () =>
                    router.push({
                      pathname:
                        '/vehicles/[vehicleId]/maintenances/[maintenanceId]/edit',
                      params: { vehicleId, maintenanceId, tab },
                    }),
                },
                {
                  key: 'delete',
                  label: 'Eliminar',
                  icon: 'trash-outline',
                  danger: true,
                  onPress: openDeleteModal,
                },
              ]}
            />
          ) : undefined
        }
        title="Mantención"
      />

      {maintenanceQuery.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {maintenanceQuery.isError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>No se pudo cargar la mantención.</Text>
          <Button
            label="Reintentar"
            onPress={() => void maintenanceQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}

      {maintenance ? (
        <>
          <Card style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Fecha</Text>
              <Text style={styles.rowValue}>
                {isoDateToDisplay(maintenance.serviceDate)}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Kilometraje</Text>
              <Text style={styles.rowValue}>
                {formatChileanAmount(String(maintenance.serviceMileage))} km
              </Text>
            </View>
          </Card>

          <Card style={styles.card}>
            <Text style={styles.blockLabel}>Descripción</Text>
            <Text style={styles.blockText}>{maintenance.description}</Text>
          </Card>

          {maintenance.diagnosis ? (
            <Card style={styles.card}>
              <Text style={styles.blockLabel}>Diagnóstico</Text>
              <Text style={styles.blockText}>{maintenance.diagnosis}</Text>
            </Card>
          ) : null}

          {maintenanceWorkshop ? (
            <Card style={styles.card}>
              <Text style={styles.blockLabel}>Taller</Text>
              <Text style={styles.blockText}>{maintenanceWorkshop.name}</Text>

              {workshop?.address ? (
                <Text style={styles.blockMeta}>
                  Dirección: {workshop.address}
                </Text>
              ) : null}

              {workshop?.phone ? (
                <Text style={styles.blockMeta}>Teléfono: {workshop.phone}</Text>
              ) : null}
            </Card>
          ) : null}

          <Card style={styles.card}>
            <Text style={styles.blockLabel}>Registrada por</Text>
            <Text style={styles.blockText}>{registeredByLabel}</Text>
          </Card>

          <Card style={styles.partsCard}>
            <Text style={styles.blockLabel}>Repuestos asociados</Text>

            {maintenance.parts.length === 0 ? (
              <Text style={styles.emptyText}>Sin repuestos asociados</Text>
            ) : (
              maintenance.parts.map((part, index) => (
                <View
                  key={part.id}
                  style={index > 0 ? styles.partBorder : undefined}
                >
                  <ListRow
                    subtitle={part.category}
                    title={part.name}
                    value={formatAmount(part.cost)}
                  />
                </View>
              ))
            )}
          </Card>

          <Card style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Mano de obra</Text>
              <Text style={styles.rowValue}>
                {formatAmount(maintenance.laborCost)}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Repuestos</Text>
              <Text style={styles.rowValue}>
                {formatAmount(maintenance.partsTotal)}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                {formatAmount(maintenance.totalCost)}
              </Text>
            </View>
          </Card>
        </>
      ) : null}

      <ConfirmModal
        error={deleteError}
        loading={deleteMutation.isPending}
        message="Se eliminará la mantención. Sus repuestos quedarán sin asignar."
        onCancel={closeDeleteModal}
        onConfirm={() => void confirmDelete()}
        title="Eliminar mantención"
        visible={deleteModalVisible}
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
  card: {
    gap: spacing.sm,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowLabel: {
    ...typography.caption,
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
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  partsCard: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  partBorder: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: 1,
  },
  divider: {
    backgroundColor: colors.borderSubtle,
    height: layout.hairline,
  },
  totalLabel: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  totalValue: {
    ...typography.subtitle,
    color: colors.primaryDark,
  },
});
