import { Redirect, useLocalSearchParams } from 'expo-router';

export default function MaintenanceHistoryRedirect() {
  const params = useLocalSearchParams<{
    vehicleId?: string | string[];
    flash?: string | string[];
  }>();
  const vehicleId = Array.isArray(params.vehicleId)
    ? params.vehicleId[0] ?? ''
    : params.vehicleId ?? '';
  const flash = Array.isArray(params.flash) ? params.flash[0] : params.flash;

  if (!vehicleId) {
    return <Redirect href="/" />;
  }

  return (
    <Redirect
      href={{
        pathname: '/vehicles/[vehicleId]',
        params: {
          vehicleId,
          tab: 'maintenances',
          ...(flash ? { flash } : {}),
        },
      }}
    />
  );
}
