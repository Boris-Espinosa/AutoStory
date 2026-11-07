import { Redirect, useLocalSearchParams } from 'expo-router';

export default function PartsListRedirect() {
  const params = useLocalSearchParams<{ vehicleId?: string | string[] }>();
  const vehicleId = Array.isArray(params.vehicleId)
    ? params.vehicleId[0] ?? ''
    : params.vehicleId ?? '';

  if (!vehicleId) {
    return <Redirect href="/" />;
  }

  return (
    <Redirect
      href={{
        pathname: '/vehicles/[vehicleId]',
        params: { vehicleId, tab: 'parts' },
      }}
    />
  );
}
