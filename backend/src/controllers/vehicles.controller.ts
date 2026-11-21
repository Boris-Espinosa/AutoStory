import { promises as fs } from 'fs';
import { z } from 'zod';
import { AsyncRouteHandler } from '../common/async-handler';
import { HttpError } from '../common/http-error';
import { error as logError, warn as logWarn } from '../common/logger';
import { ValidationError, formatIssues } from '../common/validation-pipe';
import {
  detectImageExtension,
  logPhotoUploadFailure,
} from '../middlewares/photo-upload';
import {
  CreateAppointmentInput,
  listAppointmentsQuerySchema,
} from '../schemas/appointment.schema';
import {
  CreateMaintenanceInput,
  UpdateMaintenanceInput,
  listMaintenancesQuerySchema,
} from '../schemas/maintenance.schema';
import {
  CreateVehicleInput,
  UpdateVehicleInput,
} from '../schemas/vehicle.schema';
import { AppointmentService } from '../services/appointments.service';
import { MaintenanceService } from '../services/maintenance.service';
import { PartsService } from '../services/parts.service';
import { VehicleAccessService } from '../services/vehicle-access.service';
import { VehiclesService } from '../services/vehicles.service';
import { VinDecoderService } from '../services/vin-decoder.service';
import { isVehiclePhotoKey, StorageService } from '../storage/storage.service';
import { BRANDS } from '../utils/brands';
import { vinParamSchema } from '../utils/vin';

function withPublicPhotoUrl<T extends { photoUrl: string | null }>(
  vehicle: T,
  storage: StorageService,
): T {
  return { ...vehicle, photoUrl: storage.publicUrl(vehicle.photoUrl) };
}

async function removeOwnedPhoto(
  storage: StorageService,
  photo: string | null,
  userId: string,
  vehicleId: string,
): Promise<void> {
  if (photo === null) {
    return;
  }

  if (!isVehiclePhotoKey(photo, userId, vehicleId)) {
    logWarn('No se borró la foto: la key no pertenece al vehículo.');
    return;
  }

  await storage.remove(photo);
}

export function listBrands(): AsyncRouteHandler {
  return async (_req, res) => {
    res.json(BRANDS);
  };
}

export function listVehicles(
  vehiclesService: VehiclesService,
  storage: StorageService,
): AsyncRouteHandler {
  return async (req, res) => {
    const vehicles = await vehiclesService.listByUser(req.auth.userId);
    res.json(vehicles.map((vehicle) => withPublicPhotoUrl(vehicle, storage)));
  };
}

export function createVehicle(
  vehiclesService: VehiclesService,
  storage: StorageService,
): AsyncRouteHandler {
  return async (req, res) => {
    const vehicle = await vehiclesService.create(
      req.auth.userId,
      req.body as CreateVehicleInput,
    );
    res.status(201).json(withPublicPhotoUrl(vehicle, storage));
  };
}

export function decodeVin(vinDecoder: VinDecoderService): AsyncRouteHandler {
  return async (req, res) => {
    const parsed = vinParamSchema.safeParse(req.params.vin);

    if (!parsed.success) {
      throw new ValidationError(formatIssues(parsed.error));
    }

    res.json(await vinDecoder.decode(parsed.data));
  };
}

const listVehiclePartsQuerySchema = z
  .object({
    unassigned: z
      .enum(['true', 'false'], {
        errorMap: () => ({ message: 'El filtro no es válido.' }),
      })
      .optional()
      .transform((value) => value === 'true'),
  })
  .strip();

export function listVehicleParts(
  partsService: PartsService,
): AsyncRouteHandler {
  return async (req, res) => {
    const parsed = listVehiclePartsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      throw new ValidationError(formatIssues(parsed.error));
    }

    const result = await partsService.listByVehicle(req.params.vehicleId, {
      unassigned: parsed.data.unassigned,
    });
    res.json(result);
  };
}

export function getExpensesSummary(
  partsService: PartsService,
): AsyncRouteHandler {
  return async (req, res) => {
    const summary = await partsService.getExpensesSummary(req.params.vehicleId);
    res.json(summary);
  };
}

export function listMaintenances(
  maintenanceService: MaintenanceService,
): AsyncRouteHandler {
  return async (req, res) => {
    const parsed = listMaintenancesQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      throw new ValidationError(formatIssues(parsed.error));
    }

    const result = await maintenanceService.list(
      req.params.vehicleId,
      parsed.data,
    );
    res.json(result);
  };
}

export function createMaintenance(
  maintenanceService: MaintenanceService,
): AsyncRouteHandler {
  return async (req, res) => {
    const maintenance = await maintenanceService.create(
      req.auth.userId,
      req.params.vehicleId,
      req.body as CreateMaintenanceInput,
    );
    res.status(201).json(maintenance);
  };
}

export function getMaintenance(
  maintenanceService: MaintenanceService,
): AsyncRouteHandler {
  return async (req, res) => {
    const maintenance = await maintenanceService.getOne(
      req.params.vehicleId,
      req.params.maintenanceId,
    );
    res.json(maintenance);
  };
}

export function updateMaintenance(
  maintenanceService: MaintenanceService,
  access: VehicleAccessService,
): AsyncRouteHandler {
  return async (req, res) => {
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
  };
}

export function removeMaintenance(
  maintenanceService: MaintenanceService,
  access: VehicleAccessService,
): AsyncRouteHandler {
  return async (req, res) => {
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
  };
}

export function listAppointmentsForVehicle(
  appointmentService: AppointmentService,
): AsyncRouteHandler {
  return async (req, res) => {
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
  };
}

export function createAppointmentForVehicle(
  appointmentService: AppointmentService,
): AsyncRouteHandler {
  return async (req, res) => {
    const appointment = await appointmentService.create(
      req.auth.userId,
      req.params.vehicleId,
      req.body as CreateAppointmentInput,
    );
    res.status(201).json(appointment);
  };
}

export function updateVehicle(
  vehiclesService: VehiclesService,
  storage: StorageService,
): AsyncRouteHandler {
  return async (req, res) => {
    const vehicle = await vehiclesService.update(
      req.auth.userId,
      req.params.vehicleId,
      req.body as UpdateVehicleInput,
    );
    res.json(withPublicPhotoUrl(vehicle, storage));
  };
}

export function removeVehicle(
  vehiclesService: VehiclesService,
  storage: StorageService,
): AsyncRouteHandler {
  return async (req, res) => {
    const photoKey = await vehiclesService.remove(req.params.vehicleId);

    // La foto se borra solo una vez confirmada la transacción, y un fallo del
    // almacenamiento no cambia la respuesta: el vehículo ya no existe.
    try {
      await removeOwnedPhoto(
        storage,
        photoKey,
        req.auth.userId,
        req.params.vehicleId,
      );
    } catch (error) {
      logError(
        'No se pudo borrar la foto del vehículo.',
        error instanceof Error ? error.name : undefined,
      );
    }

    res.status(204).end();
  };
}

export function uploadVehiclePhoto(
  vehiclesService: VehiclesService,
  storage: StorageService,
): AsyncRouteHandler {
  return async (req, res) => {
    if (!req.file) {
      const error = new HttpError(400, 'La foto es obligatoria.');
      logPhotoUploadFailure(error, req.file);
      throw error;
    }

    const source: Buffer | string = req.file.buffer ?? req.file.path;

    try {
      // El tipo MIME (vacío o application/octet-stream) no decide nada: la
      // firma real del archivo es la que valida el formato.
      const extension = await detectImageExtension(source);

      if (!extension) {
        const error = new HttpError(
          400,
          'El archivo no es una imagen válida (solo JPG, PNG o WEBP).',
        );
        logPhotoUploadFailure(error, req.file);
        throw error;
      }

      let photoKey: string;

      try {
        photoKey = await storage.save(
          source,
          extension,
          req.auth.userId,
          req.params.vehicleId,
        );
      } catch (error) {
        logPhotoUploadFailure(error, req.file);
        throw new HttpError(500, 'No se pudo guardar la foto.');
      }

      let previous: string | null;

      try {
        previous = await vehiclesService.setPhoto(
          req.params.vehicleId,
          photoKey,
        );
      } catch (error) {
        // Si la base rechaza la foto, no debe quedar huérfana en el almacenamiento.
        await removeOwnedPhoto(
          storage,
          photoKey,
          req.auth.userId,
          req.params.vehicleId,
        ).catch(() => undefined);
        logPhotoUploadFailure(error, req.file);
        throw error;
      }

      try {
        await removeOwnedPhoto(
          storage,
          previous,
          req.auth.userId,
          req.params.vehicleId,
        );
      } catch (error) {
        logWarn(
          'No se pudo borrar la foto anterior del vehículo.',
          error instanceof Error ? error.name : undefined,
        );
      }

      res.json({ photoUrl: storage.publicUrl(photoKey) });
    } finally {
      if (typeof source === 'string') {
        try {
          await fs.rm(source, { force: true });
        } catch (error) {
          logWarn(
            'No se pudo borrar el archivo temporal de la foto.',
            error instanceof Error ? error.name : undefined,
          );
        }
      }
    }
  };
}

export function removeVehiclePhoto(
  vehiclesService: VehiclesService,
  storage: StorageService,
): AsyncRouteHandler {
  return async (req, res) => {
    const previous = await vehiclesService.setPhoto(
      req.params.vehicleId,
      null,
    );

    try {
      await removeOwnedPhoto(
        storage,
        previous,
        req.auth.userId,
        req.params.vehicleId,
      );
    } catch (error) {
      logWarn(
        'No se pudo borrar la foto del vehículo.',
        error instanceof Error ? error.name : undefined,
      );
    }

    res.status(204).end();
  };
}
