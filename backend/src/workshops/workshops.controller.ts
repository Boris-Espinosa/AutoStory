import { RequestHandler, Router } from 'express';
import { asyncHandler } from '../common/async-handler';
import { validateBody } from '../common/validation-pipe';
import { CreateWorkshopInput, createWorkshopSchema } from './workshop.schema';
import { WorkshopService } from './workshop.service';

export function createWorkshopsRouter(
  service: WorkshopService,
  auth: RequestHandler,
): Router {
  const router = Router();

  router.use(auth);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json(await service.listByUser(req.auth.userId));
    }),
  );

  router.post(
    '/',
    validateBody(createWorkshopSchema),
    asyncHandler(async (req, res) => {
      const workshop = await service.create(
        req.auth.userId,
        req.body as CreateWorkshopInput,
      );
      res.status(201).json(workshop);
    }),
  );

  return router;
}
