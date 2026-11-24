import { AsyncRouteHandler } from '../common/async-handler';
import { ValidationError, formatIssues } from '../common/validation-pipe';
import {
  SendSharingRequestInput,
  uuidParamSchema,
} from '../schemas/sharing-request.schema';
import { SharingRequestsService } from '../services/sharing-requests.service';
import { SHARING_NEUTRAL_MESSAGE } from '../utils/messages';

export function sendSharingRequest(
  service: SharingRequestsService,
): AsyncRouteHandler {
  return async (req, res) => {
    await service.send(
      req.auth.userId,
      req.params.vehicleId,
      (req.body as SendSharingRequestInput).email,
    );

    res.status(202).json({ message: SHARING_NEUTRAL_MESSAGE });
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
    const parsed = uuidParamSchema.safeParse(req.params.requestId);

    if (!parsed.success) {
      throw new ValidationError(formatIssues(parsed.error));
    }

    res.json(await service.cancel(req.params.vehicleId, parsed.data));
  };
}
