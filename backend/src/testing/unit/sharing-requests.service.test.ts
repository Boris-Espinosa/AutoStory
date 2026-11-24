import { EntityManager, Repository } from 'typeorm';
import { NotificationType } from '../../entities/Notification';
import { SharingRequest } from '../../entities/SharingRequest';
import { User } from '../../entities/User';
import { UserVehicle } from '../../entities/UserVehicle';
import { createNotifications } from '../../jobs/notify';
import { SharingRequestsService } from '../../services/sharing-requests.service';
import {
  sharingRequestReceivedBody,
  SHARING_REQUEST_RECEIVED_TITLE,
} from '../../utils/messages';

jest.mock('../../jobs/notify', () => ({
  createNotifications: jest.fn(),
}));

const VEHICLE_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SENDER_ID = 'user-1';
const RECEIVER_ID = 'user-2';
const SENT_AT = new Date('2026-01-10T12:00:00.000Z');

type MockManager = {
  query: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

function buildService() {
  const manager: MockManager = {
    query: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const sharingRequests = {
    manager: { transaction: jest.fn() },
    query: jest.fn(),
  };

  sharingRequests.manager.transaction.mockImplementation(
    async (callback: (tx: EntityManager) => Promise<unknown>) =>
      callback(manager as unknown as EntityManager),
  );
  manager.create.mockImplementation(
    (_entity: unknown, data: Partial<SharingRequest>) => ({
      ...data,
      id: REQUEST_ID,
    }),
  );
  manager.save.mockImplementation(async (request: SharingRequest) => request);

  const service = new SharingRequestsService({
    sharingRequests: sharingRequests as unknown as Repository<SharingRequest>,
    users: {} as Repository<User>,
    userVehicles: {} as Repository<UserVehicle>,
  });

  return { service, manager, sharingRequests };
}

function mockReceiverLookup(manager: MockManager, matches = [{ id: RECEIVER_ID }]) {
  manager.query.mockImplementation((sql: string) => {
    if (sql.includes('FROM "users"')) {
      return Promise.resolve(matches);
    }
    if (sql.includes('pg_advisory_xact_lock')) {
      return Promise.resolve([]);
    }
    if (sql.includes('COUNT(*)')) {
      return Promise.resolve([{ count: 0 }]);
    }
    return Promise.resolve([]);
  });
  manager.findOne.mockImplementation((entity: unknown) => {
    if (entity === User) {
      return Promise.resolve({ name: 'Bruno' });
    }
    return Promise.resolve(null);
  });
}

describe('SharingRequestsService.send', () => {
  it('busca con LOWER(TRIM(email)) y notifica con el id de la solicitud', async () => {
    const { service, manager } = buildService();
    mockReceiverLookup(manager);

    await service.send(SENDER_ID, VEHICLE_ID, '  BRUNO@example.com  ');

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('LOWER(TRIM("email")) = LOWER(TRIM($1))'),
      ['  BRUNO@example.com  '],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      [`sharing:${VEHICLE_ID}`],
    );
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(createNotifications).toHaveBeenCalledWith(manager, [
      expect.objectContaining({
        userId: RECEIVER_ID,
        type: NotificationType.SHARING_REQUEST_RECEIVED,
        title: SHARING_REQUEST_RECEIVED_TITLE,
        sharingRequestId: REQUEST_ID,
      }),
    ]);
  });

  it('no inserta nada si el correo no existe', async () => {
    const { service, manager } = buildService();
    mockReceiverLookup(manager, []);

    await service.send(SENDER_ID, VEHICLE_ID, 'nadie@example.com');

    expect(manager.save).not.toHaveBeenCalled();
    expect(createNotifications).not.toHaveBeenCalled();
  });

  it('no inserta nada si hay más de una coincidencia', async () => {
    const { service, manager } = buildService();
    mockReceiverLookup(manager, [{ id: RECEIVER_ID }, { id: 'user-3' }]);

    await service.send(SENDER_ID, VEHICLE_ID, 'duplicado@example.com');

    expect(manager.save).not.toHaveBeenCalled();
    expect(createNotifications).not.toHaveBeenCalled();
  });

  it('rechaza enviarse a uno mismo', async () => {
    const { service, manager } = buildService();
    mockReceiverLookup(manager, [{ id: SENDER_ID }]);

    await expect(
      service.send(SENDER_ID, VEHICLE_ID, 'ana@example.com'),
    ).rejects.toMatchObject({ status: 409 });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rechaza enviar a quien ya es miembro', async () => {
    const { service, manager } = buildService();
    mockReceiverLookup(manager);
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === UserVehicle) {
        return Promise.resolve({ userId: RECEIVER_ID, vehicleId: VEHICLE_ID });
      }
      return Promise.resolve(null);
    });

    await expect(
      service.send(SENDER_ID, VEHICLE_ID, 'bruno@example.com'),
    ).rejects.toMatchObject({ status: 409 });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('traduce el conflicto 23505 del índice parcial a 409', async () => {
    const { service, manager } = buildService();
    mockReceiverLookup(manager);
    manager.save.mockRejectedValue({ code: '23505' });

    await expect(
      service.send(SENDER_ID, VEHICLE_ID, 'bruno@example.com'),
    ).rejects.toMatchObject({ status: 409 });
    expect(createNotifications).not.toHaveBeenCalled();
  });

  it('rechaza el envío cuando ya hay 10 pendientes', async () => {
    const { service, manager } = buildService();
    mockReceiverLookup(manager);
    manager.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM "users"')) {
        return Promise.resolve([{ id: RECEIVER_ID }]);
      }
      if (sql.includes('COUNT(*)')) {
        return Promise.resolve([{ count: 10 }]);
      }
      return Promise.resolve([]);
    });

    await expect(
      service.send(SENDER_ID, VEHICLE_ID, 'bruno@example.com'),
    ).rejects.toMatchObject({ status: 409 });
    expect(manager.save).not.toHaveBeenCalled();
  });
});

describe('SharingRequestsService.listPending', () => {
  it('devuelve el email actual del receptor y la fecha de envío', async () => {
    const { service, sharingRequests } = buildService();
    sharingRequests.query.mockResolvedValue([
      { id: REQUEST_ID, receiver_email: 'Bruno@Example.com', sent_at: SENT_AT },
    ]);

    await expect(service.listPending(VEHICLE_ID)).resolves.toEqual([
      {
        id: REQUEST_ID,
        receiverEmail: 'Bruno@Example.com',
        sentAt: SENT_AT.toISOString(),
        status: 'PENDING',
      },
    ]);
  });
});

describe('SharingRequestsService.cancel', () => {
  it('cancela una solicitud pendiente', async () => {
    const { service, sharingRequests } = buildService();
    sharingRequests.query
      .mockResolvedValueOnce([{ id: REQUEST_ID }])
      .mockResolvedValueOnce([
        { id: REQUEST_ID, responded_at: SENT_AT },
      ]);

    await expect(service.cancel(VEHICLE_ID, REQUEST_ID)).resolves.toEqual({
      id: REQUEST_ID,
      status: 'CANCELLED',
      respondedAt: SENT_AT.toISOString(),
    });
  });

  it('responde 404 si la solicitud es de otro vehículo', async () => {
    const { service, sharingRequests } = buildService();
    sharingRequests.query.mockResolvedValueOnce([]);

    await expect(
      service.cancel(VEHICLE_ID, REQUEST_ID),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('responde 409 si la solicitud ya no está pendiente', async () => {
    const { service, sharingRequests } = buildService();
    sharingRequests.query
      .mockResolvedValueOnce([{ id: REQUEST_ID }])
      .mockResolvedValueOnce([]);

    await expect(
      service.cancel(VEHICLE_ID, REQUEST_ID),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('textos de compartir', () => {
  it('respeta los límites de título y cuerpo', () => {
    expect(SHARING_REQUEST_RECEIVED_TITLE.length).toBeLessThanOrEqual(120);
    expect(
      sharingRequestReceivedBody('N'.repeat(400)).length,
    ).toBeLessThanOrEqual(300);
  });

  it('usa el nombre genérico cuando el emisor no tiene nombre', () => {
    expect(sharingRequestReceivedBody(null)).toContain(
      'Un usuario de AutoStory',
    );
  });
});
