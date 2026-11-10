import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useVehicles } from '../../src/api/vehicles';
import { Button } from '../../src/components/ui/Button';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Fab } from '../../src/components/ui/Fab';
import { AppointmentsList } from '../../src/features/appointments/AppointmentsList';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { colors, layout, spacing, typography } from '../../src/theme';

export default function AppointmentsScreen() {
  const vehiclesQuery = useVehicles();
  const queryClient = useQueryClient();
  const { size } = useBreakpoint();
  const [refreshing, setRefreshing] = useState(false);

  const vehicles = vehiclesQuery.data ?? [];
  const hasVehicles =
    !vehiclesQuery.isLoading &&
    !vehiclesQuery.isError &&
    vehicles.length > 0;

  const openNewAppointment = () => router.push('/appointments/new');

  const refresh = async () => {
    setRefreshing(true);

    try {
      await queryClient.refetchQueries({ queryKey: ['appointments'] });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <Head>
        <title>Citas · AutoStory</title>
      </Head>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          Platform.OS !== 'web' ? (
            <RefreshControl
              colors={[colors.primary]}
              onRefresh={() => void refresh()}
              refreshing={refreshing}
              tintColor={colors.primary}
            />
          ) : undefined
        }
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              Citas
            </Text>
          </View>

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
                onPress: () => router.push('/vehicles/new'),
              }}
              icon="car-outline"
              text="Registra un vehículo para programar una cita."
              title="Aún no tienes vehículos"
            />
          ) : null}

          {hasVehicles ? <AppointmentsList showFab={false} /> : null}
        </View>
      </ScrollView>

      {hasVehicles ? (
        <Fab
          accessibilityLabel="Programar cita"
          bottomOffset={layout.bottomBarHeight}
          label={size === 'expanded' ? 'Programar cita' : undefined}
          onPress={openNewAppointment}
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
    minHeight: layout.touchTarget,
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
});
