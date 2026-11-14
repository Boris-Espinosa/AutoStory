import { useMutation, useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { apiRequest, UPLOAD_TIMEOUT_MS } from './client';
import { preparePhoto } from '../utils/photo';

export type VehicleRole = 'OWNER' | 'GUEST';

export interface Vehicle {
  id: string;
  vin: string | null;
  licensePlate: string;
  brand: string;
  model: string;
  year: number;
  currentMileage: number;
  photoUrl: string | null;
  role: VehicleRole;
}

export interface CreateVehiclePayload {
  vin: string | null;
  licensePlate: string;
  brand: string;
  model: string;
  year: number;
  currentMileage: number;
}

export type VinDecodeStatus =
  | 'full'
  | 'partial'
  | 'unrecognized'
  | 'unavailable';

export interface VinDecodeResult {
  brand: string | null;
  model: string | null;
  year: number | null;
  status: VinDecodeStatus;
}

export interface LocalPhoto {
  uri: string;
  name: string;
  type: string;
}

export const vehiclesQueryKey = ['vehicles'] as const;
export const brandsQueryKey = ['vehicle-brands'] as const;
export const vinDecodeQueryKey = (vin: string) => ['vin-decode', vin] as const;

export function getVehicles(): Promise<Vehicle[]> {
  return apiRequest<Vehicle[]>('/vehicles');
}

export function getBrands(): Promise<string[]> {
  return apiRequest<string[]>('/vehicles/brands');
}

export function createVehicle(payload: CreateVehiclePayload): Promise<Vehicle> {
  return apiRequest<Vehicle>('/vehicles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteVehicle(vehicleId: string): Promise<void> {
  return apiRequest<void>(`/vehicles/${vehicleId}`, { method: 'DELETE' });
}

export function updateVehicle(
  vehicleId: string,
  payload: CreateVehiclePayload,
): Promise<Vehicle> {
  return apiRequest<Vehicle>(`/vehicles/${vehicleId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function removeVehiclePhoto(vehicleId: string): Promise<void> {
  return apiRequest<void>(`/vehicles/${vehicleId}/photo`, { method: 'DELETE' });
}

export function decodeVin(vin: string): Promise<VinDecodeResult> {
  return apiRequest<VinDecodeResult>(
    `/vehicles/vin/${encodeURIComponent(vin)}/decode`,
  );
}

/** Sube la foto con FormData: blob en web y { uri, name, type } en móvil. */
export async function uploadVehiclePhoto(
  vehicleId: string,
  photo: LocalPhoto,
): Promise<{ photoUrl: string }> {
  const buildForm = async (): Promise<FormData> => {
    // Se comprime antes de armar el multipart: si falla, la pantalla avisa
    // y deja reintentar o continuar sin foto; nunca se sube el original.
    const ready = await preparePhoto(photo);
    const form = new FormData();

    if (Platform.OS === 'web') {
      const blob = await fetch(ready.uri).then((response) => response.blob());
      form.append(
        'photo',
        new Blob([blob], { type: 'image/jpeg' }),
        ready.name,
      );
    } else {
      form.append('photo', ready as unknown as Blob);
    }

    return form;
  };

  return apiRequest<{ photoUrl: string }>(
    `/vehicles/${vehicleId}/photo`,
    {
      method: 'POST',
      body: await buildForm(),
    },
    { timeoutMs: UPLOAD_TIMEOUT_MS, retries: 0, retryBody: buildForm },
  );
}

export function useVehicles() {
  return useQuery({
    queryKey: vehiclesQueryKey,
    queryFn: getVehicles,
  });
}

export function useBrands() {
  return useQuery({
    queryKey: brandsQueryKey,
    queryFn: getBrands,
    staleTime: Infinity,
  });
}

/** Una sola consulta por VIN: la clave de caché es el VIN. */
export function useDecodeVin(vin: string | null) {
  return useQuery({
    queryKey: vinDecodeQueryKey(vin ?? ''),
    queryFn: () => decodeVin(vin as string),
    enabled: Boolean(vin),
    retry: false,
    staleTime: Infinity,
  });
}

export function useCreateVehicle() {
  return useMutation({
    mutationFn: createVehicle,
  });
}

export function useDeleteVehicle() {
  return useMutation({
    mutationFn: deleteVehicle,
  });
}

export function useUpdateVehicle() {
  return useMutation({
    mutationFn: ({
      vehicleId,
      payload,
    }: {
      vehicleId: string;
      payload: CreateVehiclePayload;
    }) => updateVehicle(vehicleId, payload),
  });
}
