import 'reflect-metadata';
import { DeepPartial } from 'typeorm';
import { error as logError, info } from './common/logger';
import { env } from './config/env';
import { AppDataSource } from './db/data-source';
import { Maintenance } from './entities/Maintenance';
import { Part } from './entities/Part';
import { User } from './entities/User';
import { UserVehicle, UserVehicleRole } from './entities/UserVehicle';
import { Vehicle } from './entities/Vehicle';
import { Workshop } from './entities/Workshop';

const VEHICLE_A = '11111111-1111-4111-8111-111111111111';
const VEHICLE_B = '22222222-2222-4222-8222-222222222222';
const VEHICLE_C = '33333333-3333-4333-8333-333333333333';
// Mismo vehículo que VEHICLE_A, registrado aparte por otro usuario.
const VEHICLE_D = '44444444-4444-4444-8444-444444444444';
const VEHICLE_E = '55555555-5555-4555-8555-555555555555';

// Mismo nombre en ambos usuarios: los talleres son personales.
const WORKSHOP_U1 = '66666666-6666-4666-8666-666666666666';
const WORKSHOP_U2 = '77777777-7777-4777-8777-777777777777';

const MAINTENANCE_A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MAINTENANCE_A2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const PART_A1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PART_A2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PART_A3 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const seedUsers: DeepPartial<User>[] = [
  {
    id: 'user-1',
    name: 'Ana Pérez',
    email: null,
    contactPhone: null,
    address: null,
  },
  {
    id: 'user-2',
    name: 'Bruno Soto',
    email: null,
    contactPhone: null,
    address: null,
  },
];

const seedVehicles: DeepPartial<Vehicle>[] = [
  {
    id: VEHICLE_A,
    vin: '1HGCM82633A004352',
    licensePlate: 'BCDF12',
    brand: 'Volkswagen',
    model: 'Polo',
    year: 2021,
    currentMileage: 32500,
    photoUrl: null,
  },
  // Mismo auto que VEHICLE_C, registrado aparte por otro usuario.
  {
    id: VEHICLE_B,
    vin: '2T1BURHE8JC123456',
    licensePlate: 'GHJK34',
    brand: 'Chevrolet',
    model: 'Sail',
    year: 2018,
    currentMileage: 91000,
    photoUrl: null,
  },
  {
    id: VEHICLE_C,
    vin: '2T1BURHE8JC123456',
    licensePlate: 'GHJK34',
    brand: 'Chevrolet',
    model: 'Sail',
    year: 2018,
    currentMileage: 91000,
    photoUrl: null,
  },
  {
    id: VEHICLE_D,
    vin: '1HGCM82633A004352',
    licensePlate: 'BCDF12',
    brand: 'Volkswagen',
    model: 'Polo',
    year: 2021,
    currentMileage: 32500,
    photoUrl: null,
  },
  {
    id: VEHICLE_E,
    vin: null,
    licensePlate: 'JKLP78',
    brand: 'Nissan',
    model: 'Versa',
    year: 2017,
    currentMileage: 118000,
    photoUrl: null,
  },
];

const seedMemberships: DeepPartial<UserVehicle>[] = [
  { userId: 'user-1', vehicleId: VEHICLE_A, role: UserVehicleRole.OWNER },
  { userId: 'user-2', vehicleId: VEHICLE_A, role: UserVehicleRole.GUEST },
  { userId: 'user-1', vehicleId: VEHICLE_B, role: UserVehicleRole.OWNER },
  { userId: 'user-2', vehicleId: VEHICLE_C, role: UserVehicleRole.OWNER },
  { userId: 'user-2', vehicleId: VEHICLE_D, role: UserVehicleRole.OWNER },
  { userId: 'user-1', vehicleId: VEHICLE_E, role: UserVehicleRole.OWNER },
];

const seedWorkshops: DeepPartial<Workshop>[] = [
  {
    id: WORKSHOP_U1,
    name: 'Taller Central',
    address: 'Av. Siempre Viva 742',
    phone: '+56 9 1111 1111',
    rating: 4,
    createdByUserId: 'user-1',
  },
  {
    id: WORKSHOP_U2,
    name: 'Taller Central',
    address: null,
    phone: null,
    rating: 3,
    createdByUserId: 'user-2',
  },
];

const seedMaintenances: DeepPartial<Maintenance>[] = [
  {
    id: MAINTENANCE_A1,
    vehicleId: VEHICLE_A,
    serviceDate: '2026-09-12',
    serviceMileage: 32000,
    description: 'Cambio de aceite y filtros',
    diagnosis: 'Aceite degradado por uso urbano.',
    laborCost: 89990,
    workshopId: WORKSHOP_U1,
    registeredByUserId: 'user-1',
  },
  {
    id: MAINTENANCE_A2,
    vehicleId: VEHICLE_A,
    serviceDate: '2026-08-03',
    serviceMileage: 31000,
    description: 'Revisión de frenos',
    diagnosis: null,
    laborCost: 65990,
    workshopId: null,
    registeredByUserId: 'user-2',
  },
];

const seedParts: DeepPartial<Part>[] = [
  {
    id: PART_A1,
    vehicleId: VEHICLE_A,
    maintenanceId: MAINTENANCE_A1,
    name: 'Filtro de aceite',
    category: 'Filtros y lubricantes',
    cost: 12990,
    purchaseDate: '2026-09-12',
  },
  {
    id: PART_A3,
    vehicleId: VEHICLE_A,
    maintenanceId: MAINTENANCE_A1,
    name: 'Aceite de motor 5W-30',
    category: 'Filtros y lubricantes',
    cost: 34990,
    purchaseDate: '2026-09-12',
  },
  {
    id: PART_A2,
    vehicleId: VEHICLE_A,
    maintenanceId: null,
    name: 'Pastillas de freno',
    category: 'Frenos',
    cost: 45990,
    purchaseDate: '2026-10-15',
  },
];

async function seed(): Promise<void> {
  if (env.nodeEnv === 'production') {
    logError('El seed no se ejecuta en producción.');
    process.exit(1);
  }

  await AppDataSource.initialize();

  try {
    await AppDataSource.getRepository(User).save(seedUsers);
    await AppDataSource.getRepository(Vehicle).save(seedVehicles);
    await AppDataSource.getRepository(UserVehicle).save(seedMemberships);
    await AppDataSource.getRepository(Workshop).save(seedWorkshops);
    await AppDataSource.getRepository(Maintenance).save(seedMaintenances);
    await AppDataSource.getRepository(Part).save(seedParts);

    info('Seed completado.');
    info('Usuarios: user-1, user-2');
    info(
      'VEHICLE_B y VEHICLE_C comparten patente y VIN con dueños distintos; VEHICLE_E no tiene VIN.',
    );
    info(`Vehículos: ${seedVehicles.length}`);
    info(
      `Talleres: ${seedWorkshops.length} (mismo nombre en user-1 y user-2)`,
    );
    info(`Mantenciones: ${seedMaintenances.length}`);
    info(`Repuestos: ${seedParts.length}`);
  } finally {
    await AppDataSource.destroy();
  }
}

seed().catch((error) => {
  logError(
    'No se pudo ejecutar el seed.',
    error instanceof Error ? error.name : undefined,
  );
  process.exit(1);
});
