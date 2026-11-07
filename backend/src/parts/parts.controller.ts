import { RequestHandler, Router } from 'express';
import { asyncHandler } from '../common/async-handler';
import { validateBody } from '../common/validation-pipe';
import { CreatePartInput, createPartSchema } from './part.schema';
import { PartsService } from './parts.service';
import { VehicleAccessService } from '../vehicles/vehicle-access.service';

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
    asyncHandler(async (req, res) => {
      const input = req.body as CreatePartInput;
      await access.assertMember(req.auth.userId, input.vehicleId);
      const part = await service.create(input);
      res.status(201).json(part);
    }),
  );

  return router;
}
