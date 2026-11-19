import { AsyncRouteHandler } from '../common/async-handler';
import { ValidationError, formatIssues } from '../common/validation-pipe';
import { listRemindersQuerySchema } from '../schemas/reminders.schema';
import { AccountDeletionService } from '../services/account-deletion.service';
import { RemindersService } from '../services/reminders.service';
import { UserSyncService } from '../services/user-sync.service';

export function getMe(userSync: UserSyncService): AsyncRouteHandler {
  return async (req, res) => {
    const user = await userSync.ensureLocalUser(req.auth.userId);

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      imageUrl: user.imageUrl,
    });
  };
}

export function deletionPreview(
  accountDeletion: AccountDeletionService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json(await accountDeletion.preview(req.auth.userId));
  };
}

export function deleteAccount(
  accountDeletion: AccountDeletionService,
): AsyncRouteHandler {
  return async (req, res) => {
    res.json(await accountDeletion.deleteAccount(req.auth.userId));
  };
}

export function listReminders(service: RemindersService): AsyncRouteHandler {
  return async (req, res) => {
    const parsed = listRemindersQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      throw new ValidationError(formatIssues(parsed.error));
    }

    res.json(await service.listPending(req.auth.userId, parsed.data.limit));
  };
}
