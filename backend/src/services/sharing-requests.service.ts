import { Repository } from 'typeorm';
import { HttpError } from '../common/http-error';
import { NotificationType } from '../entities/Notification';
import {
  SharingRequest,
  SharingRequestStatus,
} from '../entities/SharingRequest';
import { User } from '../entities/User';
import { UserVehicle, UserVehicleRole } from '../entities/UserVehicle';
import { createNotifications } from '../jobs/notify';
import {
  SHARING_ACCOUNT_NOT_FOUND_MESSAGE,
  sharingDisplayName,
  sharingRequestAcceptedBody,
  sharingRequestReceivedBody,
  sharingRequestRejectedBody,
  SHARING_REQUEST_ACCEPTED_TITLE,
  SHARING_REQUEST_RECEIVED_TITLE,
  SHARING_REQUEST_REJECTED_TITLE,
} from '../utils/messages';

export interface SharingRequestsRepositories {
  sharingRequests: Repository<SharingRequest>;
  users: Repository<User>;
  userVehicles: Repository<UserVehicle>;
}

export interface PendingSharingRequestView {
  id: string;
  receiverEmail: string;
  sentAt: string;
  status: SharingRequestStatus.PENDING;
}

export interface CancelledSharingRequestView {
  id: string;
  status: SharingRequestStatus.CANCELLED;
  respondedAt: string;
}

export interface ReceiverSharingRequestView {
  id: string;
  vehicle: { brand: string; model: string; year: number };
  senderName: string;
  status: SharingRequestStatus;
  sentAt: string;
}

export interface RespondedSharingRequestView {
  id: string;
  status: SharingRequestStatus.ACCEPTED | SharingRequestStatus.REJECTED;
}

export interface MemberView {
  userId: string;
  email: string;
  role: UserVehicleRole.GUEST;
  assignedAt: string;
}

interface EmailMatch {
  id: string;
}

interface PendingCount {
  count: number;
}

interface CancelRow {
  id: string;
  responded_at: Date | string;
}

interface ReceiverRow {
  id: string;
  brand: string;
  model: string;
  year: number;
  sender_name: string | null;
  status: SharingRequestStatus;
  sent_at: Date | string;
}

interface RespondRow {
  id: string;
  sender_user_id: string;
  vehicle_id: string;
}

interface MemberRow {
  user_id: string;
  email: string | null;
  assigned_at: Date | string;
}

const MAX_PENDING = 10;

function isDuplicate(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === '23505';
}

function conflictMessage(status: SharingRequestStatus): string {
  return status === SharingRequestStatus.CANCELLED
    ? 'Esta solicitud ya no está disponible.'
    : 'Ya respondiste esta solicitud.';
}

export class SharingRequestsService {
  constructor(private readonly repositories: SharingRequestsRepositories) {}

  async send(senderId: string, vehicleId: string, email: string): Promise<void> {
    await this.repositories.sharingRequests.manager.transaction(
      async (manager) => {
        const matches: EmailMatch[] = await manager.query(
          `SELECT id
             FROM "users"
            WHERE "email" IS NOT NULL
              AND LOWER(TRIM("email")) = LOWER(TRIM($1))
            LIMIT 2`,
          [email],
        );

        // R33: sin una cuenta única no se crea nada y se informa el motivo.
        if (matches.length !== 1) {
          throw new HttpError(400, SHARING_ACCOUNT_NOT_FOUND_MESSAGE);
        }

        const receiverId = matches[0].id;

        if (receiverId === senderId) {
          throw new HttpError(409, 'No puedes compartir un vehículo contigo mismo.');
        }

        const membership = await manager.findOne(UserVehicle, {
          where: { userId: receiverId, vehicleId },
        });

        if (membership) {
          throw new HttpError(409, 'Ese usuario ya tiene acceso al vehículo.');
        }

        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `sharing:${vehicleId}`,
        ]);

        const [countRow]: PendingCount[] = await manager.query(
          `SELECT COUNT(*)::int AS count
             FROM "sharing_requests"
            WHERE vehicle_id = $1 AND status = 'PENDING'`,
          [vehicleId],
        );

        if (countRow.count >= MAX_PENDING) {
          throw new HttpError(
            409,
            'Este vehículo ya tiene 10 solicitudes pendientes.',
          );
        }

        const sender = await manager.findOne(User, {
          where: { id: senderId },
          select: ['name'],
        });

        const request = manager.create(SharingRequest, {
          vehicleId,
          senderUserId: senderId,
          receiverUserId: receiverId,
        });

        try {
          await manager.save(request);
        } catch (error) {
          if (isDuplicate(error)) {
            throw new HttpError(
              409,
              'Ya existe una solicitud pendiente para ese vehículo y receptor.',
            );
          }
          throw error;
        }

        await createNotifications(manager, [
          {
            userId: receiverId,
            type: NotificationType.SHARING_REQUEST_RECEIVED,
            title: SHARING_REQUEST_RECEIVED_TITLE,
            body: sharingRequestReceivedBody(sender?.name ?? null),
            sharingRequestId: request.id,
          },
        ]);
      },
    );
  }

  async listPending(vehicleId: string): Promise<PendingSharingRequestView[]> {
    const rows: Array<{
      id: string;
      receiver_email: string | null;
      sent_at: Date | string;
    }> = await this.repositories.sharingRequests.query(
      `SELECT sr.id, u.email AS receiver_email, sr.sent_at
         FROM "sharing_requests" sr
         JOIN "users" u ON u.id = sr.receiver_user_id
        WHERE sr.vehicle_id = $1 AND sr.status = 'PENDING'
        ORDER BY sr.sent_at DESC, sr.id ASC`,
      [vehicleId],
    );

    return rows.map((row) => ({
      id: row.id,
      receiverEmail: row.receiver_email ?? '',
      sentAt: new Date(row.sent_at).toISOString(),
      status: SharingRequestStatus.PENDING,
    }));
  }

  async cancel(
    vehicleId: string,
    requestId: string,
  ): Promise<CancelledSharingRequestView> {
    const existing: Array<{ id: string }> =
      await this.repositories.sharingRequests.query(
        `SELECT id
           FROM "sharing_requests"
          WHERE id = $1 AND vehicle_id = $2`,
        [requestId, vehicleId],
      );

    if (existing.length === 0) {
      throw new HttpError(404, 'Solicitud no encontrada.');
    }

    // TypeORM devuelve [filas, filasAfectadas] para UPDATE con RETURNING.
    const [rows]: [CancelRow[], number] =
      await this.repositories.sharingRequests.query(
        `UPDATE "sharing_requests"
            SET status = 'CANCELLED', responded_at = now()
          WHERE id = $1 AND vehicle_id = $2 AND status = 'PENDING'
          RETURNING id, responded_at`,
        [requestId, vehicleId],
      );

    if (rows.length === 0) {
      throw new HttpError(409, 'La solicitud ya no está pendiente.');
    }

    return {
      id: rows[0].id,
      status: SharingRequestStatus.CANCELLED,
      respondedAt: new Date(rows[0].responded_at).toISOString(),
    };
  }

  async getForReceiver(
    receiverId: string,
    requestId: string,
  ): Promise<ReceiverSharingRequestView> {
    const rows: ReceiverRow[] = await this.repositories.sharingRequests.query(
      `SELECT sr.id, v.brand, v.model, v.year, u.name AS sender_name,
              sr.status, sr.sent_at
         FROM "sharing_requests" sr
         JOIN "vehicles" v ON v.id = sr.vehicle_id
         JOIN "users" u ON u.id = sr.sender_user_id
        WHERE sr.id = $1 AND sr.receiver_user_id = $2`,
      [requestId, receiverId],
    );

    if (rows.length === 0) {
      throw new HttpError(404, 'Solicitud no encontrada.');
    }

    const row = rows[0];

    if (row.status !== SharingRequestStatus.PENDING) {
      throw new HttpError(409, conflictMessage(row.status));
    }

    return {
      id: row.id,
      vehicle: { brand: row.brand, model: row.model, year: row.year },
      senderName: sharingDisplayName(row.sender_name),
      status: row.status,
      sentAt: new Date(row.sent_at).toISOString(),
    };
  }

  async accept(
    receiverId: string,
    requestId: string,
  ): Promise<RespondedSharingRequestView> {
    return this.respond(receiverId, requestId, SharingRequestStatus.ACCEPTED);
  }

  async reject(
    receiverId: string,
    requestId: string,
  ): Promise<RespondedSharingRequestView> {
    return this.respond(receiverId, requestId, SharingRequestStatus.REJECTED);
  }

  private async respond(
    receiverId: string,
    requestId: string,
    status: RespondedSharingRequestView['status'],
  ): Promise<RespondedSharingRequestView> {
    return this.repositories.sharingRequests.manager.transaction(
      async (manager) => {
        // TypeORM devuelve [filas, filasAfectadas] para UPDATE con RETURNING.
        const [rows]: [RespondRow[], number] = await manager.query(
          `UPDATE "sharing_requests"
              SET status = $3, responded_at = now()
            WHERE id = $1 AND receiver_user_id = $2 AND status = 'PENDING'
            RETURNING id, sender_user_id, vehicle_id`,
          [requestId, receiverId, status],
        );

        if (rows.length === 0) {
          const existing: Array<{ status: SharingRequestStatus }> =
            await manager.query(
              `SELECT status
                 FROM "sharing_requests"
                WHERE id = $1 AND receiver_user_id = $2`,
              [requestId, receiverId],
            );

          if (existing.length === 0) {
            throw new HttpError(404, 'Solicitud no encontrada.');
          }
          throw new HttpError(409, conflictMessage(existing[0].status));
        }

        const request = rows[0];
        const accepted = status === SharingRequestStatus.ACCEPTED;

        if (accepted) {
          await manager.query(
            `INSERT INTO "user_vehicles" (user_id, vehicle_id, role)
             VALUES ($1, $2, 'GUEST')
             ON CONFLICT (user_id, vehicle_id) DO NOTHING`,
            [receiverId, request.vehicle_id],
          );
        }

        const receiver = await manager.findOne(User, {
          where: { id: receiverId },
          select: ['name'],
        });

        await createNotifications(manager, [
          {
            userId: request.sender_user_id,
            type: accepted
              ? NotificationType.SHARING_REQUEST_ACCEPTED
              : NotificationType.SHARING_REQUEST_REJECTED,
            title: accepted
              ? SHARING_REQUEST_ACCEPTED_TITLE
              : SHARING_REQUEST_REJECTED_TITLE,
            body: accepted
              ? sharingRequestAcceptedBody(receiver?.name ?? null)
              : sharingRequestRejectedBody(receiver?.name ?? null),
            sharingRequestId: requestId,
          },
        ]);

        return { id: request.id, status };
      },
    );
  }

  async listMembers(vehicleId: string): Promise<MemberView[]> {
    const rows: MemberRow[] = await this.repositories.userVehicles.query(
      `SELECT uv.user_id, u.email, uv.assigned_at
         FROM "user_vehicles" uv
         JOIN "users" u ON u.id = uv.user_id
        WHERE uv.vehicle_id = $1 AND uv.role = 'GUEST'
        ORDER BY uv.assigned_at DESC, uv.user_id ASC`,
      [vehicleId],
    );

    return rows.map((row) => ({
      userId: row.user_id,
      email: row.email ?? '',
      role: UserVehicleRole.GUEST,
      assignedAt: new Date(row.assigned_at).toISOString(),
    }));
  }

  async revoke(vehicleId: string, userId: string): Promise<void> {
    const rows: Array<{ role: UserVehicleRole }> =
      await this.repositories.userVehicles.query(
        `SELECT role
           FROM "user_vehicles"
          WHERE user_id = $1 AND vehicle_id = $2`,
        [userId, vehicleId],
      );

    if (rows.length === 0) {
      throw new HttpError(404, 'Miembro no encontrado.');
    }
    if (rows[0].role === UserVehicleRole.OWNER) {
      throw new HttpError(409, 'El dueño no puede salir ni ser revocado.');
    }

    await this.repositories.userVehicles.query(
      `DELETE FROM "user_vehicles"
        WHERE user_id = $1 AND vehicle_id = $2 AND role = 'GUEST'`,
      [userId, vehicleId],
    );
  }

  async leave(vehicleId: string, userId: string): Promise<void> {
    await this.revoke(vehicleId, userId);
  }
}
