import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_BASE_URL } from '../../src/api/client';
import { Vehicle, useVehicles } from '../../src/api/vehicles';
import { MessageBanner } from '../../src/components/MessageBanner';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Fab } from '../../src/components/ui/Fab';
import { Icon } from '../../src/components/ui/Icon';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import {
  colors,
  fontSizes,
  layout,
  radius,
  spacing,
  tracking,
  typography,
} from '../../src/theme';
import { formatChileanAmount } from '../../src/utils/format';

const FLASH_DURATION_MS = 5000;
const PHOTO_SIZE = layout.photoSize;

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const photoUri = vehicle.photoUrl
    ? `${API_BASE_URL}${vehicle.photoUrl}`
    : null;

  return (
    <Card
      accessibilityLabel={`${vehicle.licensePlate}, ${vehicle.brand} ${vehicle.model} ${vehicle.year}`}
      onPress={() =>
        router.push({
          pathname: '/vehicles/[vehicleId]',
          params: { vehicleId: vehicle.id },
        })
      }
      style={styles.card}
    >
      <View style={styles.cardRow}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Icon
              color={colors.textSecondary}
              name="car-outline"
              size={32}
            />
          </View>
        )}

        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            <Text numberOfLines={1} style={styles.licensePlate}>
              {vehicle.licensePlate}
            </Text>
            {vehicle.role === 'GUEST' ? (
              <Badge label="Invitado" tone="info" />
            ) : null}
          </View>

          <Text numberOfLines={1} style={styles.vehicleName}>
            {vehicle.brand} {vehicle.model} · {vehicle.year}
          </Text>

          <View style={styles.mileageRow}>
            <Icon
              color={colors.textSecondary}
              name="speedometer-outline"
              size={16}
            />
            <Text style={styles.mileage}>
              {formatChileanAmount(String(vehicle.currentMileage))} km
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

export default function VehiclesScreen() {
  const vehiclesQuery = useVehicles();
  const vehicles = vehiclesQuery.data ?? [];
  const { columns, isWide } = useBreakpoint();
  const params = useLocalSearchParams<{ flash?: string; flashTone?: string }>();

  const [flash, setFlash] = useState<{
    message: string;
    tone: 'success' | 'error';
  } | null>(null);

  // El mensaje de bienvenida se quita de la URL para que no reaparezca al volver.
  useEffect(() => {
    if (typeof params.flash === 'string' && params.flash.length > 0) {
      setFlash({
        message: params.flash,
        tone: params.flashTone === 'error' ? 'error' : 'success',
      });
      router.setParams({ flash: '', flashTone: '' });
    }
  }, [params.flash, params.flashTone]);

  useEffect(() => {
    if (!flash) {
      return;
    }

    const timer = setTimeout(() => setFlash(null), FLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  const goToNewVehicle = () => router.push('/vehicles/new');
  const hasVehicles =
    !vehiclesQuery.isLoading &&
    !vehiclesQuery.isError &&
    vehicles.length > 0;
  const gridItemStyle =
    columns === 1
      ? styles.gridItemFull
      : columns === 2
        ? styles.gridItemHalf
        : styles.gridItemThird;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          Platform.OS !== 'web' ? (
            <RefreshControl
              colors={[colors.primary]}
              onRefresh={() => void vehiclesQuery.refetch()}
              refreshing={vehiclesQuery.isRefetching}
              tintColor={colors.primary}
            />
          ) : undefined
        }
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.titleGroup}>
              <Text accessibilityRole="header" style={styles.title}>
                Mis vehículos
              </Text>
              <Badge label={String(vehicles.length)} />
            </View>

            {hasVehicles && isWide ? (
              <Button
                label="Registrar vehículo"
                onPress={goToNewVehicle}
              />
            ) : null}
          </View>

          <MessageBanner message={flash?.message ?? null} tone={flash?.tone} />

          {vehiclesQuery.isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}

          {vehiclesQuery.isError ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>
                No se pudieron cargar los vehículos.
              </Text>
              <Button
                label="Reintentar"
                onPress={() => void vehiclesQuery.refetch()}
                variant="secondary"
              />
            </View>
          ) : null}

          {!vehiclesQuery.isLoading &&
          !vehiclesQuery.isError &&
          vehicles.length === 0 ? (
            <EmptyState
              action={{
                label: 'Registrar vehículo',
                onPress: goToNewVehicle,
              }}
              icon="car-outline"
              text="Cuando registres tu primer vehículo aparecerá aquí."
              title="Aún no tienes vehículos"
            />
          ) : null}

          {hasVehicles ? (
            <View style={styles.grid}>
              {vehicles.map((vehicle) => (
                <View key={vehicle.id} style={[styles.gridItem, gridItemStyle]}>
                  <VehicleCard vehicle={vehicle} />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {hasVehicles && !isWide ? (
        <Fab
          accessibilityLabel="Registrar vehículo"
          bottomOffset={layout.bottomBarHeight}
          onPress={goToNewVehicle}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing.lg,
    maxWidth: layout.contentMaxWidth,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: layout.touchTarget,
  },
  titleGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.dangerText,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gridItem: {
    minWidth: spacing.none,
  },
  gridItemFull: {
    width: '100%',
  },
  gridItemHalf: {
    width: '48.5%',
  },
  gridItemThird: {
    width: '32%',
  },
  card: {
    minHeight: PHOTO_SIZE + spacing.lg * 2,
    padding: spacing.lg,
  },
  cardRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  photo: {
    borderRadius: radius.sm,
    height: PHOTO_SIZE,
    width: PHOTO_SIZE,
  },
  photoPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.neutralBackground,
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  cardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  licensePlate: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: fontSizes.xxl,
    fontWeight: '800',
    letterSpacing: tracking.wide,
  },
  vehicleName: {
    ...typography.body,
    color: colors.textLabel,
    fontWeight: '600',
  },
  mileageRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  mileage: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
