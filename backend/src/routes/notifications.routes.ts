import { RequestHandler, Router } from 'express';
import { asyncHandler } from '../common/async-handler';
import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from '../controllers/notifications.controller';
import { NotificationsService } from '../services/notifications.service';

export function createNotificationsRouter(
  service: NotificationsService,
  auth: RequestHandler,
): Router {
  const router = Router();

  router.use(auth);

  router.get('/', asyncHandler(listNotifications(service)));

  router.get('/unread-count', asyncHandler(unreadCount(service)));

  router.post('/read-all', asyncHandler(markAllRead(service)));

  router.post('/:id/read', asyncHandler(markRead(service)));

  return router;
}
