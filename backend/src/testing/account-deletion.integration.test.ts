import { promises as fs } from 'fs';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import path from 'path';
import { DataSource, Repository } from 'typeorm';
import { createApp } from '../app';
import { Clock } from '../common/clock';
import { Appointment, AppointmentStatus } from '../entities/Appointment';
import { AppointmentReminder } from '../entities/AppointmentReminder';
import { Maintenance } from '../entities/Maintenance';
import {
  Notification,
  NotificationType,
} from '../entities/Notification';
import { Part } from '../entities/Part';
import {
  SharingRequest,
  SharingRequestStatus,
} from '../entities/SharingRequest';
import { User } from '../entities/User';
import { UserVehicle, UserVehicleRole } from '../entities/UserVehicle';
import { Vehicle } from '../entities/Vehicle';
import { Workshop } from '../entities/Workshop';
import { ClerkUserDeleter } from '../me/account-deletion.service';
import { VEHICLE_UPLOADS_DIR } from '../vehicles/photo-upload';
import { createTestDataSource } from './test-data-source';

class FakeClerkUserDeleter implements ClerkUserDeleter {
  readonly calls: string[] = [];
  shouldFail = false;

  async deleteUser(userId: string): Promise<void> {
    this.calls.push(userId);

    if (this.shouldFail) {
      throw new Error('Clerk no disponible');
    }
  }
}

let dataSource: DataSource;
let server: Server;
let baseUrl: string;
let deleter: FakeClerkUserDeleter;
let users: Repository<User>;
let vehicles: Repository<Vehicle>;
let userVehicles: Repository<UserVehicle>;
let workshops: Repository<Workshop>;
let maintenances: Repository<Maintenance>;
let parts: Repository<Part>;
let appointments: Repository<Appointment>;
let reminders: Repository<AppointmentReminder>;
let notifications: Repository<Notification>;
let sharingRequests: Repository<SharingRequest>;

const clock: Clock = { now: () => new Date('2026-11-09T12:00:00.000Z') };
const PHOTO_NAME = 'account-deletion-test.jpg';
const PHOTO_PATH = path.join(VEHICLE_UPLOADS_DIR, PHOTO_NAME);
const PHOTO_URL = `/uploads/vehicles/${PHOTO_NAME}`;

interface ApiResponse {
  status: number;
  body: Record<string, any>;
}

async function api(
  method: string,
  apiPath: string,
  options: { userId?: string; body?: unknown } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};

  if (options.userId) {
    headers['x-user-id'] = options.userId;
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers,
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();

  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

async function seedUser(id: string): Promise<void> {
  await users.save({ id, name: `Usuario ${id}` });
}

async function seedVehicle(
  id: string,
  ownerId: string,
  photoUrl: string | null = null,
): Promise<Vehicle> {
  const vehicle = await vehicles.save(
    vehicles.create({
      vin: null,
      licensePlate: `BCDF${id}`,
      brand: 'Volkswagen',
      model: 'Polo',
      year: 2021,
      currentMileage: 1000,
      photoUrl,
    }),
  );

  await userVehicles.save({
    userId: ownerId,
    vehicleId: vehicle.id,
    role: UserVehicleRole.OWNER,
  });

  return vehicle;
}

async function seedAccountData(): Promise<void> {
  await seedUser('user-1');
  await seedUser('user-2');
  await seedUser('user-3');

  const v1 = await seedVehicle('11', 'user-1', PHOTO_URL);
  const v2 = await seedVehicle('22', 'user-2');
  const v3 = await seedVehicle('33', 'user-3');

  await userVehicles.save({
    userId: 'user-2',
    vehicleId: v1.id,
    role: UserVehicleRole.GUEST,
  });
  await userVehicles.save({
    userId: 'user-1',
    vehicleId: v2.id,
    role: UserVehicleRole.GUEST,
  });

  const w1 = await workshops.save({
    name: 'Taller de user-1',
    createdByUserId: 'user-1',
  });
  const w2 = await workshops.save({
    name: 'Taller de user-2',
    createdByUserId: 'user-2',
  });

  const m1 = await maintenances.save({
    vehicleId: v1.id,
    serviceDate: '2026-10-01',
    serviceMileage: 1000,
    description: 'Cambio de aceite',
    diagnosis: null,
    laborCost: 10000,
    workshopId: w1.id,
    registeredByUserId: 'user-1',
  });

  await parts.save({
    vehicleId: v1.id,
    maintenanceId: m1.id,
    name: 'Filtro',
    category: 'Filtros y lubricantes',
    cost: 5000,
    purchaseDate: '2026-10-01',
  });

  await maintenances.save({
    vehicleId: v2.id,
    serviceDate: '2026-10-02',
    serviceMileage: 2000,
    description: 'Alineación',
    diagnosis: null,
    laborCost: 8000,
    workshopId: w2.id,
    registeredByUserId: 'user-1',
  });

  const a1 = await appointments.save({
    vehicleId: v1.id,
    workshopId: w1.id,
    createdByUserId: 'user-1',
    scheduledAt: new Date('2026-11-20T12:00:00.000Z'),
    timezone: 'America/Santiago',
    reason: 'Revisión',
    notes: null,
    status: AppointmentStatus.SCHEDULED,
  });

  const a2 = await appointments.save({
    vehicleId: v2.id,
    workshopId: w2.id,
    createdByUserId: 'user-1',
    scheduledAt: new Date('2026-11-21T12:00:00.000Z'),
    timezone: 'America/Santiago',
    reason: 'Alineación',
    notes: null,
    status: AppointmentStatus.SCHEDULED,
  });

  const r1 = await reminders.save({
    appointmentId: a1.id,
    offsetMinutes: 1440,
    remindAt: new Date('2026-11-19T12:00:00.000Z'),
  });

  await notifications.save([
    {
      userId: 'user-1',
      type: NotificationType.APPOINTMENT_REMINDER,
      title: 'Recordatorio',
      body: 'Tu cita es mañana',
      vehicleId: v1.id,
      appointmentId: a1.id,
      reminderId: r1.id,
    },
    {
      userId: 'user-2',
      type: NotificationType.APPOINTMENT_CREATED,
      title: 'Cita creada',
      body: 'Tienes una cita',
      vehicleId: v2.id,
      appointmentId: a2.id,
      reminderId: null,
    },
  ]);

  await sharingRequests.save({
    vehicleId: v3.id,
    senderUserId: 'user-3',
    receiverUserId: 'user-1',
    status: SharingRequestStatus.PENDING,
  });
}

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  deleter = new FakeClerkUserDeleter();

  server = createServer(createApp(dataSource, clock, undefined, deleter));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  users = dataSource.getRepository(User);
  vehicles = dataSource.getRepository(Vehicle);
  userVehicles = dataSource.getRepository(UserVehicle);
  workshops = dataSource.getRepository(Workshop);
  maintenances = dataSource.getRepository(Maintenance);
  parts = dataSource.getRepository(Part);
  appointments = dataSource.getRepository(Appointment);
  reminders = dataSource.getRepository(AppointmentReminder);
  notifications = dataSource.getRepository(Notification);
  sharingRequests = dataSource.getRepository(SharingRequest);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await dataSource.destroy();
});

beforeEach(async () => {
  deleter.calls.length = 0;
  deleter.shouldFail = false;
  await dataSource.query(
    `TRUNCATE TABLE "notifications", "appointment_reminders", "appointments", "user_vehicles", "sharing_requests", "parts", "maintenances", "workshops", "vehicles", "users" CASCADE`,
  );
  await fs.mkdir(VEHICLE_UPLOADS_DIR, { recursive: true });
  await fs.writeFile(PHOTO_PATH, 'foto');
  await seedAccountData();
});

afterEach(async () => {
  await fs.rm(PHOTO_PATH, { force: true });
});

describe('eliminación de cuenta', () => {
  it('previsualiza solo los conteos del usuario autenticado', async () => {
    const preview = await api('GET', '/me/deletion-preview', {
      userId: 'user-1',
    });

    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({
      ownedVehicles: 1,
      ownedVehiclesWithGuests: 1,
      guestMemberships: 1,
    });
  });

  it('borra la cuenta y todo lo que le pertenece', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      const response = await api('DELETE', '/me', {
        userId: 'user-1',
        body: { confirm: 'ELIMINAR' },
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ clerkDeleted: true });
      expect(deleter.calls).toEqual(['user-1']);
      await expect(fs.access(PHOTO_PATH)).rejects.toBeDefined();

      expect(await users.findOneBy({ id: 'user-1' })).toBeNull();
      expect(await vehicles.findOneBy({ licensePlate: 'BCDF11' })).toBeNull();
      expect(await userVehicles.countBy({ userId: 'user-1' })).toBe(0);
      expect(await workshops.countBy({ createdByUserId: 'user-1' })).toBe(0);
      expect(await notifications.countBy({ userId: 'user-1' })).toBe(0);

      const ownedMaintenances: unknown[] = await dataSource.query(
        `SELECT 1
           FROM "maintenances" maintenance
           JOIN "vehicles" vehicle ON vehicle."id" = maintenance."vehicle_id"
          WHERE vehicle."license_plate" = 'BCDF11'`,
      );
      expect(ownedMaintenances).toEqual([]);

      const ownedParts: unknown[] = await dataSource.query(
        `SELECT 1
           FROM "parts" part
           JOIN "vehicles" vehicle ON vehicle."id" = part."vehicle_id"
          WHERE vehicle."license_plate" = 'BCDF11'`,
      );
      expect(ownedParts).toEqual([]);

      const ownedAppointments: unknown[] = await dataSource.query(
        `SELECT 1
           FROM "appointments" appointment
           JOIN "vehicles" vehicle ON vehicle."id" = appointment."vehicle_id"
          WHERE vehicle."license_plate" = 'BCDF11'`,
      );
      expect(ownedAppointments).toEqual([]);

      expect(
        await sharingRequests.countBy({ receiverUserId: 'user-1' }),
      ).toBe(0);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('quita el acceso a los invitados sin tocar sus propios datos', async () => {
    const before = await api('GET', '/vehicles', { userId: 'user-2' });
    expect(before.body.map((vehicle: Vehicle) => vehicle.licensePlate)).toEqual(
      expect.arrayContaining(['BCDF11', 'BCDF22']),
    );

    const response = await api('DELETE', '/me', {
      userId: 'user-1',
      body: { confirm: 'ELIMINAR' },
    });
    expect(response.status).toBe(200);

    const after = await api('GET', '/vehicles', { userId: 'user-2' });
    expect(after.status).toBe(200);
    expect(after.body.map((vehicle: Vehicle) => vehicle.licensePlate)).toEqual([
      'BCDF22',
    ]);

    expect(await users.findOneBy({ id: 'user-2' })).not.toBeNull();
    expect(await users.findOneBy({ id: 'user-3' })).not.toBeNull();
    expect(await vehicles.countBy({ licensePlate: 'BCDF22' })).toBe(1);
    expect(await vehicles.countBy({ licensePlate: 'BCDF33' })).toBe(1);
    expect(
      await workshops.countBy({ createdByUserId: 'user-2' }),
    ).toBe(1);
  });

  it('deja sin autor los registros de otros usuarios que lo referencian', async () => {
    const response = await api('DELETE', '/me', {
      userId: 'user-1',
      body: { confirm: 'ELIMINAR' },
    });
    expect(response.status).toBe(200);

    const maintenance = await maintenances.findOneByOrFail({
      description: 'Alineación',
    });
    expect(maintenance.registeredByUserId).toBeNull();

    const appointment = await appointments.findOneByOrFail({
      reason: 'Alineación',
    });
    expect(appointment.createdByUserId).toBeNull();

    expect(await notifications.countBy({ userId: 'user-2' })).toBe(1);
    expect(await userVehicles.countBy({ userId: 'user-2' })).toBe(1);
  });

  it('rechaza una confirmación incorrecta sin borrar nada', async () => {
    const response = await api('DELETE', '/me', {
      userId: 'user-1',
      body: { confirm: 'eliminar' },
    });

    expect(response.status).toBe(400);
    expect(await users.findOneBy({ id: 'user-1' })).not.toBeNull();
    expect(deleter.calls).toEqual([]);
  });

  it('responde 200 con clerkDeleted false si Clerk falla', async () => {
    deleter.shouldFail = true;
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      const response = await api('DELETE', '/me', {
        userId: 'user-1',
        body: { confirm: 'ELIMINAR' },
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ clerkDeleted: false });
      expect(await users.findOneBy({ id: 'user-1' })).toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        'No se pudo eliminar la cuenta en Clerk; la eliminación local ya se completó.',
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('solo elimina la cuenta del usuario autenticado', async () => {
    const response = await api('DELETE', '/me', {
      userId: 'user-2',
      body: { confirm: 'ELIMINAR' },
    });

    expect(response.status).toBe(200);
    expect(deleter.calls).toEqual(['user-2']);
    expect(await users.findOneBy({ id: 'user-1' })).not.toBeNull();
    expect(await users.findOneBy({ id: 'user-2' })).toBeNull();
    expect(await vehicles.countBy({ licensePlate: 'BCDF11' })).toBe(1);
    expect(await vehicles.countBy({ licensePlate: 'BCDF22' })).toBe(0);
  });
});
