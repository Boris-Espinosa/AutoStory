import { Repository } from 'typeorm';
import { HttpError } from '../common/http-error';
import { NotificationType } from '../entities/Notification';
import {
  SharingRequest,
  SharingRequestStatus,
} from '../entities/SharingRequest';
import { User } from '../entities/User';
import { UserVehicle } from '../entities/UserVehicle';
import { createNotifications } from '../jobs/notify';
import {
  sharingRequestReceivedBody,
  SHARING_REQUEST_RECEIVED_TITLE,
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

const MAX_PENDING = 10;

function isDuplicate(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === '23505';
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

        // R33: 0 o más de una coincidencia dan la misma respuesta 202.
        if (matches.length !== 1) {
          return;
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

    const updated: CancelRow[] = await this.repositories.sharingRequests.query(
      `UPDATE "sharing_requests"
          SET status = 'CANCELLED', responded_at = now()
        WHERE id = $1 AND vehicle_id = $2 AND status = 'PENDING'
        RETURNING id, responded_at`,
      [requestId, vehicleId],
    );

    if (updated.length === 0) {
      throw new HttpError(409, 'La solicitud ya no está pendiente.');
    }

    return {
      id: updated[0].id,
      status: SharingRequestStatus.CANCELLED,
      respondedAt: new Date(updated[0].responded_at).toISOString(),
    };
  }
}
