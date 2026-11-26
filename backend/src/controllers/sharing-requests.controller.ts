import { Request } from 'express';
import { AsyncRouteHandler } from '../common/async-handler';
import { ValidationError, formatIssues } from '../common/validation-pipe';
import {
  SendSharingRequestInput,
  userIdParamSchema,
  uuidParamSchema,
} from '../schemas/sharing-request.schema';
import { SharingRequestsService } from '../services/sharing-requests.service';
import { SHARING_REQUEST_SENT_MESSAGE } from '../utils/messages';

function requestIdFrom(req: Request): string {
  const parsed = uuidParamSchema.safeParse(req.params.requestId);

  if (!parsed.success) {
    throw new ValidationError(formatIssues(parsed.error));
  }

  return parsed.data;
}

function memberUserIdFrom(req: Request): string {
  const parsed = userIdParamSchema.safeParse(req.params.userId);

  if (!parsed.success) {
    throw new ValidationError(formatIssues(parsed.error));
  }

  return parsed.data;
}

export function sendSharingRequest(
  service: SharingRequestsService,
): AsyncRouteHandler {
  return async (req, res) => {
    await service.send(
      req.auth.userId,
      req.params.vehicleId,
      (req.body as SendSharingRequestInput).email,
    );

    res.status(202).json({ message: SHARING_REQUEST_SENT_MESSAGE });
  };
}

export function listSharingRequests(
  service: SharingRequestsService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json({ items: await service.listPending(req.params.vehicleId) });
  };
}

export function cancelSharingRequest(
  service: SharingRequestsService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json(await service.cancel(req.params.vehicleId, requestIdFrom(req)));
  };
}

export function getSharingRequest(
  service: SharingRequestsService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json(
      await service.getForReceiver(req.auth.userId, requestIdFrom(req)),
    );
  };
}

export function acceptSharingRequest(
  service: SharingRequestsService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json(await service.accept(req.auth.userId, requestIdFrom(req)));
  };
}

export function rejectSharingRequest(
  service: SharingRequestsService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json(await service.reject(req.auth.userId, requestIdFrom(req)));
  };
}

export function listMembers(
  service: SharingRequestsService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json({ items: await service.listMembers(req.params.vehicleId) });
  };
}

export function revokeMember(
  service: SharingRequestsService,
): AsyncRouteHandler {
  return async (req, res) => {
    await service.revoke(req.params.vehicleId, memberUserIdFrom(req));
    res.status(204).end();
  };
}

export function leaveVehicle(
  service: SharingRequestsService,
): AsyncRouteHandler {
  return async (req, res) => {
    await service.leave(req.params.vehicleId, req.auth.userId);
    res.status(204).end();
  };
}
