import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DataSource, Repository } from 'typeorm';
import { createApp } from '../app';
import { Clock } from '../common/clock';
import { Appointment, AppointmentStatus } from '../entities/Appointment';
import { AppointmentReminder } from '../entities/AppointmentReminder';
import { Maintenance } from '../entities/Maintenance';
import { Notification, NotificationType } from '../entities/Notification';
import { User } from '../entities/User';
import { UserVehicle, UserVehicleRole } from '../entities/UserVehicle';
import { createTestDataSource } from './test-data-source';

let dataSource: DataSource;
let server: Server;
let baseUrl: string;
let now: Date;
let appointments: Repository<Appointment>;
let reminders: Repository<AppointmentReminder>;
let notifications: Repository<Notification>;
let maintenances: Repository<Maintenance>;

const clock: Clock = { now: () => now };

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
  maintenances = dataSource.getRepository(Maintenance);
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
  options: { userId?: string; body?: unknown } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};

  if (options.userId) {
    headers['x-user-id'] = options.userId;
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();

  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

const VEHICLE_PLATES = ['BCDF12', 'GHJK34', 'JKLP78', 'BCDF13'];

async function createVehicle(
  userId: string,
  index = 0,
): Promise<Record<string, any>> {
  const response = await api('POST', '/vehicles', {
    userId,
    body: {
      vin: null,
      licensePlate: VEHICLE_PLATES[index],
      brand: 'Volkswagen',
      model: 'Polo',
      year: 2021,
      currentMileage: 1000,
    },
  });

  expect(response.status).toBe(201);
  return response.body;
}

async function addGuest(userId: string, vehicleId: string): Promise<void> {
  await dataSource.getRepository(UserVehicle).save({
    userId,
    vehicleId,
    role: UserVehicleRole.GUEST,
  });
}

function at(minutesFromNow: number): string {
  return new Date(now.getTime() + minutesFromNow * 60_000).toISOString();
}

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    scheduledAt: at(3 * 60),
    timezone: 'America/Santiago',
    reason: 'Cambio de aceite',
    ...overrides,
  };
}

async function createAppointment(
  userId: string,
  vehicleId: string,
  overrides: Record<string, unknown> = {},
): Promise<ApiResponse> {
  return api('POST', `/vehicles/${vehicleId}/appointments`, {
    userId,
    body: payload(overrides),
  });
}

function maintenancePayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    serviceDate: '2026-01-10',
    serviceMileage: 1500,
    description: 'Cambio de aceite',
    laborCost: 20000,
    ...overrides,
  };
}

async function createMaintenance(
  userId: string,
  vehicleId: string,
  overrides: Record<string, unknown> = {},
): Promise<ApiResponse> {
  return api('POST', `/vehicles/${vehicleId}/maintenances`, {
    userId,
    body: maintenancePayload(overrides),
  });
}

describe('POST /vehicles/:vehicleId/appointments', () => {
  it('permite programar al dueño y al invitado y responde 404 al no miembro', async () => {
    const vehicle = await createVehicle('user-1');
    await addGuest('user-2', vehicle.id);

    const asOwner = await createAppointment('user-1', vehicle.id);
    const asGuest = await createAppointment('user-2', vehicle.id);
    const notMember = await createAppointment('user-3', vehicle.id);

    expect(asOwner.status).toBe(201);
    expect(asOwner.body).toMatchObject({
      status: AppointmentStatus.SCHEDULED,
      timezone: 'America/Santiago',
      createdBy: { id: 'user-1', name: 'Ana' },
      canEdit: true,
      vehicle: {
        id: vehicle.id,
        licensePlate: 'BCDF12',
        brand: 'Volkswagen',
        model: 'Polo',
        year: 2021,
      },
    });
    expect(asGuest.status).toBe(201);
    expect(asGuest.body.createdBy).toEqual({ id: 'user-2', name: 'Bruno' });
    expect(notMember.status).toBe(404);
    expect(await appointments.count()).toBe(2);
  });

  it('avisa al dueño cuando un invitado programa la cita', async () => {
    const vehicle = await createVehicle('user-1');
    await addGuest('user-2', vehicle.id);

    const response = await createAppointment('user-2', vehicle.id);

    expect(response.status).toBe(201);
    const notice = await notifications.findOneByOrFail({
      userId: 'user-1',
      type: NotificationType.APPOINTMENT_CREATED,
    });
    expect(notice.title).toBe('Nueva cita programada');
    expect(notice.body).toContain('Cambio de aceite');
    expect(notice.body).toContain('Volkswagen Polo BCDF12');
    expect(notice.appointmentId).toBe(response.body.id);
    expect(await notifications.count()).toBe(1);
  });

  it('rechaza fechas pasadas o lejanas, motivo corto, offset y zona inválidos', async () => {
    const vehicle = await createVehicle('user-1');

    const past = await createAppointment('user-1', vehicle.id, {
      scheduledAt: at(-60),
    });
    expect(past.status).toBe(400);
    expect(past.body.errors).toEqual(
      expect.arrayContaining([
        {
          field: 'scheduledAt',
          message: 'La cita debe ser en una fecha y hora futuras',
        },
      ]),
    );

    const tooFar = await createAppointment('user-1', vehicle.id, {
      scheduledAt: at(731 * 24 * 60),
    });
    expect(tooFar.status).toBe(400);
    expect(tooFar.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'scheduledAt' })]),
    );

    const shortReason = await createAppointment('user-1', vehicle.id, {
      reason: 'ab',
    });
    expect(shortReason.status).toBe(400);
    expect(shortReason.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'reason' })]),
    );

    const badOffset = await createAppointment('user-1', vehicle.id, {
      reminders: [60],
    });
    expect(badOffset.status).toBe(400);
    expect(badOffset.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'reminders' })]),
    );

    const badTimezone = await createAppointment('user-1', vehicle.id, {
      timezone: 'Marte/Olympus',
    });
    expect(badTimezone.status).toBe(400);
    expect(badTimezone.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'timezone' })]),
    );

    expect(await appointments.count()).toBe(0);
  });

  it('responde 404 con un taller de otro usuario y guarda el taller propio', async () => {
    const vehicle = await createVehicle('user-1');
    const foreign = await api('POST', '/workshops', {
      userId: 'user-2',
      body: { name: 'Taller Ajeno' },
    });
    const own = await api('POST', '/workshops', {
      userId: 'user-1',
      body: { name: 'Taller Central', address: 'Av. Siempre Viva 123' },
    });

    const rejected = await createAppointment('user-1', vehicle.id, {
      workshopId: foreign.body.id,
    });
    const accepted = await createAppointment('user-1', vehicle.id, {
      workshopId: own.body.id,
    });

    expect(rejected.status).toBe(404);
    expect(rejected.body).toEqual({ message: 'Taller no encontrado' });
    expect(accepted.status).toBe(201);
    expect(accepted.body.workshop).toEqual({
      id: own.body.id,
      name: 'Taller Central',
      address: 'Av. Siempre Viva 123',
      phone: null,
    });
    expect(await appointments.count()).toBe(1);
  });
});

describe('recordatorios', () => {
  it('omite los ya vencidos y devuelve skippedReminders', async () => {
    const vehicle = await createVehicle('user-1');

    const response = await createAppointment('user-1', vehicle.id, {
      scheduledAt: at(3 * 60),
      reminders: [10080, 1440, 120, 30],
    });

    expect(response.status).toBe(201);
    expect(response.body.skippedReminders).toEqual([10080, 1440]);
    expect(
      (response.body.reminders as Array<{ offsetMinutes: number }>).map(
        (reminder) => reminder.offsetMinutes,
      ),
    ).toEqual([120, 30]);
    expect(await reminders.count()).toBe(2);
  });

  it('usa [1440, 120] cuando se omiten y permite un arreglo vacío', async () => {
    const vehicle = await createVehicle('user-1');

    const defaults = await createAppointment('user-1', vehicle.id, {
      scheduledAt: at(3 * 24 * 60),
    });
    const none = await createAppointment('user-1', vehicle.id, {
      scheduledAt: at(3 * 24 * 60),
      reminders: [],
    });

    expect(defaults.status).toBe(201);
    expect(defaults.body.skippedReminders).toEqual([]);
    expect(
      (defaults.body.reminders as Array<{ offsetMinutes: number }>).map(
        (reminder) => reminder.offsetMinutes,
      ),
    ).toEqual([1440, 120]);
    expect(none.status).toBe(201);
    expect(none.body.reminders).toEqual([]);
    expect(none.body.skippedReminders).toEqual([]);
    expect(await reminders.count()).toBe(2);
  });

  it('conserva el estado procesado al cambiar solo los recordatorios', async () => {
    const vehicle = await createVehicle('user-1');
    const created = await createAppointment('user-1', vehicle.id, {
      scheduledAt: at(3 * 24 * 60),
      reminders: [1440, 120],
    });
    const processed = await reminders.findOneByOrFail({
      appointmentId: created.body.id,
      offsetMinutes: 1440,
    });
    processed.processedAt = now;
    await reminders.save(processed);

    const response = await api(
      'PATCH',
      `/appointments/${created.body.id}`,
      {
        userId: 'user-1',
        body: { reminders: [1440, 30] },
      },
    );

    expect(response.status).toBe(200);
    const stored = await reminders.find({
      where: { appointmentId: created.body.id },
      order: { offsetMinutes: 'DESC' },
    });
    expect(stored.map((reminder) => reminder.offsetMinutes)).toEqual([1440, 30]);
    expect(stored[0].processedAt).not.toBeNull();
    expect(stored[1].processedAt).toBeNull();
  });
});

describe('PATCH, cancelar y completar', () => {
  it('reprograma recalculando recordatorios y avisa a los demás destinatarios', async () => {
    const vehicle = await createVehicle('user-1');
    await addGuest('user-2', vehicle.id);
    const created = await createAppointment('user-2', vehicle.id, {
      scheduledAt: at(3 * 24 * 60),
      reminders: [10080, 1440, 120],
    });

    now = new Date(now.getTime() + 60 * 60_000);
    const response = await api('PATCH', `/appointments/${created.body.id}`, {
      userId: 'user-1',
      body: {
        scheduledAt: at(4 * 24 * 60),
        reminders: [10080, 1440, 120],
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.skippedReminders).toEqual([10080]);
    expect(
      (response.body.reminders as Array<{ offsetMinutes: number }>).map(
        (reminder) => reminder.offsetMinutes,
      ),
    ).toEqual([1440, 120]);
    expect(await reminders.count()).toBe(2);

    const rescheduled = await notifications.findOneByOrFail({
      userId: 'user-2',
      type: NotificationType.APPOINTMENT_RESCHEDULED,
    });
    expect(rescheduled.title).toBe('Cita reprogramada');
    expect(rescheduled.body).toContain('Cambio de aceite');
    // El dueño hizo el cambio: no se notifica a sí mismo.
    expect(
      await notifications.count({
        where: {
          userId: 'user-1',
          type: NotificationType.APPOINTMENT_RESCHEDULED,
        },
      }),
    ).toBe(0);
  });

  it('cancela y completa desde SCHEDULED, descarta pendientes y bloquea más cambios', async () => {
    const vehicle = await createVehicle('user-1');
    await addGuest('user-2', vehicle.id);
    const toCancel = await createAppointment('user-2', vehicle.id, {
      scheduledAt: at(3 * 24 * 60),
    });
    const toComplete = await createAppointment('user-1', vehicle.id, {
      scheduledAt: at(3 * 24 * 60),
    });

    const cancelled = await api(
      'POST',
      `/appointments/${toCancel.body.id}/cancel`,
      { userId: 'user-1' },
    );
    const completed = await api(
      'POST',
      `/appointments/${toComplete.body.id}/complete`,
      { userId: 'user-1' },
    );

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe(AppointmentStatus.CANCELLED);
    expect(cancelled.body.cancelledAt).toEqual(expect.any(String));
    expect(cancelled.body.canEdit).toBe(false);
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe(AppointmentStatus.COMPLETED);
    expect(completed.body.completedAt).toEqual(expect.any(String));

    expect(
      await reminders.count({ where: { appointmentId: toCancel.body.id } }),
    ).toBe(0);
    expect(
      await reminders.count({ where: { appointmentId: toComplete.body.id } }),
    ).toBe(0);

    const cancelNotice = await notifications.findOneByOrFail({
      userId: 'user-2',
      type: NotificationType.APPOINTMENT_CANCELLED,
    });
    expect(cancelNotice.title).toBe('Cita cancelada');

    for (const [method, path, userId] of [
      ['PATCH', `/appointments/${toCancel.body.id}`, 'user-1'],
      ['POST', `/appointments/${toCancel.body.id}/cancel`, 'user-1'],
      ['POST', `/appointments/${toCancel.body.id}/complete`, 'user-1'],
      ['PATCH', `/appointments/${toComplete.body.id}`, 'user-1'],
      ['POST', `/appointments/${toComplete.body.id}/cancel`, 'user-1'],
    ] as const) {
      const response = await api(method, path, {
        userId,
        body: method === 'PATCH' ? { reason: 'No permitido' } : undefined,
      });
      expect(response.status).toBe(409);
      expect(response.body).toEqual({ message: 'La cita ya está cerrada' });
    }
  });

  it('permisos: el invitado solo cambia sus citas y canEdit refleja el rol', async () => {
    const vehicle = await createVehicle('user-1');
    await addGuest('user-2', vehicle.id);
    const guestAppointment = await createAppointment('user-2', vehicle.id);
    const ownerAppointment = await createAppointment('user-1', vehicle.id);

    const guestOwn = await api(
      'GET',
      `/appointments/${guestAppointment.body.id}`,
      { userId: 'user-2' },
    );
    const guestOther = await api(
      'GET',
      `/appointments/${ownerAppointment.body.id}`,
      { userId: 'user-2' },
    );
    const ownerView = await api(
      'GET',
      `/appointments/${guestAppointment.body.id}`,
      { userId: 'user-1' },
    );

    expect(guestOwn.body.canEdit).toBe(true);
    expect(guestOther.body.canEdit).toBe(false);
    expect(ownerView.body.canEdit).toBe(true);

    const forbidden = await api(
      'PATCH',
      `/appointments/${ownerAppointment.body.id}`,
      { userId: 'user-2', body: { reason: 'Cambio ajeno' } },
    );
    const ownerEdits = await api(
      'PATCH',
      `/appointments/${guestAppointment.body.id}`,
      { userId: 'user-1', body: { reason: 'Cambio del dueño' } },
    );
    const nonMember = await api(
      'GET',
      `/appointments/${guestAppointment.body.id}`,
      { userId: 'user-3' },
    );

    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({
      message: 'No tienes permiso para esta acción',
    });
    expect(ownerEdits.status).toBe(200);
    expect(ownerEdits.body.reason).toBe('Cambio del dueño');
    expect(nonMember.status).toBe(404);
  });

  it('responde 404 si el id no es uuid o no existe', async () => {
    const invalid = await api('GET', '/appointments/no-es-uuid', {
      userId: 'user-1',
    });
    const missing = await api(
      'GET',
      '/appointments/99999999-9999-4999-8999-999999999999',
      { userId: 'user-1' },
    );

    expect(invalid.status).toBe(404);
    expect(missing.status).toBe(404);
  });
});

describe('mantención creada desde una cita', () => {
  it('completa y vincula la cita en la misma transacción', async () => {
    const vehicle = await createVehicle('user-1');
    const appointment = await createAppointment('user-1', vehicle.id, {
      scheduledAt: at(3 * 24 * 60),
    });

    const response = await createMaintenance('user-1', vehicle.id, {
      appointmentId: appointment.body.id,
    });

    expect(response.status).toBe(201);
    expect(response.body.appointmentId).toBe(appointment.body.id);

    const stored = await appointments.findOneByOrFail({
      id: appointment.body.id,
    });
    expect(stored.status).toBe(AppointmentStatus.COMPLETED);
    expect(stored.completedAt).not.toBeNull();

    const detail = await api('GET', `/appointments/${appointment.body.id}`, {
      userId: 'user-1',
    });
    expect(detail.body.maintenanceId).toBe(response.body.id);
    expect(detail.body.reminders).toEqual([]);
    expect(
      await reminders.count({ where: { appointmentId: appointment.body.id } }),
    ).toBe(0);
  });

  it('rechaza citas de otro vehículo, ya completadas o ya vinculadas sin crear nada', async () => {
    const firstVehicle = await createVehicle('user-1');
    const secondVehicle = await createVehicle('user-1', 1);
    const fromOther = await createAppointment('user-1', firstVehicle.id, {
      scheduledAt: at(3 * 24 * 60),
    });
    const alreadyCompleted = await createAppointment(
      'user-1',
      firstVehicle.id,
      { scheduledAt: at(3 * 24 * 60) },
    );
    await api('POST', `/appointments/${alreadyCompleted.body.id}/complete`, {
      userId: 'user-1',
    });
    const alreadyLinked = await createAppointment('user-1', firstVehicle.id, {
      scheduledAt: at(3 * 24 * 60),
    });
    await createMaintenance('user-1', firstVehicle.id, {
      appointmentId: alreadyLinked.body.id,
    });

    const responses = [
      await createMaintenance('user-1', secondVehicle.id, {
        appointmentId: fromOther.body.id,
      }),
      await createMaintenance('user-1', firstVehicle.id, {
        appointmentId: alreadyCompleted.body.id,
      }),
      await createMaintenance('user-1', firstVehicle.id, {
        appointmentId: alreadyLinked.body.id,
      }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'La cita no es válida para esta mantención',
      });
    }

    expect(await maintenances.count()).toBe(1);
  });

  it('dos solicitudes simultáneas con la misma cita: una gana', async () => {
    const vehicle = await createVehicle('user-1');
    const appointment = await createAppointment('user-1', vehicle.id, {
      scheduledAt: at(3 * 24 * 60),
    });

    const responses = await Promise.all([
      createMaintenance('user-1', vehicle.id, {
        appointmentId: appointment.body.id,
      }),
      createMaintenance('user-1', vehicle.id, {
        appointmentId: appointment.body.id,
      }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 400,
    ]);
    expect(await maintenances.count()).toBe(1);
    expect(
      (await appointments.findOneByOrFail({ id: appointment.body.id })).status,
    ).toBe(AppointmentStatus.COMPLETED);
  });
});

describe('listados', () => {
  async function seedScopes(): Promise<{
    vehicleId: string;
    upcomingIds: string[];
    historyId: string;
  }> {
    const vehicle = await createVehicle('user-1');
    const upcoming = await createAppointment('user-1', vehicle.id, {
      scheduledAt: at(24 * 60),
      reason: 'Cita uno',
    });
    const second = await createAppointment('user-1', vehicle.id, {
      scheduledAt: at(48 * 60),
      reason: 'Cita dos',
    });
    const history = await createAppointment('user-1', vehicle.id, {
      scheduledAt: at(72 * 60),
      reason: 'Cita tres',
    });
    await api('POST', `/appointments/${history.body.id}/cancel`, {
      userId: 'user-1',
    });

    return {
      vehicleId: vehicle.id,
      upcomingIds: [upcoming.body.id, second.body.id],
      historyId: history.body.id,
    };
  }

  it('respeta scope, limit, offset y total', async () => {
    const { vehicleId, upcomingIds, historyId } = await seedScopes();

    const allUpcoming = await api(
      'GET',
      `/vehicles/${vehicleId}/appointments?scope=upcoming`,
      { userId: 'user-1' },
    );
    const page = await api(
      'GET',
      `/vehicles/${vehicleId}/appointments?scope=upcoming&limit=1&offset=1`,
      { userId: 'user-1' },
    );
    const history = await api(
      'GET',
      `/vehicles/${vehicleId}/appointments?scope=history`,
      { userId: 'user-1' },
    );

    expect(allUpcoming.status).toBe(200);
    expect(allUpcoming.body.total).toBe(2);
    expect(allUpcoming.body.items.map((item: any) => item.id)).toEqual(
      upcomingIds,
    );
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0].id).toBe(upcomingIds[1]);
    expect(page.body.total).toBe(2);
    expect(history.body.items.map((item: any) => item.id)).toEqual([historyId]);

    now = new Date(now.getTime() + 36 * 60 * 60_000);
    const overdue = await api(
      'GET',
      `/vehicles/${vehicleId}/appointments?scope=overdue`,
      { userId: 'user-1' },
    );
    const upcoming = await api(
      'GET',
      `/vehicles/${vehicleId}/appointments?scope=upcoming`,
      { userId: 'user-1' },
    );

    expect(overdue.body.items.map((item: any) => item.id)).toEqual([
      upcomingIds[0],
    ]);
    expect(upcoming.body.items.map((item: any) => item.id)).toEqual([
      upcomingIds[1],
    ]);
  });

  it('el listado global muestra solo vehículos del usuario y filtra por vehicleId', async () => {
    const ownVehicle = await createVehicle('user-1');
    const foreignVehicle = await createVehicle('user-2', 1);
    const own = await createAppointment('user-1', ownVehicle.id, {
      scheduledAt: at(24 * 60),
    });
    await createAppointment('user-2', foreignVehicle.id, {
      scheduledAt: at(24 * 60),
    });

    const global = await api('GET', '/appointments?scope=upcoming', {
      userId: 'user-1',
    });
    const filtered = await api(
      'GET',
      `/appointments?scope=upcoming&vehicleId=${ownVehicle.id}`,
      { userId: 'user-1' },
    );
    const foreign = await api(
      'GET',
      `/appointments?scope=upcoming&vehicleId=${foreignVehicle.id}`,
      { userId: 'user-1' },
    );

    expect(global.status).toBe(200);
    expect(global.body.total).toBe(1);
    expect(global.body.items[0].id).toBe(own.body.id);
    expect(filtered.body.items[0].id).toBe(own.body.id);
    expect(foreign.body).toEqual({ items: [], total: 0 });
  });

  it('valida la paginación', async () => {
    const vehicle = await createVehicle('user-1');

    const response = await api(
      'GET',
      `/vehicles/${vehicle.id}/appointments?limit=101`,
      { userId: 'user-1' },
    );

    expect(response.status).toBe(400);
  });

  it('no hace consultas por cada cita al armar la página', async () => {
    const vehicle = await createVehicle('user-1');

    for (let index = 0; index < 8; index += 1) {
      await createAppointment('user-1', vehicle.id, {
        scheduledAt: at((index + 1) * 24 * 60),
        reason: `Cita ${index}`,
      });
    }

    const reminderFind = jest.spyOn(reminders, 'find');
    const maintenanceFind = jest.spyOn(maintenances, 'find');

    const response = await api(
      'GET',
      `/vehicles/${vehicle.id}/appointments?limit=100`,
      { userId: 'user-1' },
    );

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(8);
    expect(reminderFind).toHaveBeenCalledTimes(1);
    expect(maintenanceFind).toHaveBeenCalledTimes(1);

    reminderFind.mockRestore();
    maintenanceFind.mockRestore();
  });
});

describe('texto del motivo', () => {
  it('normaliza tildes, ñ y emoji y los devuelve idénticos', async () => {
    const vehicle = await createVehicle('user-1');
    const reason = '  Revisio\u0301n ñandú 🚗  ';

    const created = await createAppointment('user-1', vehicle.id, {
      reason,
      notes: '',
    });

    expect(created.status).toBe(201);
    expect(created.body.reason).toBe('Revisión ñandú 🚗');
    expect(created.body.notes).toBeNull();

    const detail = await api('GET', `/appointments/${created.body.id}`, {
      userId: 'user-1',
    });

    expect(detail.body.reason).toBe('Revisión ñandú 🚗');
    expect(detail.body.notes).toBeNull();
  });
});
