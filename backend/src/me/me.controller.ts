import { RequestHandler, Router } from 'express';
import { asyncHandler } from '../common/async-handler';
import {
  ValidationError,
  formatIssues,
  validateBody,
} from '../common/validation-pipe';
import { UserSyncService } from '../users/user-sync.service';
import { AccountDeletionService } from './account-deletion.service';
import { deleteAccountSchema } from './account-deletion.schema';
import { listRemindersQuerySchema } from './reminders.schema';
import { RemindersService } from './reminders.service';

export function createMeRouter(
  service: RemindersService,
  userSync: UserSyncService,
  accountDeletion: AccountDeletionService,
  auth: RequestHandler,
): Router {
  const router = Router();

  router.use(auth);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const user = await userSync.ensureLocalUser(req.auth.userId);

      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        imageUrl: user.imageUrl,
      });
    }),
  );

  router.get(
    '/deletion-preview',
    asyncHandler(async (req, res) => {
      res.json(await accountDeletion.preview(req.auth.userId));
    }),
  );

  router.delete(
    '/',
    validateBody(deleteAccountSchema),
    asyncHandler(async (req, res) => {
      res.json(await accountDeletion.deleteAccount(req.auth.userId));
    }),
  );

  router.get(
    '/reminders',
    asyncHandler(async (req, res) => {
      const parsed = listRemindersQuerySchema.safeParse(req.query);

      if (!parsed.success) {
        throw new ValidationError(formatIssues(parsed.error));
      }

      res.json(await service.listPending(req.auth.userId, parsed.data.limit));
    }),
  );

  return router;
}
