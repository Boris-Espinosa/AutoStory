import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './client';

export const PART_CATEGORIES = [
  'Encendido',
  'Motor',
  'Frenos',
  'Suspensión',
  'Transmisión',
  'Eléctrico',
  'Neumáticos',
  'Filtros y lubricantes',
  'Carrocería',
  'Otro',
] as const;

export type PartCategory = (typeof PART_CATEGORIES)[number];

export interface Part {
  id: string;
  vehicleId: string;
  maintenanceId: string | null;
  name: string;
  category: PartCategory;
  cost: number;
  purchaseDate: string;
  createdAt: string;
}

export interface CreatePartPayload {
  vehicleId: string;
  maintenanceId: string | null;
  name: string;
  category: PartCategory;
  cost: number;
  purchaseDate: string;
}

export interface VehicleParts {
  items: Part[];
  totalCost: number;
}

export const partsQueryKey = (vehicleId: string) => ['parts', vehicleId] as const;
export const unassignedPartsQueryKey = (vehicleId: string) =>
  ['parts', vehicleId, 'unassigned'] as const;
export const expensesSummaryQueryKey = (vehicleId: string) =>
  ['expenses-summary', vehicleId] as const;

export function createPart(payload: CreatePartPayload): Promise<Part> {
  return apiRequest<Part>('/parts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getVehicleParts(
  vehicleId: string,
  unassigned = false,
): Promise<VehicleParts> {
  const query = unassigned ? '?unassigned=true' : '';
  return apiRequest<VehicleParts>(`/vehicles/${vehicleId}/parts${query}`);
}

export function useVehicleParts(vehicleId: string | null) {
  return useQuery({
    queryKey: partsQueryKey(vehicleId ?? ''),
    queryFn: () => getVehicleParts(vehicleId as string),
    enabled: Boolean(vehicleId),
  });
}

export function useUnassignedVehicleParts(vehicleId: string | null) {
  return useQuery({
    queryKey: unassignedPartsQueryKey(vehicleId ?? ''),
    queryFn: () => getVehicleParts(vehicleId as string, true),
    enabled: Boolean(vehicleId),
  });
}

export function useCreatePart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPart,
    onSuccess: (part) => {
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
      queryClient.invalidateQueries({ queryKey: ['expenses-summary'] });
      queryClient.invalidateQueries({ queryKey: partsQueryKey(part.vehicleId) });
      queryClient.invalidateQueries({
        queryKey: expensesSummaryQueryKey(part.vehicleId),
      });
    },
  });
}
