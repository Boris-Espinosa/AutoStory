import { clerkMiddleware, type ClerkMiddlewareOptions } from '@clerk/express';
import cors from 'cors';
import express, { Express } from 'express';
import { DataSource } from 'typeorm';
import { createAuthMiddleware } from './auth/auth.middleware';
import { Clock, systemClock } from './common/clock';
import { errorHandler, notFoundHandler } from './common/error-handler';
import { error as logError } from './common/logger';
import { env } from './config/env';
import { AppDataSource } from './db/data-source';
import { Appointment } from './entities/Appointment';
import { AppointmentReminder } from './entities/AppointmentReminder';
import { Maintenance } from './entities/Maintenance';
import { Notification } from './entities/Notification';
import { Part } from './entities/Part';
import { User } from './entities/User';
import { UserVehicle } from './entities/UserVehicle';
import { Vehicle } from './entities/Vehicle';
import { Workshop } from './entities/Workshop';
import { AppointmentService } from './appointments/appointments.service';
import { createAppointmentsRouter } from './appointments/appointments.controller';
import { MaintenanceService } from './maintenances/maintenance.service';
import {
  AccountDeletionService,
  ClerkUserDeleter,
  ClerkUserDeleterService,
} from './me/account-deletion.service';
import { createMeRouter } from './me/me.controller';
import { RemindersService } from './me/reminders.service';
import { createNotificationsRouter } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { createPartsRouter } from './parts/parts.controller';
import { PartsService } from './parts/parts.service';
import { createVehiclesRouter } from './vehicles/vehicles.controller';
import { VehicleAccessService } from './vehicles/vehicle-access.service';
import { VehiclesService } from './vehicles/vehicles.service';
import { UPLOADS_DIR } from './vehicles/photo-upload';
import { VinDecoderService } from './vehicles/vin-decoder.service';
import { WorkshopService } from './workshops/workshop.service';
import { createWorkshopsRouter } from './workshops/workshops.controller';
import {
  createStorageService,
  StorageService,
} from './storage/storage.service';
import {
  ClerkProfileProvider,
  ProfileProvider,
  UserSyncService,
} from './users/user-sync.service';

export function createApp(
  dataSource: DataSource = AppDataSource,
  clock: Clock = systemClock,
  profileProvider: ProfileProvider = new ClerkProfileProvider(),
  userDeleter: ClerkUserDeleter = new ClerkUserDeleterService(),
  storage: StorageService = createStorageService(),
): Express {
  const access = new VehicleAccessService(
    dataSource.getRepository(UserVehicle),
  );
  const userSync = new UserSyncService({
    users: dataSource.getRepository(User),
    provider: profileProvider,
    clock,
  });
  const auth = createAuthMiddleware({
    users: dataSource.getRepository(User),
    userSync,
  });

  const partsService = new PartsService({
    maintenances: dataSource.getRepository(Maintenance),
    parts: dataSource.getRepository(Part),
  });

  const appointmentService = new AppointmentService({
    appointments: dataSource.getRepository(Appointment),
    reminders: dataSource.getRepository(AppointmentReminder),
    maintenances: dataSource.getRepository(Maintenance),
    vehicles: dataSource.getRepository(Vehicle),
    workshops: dataSource.getRepository(Workshop),
    users: dataSource.getRepository(User),
    userVehicles: dataSource.getRepository(UserVehicle),
    access,
    clock,
  });

  const maintenanceService = new MaintenanceService({
    maintenances: dataSource.getRepository(Maintenance),
    parts: dataSource.getRepository(Part),
    workshops: dataSource.getRepository(Workshop),
    users: dataSource.getRepository(User),
    clock,
  });

  const workshopService = new WorkshopService(
    dataSource.getRepository(Workshop),
  );

  const notificationsService = new NotificationsService(
    dataSource.getRepository(Notification),
    clock,
  );

  const remindersService = new RemindersService({
    reminders: dataSource.getRepository(AppointmentReminder),
    vehicles: dataSource.getRepository(Vehicle),
    workshops: dataSource.getRepository(Workshop),
    clock,
  });

  const accountDeletionService = new AccountDeletionService(
    dataSource,
    userDeleter,
    storage,
  );

  const vehiclesService = new VehiclesService({
    userVehicles: dataSource.getRepository(UserVehicle),
    vehicles: dataSource.getRepository(Vehicle),
  });

  const vinDecoder = new VinDecoderService();

  const app = express();

  app.set('trust proxy', 1);
  app.use(
    cors({
      origin: env.corsOrigins,
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  if (env.auth.mode === 'clerk') {
    // shortcut: la versión instalada de @clerk/express no expone
    // enableHandshake; quitar este shim al actualizar a una que lo soporte.
    // La API nunca sirve documentos, así que no debe iniciar el handshake 307.
    app.use((req, _res, next) => {
      delete req.headers['sec-fetch-dest'];

      if (req.headers.accept?.startsWith('text/html')) {
        req.headers.accept = 'application/json';
      }

      next();
    });

    const clerkOptions: ClerkMiddlewareOptions & {
      enableHandshake: boolean;
    } = {
      publishableKey: env.auth.publishableKey,
      secretKey: env.auth.secretKey,
      ...(env.auth.authorizedParties
        ? { authorizedParties: env.auth.authorizedParties }
        : {}),
      enableHandshake: false,
    };

    app.use(clerkMiddleware(clerkOptions));
  }

  // Las fotos se sirven por URL con nombre uuid, imposibles de adivinar.
  // Limitación aceptada del prototipo: /uploads no comprueba membresía.
  app.use('/uploads', express.static(UPLOADS_DIR));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/db', async (_req, res) => {
    try {
      await dataSource.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch (error) {
      logError(
        'La base de datos no respondió al diagnóstico.',
        error instanceof Error ? error.name : 'Error',
      );
      res.status(503).json({ status: 'error' });
    }
  });

  app.use('/parts', createPartsRouter(partsService, access, auth));
  app.use('/workshops', createWorkshopsRouter(workshopService, auth));
  app.use(
    '/notifications',
    createNotificationsRouter(notificationsService, auth),
  );
  app.use(
    '/me',
    createMeRouter(remindersService, userSync, accountDeletionService, auth),
  );
  app.use(
    '/appointments',
    createAppointmentsRouter(appointmentService, auth, clock),
  );
  app.use(
    '/vehicles',
    createVehiclesRouter(
      vehiclesService,
      partsService,
      maintenanceService,
      appointmentService,
      access,
      auth,
      vinDecoder,
      clock,
      storage,
    ),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
