import { DataSource, Repository } from 'typeorm';
import { Maintenance } from '../entities/Maintenance';
import { Part } from '../entities/Part';
import {
  SharingRequest,
  SharingRequestStatus,
} from '../entities/SharingRequest';
import { User } from '../entities/User';
import { UserVehicle, UserVehicleRole } from '../entities/UserVehicle';
import { Vehicle } from '../entities/Vehicle';
import { VehicleAccessService } from '../vehicles/vehicle-access.service';
import { createTestDataSource } from './test-data-source';

let dataSource: DataSource;
let users: Repository<User>;
let vehicles: Repository<Vehicle>;
let userVehicles: Repository<UserVehicle>;
let sharingRequests: Repository<SharingRequest>;
let maintenances: Repository<Maintenance>;
let parts: Repository<Part>;
let access: VehicleAccessService;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();

  users = dataSource.getRepository(User);
  vehicles = dataSource.getRepository(Vehicle);
  userVehicles = dataSource.getRepository(UserVehicle);
  sharingRequests = dataSource.getRepository(SharingRequest);
  maintenances = dataSource.getRepository(Maintenance);
  parts = dataSource.getRepository(Part);
  access = new VehicleAccessService(userVehicles);
});

afterAll(async () => {
  await dataSource.destroy();
});

beforeEach(async () => {
  await dataSource.query(
    `TRUNCATE TABLE "user_vehicles", "sharing_requests", "parts", "maintenances", "workshops", "vehicles", "users" CASCADE`,
  );
});

function vehicleData(overrides: Partial<Vehicle> = {}): Partial<Vehicle> {
  return {
    vin: 'WVWZZZ6RZMY000001',
    licensePlate: 'BBJJ12',
    brand: 'Volkswagen',
    model: 'Polo',
    year: 2021,
    currentMileage: 1000,
    photoUrl: null,
    ...overrides,
  };
}

async function createUser(id: string): Promise<User> {
  return users.save({ id, name: `Usuario ${id}` });
}

async function createVehicle(
  overrides: Partial<Vehicle> = {},
): Promise<Vehicle> {
  return vehicles.save(vehicleData(overrides));
}

async function addMembership(
  userId: string,
  vehicleId: string,
  role: UserVehicleRole,
): Promise<UserVehicle> {
  return userVehicles.save({ userId, vehicleId, role });
}

describe('VehicleAccessService', () => {
  it('responde 404 cuando el usuario no es miembro', async () => {
    const owner = await createUser('user-1');
    const outsider = await createUser('user-2');
    const vehicle = await createVehicle();
    await addMembership(owner.id, vehicle.id, UserVehicleRole.OWNER);

    await expect(
      access.assertMember(outsider.id, vehicle.id),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Vehículo no encontrado.',
    });
  });

  it('responde 403 cuando un invitado intenta una acción de dueño', async () => {
    const guest = await createUser('user-2');
    const vehicle = await createVehicle();
    await addMembership(guest.id, vehicle.id, UserVehicleRole.GUEST);

    await expect(
      access.assertOwner(guest.id, vehicle.id),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'No tienes permiso para esta acción.',
    });
  });

  it('deja pasar al dueño como miembro y como dueño', async () => {
    const owner = await createUser('user-1');
    const vehicle = await createVehicle();
    await addMembership(owner.id, vehicle.id, UserVehicleRole.OWNER);

    await expect(access.assertMember(owner.id, vehicle.id)).resolves.toMatchObject(
      { role: UserVehicleRole.OWNER },
    );
    await expect(access.assertOwner(owner.id, vehicle.id)).resolves.toMatchObject(
      { role: UserVehicleRole.OWNER },
    );
  });

  it('responde 404 cuando el id del vehículo no es un uuid', async () => {
    const owner = await createUser('user-1');

    await expect(
      access.assertMember(owner.id, 'no-es-un-uuid'),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Vehículo no encontrado.',
    });
  });
});

describe('índice único de dueño', () => {
  it('falla al registrar un segundo OWNER para el mismo vehículo', async () => {
    const first = await createUser('user-1');
    const second = await createUser('user-2');
    const vehicle = await createVehicle();

    await addMembership(first.id, vehicle.id, UserVehicleRole.OWNER);

    await expect(
      addMembership(second.id, vehicle.id, UserVehicleRole.OWNER),
    ).rejects.toThrow();
  });

  it('existe el índice parcial en la base de datos', async () => {
    const rows: Array<{ indexdef: string }> = await dataSource.query(`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'user_vehicles'
        AND indexname = 'UQ_user_vehicles_owner'
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('OWNER');
  });
});

describe('modelo multi-usuario', () => {
  it('permite la misma patente y el mismo VIN en usuarios distintos', async () => {
    const first = await createUser('user-1');
    const second = await createUser('user-2');

    const firstVehicle = await createVehicle();
    const secondVehicle = await createVehicle();

    await addMembership(first.id, firstVehicle.id, UserVehicleRole.OWNER);
    await addMembership(second.id, secondVehicle.id, UserVehicleRole.OWNER);

    expect(secondVehicle.id).not.toBe(firstVehicle.id);
    expect(secondVehicle.licensePlate).toBe(firstVehicle.licensePlate);
    expect(secondVehicle.vin).toBe(firstVehicle.vin);
  });

  it('permite guardar un vehículo sin VIN', async () => {
    const vehicle = await createVehicle({ vin: null });

    expect(vehicle.vin).toBeNull();
  });

  it('normaliza la patente y el VIN al guardar', async () => {
    const vehicle = await createVehicle({
      vin: ' wvwzzz6rzmy000001 ',
      licensePlate: 'bb-jj 12',
    });

    const reloaded = await vehicles.findOneByOrFail({ id: vehicle.id });

    expect(reloaded.vin).toBe('WVWZZZ6RZMY000001');
    expect(reloaded.licensePlate).toBe('BBJJ12');
  });

  it('no deja índices únicos sobre vin ni license_plate y deja vin nullable', async () => {
    const indexes: Array<{ indexname: string; indexdef: string }> =
      await dataSource.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'vehicles'
      `);

    const uniqueOnVehicleData = indexes.filter(
      (index) =>
        /unique/i.test(index.indexdef) &&
        /\((vin|license_plate)\)/.test(index.indexdef),
    );

    expect(uniqueOnVehicleData).toEqual([]);
    expect(indexes.map((index) => index.indexname)).toEqual(
      expect.arrayContaining([
        'IDX_vehicles_vin',
        'IDX_vehicles_license_plate',
      ]),
    );

    const [column]: Array<{ is_nullable: string }> = await dataSource.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'vehicles' AND column_name = 'vin'
    `);

    expect(column.is_nullable).toBe('YES');
  });
});

describe('borrado en cascada', () => {
  it('elimina UserVehicle, Part, Maintenance y SharingRequest al borrar el vehículo', async () => {
    const owner = await createUser('user-1');
    const receiver = await createUser('user-2');
    const vehicle = await createVehicle();
    await addMembership(owner.id, vehicle.id, UserVehicleRole.OWNER);

    const maintenance = await maintenances.save({
      vehicleId: vehicle.id,
      registeredByUserId: owner.id,
      description: 'Cambio de aceite',
      serviceDate: '2026-01-10',
      serviceMileage: 1000,
      diagnosis: null,
      laborCost: 89990,
      workshopId: null,
    });

    await parts.save({
      vehicleId: vehicle.id,
      maintenanceId: maintenance.id,
      name: 'Filtro de aceite',
      category: 'Filtros y lubricantes',
      cost: 12990,
      purchaseDate: '2026-01-10',
    });

    await sharingRequests.save({
      vehicleId: vehicle.id,
      senderUserId: owner.id,
      receiverUserId: receiver.id,
      status: SharingRequestStatus.PENDING,
    });

    await vehicles.delete({ id: vehicle.id });

    expect(await userVehicles.count({ where: { vehicleId: vehicle.id } })).toBe(0);
    expect(await parts.count({ where: { vehicleId: vehicle.id } })).toBe(0);
    expect(await maintenances.count({ where: { vehicleId: vehicle.id } })).toBe(0);
    expect(
      await sharingRequests.count({ where: { vehicleId: vehicle.id } }),
    ).toBe(0);
  });

  it('falla al borrar un usuario que es dueño de un vehículo', async () => {
    const owner = await createUser('user-1');
    const vehicle = await createVehicle();
    await addMembership(owner.id, vehicle.id, UserVehicleRole.OWNER);

    await expect(users.delete({ id: owner.id })).rejects.toThrow();
    await expect(users.findOneBy({ id: owner.id })).resolves.toMatchObject({
      id: owner.id,
    });
  });
});
