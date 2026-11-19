import { RequestHandler, Router } from 'express';
import { asyncHandler } from '../common/async-handler';
import { validateBody } from '../common/validation-pipe';
import {
  createWorkshop,
  listWorkshops,
} from '../controllers/workshops.controller';
import { createWorkshopSchema } from '../schemas/workshop.schema';
import { WorkshopService } from '../services/workshop.service';

export function createWorkshopsRouter(
  service: WorkshopService,
  auth: RequestHandler,
): Router {
  const router = Router();

  router.use(auth);

  router.get('/', asyncHandler(listWorkshops(service)));

  router.post(
    '/',
    validateBody(createWorkshopSchema),
    asyncHandler(createWorkshop(service)),
  );

  return router;
}
