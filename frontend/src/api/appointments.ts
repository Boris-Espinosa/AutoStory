import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiRequest } from './client';
import { syncLocalReminders } from '../notifications/local';

export type AppointmentStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type AppointmentScope = 'upcoming' | 'overdue' | 'history';

export interface AppointmentReminder {
  offsetMinutes: number;
  remindAt: string;
  processed: boolean;
}

export interface Appointment {
  id: string;
  vehicle: {
    id: string;
    licensePlate: string;
    brand: string;
    model: string;
    year: number;
  };
  workshop: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
  } | null;
  createdBy: { id: string; name: string | null } | null;
  scheduledAt: string;
  timezone: string;
  reason: string;
  notes: string | null;
  status: AppointmentStatus;
  completedAt: string | null;
  cancelledAt: string | null;
  maintenanceId: string | null;
  reminders: AppointmentReminder[];
  canEdit: boolean;
}

export interface AppointmentWithSkipped extends Appointment {
  skippedReminders: number[];
}

export interface AppointmentList {
  items: Appointment[];
  total: number;
}

export interface CreateAppointmentPayload {
  scheduledAt: string;
  timezone: string;
  reason: string;
  notes: string | null;
  workshopId: string | null;
  reminders?: number[];
}

export type UpdateAppointmentPayload = Partial<CreateAppointmentPayload>;

export interface ReminderOption {
  offsetMinutes: number;
  label: string;
}

export const REMINDER_OPTIONS: ReminderOption[] = [
  { offsetMinutes: 10080, label: '1 semana antes' },
  { offsetMinutes: 1440, label: '1 día antes' },
  { offsetMinutes: 120, label: '2 horas antes' },
  { offsetMinutes: 30, label: '30 min antes' },
];

export const DEFAULT_REMINDER_OFFSETS = [1440, 120];

export function reminderLabel(offsetMinutes: number): string {
  return (
    REMINDER_OPTIONS.find((option) => option.offsetMinutes === offsetMinutes)
      ?.label ?? 'Recordatorio'
  );
}

const HISTORY_PAGE_SIZE = 20;

export const appointmentsQueryKey = (vehicleId?: string | null) =>
  ['appointments', 'list', vehicleId ?? 'all'] as const;
export const appointmentQueryKey = (appointmentId: string) =>
  ['appointments', 'detail', appointmentId] as const;

export function getAppointments(params: {
  scope: AppointmentScope;
  vehicleId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AppointmentList> {
  const query = `scope=${params.scope}&limit=${params.limit ?? 100}&offset=${params.offset ?? 0}${
    params.vehicleId ? `&vehicleId=${params.vehicleId}` : ''
  }`;

  return apiRequest<AppointmentList>(`/appointments?${query}`);
}

export function getAppointment(appointmentId: string): Promise<Appointment> {
  return apiRequest<Appointment>(`/appointments/${appointmentId}`);
}

export function createAppointment(
  vehicleId: string,
  payload: CreateAppointmentPayload,
): Promise<AppointmentWithSkipped> {
  return apiRequest<AppointmentWithSkipped>(
    `/vehicles/${vehicleId}/appointments`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function updateAppointment(
  appointmentId: string,
  payload: UpdateAppointmentPayload,
): Promise<AppointmentWithSkipped> {
  return apiRequest<AppointmentWithSkipped>(`/appointments/${appointmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function cancelAppointment(
  appointmentId: string,
): Promise<Appointment> {
  return apiRequest<Appointment>(`/appointments/${appointmentId}/cancel`, {
    method: 'POST',
  });
}

export function completeAppointment(
  appointmentId: string,
): Promise<Appointment> {
  return apiRequest<Appointment>(`/appointments/${appointmentId}/complete`, {
    method: 'POST',
  });
}

/**
 * Próximas y sin cerrar traen hasta 100; el historial se pagina con "Cargar más".
 * shortcut: más de 100 próximas o sin cerrar no se paginan; agregar "Cargar más" si pasa.
 */
export function useAppointments(
  scope: AppointmentScope,
  vehicleId?: string | null,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: [...appointmentsQueryKey(vehicleId), scope] as const,
    queryFn: ({ pageParam }) =>
      getAppointments({
        scope,
        vehicleId,
        limit: scope === 'history' ? HISTORY_PAGE_SIZE : 100,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (scope !== 'history') {
        return undefined;
      }

      const loaded = allPages.reduce(
        (total, page) => total + page.items.length,
        0,
      );

      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled,
  });
}

export function useAppointment(appointmentId: string | null) {
  return useQuery({
    queryKey: appointmentQueryKey(appointmentId ?? ''),
    queryFn: () => getAppointment(appointmentId as string),
    enabled: Boolean(appointmentId),
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      vehicleId,
      ...payload
    }: CreateAppointmentPayload & { vehicleId: string }) =>
      createAppointment(vehicleId, payload),
    onSuccess: () => invalidateAfterAppointmentChange(queryClient),
  });
}

export function useUpdateAppointment(appointmentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateAppointmentPayload) =>
      updateAppointment(appointmentId, payload),
    onSuccess: () => invalidateAfterAppointmentChange(queryClient),
  });
}

export function useCancelAppointment(appointmentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => cancelAppointment(appointmentId),
    onSuccess: () => invalidateAfterAppointmentChange(queryClient),
  });
}

export function useCompleteAppointment(appointmentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => completeAppointment(appointmentId),
    onSuccess: () => invalidateAfterAppointmentChange(queryClient),
  });
}

function invalidateAfterAppointmentChange(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['appointments'] });
  queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
  // Mantiene los avisos del teléfono al día tras crear, editar, cancelar o completar.
  void syncLocalReminders().catch(() => undefined);
}
