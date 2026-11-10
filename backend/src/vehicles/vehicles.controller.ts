import { promises as fs } from 'fs';
import path from 'path';
import { RequestHandler, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Clock } from '../common/clock';
import { asyncHandler } from '../common/async-handler';
import {
  ValidationError,
  formatIssues,
  validateBody,
} from '../common/validation-pipe';
import { HttpError } from '../common/http-error';
import {
  CreateAppointmentInput,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
} from '../appointments/appointment.schema';
import { AppointmentService } from '../appointments/appointments.service';
import { MaintenanceService } from '../maintenances/maintenance.service';
import {
  CreateMaintenanceInput,
  UpdateMaintenanceInput,
  createMaintenanceSchema,
  listMaintenancesQuerySchema,
  updateMaintenanceSchema,
} from '../maintenances/maintenance.schema';
import { PartsService } from '../parts/parts.service';
import { BRANDS } from './brands';
import {
  VEHICLE_PHOTO_URL_PREFIX,
  detectImageExtension,
  photoUploadErrors,
  removeVehiclePhoto,
  vehiclePhotoUpload,
} from './photo-upload';
import {
  requireVehicleMember,
  requireVehicleOwner,
} from './vehicle-access.middleware';
import { VehicleAccessService } from './vehicle-access.service';
import { CreateVehicleInput, createVehicleSchema } from './vehicle.schema';
import { vinParamSchema } from './vin';
import { VehiclesService } from './vehicles.service';
import { VinDecoderService } from './vin-decoder.service';

export function createVehiclesRouter(
  vehiclesService: VehiclesService,
  partsService: PartsService,
  maintenanceService: MaintenanceService,
  appointmentService: AppointmentService,
  access: VehicleAccessService,
  auth: RequestHandler,
  vinDecoder: VinDecoderService,
  clock: Clock,
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
  router.get('/brands', (_req, res) => {
    res.json(BRANDS);
  });

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const vehicles = await vehiclesService.listByUser(req.auth.userId);
      res.json(vehicles);
    }),
  );

  router.post(
    '/',
    validateBody(createVehicleSchema),
    asyncHandler(async (req, res) => {
      const vehicle = await vehiclesService.create(
        req.auth.userId,
        req.body as CreateVehicleInput,
      );
      res.status(201).json(vehicle);
    }),
  );

  router.get(
    '/vin/:vin/decode',
    vinDecodeLimiter,
    asyncHandler(async (req, res) => {
      const parsed = vinParamSchema.safeParse(req.params.vin);

      if (!parsed.success) {
        throw new ValidationError(formatIssues(parsed.error));
      }

      res.json(await vinDecoder.decode(parsed.data));
    }),
  );

  router.get(
    '/:vehicleId/parts',
    member,
    asyncHandler(async (req, res) => {
      const result = await partsService.listByVehicle(req.params.vehicleId, {
        unassigned: req.query.unassigned === 'true',
      });
      res.json(result);
    }),
  );

  router.get(
    '/:vehicleId/expenses/summary',
    member,
    asyncHandler(async (req, res) => {
      const summary = await partsService.getExpensesSummary(req.params.vehicleId);
      res.json(summary);
    }),
  );

  router.get(
    '/:vehicleId/maintenances',
    member,
    asyncHandler(async (req, res) => {
      const parsed = listMaintenancesQuerySchema.safeParse(req.query);

      if (!parsed.success) {
        throw new ValidationError(formatIssues(parsed.error));
      }

      const result = await maintenanceService.list(
        req.params.vehicleId,
        parsed.data,
      );
      res.json(result);
    }),
  );

  router.post(
    '/:vehicleId/maintenances',
    member,
    validateBody(createMaintenanceSchema),
    asyncHandler(async (req, res) => {
      const maintenance = await maintenanceService.create(
        req.auth.userId,
        req.params.vehicleId,
        req.body as CreateMaintenanceInput,
      );
      res.status(201).json(maintenance);
    }),
  );

  router.get(
    '/:vehicleId/maintenances/:maintenanceId',
    member,
    asyncHandler(async (req, res) => {
      const maintenance = await maintenanceService.getOne(
        req.params.vehicleId,
        req.params.maintenanceId,
      );
      res.json(maintenance);
    }),
  );

  router.patch(
    '/:vehicleId/maintenances/:maintenanceId',
    member,
    validateBody(updateMaintenanceSchema),
    asyncHandler(async (req, res) => {
      const membership = await access.assertMember(
        req.auth.userId,
        req.params.vehicleId,
      );

      const maintenance = await maintenanceService.update(
        req.auth.userId,
        membership.role,
        req.params.vehicleId,
        req.params.maintenanceId,
        req.body as UpdateMaintenanceInput,
      );
      res.json(maintenance);
    }),
  );

  router.delete(
    '/:vehicleId/maintenances/:maintenanceId',
    member,
    asyncHandler(async (req, res) => {
      const membership = await access.assertMember(
        req.auth.userId,
        req.params.vehicleId,
      );

      await maintenanceService.remove(
        req.auth.userId,
        membership.role,
        req.params.vehicleId,
        req.params.maintenanceId,
      );
      res.status(204).end();
    }),
  );

  router.get(
    '/:vehicleId/appointments',
    member,
    asyncHandler(async (req, res) => {
      const parsed = listAppointmentsQuerySchema.safeParse(req.query);

      if (!parsed.success) {
        throw new ValidationError(formatIssues(parsed.error));
      }

      res.json(
        await appointmentService.listForVehicle(
          req.auth.userId,
          req.params.vehicleId,
          parsed.data,
        ),
      );
    }),
  );

  router.post(
    '/:vehicleId/appointments',
    member,
    validateBody(z.lazy(() => createAppointmentSchema(clock.now()))),
    asyncHandler(async (req, res) => {
      const appointment = await appointmentService.create(
        req.auth.userId,
        req.params.vehicleId,
        req.body as CreateAppointmentInput,
      );
      res.status(201).json(appointment);
    }),
  );

  router.delete(
    '/:vehicleId',
    owner,
    asyncHandler(async (req, res) => {
      const photoUrl = await vehiclesService.remove(req.params.vehicleId);

      // La foto se borra solo una vez confirmada la transacción, y un fallo de
      // disco no cambia la respuesta: el vehículo ya no existe.
      try {
        await removeVehiclePhoto(photoUrl);
      } catch (error) {
        console.error('No se pudo borrar la foto del vehículo:', error);
      }

      res.status(204).end();
    }),
  );

  // El orden importa: auth, dueño y solo después Multer. Así quien no es
  // dueño no llega a escribir archivos en el disco.
  router.post(
    '/:vehicleId/photo',
    owner,
    vehiclePhotoUpload.single('photo'),
    photoUploadErrors,
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new HttpError(400, 'La foto es obligatoria.');
      }

      const extension = await detectImageExtension(req.file.path);

      if (!extension) {
        await fs.rm(req.file.path, { force: true });
        throw new HttpError(
          400,
          'El archivo no es una imagen válida (solo JPG, PNG o WEBP).',
        );
      }

      const finalPath = req.file.path.replace(/\.tmp$/, `.${extension}`);
      await fs.rename(req.file.path, finalPath);

      const photoUrl = `${VEHICLE_PHOTO_URL_PREFIX}${path.basename(finalPath)}`;

      let previous: string | null;

      try {
        previous = await vehiclesService.setPhoto(req.params.vehicleId, photoUrl);
      } catch (error) {
        await fs.rm(finalPath, { force: true });
        throw error;
      }

      await removeVehiclePhoto(previous);

      res.json({ photoUrl });
    }),
  );

  return router;
}
