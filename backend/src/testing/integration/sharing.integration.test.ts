import { DataSource, Repository } from 'typeorm';
import { Notification, NotificationType } from '../../entities/Notification';
import {
  SharingRequest,
  SharingRequestStatus,
} from '../../entities/SharingRequest';
import { User } from '../../entities/User';
import { Vehicle } from '../../entities/Vehicle';
import { createTestDataSource } from '../test-data-source';

let dataSource: DataSource;
let users: Repository<User>;
let vehicles: Repository<Vehicle>;
let sharingRequests: Repository<SharingRequest>;
let notifications: Repository<Notification>;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();

  users = dataSource.getRepository(User);
  vehicles = dataSource.getRepository(Vehicle);
  sharingRequests = dataSource.getRepository(SharingRequest);
  notifications = dataSource.getRepository(Notification);
});

afterAll(async () => {
  await dataSource.destroy();
});

beforeEach(async () => {
  await dataSource.query(
    `TRUNCATE TABLE "notifications", "sharing_requests", "vehicles", "users" CASCADE`,
  );
  await users.save([
    { id: 'user-1', name: 'Ana' },
    { id: 'user-2', name: 'Bruno' },
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
