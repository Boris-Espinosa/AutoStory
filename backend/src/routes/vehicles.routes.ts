import { RequestHandler, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../common/async-handler';
import { Clock } from '../common/clock';
import { validateBody } from '../common/validation-pipe';
import {
  createAppointmentForVehicle,
  createMaintenance,
  createVehicle,
  decodeVin,
  getExpensesSummary,
  getMaintenance,
  listAppointmentsForVehicle,
  listBrands,
  listMaintenances,
  listVehicleParts,
  listVehicles,
  removeMaintenance,
  removeVehicle,
  removeVehiclePhoto,
  updateMaintenance,
  updateVehicle,
  uploadVehiclePhoto,
} from '../controllers/vehicles.controller';
import {
  photoUploadErrors,
  vehiclePhotoUpload,
} from '../middlewares/photo-upload';
import {
  requireVehicleMember,
  requireVehicleOwner,
} from '../middlewares/vehicle-access.middleware';
import { createAppointmentSchema } from '../schemas/appointment.schema';
import {
  createMaintenanceSchema,
  updateMaintenanceSchema,
} from '../schemas/maintenance.schema';
import {
  createVehicleSchema,
  updateVehicleSchema,
} from '../schemas/vehicle.schema';
import { AppointmentService } from '../services/appointments.service';
import { MaintenanceService } from '../services/maintenance.service';
import { PartsService } from '../services/parts.service';
import { VehicleAccessService } from '../services/vehicle-access.service';
import { VehiclesService } from '../services/vehicles.service';
import { VinDecoderService } from '../services/vin-decoder.service';
import { StorageService } from '../storage/storage.service';

export function createVehiclesRouter(
  vehiclesService: VehiclesService,
  partsService: PartsService,
  maintenanceService: MaintenanceService,
  appointmentService: AppointmentService,
  access: VehicleAccessService,
  auth: RequestHandler,
  vinDecoder: VinDecoderService,
  clock: Clock,
  storage: StorageService,
): Router {
  const router = Router();

  router.use(auth);
  const member = requireVehicleMember(access);
  const owner = requireVehicleOwner(access);

  const vinDecodeLimiter = rateLimit({
    windowMs: 60 * 1_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.auth.userId,
    handler: (_req, res) => {
      res.status(429).json({
        message: 'Demasiadas consultas de VIN. Intenta de nuevo en un minuto.',
      });
    },
  });

  // Antes de cualquier ruta con :vehicleId.
  router.get('/brands', asyncHandler(listBrands()));

  router.get('/', asyncHandler(listVehicles(vehiclesService)));

  router.post(
    '/',
    validateBody(createVehicleSchema),
    asyncHandler(createVehicle(vehiclesService)),
  );

  router.get(
    '/vin/:vin/decode',
    vinDecodeLimiter,
    asyncHandler(decodeVin(vinDecoder)),
  );

  router.get(
    '/:vehicleId/parts',
    member,
    asyncHandler(listVehicleParts(partsService)),
  );

  router.get(
    '/:vehicleId/expenses/summary',
    member,
    asyncHandler(getExpensesSummary(partsService)),
  );

  router.get(
    '/:vehicleId/maintenances',
    member,
    asyncHandler(listMaintenances(maintenanceService)),
  );

  router.post(
    '/:vehicleId/maintenances',
    member,
    validateBody(createMaintenanceSchema),
    asyncHandler(createMaintenance(maintenanceService)),
  );

  router.get(
    '/:vehicleId/maintenances/:maintenanceId',
    member,
    asyncHandler(getMaintenance(maintenanceService)),
  );

  router.patch(
    '/:vehicleId/maintenances/:maintenanceId',
    member,
    validateBody(updateMaintenanceSchema),
    asyncHandler(updateMaintenance(maintenanceService, access)),
  );

  router.delete(
    '/:vehicleId/maintenances/:maintenanceId',
    member,
    asyncHandler(removeMaintenance(maintenanceService, access)),
  );

  router.get(
    '/:vehicleId/appointments',
    member,
    asyncHandler(listAppointmentsForVehicle(appointmentService)),
  );

  router.post(
    '/:vehicleId/appointments',
    member,
    validateBody(z.lazy(() => createAppointmentSchema(clock.now()))),
    asyncHandler(createAppointmentForVehicle(appointmentService)),
  );

  router.patch(
    '/:vehicleId',
    owner,
    validateBody(updateVehicleSchema),
    asyncHandler(updateVehicle(vehiclesService)),
  );

  router.delete(
    '/:vehicleId',
    owner,
    asyncHandler(removeVehicle(vehiclesService, storage)),
  );

  // El orden importa: auth, dueño y solo después Multer. Así quien no es
  // dueño no llega a escribir archivos en el disco.
  router.post(
    '/:vehicleId/photo',
    owner,
    vehiclePhotoUpload.single('photo'),
    photoUploadErrors,
    asyncHandler(uploadVehiclePhoto(vehiclesService, storage)),
  );

  router.delete(
    '/:vehicleId/photo',
    owner,
    asyncHandler(removeVehiclePhoto(vehiclesService, storage)),
  );

  return router;
}
