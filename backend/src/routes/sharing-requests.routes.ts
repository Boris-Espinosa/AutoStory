import { RequestHandler, Router } from 'express';
import { asyncHandler } from '../common/async-handler';
import {
  acceptSharingRequest,
  getSharingRequest,
  rejectSharingRequest,
} from '../controllers/sharing-requests.controller';
import { SharingRequestsService } from '../services/sharing-requests.service';

export function createSharingRequestsRouter(
  service: SharingRequestsService,
  auth: RequestHandler,
): Router {
  const router = Router();

  router.use(auth);

  router.get('/:requestId', asyncHandler(getSharingRequest(service)));

  router.post(
    '/:requestId/accept',
    asyncHandler(acceptSharingRequest(service)),
  );

  router.post(
    '/:requestId/reject',
    asyncHandler(rejectSharingRequest(service)),
  );

  return router;
}
