import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useVehicleMaintenances } from '../../api/maintenances';
import { useVehicleParts } from '../../api/parts';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Fab } from '../../components/ui/Fab';
import { ListRow } from '../../components/ui/ListRow';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { colors, layout, spacing, typography } from '../../theme';
import { formatChileanAmount, isoDateToDisplay } from '../../utils/format';

export function PartsTab({ vehicleId }: { vehicleId: string }) {
  const partsQuery = useVehicleParts(vehicleId || null);
  // shortcut: el selector trae 100 mantenciones; pasadas esas, el badge pierde la fecha.
  const maintenancesQuery = useVehicleMaintenances(vehicleId || null);
  const { size } = useBreakpoint();

  const parts = partsQuery.data?.items ?? [];
  const totalCost = partsQuery.data?.totalCost ?? 0;
  const maintenanceDates = new Map(
    (maintenancesQuery.data?.items ?? []).map((maintenance) => [
      maintenance.id,
      maintenance.serviceDate,
    ]),
  );

  const openNewPart = () =>
    router.push({
      pathname: '/vehicles/[vehicleId]/parts/new',
      params: { vehicleId },
    });

  if (partsQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (partsQuery.isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          No se pudieron cargar los repuestos del vehículo.
        </Text>
        <Button
          label="Reintentar"
          onPress={() => void partsQuery.refetch()}
          variant="secondary"
        />
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <Text style={styles.summary}>
        {`Total gastado en repuestos: $${formatChileanAmount(
          String(totalCost),
        )}`}
      </Text>

      {parts.length === 0 ? (
        <EmptyState
          action={{ label: 'Añadir repuesto', onPress: openNewPart }}
          icon="cube-outline"
          title="Aún no hay repuestos registrados"
        />
      ) : (
        <>
          <Card style={styles.listCard}>
            {parts.map((part, index) => {
              const maintenanceDate = part.maintenanceId
                ? maintenanceDates.get(part.maintenanceId)
                : undefined;

              return (
                <View
                  key={part.id}
                  style={index > 0 ? styles.rowBorder : undefined}
                >
                  <ListRow
                    badge={
                      part.maintenanceId ? (
                        <Badge
                          label={
                            maintenanceDate
                              ? `Mantención ${isoDateToDisplay(maintenanceDate)}`
                              : 'Asignado a mantención'
                          }
                        />
                      ) : undefined
                    }
                    subtitle={`${part.category} · ${isoDateToDisplay(part.purchaseDate)}`}
                    title={part.name}
                    value={`$${formatChileanAmount(String(part.cost))}`}
                  />
                </View>
              );
            })}
          </Card>

          <Fab
            accessibilityLabel="Añadir repuesto"
            bottomOffset={spacing.xxl}
            label={size === 'expanded' ? 'Repuesto' : undefined}
            onPress={openNewPart}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: layout.fabSize + spacing.xxl,
  },
  centered: {
    alignItems: 'center',
    gap: spacing.lg,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.dangerText,
    textAlign: 'center',
  },
  summary: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  listCard: {
    paddingVertical: spacing.none,
  },
  rowBorder: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: layout.borderWidth,
  },
});
