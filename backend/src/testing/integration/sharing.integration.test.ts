import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DataSource, Repository } from 'typeorm';
import { createApp } from '../../app';
import { Maintenance } from '../../entities/Maintenance';
import { Notification, NotificationType } from '../../entities/Notification';
import {
  SharingRequest,
  SharingRequestStatus,
} from '../../entities/SharingRequest';
import { User } from '../../entities/User';
import { UserVehicle, UserVehicleRole } from '../../entities/UserVehicle';
import { Vehicle } from '../../entities/Vehicle';
import { SHARING_NEUTRAL_MESSAGE } from '../../utils/messages';
import { createTestDataSource } from '../test-data-source';

let dataSource: DataSource;
let server: Server;
let baseUrl: string;
let users: Repository<User>;
let vehicles: Repository<Vehicle>;
let userVehicles: Repository<UserVehicle>;
let sharingRequests: Repository<SharingRequest>;
let notifications: Repository<Notification>;
let maintenances: Repository<Maintenance>;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();

  users = dataSource.getRepository(User);
  vehicles = dataSource.getRepository(Vehicle);
  userVehicles = dataSource.getRepository(UserVehicle);
  sharingRequests = dataSource.getRepository(SharingRequest);
  notifications = dataSource.getRepository(Notification);
  maintenances = dataSource.getRepository(Maintenance);

  server = createServer(createApp(dataSource));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await dataSource.destroy();
});

beforeEach(async () => {
  await dataSource.query(
    `TRUNCATE TABLE "notifications", "sharing_requests", "user_vehicles", "vehicles", "users" CASCADE`,
  );
  await users.save([
    { id: 'user-1', name: 'Ana', email: 'ana@example.com' },
    { id: 'user-2', name: 'Bruno', email: 'bruno@example.com' },
  ]);
});

async function createVehicle(): Promise<Vehicle> {
  return vehicles.save({
    vin: 'WVWZZZ6RZMY000001',
    licensePlate: 'BBJJ12',
    brand: 'Volkswagen',
    model: 'Polo',
    year: 2021,
    currentMileage: 1000,
    photoUrl: null,
  });
}

function pendingFor(vehicleId: string): Partial<SharingRequest> {
  return {
    vehicleId,
    senderUserId: 'user-1',
    receiverUserId: 'user-2',
    status: SharingRequestStatus.PENDING,
  };
}

async function seedVehicleWithOwner(ownerId = 'user-1'): Promise<Vehicle> {
  const vehicle = await createVehicle();
  await userVehicles.save(
    userVehicles.create({
      userId: ownerId,
      vehicleId: vehicle.id,
      role: UserVehicleRole.OWNER,
    }),
  );
  return vehicle;
}

async function seedGuest(vehicleId: string, userId = 'user-2'): Promise<void> {
  await userVehicles.save(
    userVehicles.create({
      userId,
      vehicleId,
      role: UserVehicleRole.GUEST,
    }),
  );
}

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
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();

  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

describe('base de datos de compartir vehículo', () => {
  it('registra los valores nuevos de los enums', async () => {
    const statuses: Array<{ enumlabel: string }> = await dataSource.query(`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'sharing_request_status'
    `);
    const types: Array<{ enumlabel: string }> = await dataSource.query(`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'notification_type'
    `);

    expect(statuses.map((row) => row.enumlabel)).toEqual(
      expect.arrayContaining([
        'PENDING',
        'ACCEPTED',
        'REJECTED',
        'CANCELLED',
      ]),
    );
    expect(types.map((row) => row.enumlabel)).toEqual(
      expect.arrayContaining([
        'SHARING_REQUEST_RECEIVED',
        'SHARING_REQUEST_ACCEPTED',
        'SHARING_REQUEST_REJECTED',
      ]),
    );
  });

  it('impide dos PENDING del mismo vehículo y receptor, pero permite reenviar tras cancelar', async () => {
    const vehicle = await createVehicle();
    const first = await sharingRequests.save(pendingFor(vehicle.id));

    const [index]: Array<{ indexdef: string }> = await dataSource.query(`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'sharing_requests'
        AND indexname = 'UQ_sharing_requests_pending'
    `);

    expect(index.indexdef).toContain('vehicle_id');
    expect(index.indexdef).toContain('receiver_user_id');
    expect(index.indexdef).toContain('PENDING');
    await expect(
      sharingRequests.save(pendingFor(vehicle.id)),
    ).rejects.toThrow(/UQ_sharing_requests_pending/);

    first.status = SharingRequestStatus.CANCELLED;
    await sharingRequests.save(first);

    await expect(
      sharingRequests.save(pendingFor(vehicle.id)),
    ).resolves.toMatchObject({ status: SharingRequestStatus.PENDING });
  });

  it('guarda la solicitud en la notificación y la elimina en cascada', async () => {
    const vehicle = await createVehicle();
    const request = await sharingRequests.save(pendingFor(vehicle.id));
    const notification = await notifications.save({
      userId: 'user-2',
      type: NotificationType.SHARING_REQUEST_RECEIVED,
      title: 'Solicitud de compartir',
      body: 'Tienes una solicitud de compartir vehículo.',
      sharingRequestId: request.id,
    });

    expect(notification.sharingRequestId).toBe(request.id);

    const [column]: Array<{ is_nullable: string }> = await dataSource.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'notifications' AND column_name = 'sharing_request_id'
    `);

    expect(column.is_nullable).toBe('YES');

    await sharingRequests.delete({ id: request.id });

    await expect(
      notifications.findOneBy({ id: notification.id }),
    ).resolves.toBeNull();
  });
});

describe('API del dueño para compartir vehículo', () => {
  it('responde 202 neutral y crea la notificación con sharingRequestId', async () => {
    const vehicle = await seedVehicleWithOwner();

    const response = await api(
      'POST',
      `/vehicles/${vehicle.id}/sharing-requests`,
      { userId: 'user-1', body: { email: '  BRUNO@Example.com  ' } },
    );

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ message: SHARING_NEUTRAL_MESSAGE });

    const [request] = await sharingRequests.find();
    expect(request).toMatchObject({
      vehicleId: vehicle.id,
      senderUserId: 'user-1',
      receiverUserId: 'user-2',
      status: SharingRequestStatus.PENDING,
    });

    const notification = await notifications.findOneBy({
      type: NotificationType.SHARING_REQUEST_RECEIVED,
    });
    expect(notification?.sharingRequestId).toBe(request.id);
  });

  it('no crea nada cuando el correo no existe', async () => {
    const vehicle = await seedVehicleWithOwner();

    const response = await api(
      'POST',
      `/vehicles/${vehicle.id}/sharing-requests`,
      { userId: 'user-1', body: { email: 'nadie@example.com' } },
    );

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ message: SHARING_NEUTRAL_MESSAGE });
    await expect(sharingRequests.count()).resolves.toBe(0);
    await expect(notifications.count()).resolves.toBe(0);
  });

  it('rechaza el duplicado PENDING y lista el correo actual del receptor', async () => {
    const vehicle = await seedVehicleWithOwner();
    const body = { email: 'bruno@example.com' };

    await api('POST', `/vehicles/${vehicle.id}/sharing-requests`, {
      userId: 'user-1',
      body,
    });
    const duplicate = await api(
      'POST',
      `/vehicles/${vehicle.id}/sharing-requests`,
      { userId: 'user-1', body },
    );

    expect(duplicate.status).toBe(409);
    await expect(sharingRequests.count()).resolves.toBe(1);

    const list = await api('GET', `/vehicles/${vehicle.id}/sharing-requests`, {
      userId: 'user-1',
    });
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].receiverEmail).toBe('bruno@example.com');
  });

  it('responde 429 en el undécimo envío del mismo usuario', async () => {
    await users.save({
      id: 'user-rate',
      name: 'Rate',
      email: 'rate@example.com',
    });
    const vehicle = await seedVehicleWithOwner('user-rate');

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await api(
        'POST',
        `/vehicles/${vehicle.id}/sharing-requests`,
        { userId: 'user-rate', body: { email: 'bruno@example.com' } },
      );
      expect(response.status).not.toBe(429);
    }

    const eleventh = await api(
      'POST',
      `/vehicles/${vehicle.id}/sharing-requests`,
      { userId: 'user-rate', body: { email: 'bruno@example.com' } },
    );
    expect(eleventh.status).toBe(429);
  });

  it('responde 404 al cancelar una solicitud de otro vehículo', async () => {
    const vehicle = await seedVehicleWithOwner();
    const otherVehicle = await seedVehicleWithOwner();

    await api('POST', `/vehicles/${vehicle.id}/sharing-requests`, {
      userId: 'user-1',
      body: { email: 'bruno@example.com' },
    });
    const [request] = await sharingRequests.find();

    const response = await api(
      'PATCH',
      `/vehicles/${otherVehicle.id}/sharing-requests/${request.id}/cancel`,
      { userId: 'user-1' },
    );

    expect(response.status).toBe(404);
    await expect(sharingRequests.findOneBy({ id: request.id })).resolves.toMatchObject({
      status: SharingRequestStatus.PENDING,
    });
  });

  it('expone sharingRequestId en GET /notifications', async () => {
    const vehicle = await seedVehicleWithOwner();

    await api('POST', `/vehicles/${vehicle.id}/sharing-requests`, {
      userId: 'user-1',
      body: { email: 'bruno@example.com' },
    });
    const [request] = await sharingRequests.find();

    const response = await api('GET', '/notifications', { userId: 'user-2' });
    const notification = response.body.items.find(
      (item: { type: NotificationType }) =>
        item.type === NotificationType.SHARING_REQUEST_RECEIVED,
    );

    expect(notification?.sharingRequestId).toBe(request.id);
  });
});

describe('API del receptor para responder solicitudes', () => {
  async function seedPendingRequest() {
    const vehicle = await seedVehicleWithOwner();
    const request = await sharingRequests.save(pendingFor(vehicle.id));
    return { vehicle, request };
  }

  it('muestra el detalle limitado y responde 404 si la solicitud es ajena', async () => {
    const { request } = await seedPendingRequest();

    const detail = await api('GET', `/sharing-requests/${request.id}`, {
      userId: 'user-2',
    });
    expect(detail.status).toBe(200);
    expect(detail.body).toEqual({
      id: request.id,
      vehicle: { brand: 'Volkswagen', model: 'Polo', year: 2021 },
      senderName: 'Ana',
      status: 'PENDING',
      sentAt: expect.any(String),
    });

    const json = JSON.stringify(detail.body);
    for (const field of [
      'licensePlate',
      'vin',
      'photoUrl',
      'maintenances',
      'parts',
      'appointments',
    ]) {
      expect(json).not.toContain(field);
    }

    const ajena = await api('GET', `/sharing-requests/${request.id}`, {
      userId: 'user-1',
    });
    expect(ajena.status).toBe(404);
  });

  it('acepta: crea la membresía GUEST y notifica al emisor', async () => {
    const { request } = await seedPendingRequest();

    const response = await api(
      'POST',
      `/sharing-requests/${request.id}/accept`,
      { userId: 'user-2' },
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: request.id, status: 'ACCEPTED' });
    await expect(
      userVehicles.findOneBy({ userId: 'user-2', vehicleId: request.vehicleId }),
    ).resolves.toMatchObject({ role: UserVehicleRole.GUEST });
    await expect(
      notifications.findOneBy({
        type: NotificationType.SHARING_REQUEST_ACCEPTED,
      }),
    ).resolves.toMatchObject({
      userId: 'user-1',
      sharingRequestId: request.id,
    });
  });

  it('rechaza: no crea membresía y notifica al emisor', async () => {
    const { request } = await seedPendingRequest();

    const response = await api(
      'POST',
      `/sharing-requests/${request.id}/reject`,
      { userId: 'user-2' },
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: request.id, status: 'REJECTED' });
    await expect(
      userVehicles.countBy({ userId: 'user-2' }),
    ).resolves.toBe(0);
    await expect(
      notifications.findOneBy({
        type: NotificationType.SHARING_REQUEST_REJECTED,
      }),
    ).resolves.toMatchObject({
      userId: 'user-1',
      sharingRequestId: request.id,
    });
  });

  it('responde 409 al responder dos veces', async () => {
    const { request } = await seedPendingRequest();

    await api('POST', `/sharing-requests/${request.id}/accept`, {
      userId: 'user-2',
    });
    const second = await api(
      'POST',
      `/sharing-requests/${request.id}/reject`,
      { userId: 'user-2' },
    );

    expect(second.status).toBe(409);
    await expect(
      sharingRequests.findOneBy({ id: request.id }),
    ).resolves.toMatchObject({ status: SharingRequestStatus.ACCEPTED });
  });

  it('si falla la membresía, la solicitud sigue PENDING y no hay notificación', async () => {
    const { request } = await seedPendingRequest();
    await dataSource.query(`
      CREATE FUNCTION fail_guest_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'fallo simulado en la membresía';
      END; $$ LANGUAGE plpgsql
    `);
    await dataSource.query(`
      CREATE TRIGGER tmp_fail_guest_insert
      BEFORE INSERT ON "user_vehicles"
      FOR EACH ROW
      WHEN (NEW.user_id = 'user-2')
      EXECUTE FUNCTION fail_guest_insert()
    `);

    try {
      const response = await api(
        'POST',
        `/sharing-requests/${request.id}/accept`,
        { userId: 'user-2' },
      );
      expect(response.status).toBe(500);
    } finally {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS tmp_fail_guest_insert ON "user_vehicles"',
      );
      await dataSource.query('DROP FUNCTION IF EXISTS fail_guest_insert()');
    }

    await expect(
      sharingRequests.findOneBy({ id: request.id }),
    ).resolves.toMatchObject({ status: SharingRequestStatus.PENDING });
    await expect(userVehicles.countBy({ userId: 'user-2' })).resolves.toBe(0);
    await expect(
      notifications.countBy({
        type: NotificationType.SHARING_REQUEST_ACCEPTED,
      }),
    ).resolves.toBe(0);
  });

  it('responde 400 si el UUID no es válido', async () => {
    const response = await api('GET', '/sharing-requests/no-es-uuid', {
      userId: 'user-2',
    });

    expect(response.status).toBe(400);
  });
});

describe('API de miembros del vehículo', () => {
  it('lista solo invitados con email y fecha de asignación', async () => {
    const vehicle = await seedVehicleWithOwner();
    await seedGuest(vehicle.id);

    const response = await api('GET', `/vehicles/${vehicle.id}/members`, {
      userId: 'user-1',
    });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      userId: 'user-2',
      email: 'bruno@example.com',
      role: 'GUEST',
      assignedAt: expect.any(String),
    });
  });

  it('revoca al invitado y conserva su mantención en el historial', async () => {
    const vehicle = await seedVehicleWithOwner();
    await seedGuest(vehicle.id);
    await maintenances.save({
      vehicleId: vehicle.id,
      serviceDate: '2026-01-10',
      serviceMileage: 1100,
      description: 'Cambio de aceite',
      diagnosis: null,
      laborCost: 0,
      workshopId: null,
      registeredByUserId: 'user-2',
      appointmentId: null,
    });

    const revoke = await api(
      'DELETE',
      `/vehicles/${vehicle.id}/members/user-2`,
      { userId: 'user-1' },
    );
    expect(revoke.status).toBe(204);

    const formerGuestVehicles = await api('GET', '/vehicles', {
      userId: 'user-2',
    });
    expect(formerGuestVehicles.body).toEqual([]);

    const history = await api(
      'GET',
      `/vehicles/${vehicle.id}/maintenances`,
      { userId: 'user-1' },
    );
    expect(history.status).toBe(200);
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0]).toMatchObject({
      description: 'Cambio de aceite',
      registeredBy: { id: 'user-2', name: 'Bruno' },
    });
  });

  it('el invitado abandona el vehículo con 204', async () => {
    const vehicle = await seedVehicleWithOwner();
    await seedGuest(vehicle.id);

    const leave = await api(
      'DELETE',
      `/vehicles/${vehicle.id}/members/me`,
      { userId: 'user-2' },
    );

    expect(leave.status).toBe(204);
    await expect(userVehicles.countBy({ userId: 'user-2' })).resolves.toBe(0);
  });

  it('el dueño no puede abandonar ni ser revocado', async () => {
    const vehicle = await seedVehicleWithOwner();

    const leave = await api(
      'DELETE',
      `/vehicles/${vehicle.id}/members/me`,
      { userId: 'user-1' },
    );
    const revoke = await api(
      'DELETE',
      `/vehicles/${vehicle.id}/members/user-1`,
      { userId: 'user-1' },
    );

    expect(leave.status).toBe(409);
    expect(revoke.status).toBe(409);
    await expect(
      userVehicles.countBy({ vehicleId: vehicle.id }),
    ).resolves.toBe(1);
  });

  it('un invitado no puede revocar y un miembro inexistente responde 404', async () => {
    const vehicle = await seedVehicleWithOwner();
    await seedGuest(vehicle.id);

    const forbidden = await api(
      'DELETE',
      `/vehicles/${vehicle.id}/members/user-2`,
      { userId: 'user-2' },
    );
    const missing = await api(
      'DELETE',
      `/vehicles/${vehicle.id}/members/user-3`,
      { userId: 'user-1' },
    );
    const invalid = await api(
      'DELETE',
      `/vehicles/${vehicle.id}/members/${'x'.repeat(65)}`,
      { userId: 'user-1' },
    );

    expect(forbidden.status).toBe(403);
    expect(missing.status).toBe(404);
    expect(invalid.status).toBe(400);
  });
});
