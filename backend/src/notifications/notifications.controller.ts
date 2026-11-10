import { RequestHandler, Router } from 'express';
import { asyncHandler } from '../common/async-handler';
import {
  ValidationError,
  formatIssues,
} from '../common/validation-pipe';
import { listNotificationsQuerySchema } from './notification.schema';
import { NotificationsService } from './notifications.service';

export function createNotificationsRouter(
  service: NotificationsService,
  auth: RequestHandler,
): Router {
  const router = Router();

  router.use(auth);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const parsed = listNotificationsQuerySchema.safeParse(req.query);

      if (!parsed.success) {
        throw new ValidationError(formatIssues(parsed.error));
      }

      res.json(await service.list(req.auth.userId, parsed.data));
    }),
  );

  router.get(
    '/unread-count',
    asyncHandler(async (req, res) => {
      res.json({ unreadCount: await service.unreadCount(req.auth.userId) });
    }),
  );

  router.post(
    '/read-all',
    asyncHandler(async (req, res) => {
      res.json({ updated: await service.markAllRead(req.auth.userId) });
    }),
  );

  router.post(
    '/:id/read',
    asyncHandler(async (req, res) => {
      res.json(await service.markRead(req.auth.userId, req.params.id));
    }),
  );

  return router;
}
