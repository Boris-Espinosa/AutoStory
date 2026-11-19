import { AsyncRouteHandler } from '../common/async-handler';
import { CreateWorkshopInput } from '../schemas/workshop.schema';
import { WorkshopService } from '../services/workshop.service';

export function listWorkshops(service: WorkshopService): AsyncRouteHandler {
  return async (req, res) => {
    res.json(await service.listByUser(req.auth.userId));
  };
}

export function createWorkshop(service: WorkshopService): AsyncRouteHandler {
  return async (req, res) => {
    const workshop = await service.create(
      req.auth.userId,
      req.body as CreateWorkshopInput,
    );
    res.status(201).json(workshop);
  };
}
