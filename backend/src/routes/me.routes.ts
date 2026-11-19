import { RequestHandler, Router } from 'express';
import { asyncHandler } from '../common/async-handler';
import { validateBody } from '../common/validation-pipe';
import {
  deletionPreview,
  deleteAccount,
  getMe,
  listReminders,
} from '../controllers/me.controller';
import { deleteAccountSchema } from '../schemas/account-deletion.schema';
import { AccountDeletionService } from '../services/account-deletion.service';
import { RemindersService } from '../services/reminders.service';
import { UserSyncService } from '../services/user-sync.service';

export function createMeRouter(
  service: RemindersService,
  userSync: UserSyncService,
  accountDeletion: AccountDeletionService,
  auth: RequestHandler,
): Router {
  const router = Router();

  router.use(auth);

  router.get('/', asyncHandler(getMe(userSync)));

  router.get('/deletion-preview', asyncHandler(deletionPreview(accountDeletion)));

  router.delete(
    '/',
    validateBody(deleteAccountSchema),
    asyncHandler(deleteAccount(accountDeletion)),
  );

  router.get('/reminders', asyncHandler(listReminders(service)));

  return router;
}
