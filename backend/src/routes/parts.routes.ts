import { RequestHandler, Router } from 'express';
import { asyncHandler } from '../common/async-handler';
import { validateBody } from '../common/validation-pipe';
import { createPart } from '../controllers/parts.controller';
import { createPartSchema } from '../schemas/part.schema';
import { PartsService } from '../services/parts.service';
import { VehicleAccessService } from '../services/vehicle-access.service';

export function createPartsRouter(
  service: PartsService,
  access: VehicleAccessService,
  auth: RequestHandler,
): Router {
  const router = Router();

  router.use(auth);

  router.post(
    '/',
    validateBody(createPartSchema),
    asyncHandler(createPart(service, access)),
  );

  return router;
}
