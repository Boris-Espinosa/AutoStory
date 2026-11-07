import { DataSource, Repository } from 'typeorm';
import { Maintenance } from '../entities/Maintenance';
import { Part } from '../entities/Part';
import { User } from '../entities/User';
import { Vehicle } from '../entities/Vehicle';
import { Workshop } from '../entities/Workshop';
import { createTestDataSource } from './test-data-source';

let dataSource: DataSource;
let users: Repository<User>;
let vehicles: Repository<Vehicle>;
let workshops: Repository<Workshop>;
let maintenances: Repository<Maintenance>;
let parts: Repository<Part>;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();

  users = dataSource.getRepository(User);
  vehicles = dataSource.getRepository(Vehicle);
  workshops = dataSource.getRepository(Workshop);
  maintenances = dataSource.getRepository(Maintenance);
  parts = dataSource.getRepository(Part);
});

afterAll(async () => {
  await dataSource.destroy();
});

beforeEach(async () => {
  await dataSource.query(
    `TRUNCATE TABLE "parts", "maintenances", "workshops", "vehicles", "users" CASCADE`,
  );
});

async function createUser(id: string): Promise<User> {
  return users.save({ id, name: `Usuario ${id}` });
}

async function createVehicle(): Promise<Vehicle> {
  return vehicles.save({
    vin: null,
    licensePlate: 'BBJJ12',
    brand: 'Volkswagen',
    model: 'Polo',
    year: 2021,
    currentMileage: 1000,
    photoUrl: null,
  });
}

async function createWorkshop(
  createdByUserId: string,
  name = 'Taller Central',
): Promise<Workshop> {
  return workshops.save({ createdByUserId, name, rating: null });
}

async function createMaintenance(
  vehicleId: string,
  overrides: Partial<Maintenance> = {},
): Promise<Maintenance> {
  return maintenances.save({
    vehicleId,
    serviceDate: '2026-01-10',
    serviceMileage: 1000,
    description: 'Cambio de aceite',
    diagnosis: null,
    laborCost: 0,
    workshopId: null,
    registeredByUserId: null,
    ...overrides,
  });
}

describe('talleres personales', () => {
  it('rechaza el mismo nombre en el mismo usuario sin distinguir mayúsculas', async () => {
    await createUser('user-1');
    await createWorkshop('user-1', 'Taller Central');

    await expect(createWorkshop('user-1', 'taller central')).rejects.toThrow();
  });

  it('permite el mismo nombre en usuarios distintos', async () => {
    await createUser('user-1');
    await createUser('user-2');
    const first = await createWorkshop('user-1', 'Taller Central');
    const second = await createWorkshop('user-2', 'Taller Central');

    expect(second.id).not.toBe(first.id);
    expect(second.name).toBe(first.name);
  });
});

describe('fecha del servicio', () => {
  it('se lee como texto YYYY-MM-DD', async () => {
    const vehicle = await createVehicle();
    const maintenance = await createMaintenance(vehicle.id);

    const reloaded = await maintenances.findOneByOrFail({ id: maintenance.id });

    expect(reloaded.serviceDate).toBe('2026-01-10');
  });
});

describe('borrados y SET NULL', () => {
  it('elimina las mantenciones y repuestos del vehículo en cascada', async () => {
    const vehicle = await createVehicle();
    const maintenance = await createMaintenance(vehicle.id);
    await parts.save({
      vehicleId: vehicle.id,
      maintenanceId: maintenance.id,
      name: 'Filtro de aceite',
      category: 'Filtros y lubricantes',
      cost: 12990,
      purchaseDate: '2026-01-10',
    });

    await vehicles.delete({ id: vehicle.id });

    expect(await maintenances.count()).toBe(0);
    expect(await parts.count()).toBe(0);
  });

  it('deja workshopId en null al borrar el taller', async () => {
    await createUser('user-1');
    const workshop = await createWorkshop('user-1');
    const vehicle = await createVehicle();
    const maintenance = await createMaintenance(vehicle.id, {
      workshopId: workshop.id,
    });

    await workshops.delete({ id: workshop.id });

    const reloaded = await maintenances.findOneByOrFail({ id: maintenance.id });
    expect(reloaded.workshopId).toBeNull();
  });

  it('deja maintenanceId en null al borrar la mantención', async () => {
    const vehicle = await createVehicle();
    const maintenance = await createMaintenance(vehicle.id);
    const part = await parts.save({
      vehicleId: vehicle.id,
      maintenanceId: maintenance.id,
      name: 'Filtro de aceite',
      category: 'Filtros y lubricantes',
      cost: 12990,
      purchaseDate: '2026-01-10',
    });

    await maintenances.delete({ id: maintenance.id });

    const reloaded = await parts.findOneByOrFail({ id: part.id });
    expect(reloaded.maintenanceId).toBeNull();
  });
});

describe('CHECK de la base de datos', () => {
  it('rechaza kilometraje y costo de mano de obra negativos', async () => {
    const vehicle = await createVehicle();

    await expect(
      createMaintenance(vehicle.id, { serviceMileage: -1 }),
    ).rejects.toThrow();
    await expect(
      createMaintenance(vehicle.id, { laborCost: -1 }),
    ).rejects.toThrow();
  });

  it('rechaza un rating fuera de 1 a 5', async () => {
    await createUser('user-1');

    await expect(
      workshops.save({ createdByUserId: 'user-1', name: 'A', rating: 0 }),
    ).rejects.toThrow();
    await expect(
      workshops.save({ createdByUserId: 'user-1', name: 'B', rating: 6 }),
    ).rejects.toThrow();
  });
});
