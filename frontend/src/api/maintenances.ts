import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiRequest } from './client';
import { expensesSummaryQueryKey } from './parts';
import { vehiclesQueryKey } from './vehicles';

export interface MaintenancePart {
  id: string;
  name: string;
  category: string;
  cost: number;
  purchaseDate: string;
  totalCost: number;
}

export interface Maintenance {
  id: string;
  vehicleId: string;
  serviceDate: string;
  serviceMileage: number;
  description: string;
  diagnosis: string | null;
  laborCost: number;
  workshop: { id: string; name: string } | null;
  registeredBy: { id: string; name: string | null } | null;
  parts: MaintenancePart[];
  partsTotal: number;
  totalCost: number;
  createdAt: string;
}

export interface MaintenanceList {
  items: Maintenance[];
  total: number;
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
}

export interface ExpensesSummary {
  partsTotal: number;
  partsCount: number;
  laborTotal: number;
  maintenanceCount: number;
  grandTotal: number;
}

export interface CreateMaintenancePayload {
  serviceDate: string;
  serviceMileage: number;
  description: string;
  diagnosis: string | null;
  laborCost: number;
  workshopId: string | null;
  partIds: string[];
}

export const MAINTENANCE_PAGE_SIZE = 10;

export const maintenanceListQueryKey = (vehicleId: string) =>
  ['maintenances', vehicleId, 'list'] as const;
export const maintenanceQueryKey = (vehicleId: string, maintenanceId: string) =>
  ['maintenances', vehicleId, 'detail', maintenanceId] as const;
export const latestMaintenancesQueryKey = (vehicleId: string) =>
  ['maintenances', vehicleId, 'latest'] as const;
export const vehicleMaintenanceOptionsQueryKey = (vehicleId: string) =>
  ['maintenances', vehicleId, 'options'] as const;

export function getVehicleMaintenances(
  vehicleId: string,
  params: { limit: number; offset: number },
): Promise<MaintenanceList> {
  return apiRequest<MaintenanceList>(
    `/vehicles/${vehicleId}/maintenances?limit=${params.limit}&offset=${params.offset}`,
  );
}

export function getMaintenance(
  vehicleId: string,
  maintenanceId: string,
): Promise<Maintenance> {
  return apiRequest<Maintenance>(
    `/vehicles/${vehicleId}/maintenances/${maintenanceId}`,
  );
}

export function createMaintenance(
  vehicleId: string,
  payload: CreateMaintenancePayload,
): Promise<Maintenance> {
  return apiRequest<Maintenance>(`/vehicles/${vehicleId}/maintenances`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateMaintenance(
  vehicleId: string,
  maintenanceId: string,
  payload: CreateMaintenancePayload,
): Promise<Maintenance> {
  return apiRequest<Maintenance>(
    `/vehicles/${vehicleId}/maintenances/${maintenanceId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function deleteMaintenance(
  vehicleId: string,
  maintenanceId: string,
): Promise<void> {
  return apiRequest<void>(
    `/vehicles/${vehicleId}/maintenances/${maintenanceId}`,
    { method: 'DELETE' },
  );
}

export function getExpensesSummary(vehicleId: string): Promise<ExpensesSummary> {
  return apiRequest<ExpensesSummary>(
    `/vehicles/${vehicleId}/expenses/summary`,
  );
}

/** Historial paginado con "Cargar más"; el offset avanza según lo ya cargado. */
export function useMaintenanceList(vehicleId: string | null) {
  return useInfiniteQuery({
    queryKey: maintenanceListQueryKey(vehicleId ?? ''),
    queryFn: ({ pageParam }) =>
      getVehicleMaintenances(vehicleId as string, {
        limit: MAINTENANCE_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce(
        (total, page) => total + page.items.length,
        0,
      );

      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: Boolean(vehicleId),
  });
}

/** Las 3 más recientes para la pestaña Resumen. */
export function useLatestMaintenances(vehicleId: string | null) {
  return useQuery({
    queryKey: latestMaintenancesQueryKey(vehicleId ?? ''),
    queryFn: () =>
      getVehicleMaintenances(vehicleId as string, { limit: 3, offset: 0 }),
    enabled: Boolean(vehicleId),
  });
}

/** Selector de "Añadir Repuesto": todas las mantenciones del vehículo. */
export function useVehicleMaintenances(vehicleId: string | null) {
  return useQuery({
    queryKey: vehicleMaintenanceOptionsQueryKey(vehicleId ?? ''),
    queryFn: () =>
      getVehicleMaintenances(vehicleId as string, { limit: 100, offset: 0 }),
    enabled: Boolean(vehicleId),
  });
}

export function useMaintenance(
  vehicleId: string | null,
  maintenanceId: string | null,
) {
  return useQuery({
    queryKey: maintenanceQueryKey(vehicleId ?? '', maintenanceId ?? ''),
    queryFn: () =>
      getMaintenance(vehicleId as string, maintenanceId as string),
    enabled: Boolean(vehicleId && maintenanceId),
  });
}

export function useExpensesSummary(vehicleId: string | null) {
  return useQuery({
    queryKey: expensesSummaryQueryKey(vehicleId ?? ''),
    queryFn: () => getExpensesSummary(vehicleId as string),
    enabled: Boolean(vehicleId),
  });
}

export function useCreateMaintenance(vehicleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateMaintenancePayload) =>
      createMaintenance(vehicleId, payload),
    onSuccess: () => {
      invalidateAfterMaintenanceChange(queryClient);
    },
  });
}

export function useUpdateMaintenance(
  vehicleId: string,
  maintenanceId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateMaintenancePayload) =>
      updateMaintenance(vehicleId, maintenanceId, payload),
    onSuccess: () => {
      invalidateAfterMaintenanceChange(queryClient);
      queryClient.invalidateQueries({
        queryKey: maintenanceQueryKey(vehicleId, maintenanceId),
      });
    },
  });
}

export function useDeleteMaintenance(vehicleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (maintenanceId: string) =>
      deleteMaintenance(vehicleId, maintenanceId),
    onSuccess: () => {
      invalidateAfterMaintenanceChange(queryClient);
    },
  });
}

function invalidateAfterMaintenanceChange(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['maintenances'] });
  queryClient.invalidateQueries({ queryKey: ['parts'] });
  queryClient.invalidateQueries({ queryKey: ['expenses-summary'] });
  queryClient.invalidateQueries({ queryKey: vehiclesQueryKey });
}
