import { AsyncRouteHandler } from '../common/async-handler';
import { CreatePartInput } from '../schemas/part.schema';
import { PartsService } from '../services/parts.service';
import { VehicleAccessService } from '../services/vehicle-access.service';

export function createPart(
  service: PartsService,
  access: VehicleAccessService,
): AsyncRouteHandler {
  return async (req, res) => {
    const input = req.body as CreatePartInput;
    await access.assertMember(req.auth.userId, input.vehicleId);
    const part = await service.create(input);
    res.status(201).json(part);
  };
}
