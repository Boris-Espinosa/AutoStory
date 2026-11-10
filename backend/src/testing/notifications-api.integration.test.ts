import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DataSource, Repository } from 'typeorm';
import { createApp } from '../app';
import { Clock } from '../common/clock';
import { Appointment, AppointmentStatus } from '../entities/Appointment';
import { AppointmentReminder } from '../entities/AppointmentReminder';
import { Notification, NotificationType } from '../entities/Notification';
import { User } from '../entities/User';
import { UserVehicle, UserVehicleRole } from '../entities/UserVehicle';
import { Vehicle } from '../entities/Vehicle';
import { Workshop } from '../entities/Workshop';
import {
  cleanupExpiredData,
  processDueReminders,
} from '../notifications/reminder-worker';
import { createTestDataSource } from './test-data-source';

let dataSource: DataSource;
let server: Server;
let baseUrl: string;
let now: Date;
let appointments: Repository<Appointment>;
let reminders: Repository<AppointmentReminder>;
let notifications: Repository<Notification>;
let vehicles: Repository<Vehicle>;
let userVehicles: Repository<UserVehicle>;
let workshops: Repository<Workshop>;

const clock: Clock = { now: () => now };
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();

  server = createServer(createApp(dataSource, clock));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  appointments = dataSource.getRepository(Appointment);
  reminders = dataSource.getRepository(AppointmentReminder);
  notifications = dataSource.getRepository(Notification);
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

async function seedNotification(
  userId: string,
  overrides: Partial<Notification> = {},
): Promise<Notification> {
  return notifications.save(
    notifications.create({
      userId,
      type: NotificationType.APPOINTMENT_CREATED,
      title: 'Nueva cita programada',
      body: 'hoy a las 11:00 · Cambio de aceite · Volkswagen Polo BCDF12',
      vehicleId: null,
      appointmentId: null,
      reminderId: null,
      readAt: null,
      ...overrides,
    }),
  );
}

describe('processDueReminders', () => {
  it('notifica a quien programó y al dueño, con el taller si existe', async () => {
    const vehicle = await seedVehicle('user-1');
    await addGuest('user-2', vehicle.id);
    const workshop = await workshops.save(
      workshops.create({
        name: 'Taller Central',
        createdByUserId: 'user-1',
      }),
    );
    const appointment = await seedAppointment(vehicle.id, {
      createdByUserId: 'user-2',
      workshopId: workshop.id,
    });
    const reminder = await seedReminder(
      appointment.id,
      new Date(now.getTime() - 60_000),
    );

    const processed = await processDueReminders(dataSource, clock);

    expect(processed).toBe(1);
    const stored = await notifications.find({
      where: { reminderId: reminder.id },
      order: { userId: 'ASC' },
    });
    expect(stored.map((notice) => notice.userId)).toEqual([
      'user-1',
      'user-2',
    ]);
    expect(stored[0].type).toBe(NotificationType.APPOINTMENT_REMINDER);
    expect(stored[0].title).toBe('Recordatorio de cita');
    expect(stored[0].body).toBe(
      'hoy a las 11:00 · Cambio de aceite · Volkswagen Polo BCDF12 · Taller Central',
    );
    expect(
      (await reminders.findOneByOrFail({ id: reminder.id })).processedAt,
    ).toEqual(now);
  });

  it('crea una sola notificación si el dueño programó la cita', async () => {
    const vehicle = await seedVehicle('user-1');
    const appointment = await seedAppointment(vehicle.id, {
      createdByUserId: 'user-1',
    });
    await seedReminder(appointment.id, new Date(now.getTime() - 60_000));

    await processDueReminders(dataSource, clock);

    expect(await notifications.count()).toBe(1);
    expect((await notifications.find())[0].userId).toBe('user-1');
  });

  it('no notifica a quien ya no es miembro del vehículo', async () => {
    const vehicle = await seedVehicle('user-1');
    const appointment = await seedAppointment(vehicle.id, {
      createdByUserId: 'user-3',
    });
    await seedReminder(appointment.id, new Date(now.getTime() - 60_000));

    await processDueReminders(dataSource, clock);

    expect(await notifications.count()).toBe(1);
    expect((await notifications.find())[0].userId).toBe('user-1');
  });

  it('no procesa un recordatorio futuro', async () => {
    const vehicle = await seedVehicle('user-1');
    const appointment = await seedAppointment(vehicle.id);
    const reminder = await seedReminder(
      appointment.id,
      new Date(now.getTime() + HOUR_MS),
    );

    expect(await processDueReminders(dataSource, clock)).toBe(0);

    expect(
      (await reminders.findOneByOrFail({ id: reminder.id })).processedAt,
    ).toBeNull();
    expect(await notifications.count()).toBe(0);
  });

  it('descarta sin notificar citas cerradas o ya comenzadas', async () => {
    const vehicle = await seedVehicle('user-1');
    const cancelled = await seedAppointment(vehicle.id, {
      status: AppointmentStatus.CANCELLED,
      cancelledAt: now,
    });
    const completed = await seedAppointment(vehicle.id, {
      status: AppointmentStatus.COMPLETED,
      completedAt: now,
    });
    const started = await seedAppointment(vehicle.id, {
      scheduledAt: new Date(now.getTime() - 60_000),
    });
    const due = new Date(now.getTime() - 2 * HOUR_MS);

    for (const appointment of [cancelled, completed, started]) {
      await seedReminder(appointment.id, due);
    }

    await processDueReminders(dataSource, clock);

    expect(await notifications.count()).toBe(0);
    expect(
      await reminders.count({ where: { processedAt: new Date(now) } }),
    ).toBe(3);
  });

  it('entrega un recordatorio atrasado mientras la cita no haya comenzado', async () => {
    const vehicle = await seedVehicle('user-1');
    const appointment = await seedAppointment(vehicle.id, {
      scheduledAt: new Date(now.getTime() + 55 * 60_000),
    });
    await seedReminder(appointment.id, new Date(now.getTime() - 65 * 60_000));

    expect(await processDueReminders(dataSource, clock)).toBe(1);
    expect(await notifications.count()).toBe(1);
  });

  it('dos llamadas simultáneas producen una sola notificación por destinatario', async () => {
    const vehicle = await seedVehicle('user-1');
    await addGuest('user-2', vehicle.id);
    const appointment = await seedAppointment(vehicle.id, {
      createdByUserId: 'user-2',
    });
    await seedReminder(appointment.id, new Date(now.getTime() - 60_000));

    await Promise.all([
      processDueReminders(dataSource, clock),
      processDueReminders(dataSource, clock),
    ]);

    expect(
      await notifications.count({ where: { userId: 'user-1' } }),
    ).toBe(1);
    expect(
      await notifications.count({ where: { userId: 'user-2' } }),
    ).toBe(1);
    expect(await notifications.count()).toBe(2);
  });

  it('un fallo no bloquea a los demás y se descarta tras 5 intentos', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const vehicle = await seedVehicle('user-1');
      const failing = await seedAppointment(vehicle.id);
      const failingReminder = await seedReminder(
        failing.id,
        new Date(now.getTime() - 60_000),
      );
      const healthy = await seedAppointment(vehicle.id);
      await seedReminder(healthy.id, new Date(now.getTime() - 60_000));

      const hooks = {
        beforeProcess: (reminderId: string): void => {
          if (reminderId === failingReminder.id) {
            throw new Error('fallo simulado');
          }
        },
      };

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await processDueReminders(dataSource, clock, now, hooks);

        const stored = await reminders.findOneByOrFail({
          id: failingReminder.id,
        });
        expect(stored.processedAt === null).toBe(attempt < 5);
      }

      expect(errorSpy).toHaveBeenCalledTimes(5);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(await notifications.count()).toBe(1);
      expect(
        await reminders.count({
          where: { appointmentId: healthy.id, processedAt: new Date(now) },
        }),
      ).toBe(1);
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

describe('cleanupExpiredData', () => {
  it('borra lo antiguo y conserva lo reciente', async () => {
    await seedNotification('user-1', {
      createdAt: new Date(now.getTime() - 91 * DAY_MS),
    });
    await seedNotification('user-1', {
      createdAt: new Date(now.getTime() - 89 * DAY_MS),
    });

    const vehicle = await seedVehicle('user-1');
    const appointment = await seedAppointment(vehicle.id);
    const processedOld = await seedReminder(
      appointment.id,
      new Date(now.getTime() - 40 * DAY_MS),
      120,
    );
    const processedRecent = await seedReminder(
      appointment.id,
      new Date(now.getTime() - 29 * DAY_MS),
      1440,
    );
    const pendingOld = await seedReminder(
      appointment.id,
      new Date(now.getTime() - 40 * DAY_MS),
      30,
    );
    await reminders.update(
      { id: processedOld.id },
      { processedAt: new Date(now.getTime() - 31 * DAY_MS) },
    );
    await reminders.update(
      { id: processedRecent.id },
      { processedAt: new Date(now.getTime() - 29 * DAY_MS) },
    );

    const result = await cleanupExpiredData(dataSource, now);

    expect(result).toEqual({ notifications: 1, reminders: 1 });
    expect(await notifications.count()).toBe(1);
    expect(
      (await reminders.find()).map((reminder) => reminder.id).sort(),
    ).toEqual([processedRecent.id, pendingOld.id].sort());
  });
});

describe('API de notificaciones', () => {
  const ID_A = '00000000-0000-4000-8000-000000000001';
  const ID_B = '00000000-0000-4000-8000-000000000002';
  const ID_C = '00000000-0000-4000-8000-000000000003';

  it('lista por fecha descendente y luego id, con paginación y total', async () => {
    await seedNotification('user-1', {
      id: ID_A,
      createdAt: new Date(now.getTime() - 3 * HOUR_MS),
    });
    await seedNotification('user-1', {
      id: ID_B,
      createdAt: new Date(now.getTime() - HOUR_MS),
    });
    await seedNotification('user-1', {
      id: ID_C,
      createdAt: new Date(now.getTime() - HOUR_MS),
    });

    const all = await api('GET', '/notifications', { userId: 'user-1' });

    expect(all.status).toBe(200);
    expect(all.body.items.map((item: any) => item.id)).toEqual([
      ID_B,
      ID_C,
      ID_A,
    ]);
    expect(all.body.total).toBe(3);
    expect(all.body.unreadCount).toBe(3);
    expect(all.body.items[0]).toMatchObject({
      type: 'APPOINTMENT_CREATED',
      title: 'Nueva cita programada',
      vehicleId: null,
      appointmentId: null,
      readAt: null,
      createdAt: expect.any(String),
    });

    const page = await api('GET', '/notifications?limit=1&offset=1', {
      userId: 'user-1',
    });

    expect(page.body.items.map((item: any) => item.id)).toEqual([ID_C]);
    expect(page.body.total).toBe(3);
  });

  it('filtra solo las no leídas y cuenta las no leídas con el endpoint ligero', async () => {
    await seedNotification('user-1');
    await seedNotification('user-1');
    await seedNotification('user-1', { readAt: now });
    await seedNotification('user-2');

    const unread = await api('GET', '/notifications?unread=true', {
      userId: 'user-1',
    });
    const count = await api('GET', '/notifications/unread-count', {
      userId: 'user-1',
    });

    expect(unread.status).toBe(200);
    expect(unread.body.items).toHaveLength(2);
    expect(unread.body.total).toBe(2);
    expect(unread.body.unreadCount).toBe(2);
    expect(count.body).toEqual({ unreadCount: 2 });
  });

  it('marca una notificación como leída de forma idempotente', async () => {
    const notification = await seedNotification('user-1');

    const first = await api(
      'POST',
      `/notifications/${notification.id}/read`,
      { userId: 'user-1' },
    );

    expect(first.status).toBe(200);
    expect(first.body.readAt).toEqual(expect.any(String));
    const readAt = first.body.readAt;

    now = new Date(now.getTime() + HOUR_MS);
    const second = await api(
      'POST',
      `/notifications/${notification.id}/read`,
      { userId: 'user-1' },
    );

    expect(second.status).toBe(200);
    expect(second.body.readAt).toBe(readAt);
  });

  it('responde 404 para una notificación ajena o un id inválido', async () => {
    const foreign = await seedNotification('user-2');

    const foreignResponse = await api(
      'POST',
      `/notifications/${foreign.id}/read`,
      { userId: 'user-1' },
    );
    const invalid = await api('POST', '/notifications/no-es-uuid/read', {
      userId: 'user-1',
    });

    expect(foreignResponse.status).toBe(404);
    expect(invalid.status).toBe(404);
  });

  it('marca todas las no leídas y responde cuántas actualizó', async () => {
    await seedNotification('user-1');
    await seedNotification('user-1');
    await seedNotification('user-1', { readAt: now });
    await seedNotification('user-2');

    const first = await api('POST', '/notifications/read-all', {
      userId: 'user-1',
    });
    const second = await api('POST', '/notifications/read-all', {
      userId: 'user-1',
    });
    const other = await api('GET', '/notifications/unread-count', {
      userId: 'user-2',
    });

    expect(first.body).toEqual({ updated: 2 });
    expect(second.body).toEqual({ updated: 0 });
    expect(other.body).toEqual({ unreadCount: 1 });
  });

  it('exige autenticación', async () => {
    const response = await api('GET', '/notifications');

    expect(response.status).toBe(401);
  });
});
