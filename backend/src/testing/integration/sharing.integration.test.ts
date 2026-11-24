import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DataSource, Repository } from 'typeorm';
import { createApp } from '../../app';
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

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();

  users = dataSource.getRepository(User);
  vehicles = dataSource.getRepository(Vehicle);
  userVehicles = dataSource.getRepository(UserVehicle);
  sharingRequests = dataSource.getRepository(SharingRequest);
  notifications = dataSource.getRepository(Notification);

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
