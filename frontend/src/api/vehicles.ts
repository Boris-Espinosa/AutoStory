import { useMutation, useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { apiRequest } from './client';

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
  const form = new FormData();

  if (Platform.OS === 'web') {
    const blob = await fetch(photo.uri).then((response) => response.blob());
    form.append('photo', blob, photo.name);
  } else {
    form.append('photo', photo as unknown as Blob);
  }

  return apiRequest<{ photoUrl: string }>(`/vehicles/${vehicleId}/photo`, {
    method: 'POST',
    body: form,
  });
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
