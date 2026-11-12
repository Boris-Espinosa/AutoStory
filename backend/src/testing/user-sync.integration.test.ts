import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DataSource, Repository } from 'typeorm';
import { createApp } from '../app';
import { Clock } from '../common/clock';
import { Maintenance } from '../entities/Maintenance';
import { Notification, NotificationType } from '../entities/Notification';
import { User } from '../entities/User';
import { UserVehicle, UserVehicleRole } from '../entities/UserVehicle';
import { Vehicle } from '../entities/Vehicle';
import { Workshop } from '../entities/Workshop';
import { adoptUser } from '../users/user-adoption.service';
import {
  ProfileInfo,
  ProfileProvider,
  UserSyncService,
} from '../users/user-sync.service';
import { createTestDataSource } from './test-data-source';

class FakeProfileProvider implements ProfileProvider {
  profile: ProfileInfo | Error = {
    name: null,
    email: null,
    imageUrl: null,
  };
  readonly calls: string[] = [];

  async getProfile(userId: string): Promise<ProfileInfo> {
    this.calls.push(userId);

    if (this.profile instanceof Error) {
      throw this.profile;
    }

    return this.profile;
  }
}

let dataSource: DataSource;
let server: Server;
let baseUrl: string;
let provider: FakeProfileProvider;
let now: Date;
let users: Repository<User>;
let vehicles: Repository<Vehicle>;
let userVehicles: Repository<UserVehicle>;
let workshops: Repository<Workshop>;
let maintenances: Repository<Maintenance>;
let notifications: Repository<Notification>;
let warn: jest.SpyInstance;

const clock: Clock = { now: () => now };
const HOUR_MS = 3_600_000;

function createService(
  profileProvider: ProfileProvider = provider,
): UserSyncService {
  return new UserSyncService({ users, provider: profileProvider, clock });
}

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();

  provider = new FakeProfileProvider();
  const appProvider: ProfileProvider = {
    getProfile: (userId) => provider.getProfile(userId),
  };

  server = createServer(createApp(dataSource, clock, appProvider));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  users = dataSource.getRepository(User);
  vehicles = dataSource.getRepository(Vehicle);
  userVehicles = dataSource.getRepository(UserVehicle);
  workshops = dataSource.getRepository(Workshop);
  maintenances = dataSource.getRepository(Maintenance);
  notifications = dataSource.getRepository(Notification);

  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterAll(async () => {
  warn.mockRestore();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await dataSource.destroy();
});

beforeEach(async () => {
  now = new Date('2026-11-09T12:00:00.000Z');
  provider = new FakeProfileProvider();
  warn.mockClear();
  await dataSource.query(
    `TRUNCATE TABLE "notifications", "appointment_reminders", "appointments", "user_vehicles", "sharing_requests", "parts", "maintenances", "workshops", "vehicles", "users" CASCADE`,
  );
});

interface ApiResponse {
  status: number;
  body: Record<string, any>;
}

async function api(
  method: string,
  path: string,
  userId?: string,
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};

  if (userId) {
    headers['x-user-id'] = userId;
  }

  const response = await fetch(`${baseUrl}${path}`, { method, headers });
  const text = await response.text();

  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

describe('UserSyncService', () => {
  it('crea el usuario con el perfil de Clerk', async () => {
    provider.profile = {
      name: '  Jose\u0301   ',
      email: 'jose@example.com',
      imageUrl: 'https://img.example.com/jose.png',
    };

    const user = await createService().ensureLocalUser('user_nuevo');

    expect(user).toMatchObject({
      id: 'user_nuevo',
      name: 'José',
      email: 'jose@example.com',
      imageUrl: 'https://img.example.com/jose.png',
      profileSyncedAt: now,
    });
    expect(provider.calls).toEqual(['user_nuevo']);
  });

  it('limita el nombre a 120 caracteres', async () => {
    provider.profile = {
      name: 'a'.repeat(130),
      email: null,
      imageUrl: null,
    };

    const user = await createService().ensureLocalUser('user_largo');

    expect(user.name).toHaveLength(120);
  });

  it('no llama al proveedor cuando el perfil es reciente', async () => {
    await users.save({
      id: 'user_reciente',
      name: 'Perfil actual',
      profileSyncedAt: new Date(now.getTime() - HOUR_MS),
    });
    provider.profile = {
      name: 'Perfil nuevo',
      email: 'nuevo@example.com',
      imageUrl: null,
    };

    const user = await createService().ensureLocalUser('user_reciente');

    expect(user.name).toBe('Perfil actual');
    expect(provider.calls).toEqual([]);
  });

  it('refresca el perfil desactualizado', async () => {
    await users.save({
      id: 'user_viejo',
      name: 'Perfil viejo',
      profileSyncedAt: new Date(now.getTime() - 25 * HOUR_MS),
    });
    provider.profile = {
      name: 'Perfil nuevo',
      email: 'nuevo@example.com',
      imageUrl: null,
    };

    const user = await createService().ensureLocalUser('user_viejo');

    expect(user).toMatchObject({
      name: 'Perfil nuevo',
      email: 'nuevo@example.com',
      profileSyncedAt: now,
    });
    expect(provider.calls).toEqual(['user_viejo']);
  });

  it('ante un fallo o timeout deja el usuario mínimo y reintenta después', async () => {
    provider.profile = new Error('Tiempo de espera agotado.');

    const first = await createService().ensureLocalUser('user_fallo');

    expect(first).toMatchObject({
      id: 'user_fallo',
      name: null,
      email: null,
      imageUrl: null,
      profileSyncedAt: null,
    });

    provider.profile = {
      name: 'Recuperado',
      email: 'ok@example.com',
      imageUrl: null,
    };

    const second = await createService().ensureLocalUser('user_fallo');

    expect(second).toMatchObject({
      name: 'Recuperado',
      email: 'ok@example.com',
      profileSyncedAt: now,
    });
  });

  it('guarda el usuario sin correo cuando el email ya pertenece a otro', async () => {
    await users.save({
      id: 'user_dueno_email',
      name: 'Dueño del correo',
      email: 'repetido@example.com',
    });
    provider.profile = {
      name: 'Otro usuario',
      email: 'repetido@example.com',
      imageUrl: null,
    };

    const user = await createService().ensureLocalUser('user_email_repetido');

    expect(user).toMatchObject({
      id: 'user_email_repetido',
      name: 'Otro usuario',
      email: null,
      profileSyncedAt: now,
    });
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('repetido@example.com');
  });

  it('con 20 llamadas simultáneas hace una sola consulta y crea una fila', async () => {
    provider.profile = {
      name: 'Concurrente',
      email: 'concurrente@example.com',
      imageUrl: null,
    };
    const service = createService();

    const results = await Promise.all(
      Array.from({ length: 20 }, () => service.ensureLocalUser('user_nuevo')),
    );

    expect(provider.calls).toEqual(['user_nuevo']);
    expect(results.every((user) => user.id === 'user_nuevo')).toBe(true);
    expect(await users.count({ where: { id: 'user_nuevo' } })).toBe(1);
  });
});

describe('GET /me', () => {
  it('devuelve solo los datos del propio usuario', async () => {
    await users.save([
      {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        imageUrl: 'https://img.example.com/ana.png',
        contactPhone: '+56 9 1111 1111',
        address: 'Av. Siempre Viva 742',
        profileSyncedAt: now,
      },
      {
        id: 'user-2',
        name: 'Bruno',
        email: 'bruno@example.com',
        imageUrl: 'https://img.example.com/bruno.png',
        profileSyncedAt: now,
      },
    ]);

    const response = await api('GET', '/me', 'user-1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 'user-1',
      name: 'Ana',
      email: 'ana@example.com',
      imageUrl: 'https://img.example.com/ana.png',
    });
  });
});

async function createAdoptionFixture(): Promise<{
  vehicle: Vehicle;
  workshop: Workshop;
  maintenance: Maintenance;
  notification: Notification;
}> {
  await users.save({ id: 'user-1', name: 'Ana' });
  const vehicle = await vehicles.save({
    vin: null,
    licensePlate: 'BCDF12',
    brand: 'Volkswagen',
    model: 'Polo',
    year: 2021,
    currentMileage: 1000,
    photoUrl: null,
  });
  await userVehicles.save({
    userId: 'user-1',
    vehicleId: vehicle.id,
    role: UserVehicleRole.OWNER,
  });
  const workshop = await workshops.save({
    name: 'Taller Central',
    address: null,
    phone: null,
    rating: null,
    createdByUserId: 'user-1',
  });
  const maintenance = await maintenances.save({
    vehicleId: vehicle.id,
    serviceDate: '2026-11-01',
    serviceMileage: 1000,
    description: 'Cambio de aceite',
    diagnosis: null,
    laborCost: 0,
    workshopId: workshop.id,
    registeredByUserId: 'user-1',
  });
  const notification = await notifications.save({
    userId: 'user-1',
    type: NotificationType.APPOINTMENT_CREATED,
    title: 'Cita creada',
    body: 'Tu cita quedó agendada.',
    vehicleId: vehicle.id,
    appointmentId: null,
    reminderId: null,
    readAt: null,
  });

  return { vehicle, workshop, maintenance, notification };
}

describe('dev:adopt', () => {
  it('traslada los datos de user-1 al usuario nuevo y elimina el origen', async () => {
    const { vehicle, workshop, maintenance, notification } =
      await createAdoptionFixture();

    const result = await adoptUser(
      dataSource,
      'user-1',
      'user_clerk_nuevo',
      false,
    );

    expect(result.dryRun).toBe(false);
    expect(result.counts).toMatchObject({
      user_vehicles: 1,
      workshops: 1,
      maintenances: 1,
      notifications: 1,
    });
    expect(await users.findOneBy({ id: 'user-1' })).toBeNull();
    await expect(
      users.findOneByOrFail({ id: 'user_clerk_nuevo' }),
    ).resolves.toMatchObject({ id: 'user_clerk_nuevo' });

    await expect(
      userVehicles.findOneByOrFail({ vehicleId: vehicle.id }),
    ).resolves.toMatchObject({ userId: 'user_clerk_nuevo' });
    await expect(
      workshops.findOneByOrFail({ id: workshop.id }),
    ).resolves.toMatchObject({ createdByUserId: 'user_clerk_nuevo' });
    await expect(
      maintenances.findOneByOrFail({ id: maintenance.id }),
    ).resolves.toMatchObject({ registeredByUserId: 'user_clerk_nuevo' });
    await expect(
      notifications.findOneByOrFail({ id: notification.id }),
    ).resolves.toMatchObject({ userId: 'user_clerk_nuevo' });
  });

  it('con --dry-run no cambia nada', async () => {
    const { workshop } = await createAdoptionFixture();

    const result = await adoptUser(
      dataSource,
      'user-1',
      'user_clerk_simulado',
      true,
    );

    expect(result.dryRun).toBe(true);
    expect(result.movedRows).toBeGreaterThan(0);
    await expect(users.findOneBy({ id: 'user-1' })).resolves.toMatchObject({
      id: 'user-1',
    });
    await expect(
      users.findOneBy({ id: 'user_clerk_simulado' }),
    ).resolves.toBeNull();
    await expect(
      workshops.findOneByOrFail({ id: workshop.id }),
    ).resolves.toMatchObject({ createdByUserId: 'user-1' });
  });

  it('aborta sin cambios ante un conflicto de clave', async () => {
    await createAdoptionFixture();
    await users.save({ id: 'user_clerk_conflicto', name: 'Destino' });
    await workshops.save({
      name: 'taller central',
      address: null,
      phone: null,
      rating: null,
      createdByUserId: 'user_clerk_conflicto',
    });

    await expect(
      adoptUser(dataSource, 'user-1', 'user_clerk_conflicto', false),
    ).rejects.toThrow(/conflicto/i);

    await expect(users.findOneBy({ id: 'user-1' })).resolves.toMatchObject({
      id: 'user-1',
    });
    await expect(
      workshops.findOneByOrFail({ name: 'Taller Central' }),
    ).resolves.toMatchObject({ createdByUserId: 'user-1' });
    expect(
      await workshops.count({ where: { createdByUserId: 'user-1' } }),
    ).toBe(1);
    expect(
      await workshops.count({ where: { createdByUserId: 'user_clerk_conflicto' } }),
    ).toBe(1);
  });
});
