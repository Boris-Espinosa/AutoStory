import { RequestHandler, Response } from 'express';
import { Repository } from 'typeorm';
import { asyncHandler } from '../common/async-handler';
import { env } from '../config/env';
import { User } from '../entities/User';

function respondUnauthorized(res: Response): void {
  res.status(401).json({ message: 'No autenticado' });
}

/**
 * Autenticación intercambiable.
 *
 * Para Clerk: reemplazar el cuerpo por la verificación de sesión y crear el
 * User si aún no existe.
 */
export function createAuthMiddleware(users: Repository<User>): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    // El modo por cabecera es solo para desarrollo.
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
  });
}
