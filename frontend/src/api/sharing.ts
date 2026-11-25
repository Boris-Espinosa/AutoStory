import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiRequest } from './client';
import { notificationsQueryKey } from './notifications';
import { vehiclesQueryKey } from './vehicles';

export type SharingRequestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED';

export interface PendingSharingRequest {
  id: string;
  receiverEmail: string;
  sentAt: string;
  status: 'PENDING';
}

export interface CancelledSharingRequest {
  id: string;
  status: 'CANCELLED';
  respondedAt: string;
}

export interface SharingRequestDetail {
  id: string;
  vehicle: { brand: string; model: string; year: number };
  senderName: string;
  status: SharingRequestStatus;
  sentAt: string;
}

export interface RespondedSharingRequest {
  id: string;
  status: 'ACCEPTED' | 'REJECTED';
}

export interface SharedVehicleMember {
  userId: string;
  email: string;
  role: 'GUEST';
  assignedAt: string;
}

export const sharingQueryKey = ['sharing'] as const;
export const pendingSharingRequestsQueryKey = (vehicleId: string) =>
  ['sharing', 'pending', vehicleId] as const;
export const sharingMembersQueryKey = (vehicleId: string) =>
  ['sharing', 'members', vehicleId] as const;
export const sharingRequestQueryKey = (requestId: string) =>
  ['sharing', 'request', requestId] as const;

export function getPendingSharingRequests(
  vehicleId: string,
): Promise<{ items: PendingSharingRequest[] }> {
  return apiRequest(`/vehicles/${vehicleId}/sharing-requests`);
}

export function sendSharingRequest(
  vehicleId: string,
  email: string,
): Promise<{ message: string }> {
  return apiRequest(`/vehicles/${vehicleId}/sharing-requests`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function cancelSharingRequest(
  vehicleId: string,
  requestId: string,
): Promise<CancelledSharingRequest> {
  return apiRequest(
    `/vehicles/${vehicleId}/sharing-requests/${requestId}/cancel`,
    { method: 'PATCH' },
  );
}

export function getSharingMembers(
  vehicleId: string,
): Promise<{ items: SharedVehicleMember[] }> {
  return apiRequest(`/vehicles/${vehicleId}/members`);
}

export function revokeSharingMember(
  vehicleId: string,
  userId: string,
): Promise<void> {
  return apiRequest(`/vehicles/${vehicleId}/members/${userId}`, {
    method: 'DELETE',
  });
}

export function leaveSharedVehicle(vehicleId: string): Promise<void> {
  return apiRequest(`/vehicles/${vehicleId}/members/me`, { method: 'DELETE' });
}

export function getSharingRequest(
  requestId: string,
): Promise<SharingRequestDetail> {
  return apiRequest(`/sharing-requests/${requestId}`);
}

export function acceptSharingRequest(
  requestId: string,
): Promise<RespondedSharingRequest> {
  return apiRequest(`/sharing-requests/${requestId}/accept`, {
    method: 'POST',
  });
}

export function rejectSharingRequest(
  requestId: string,
): Promise<RespondedSharingRequest> {
  return apiRequest(`/sharing-requests/${requestId}/reject`, {
    method: 'POST',
  });
}

export function usePendingSharingRequests(vehicleId: string) {
  return useQuery({
    queryKey: pendingSharingRequestsQueryKey(vehicleId),
    queryFn: () => getPendingSharingRequests(vehicleId),
    enabled: Boolean(vehicleId),
  });
}

export function useSharingMembers(vehicleId: string) {
  return useQuery({
    queryKey: sharingMembersQueryKey(vehicleId),
    queryFn: () => getSharingMembers(vehicleId),
    enabled: Boolean(vehicleId),
  });
}

export function useSharingRequest(requestId: string | null) {
  return useQuery({
    queryKey: sharingRequestQueryKey(requestId ?? ''),
    queryFn: () => getSharingRequest(requestId as string),
    enabled: Boolean(requestId),
    retry: false,
  });
}

function invalidateSharing(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: sharingQueryKey });
}

function invalidateAfterSharingChange(queryClient: QueryClient): void {
  invalidateSharing(queryClient);
  queryClient.invalidateQueries({ queryKey: vehiclesQueryKey });
  queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
}

export function useSendSharingRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      vehicleId,
      email,
    }: {
      vehicleId: string;
      email: string;
    }) => sendSharingRequest(vehicleId, email),
    onSuccess: () => invalidateSharing(queryClient),
  });
}

export function useCancelSharingRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      vehicleId,
      requestId,
    }: {
      vehicleId: string;
      requestId: string;
    }) => cancelSharingRequest(vehicleId, requestId),
    onSuccess: () => invalidateSharing(queryClient),
  });
}

export function useAcceptSharingRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: acceptSharingRequest,
    onSuccess: () => invalidateAfterSharingChange(queryClient),
  });
}

export function useRejectSharingRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: rejectSharingRequest,
    onSuccess: () => invalidateAfterSharingChange(queryClient),
  });
}

export function useRevokeSharingMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      vehicleId,
      userId,
    }: {
      vehicleId: string;
      userId: string;
    }) => revokeSharingMember(vehicleId, userId),
    onSuccess: () => invalidateAfterSharingChange(queryClient),
  });
}

export function useLeaveSharedVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: leaveSharedVehicle,
    onSuccess: () => invalidateAfterSharingChange(queryClient),
  });
}
