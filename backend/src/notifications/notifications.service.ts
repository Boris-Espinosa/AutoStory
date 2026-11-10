import { IsNull, Repository } from 'typeorm';
import { z } from 'zod';
import { Clock } from '../common/clock';
import { HttpError } from '../common/http-error';
import { Notification, NotificationType } from '../entities/Notification';
import { ListNotificationsQuery } from './notification.schema';

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  vehicleId: string | null;
  appointmentId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: NotificationView[];
  total: number;
  unreadCount: number;
}

const uuidSchema = z.string().uuid();
const NOT_FOUND = 'Notificación no encontrada.';

function toView(notification: Notification): NotificationView {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    vehicleId: notification.vehicleId,
    appointmentId: notification.appointmentId,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

export class NotificationsService {
  constructor(
    private readonly notifications: Repository<Notification>,
    private readonly clock: Clock,
  ) {}

  async list(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<NotificationList> {
    const where = query.unread
      ? { userId, readAt: IsNull() }
      : { userId };

    const [rows, total] = await this.notifications.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'ASC' },
      take: query.limit,
      skip: query.offset,
    });

    return {
      items: rows.map(toView),
      total,
      unreadCount: await this.unreadCount(userId),
    };
  }

  unreadCount(userId: string): Promise<number> {
    return this.notifications.count({ where: { userId, readAt: IsNull() } });
  }

  async markRead(userId: string, id: string): Promise<NotificationView> {
    if (!uuidSchema.safeParse(id).success) {
      throw new HttpError(404, NOT_FOUND);
    }

    const updated = await this.notifications.update(
      { id, userId, readAt: IsNull() },
      { readAt: this.clock.now() },
    );

    if (updated.affected === 0) {
      // Ya estaba leída (se conserva readAt) o no es del usuario.
      const existing = await this.notifications.findOne({
        where: { id, userId },
      });

      if (!existing) {
        throw new HttpError(404, NOT_FOUND);
      }

      return toView(existing);
    }

    const stored = await this.notifications.findOneByOrFail({ id, userId });
    return toView(stored);
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.notifications.update(
      { userId, readAt: IsNull() },
      { readAt: this.clock.now() },
    );

    return result.affected ?? 0;
  }
}
