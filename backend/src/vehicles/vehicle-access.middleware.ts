import { RequestHandler } from 'express';
import { asyncHandler } from '../common/async-handler';
import { VehicleAccessService } from './vehicle-access.service';

export function requireVehicleMember(
  access: VehicleAccessService,
): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    await access.assertMember(req.auth.userId, req.params.vehicleId);
    next();
  });
}

export function requireVehicleOwner(
  access: VehicleAccessService,
): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    await access.assertOwner(req.auth.userId, req.params.vehicleId);
    next();
  });
}
