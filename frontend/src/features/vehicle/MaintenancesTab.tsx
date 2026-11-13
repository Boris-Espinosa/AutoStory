import { useAuth } from '@clerk/expo';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useMaintenanceList } from '../../api/maintenances';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListRow } from '../../components/ui/ListRow';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { colors, layout, spacing, typography } from '../../theme';
import { formatChileanAmount, isoDateToDisplay } from '../../utils/format';

export function MaintenancesTab({ vehicleId }: { vehicleId: string }) {
  const listQuery = useMaintenanceList(vehicleId || null);
  const { size } = useBreakpoint();
  const { userId } = useAuth();

  const items = listQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const firstPage = listQuery.data?.pages[0];
  const total = firstPage?.total ?? 0;
  const laborTotal = firstPage?.laborTotal ?? 0;

  const openNewMaintenance = () =>
    router.push({
      pathname: '/vehicles/[vehicleId]/maintenances/new',
      params: { vehicleId },
    });

  const openMaintenance = (maintenanceId: string) =>
    router.push({
      pathname: '/vehicles/[vehicleId]/maintenances/[maintenanceId]',
      params: { vehicleId, maintenanceId, tab: 'maintenances' },
    });

  if (listQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (listQuery.isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          No se pudo cargar el historial de mantenciones.
        </Text>
        <Button
          label="Reintentar"
          onPress={() => void listQuery.refetch()}
          variant="secondary"
        />
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <Text style={styles.summary}>
        {`${total} mantenciones · Mano de obra $${formatChileanAmount(
          String(laborTotal),
        )}`}
      </Text>

      {items.length === 0 ? (
        <EmptyState
          action={{
            label: 'Registrar mantención',
            onPress: openNewMaintenance,
          }}
          icon="construct-outline"
          title="Aún no hay mantenciones registradas"
        />
      ) : (
        <>
          <Button
            label="Registrar mantención"
            onPress={openNewMaintenance}
            style={size === 'compact' ? undefined : styles.naturalButton}
          />

          <Card style={styles.listCard}>
            {items.map((maintenance, index) => {
              const registeredBy = maintenance.registeredBy;
              const registeredByOther =
                registeredBy !== null && registeredBy.id !== userId;

              return (
                <View
                  key={maintenance.id}
                  style={index > 0 ? styles.rowBorder : undefined}
                >
                  <ListRow
                    badge={
                      maintenance.workshop || registeredByOther ? (
                        <View style={styles.meta}>
                          {maintenance.workshop ? (
                            <Text numberOfLines={1} style={styles.workshop}>
                              {maintenance.workshop.name}
                            </Text>
                          ) : null}

                          {registeredByOther ? (
                            <Badge
                              label={registeredBy?.name ?? 'Otro usuario'}
                            />
                          ) : null}
                        </View>
                      ) : undefined
                    }
                    onPress={() => openMaintenance(maintenance.id)}
                    subtitle={maintenance.description}
                    title={isoDateToDisplay(maintenance.serviceDate)}
                    value={`$${formatChileanAmount(String(maintenance.totalCost))}`}
                  />
                </View>
              );
            })}
          </Card>

          {listQuery.hasNextPage ? (
            <Button
              label="Cargar más"
              loading={listQuery.isFetchingNextPage}
              onPress={() => void listQuery.fetchNextPage()}
              style={size === 'compact' ? undefined : styles.naturalButton}
              variant="secondary"
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
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
  naturalButton: {
    alignSelf: 'center',
    maxWidth: layout.buttonMaxWidth,
  },
  rowBorder: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: layout.borderWidth,
  },
  meta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  workshop: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
});
