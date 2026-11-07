import cors from 'cors';
import express, { Express } from 'express';
import { DataSource } from 'typeorm';
import { createAuthMiddleware } from './auth/auth.middleware';
import { errorHandler, notFoundHandler } from './common/error-handler';
import { env } from './config/env';
import { AppDataSource } from './db/data-source';
import { Maintenance } from './entities/Maintenance';
import { Part } from './entities/Part';
import { User } from './entities/User';
import { UserVehicle } from './entities/UserVehicle';
import { Vehicle } from './entities/Vehicle';
import { Workshop } from './entities/Workshop';
import { MaintenanceService } from './maintenances/maintenance.service';
import { createPartsRouter } from './parts/parts.controller';
import { PartsService } from './parts/parts.service';
import { createVehiclesRouter } from './vehicles/vehicles.controller';
import { VehicleAccessService } from './vehicles/vehicle-access.service';
import { VehiclesService } from './vehicles/vehicles.service';
import { UPLOADS_DIR } from './vehicles/photo-upload';
import { VinDecoderService } from './vehicles/vin-decoder.service';
import { WorkshopService } from './workshops/workshop.service';
import { createWorkshopsRouter } from './workshops/workshops.controller';

export function createApp(dataSource: DataSource = AppDataSource): Express {
  const access = new VehicleAccessService(
    dataSource.getRepository(UserVehicle),
  );
  const auth = createAuthMiddleware(dataSource.getRepository(User));

  const partsService = new PartsService({
    maintenances: dataSource.getRepository(Maintenance),
    parts: dataSource.getRepository(Part),
  });

  const maintenanceService = new MaintenanceService({
    maintenances: dataSource.getRepository(Maintenance),
    parts: dataSource.getRepository(Part),
    workshops: dataSource.getRepository(Workshop),
    users: dataSource.getRepository(User),
  });

  const workshopService = new WorkshopService(
    dataSource.getRepository(Workshop),
  );

  const vehiclesService = new VehiclesService({
    userVehicles: dataSource.getRepository(UserVehicle),
    vehicles: dataSource.getRepository(Vehicle),
  });

  const vinDecoder = new VinDecoderService();

  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  // Las fotos se sirven por URL con nombre uuid, imposibles de adivinar.
  // Limitación aceptada del prototipo: /uploads no comprueba membresía.
  app.use('/uploads', express.static(UPLOADS_DIR));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/parts', createPartsRouter(partsService, access, auth));
  app.use('/workshops', createWorkshopsRouter(workshopService, auth));
  app.use(
    '/vehicles',
    createVehiclesRouter(
      vehiclesService,
      partsService,
      maintenanceService,
      access,
      auth,
      vinDecoder,
    ),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
