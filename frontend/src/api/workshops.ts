import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './client';

export interface Workshop {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  rating: number | null;
  createdAt: string;
}

export interface CreateWorkshopPayload {
  name: string;
  address: string | null;
  phone: string | null;
}

export const workshopsQueryKey = ['workshops'] as const;

export function getWorkshops(): Promise<Workshop[]> {
  return apiRequest<Workshop[]>('/workshops');
}

export function createWorkshop(
  payload: CreateWorkshopPayload,
): Promise<Workshop> {
  return apiRequest<Workshop>('/workshops', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function useWorkshops() {
  return useQuery({
    queryKey: workshopsQueryKey,
    queryFn: getWorkshops,
  });
}

export function useCreateWorkshop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createWorkshop,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workshopsQueryKey });
    },
  });
}
