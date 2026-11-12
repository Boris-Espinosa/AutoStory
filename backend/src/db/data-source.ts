import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { env } from '../config/env';
import { Appointment } from '../entities/Appointment';
import { AppointmentReminder } from '../entities/AppointmentReminder';
import { Maintenance } from '../entities/Maintenance';
import { Notification } from '../entities/Notification';
import { Part } from '../entities/Part';
import { SharingRequest } from '../entities/SharingRequest';
import { User } from '../entities/User';
import { UserVehicle } from '../entities/UserVehicle';
import { Vehicle } from '../entities/Vehicle';
import { Workshop } from '../entities/Workshop';
import { InitialSchema1767225600000 } from '../migrations/1767225600000-InitialSchema';
import { VehicleMultiUser1767225601000 } from '../migrations/1767225601000-VehicleMultiUser';
import { MaintenanceModule1767225602000 } from '../migrations/1767225602000-MaintenanceModule';
import { AppointmentsModule1767225603000 } from '../migrations/1767225603000-AppointmentsModule';
import { NotificationsWorker1767225604000 } from '../migrations/1767225604000-NotificationsWorker';
import { UserClerkProfile1767225605000 } from '../migrations/1767225605000-UserClerkProfile';

export const ENTITIES = [
  User,
  Vehicle,
  UserVehicle,
  SharingRequest,
  Workshop,
  Maintenance,
  Part,
  Appointment,
  AppointmentReminder,
  Notification,
];

export const MIGRATIONS = [
  InitialSchema1767225600000,
  VehicleMultiUser1767225601000,
  MaintenanceModule1767225602000,
  AppointmentsModule1767225603000,
  NotificationsWorker1767225604000,
  UserClerkProfile1767225605000,
];

export function buildDataSourceOptions(): DataSourceOptions {
  const common = {
    type: 'postgres' as const,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    // Solo migraciones: sincronizar automáticamente puede perder datos.
    synchronize: false,
    logging: false,
  };

  if (env.databaseUrl) {
    return { ...common, url: env.databaseUrl };
  }

  return {
    ...common,
    host: env.database.host!,
    port: env.database.port!,
    username: env.database.username!,
    password: env.database.password!,
    database: env.database.name!,
  };
}

export const AppDataSource = new DataSource(buildDataSourceOptions());
