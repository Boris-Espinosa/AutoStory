import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './client';

export interface Me {
  id: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
}

export const meQueryKey = ['me'] as const;

export interface DeletionPreview {
  ownedVehicles: number;
  ownedVehiclesWithGuests: number;
  guestMemberships: number;
}

export const deletionPreviewQueryKey = ['me', 'deletion-preview'] as const;

export function getMe(): Promise<Me> {
  return apiRequest<Me>('/me');
}

export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: getMe });
}

export function getDeletionPreview(): Promise<DeletionPreview> {
  return apiRequest<DeletionPreview>('/me/deletion-preview');
}

export function useDeletionPreview() {
  return useQuery({
    queryKey: deletionPreviewQueryKey,
    queryFn: getDeletionPreview,
  });
}

export function deleteAccount(): Promise<{ clerkDeleted: boolean }> {
  return apiRequest<{ clerkDeleted: boolean }>('/me', {
    method: 'DELETE',
    body: JSON.stringify({ confirm: 'ELIMINAR' }),
  });
}
