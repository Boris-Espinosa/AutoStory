import { AsyncRouteHandler } from '../common/async-handler';
import { ValidationError, formatIssues } from '../common/validation-pipe';
import { listNotificationsQuerySchema } from '../schemas/notification.schema';
import { NotificationsService } from '../services/notifications.service';

export function listNotifications(
  service: NotificationsService,
): AsyncRouteHandler {
  return async (req, res) => {
    const parsed = listNotificationsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      throw new ValidationError(formatIssues(parsed.error));
    }

    res.json(await service.list(req.auth.userId, parsed.data));
  };
}

export function unreadCount(
  service: NotificationsService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json({ unreadCount: await service.unreadCount(req.auth.userId) });
  };
}

export function markAllRead(
  service: NotificationsService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json({ updated: await service.markAllRead(req.auth.userId) });
  };
}

export function markRead(service: NotificationsService): AsyncRouteHandler {
  return async (req, res) => {
    res.json(await service.markRead(req.auth.userId, req.params.id));
  };
}
