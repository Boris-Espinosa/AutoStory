import { getAuth } from '@clerk/express';
import { RequestHandler, Response } from 'express';
import { Repository } from 'typeorm';
import { asyncHandler } from '../common/async-handler';
import { env } from '../config/env';
import { User } from '../entities/User';
import { UserSyncService } from '../users/user-sync.service';

interface AuthMiddlewareOptions {
  users: Repository<User>;
  userSync: Pick<UserSyncService, 'ensureLocalUser'>;
}

function respondUnauthorized(res: Response): void {
  res.status(401).json({ message: 'No autenticado' });
}

/**
 * Guardia de autenticación. En modo clerk la identidad sale del token
 * verificado; el modo dev-header solo existe fuera de producción.
 */
export function createAuthMiddleware({
  users,
  userSync,
}: AuthMiddlewareOptions): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    if (env.auth.mode === 'dev-header') {
      if (env.nodeEnv === 'production') {
        respondUnauthorized(res);
        return;
      }

      const userId = req.header('x-user-id')?.trim();

      if (!userId) {
        respondUnauthorized(res);
        return;
      }

      const user = await users.findOne({ where: { id: userId } });

      if (!user) {
        respondUnauthorized(res);
        return;
      }

      req.auth = { userId };
      next();
      return;
    }

    const { userId } = getAuth(req);

    if (!userId) {
      respondUnauthorized(res);
      return;
    }

    try {
      await userSync.ensureLocalUser(userId);
    } catch {
      console.error('No se pudo asegurar el usuario local de Clerk.');
      res.status(503).json({ message: 'Servicio no disponible' });
      return;
    }

    req.auth = { userId };
    next();
  });
}
