import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DataSource, Repository } from 'typeorm';
import { createApp } from '../app';
import { Clock } from '../common/clock';
import { Appointment, AppointmentStatus } from '../entities/Appointment';
import { AppointmentReminder } from '../entities/AppointmentReminder';
import { User } from '../entities/User';
import { UserVehicle, UserVehicleRole } from '../entities/UserVehicle';
import { Vehicle } from '../entities/Vehicle';
import { Workshop } from '../entities/Workshop';
import { createTestDataSource } from './test-data-source';

let dataSource: DataSource;
let server: Server;
let baseUrl: string;
let now: Date;
let appointments: Repository<Appointment>;
let reminders: Repository<AppointmentReminder>;
let vehicles: Repository<Vehicle>;
let userVehicles: Repository<UserVehicle>;
let workshops: Repository<Workshop>;

const clock: Clock = { now: () => now };
const HOUR_MS = 3_600_000;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();

  server = createServer(createApp(dataSource, clock));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  appointments = dataSource.getRepository(Appointment);
  reminders = dataSource.getRepository(AppointmentReminder);
  vehicles = dataSource.getRepository(Vehicle);
  userVehicles = dataSource.getRepository(UserVehicle);
  workshops = dataSource.getRepository(Workshop);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await dataSource.destroy();
});

beforeEach(async () => {
  now = new Date('2026-01-10T12:00:00.000Z');
  await dataSource.query(
    `TRUNCATE TABLE "notifications", "appointment_reminders", "appointments", "user_vehicles", "sharing_requests", "parts", "maintenances", "workshops", "vehicles", "users" CASCADE`,
  );
  await dataSource.getRepository(User).save([
    { id: 'user-1', name: 'Ana' },
    { id: 'user-2', name: 'Bruno' },
    { id: 'user-3', name: 'Carla' },
  ]);
});

interface ApiResponse {
  status: number;
  body: Record<string, any>;
}

async function api(
  method: string,
  path: string,
  options: { userId?: string } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};

  if (options.userId) {
    headers['x-user-id'] = options.userId;
  }

  const response = await fetch(`${baseUrl}${path}`, { method, headers });
  const text = await response.text();

  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

const PLATES = ['BCDF12', 'GHJK34', 'JKLP78', 'BCDF13', 'BCDF14'];
let plateIndex = 0;

async function seedVehicle(ownerId = 'user-1'): Promise<Vehicle> {
  const vehicle = await vehicles.save(
    vehicles.create({
      vin: null,
      licensePlate: PLATES[plateIndex++ % PLATES.length],
      brand: 'Volkswagen',
      model: 'Polo',
      year: 2021,
      currentMileage: 1000,
    }),
  );

  await userVehicles.save(
    userVehicles.create({
      userId: ownerId,
      vehicleId: vehicle.id,
      role: UserVehicleRole.OWNER,
    }),
  );

  return vehicle;
}

async function addGuest(userId: string, vehicleId: string): Promise<void> {
  await userVehicles.save(
    userVehicles.create({ userId, vehicleId, role: UserVehicleRole.GUEST }),
  );
}

async function seedAppointment(
  vehicleId: string,
  overrides: Partial<Appointment> = {},
): Promise<Appointment> {
  return appointments.save(
    appointments.create({
      vehicleId,
      workshopId: null,
      createdByUserId: 'user-1',
      scheduledAt: new Date(now.getTime() + 2 * HOUR_MS),
      timezone: 'America/Santiago',
      reason: 'Cambio de aceite',
      notes: null,
      status: AppointmentStatus.SCHEDULED,
      ...overrides,
    }),
  );
}

async function seedReminder(
  appointmentId: string,
  remindAt: Date,
  offsetMinutes = 120,
): Promise<AppointmentReminder> {
  return reminders.save(
    reminders.create({ appointmentId, offsetMinutes, remindAt }),
  );
}

describe('API de recordatorios para avisos locales (GET /me/reminders)', () => {
  it('lista los pendientes del dueño por remindAt con los textos del servidor', async () => {
    const vehicle = await seedVehicle('user-1');
    const appointment = await seedAppointment(vehicle.id);
    const workshop = await workshops.save(
      workshops.create({ name: 'Taller Central', createdByUserId: 'user-1' }),
    );
    await appointments.update(
      { id: appointment.id },
      { workshopId: workshop.id },
    );
    const first = await seedReminder(
      appointment.id,
      new Date(now.getTime() + HOUR_MS),
      120,
    );
    const second = await seedReminder(
      appointment.id,
      new Date(now.getTime() + 30 * 60_000),
      30,
    );

    const response = await api('GET', '/me/reminders', { userId: 'user-1' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].reminderId).toBe(second.id);
    expect(response.body[1].reminderId).toBe(first.id);
    expect(response.body[0]).toMatchObject({
      appointmentId: appointment.id,
      title: 'Recordatorio de cita',
      body: 'hoy a las 11:00 · Cambio de aceite · Volkswagen Polo BCDF12 · Taller Central',
    });
    expect(response.body[0].remindAt).toBe(
      new Date(now.getTime() + 30 * 60_000).toISOString(),
    );
    expect(response.body[1].remindAt).toBe(
      new Date(now.getTime() + HOUR_MS).toISOString(),
    );
  });

  it('incluye al invitado que programó la cita y no a otro invitado', async () => {
    const vehicle = await seedVehicle('user-1');
    await addGuest('user-2', vehicle.id);
    await addGuest('user-3', vehicle.id);
    const appointment = await seedAppointment(vehicle.id, {
      createdByUserId: 'user-2',
    });
    const reminder = await seedReminder(
      appointment.id,
      new Date(now.getTime() + HOUR_MS),
    );

    const creator = await api('GET', '/me/reminders', { userId: 'user-2' });
    const otherGuest = await api('GET', '/me/reminders', { userId: 'user-3' });

    expect(creator.status).toBe(200);
    expect(creator.body).toHaveLength(1);
    expect(creator.body[0].reminderId).toBe(reminder.id);
    expect(otherGuest.status).toBe(200);
    expect(otherGuest.body).toHaveLength(0);
  });

  it('no devuelve citas canceladas, completadas ni de otros usuarios', async () => {
    const mine = await seedVehicle('user-1');
    const cancelled = await seedAppointment(mine.id, {
      status: AppointmentStatus.CANCELLED,
      cancelledAt: now,
    });
    const completed = await seedAppointment(mine.id, {
      status: AppointmentStatus.COMPLETED,
      completedAt: now,
    });
    const pending = await seedAppointment(mine.id);
    await seedReminder(cancelled.id, new Date(now.getTime() + HOUR_MS));
    await seedReminder(completed.id, new Date(now.getTime() + HOUR_MS));
    await seedReminder(pending.id, new Date(now.getTime() + HOUR_MS));

    const foreign = await seedVehicle('user-2');
    const foreignAppointment = await seedAppointment(foreign.id, {
      createdByUserId: 'user-2',
    });
    await seedReminder(
      foreignAppointment.id,
      new Date(now.getTime() + HOUR_MS),
    );

    const response = await api('GET', '/me/reminders', { userId: 'user-1' });
    const foreignResponse = await api('GET', '/me/reminders', {
      userId: 'user-3',
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].appointmentId).toBe(pending.id);
    expect(foreignResponse.body).toHaveLength(0);
  });

  it('excluye recordatorios ya procesados o con fecha pasada', async () => {
    const vehicle = await seedVehicle('user-1');
    const appointment = await seedAppointment(vehicle.id);
    const processed = await seedReminder(
      appointment.id,
      new Date(now.getTime() + HOUR_MS),
      1440,
    );
    await reminders.update(
      { id: processed.id },
      { processedAt: now },
    );
    const overdue = await seedReminder(
      appointment.id,
      new Date(now.getTime() - 60_000),
      30,
    );

    const response = await api('GET', '/me/reminders', { userId: 'user-1' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(0);
    expect(
      response.body.some((item: any) => item.reminderId === overdue.id),
    ).toBe(false);
  });

  it('respeta el límite y rechaza valores inválidos', async () => {
    const vehicle = await seedVehicle('user-1');
    const appointment = await seedAppointment(vehicle.id);
    await seedReminder(appointment.id, new Date(now.getTime() + HOUR_MS), 120);
    await seedReminder(appointment.id, new Date(now.getTime() + 2 * HOUR_MS), 1440);

    const limited = await api('GET', '/me/reminders?limit=1', {
      userId: 'user-1',
    });
    const invalid = await api('GET', '/me/reminders?limit=0', {
      userId: 'user-1',
    });

    expect(limited.status).toBe(200);
    expect(limited.body).toHaveLength(1);
    expect(invalid.status).toBe(400);
  });

  it('exige autenticación', async () => {
    const response = await api('GET', '/me/reminders');

    expect(response.status).toBe(401);
  });
});
