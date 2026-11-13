import { createClerkClient } from '@clerk/backend';
import { DataSource } from 'typeorm';
import { error as logError, warn } from '../common/logger';
import { env } from '../config/env';
import { StorageService } from '../storage/storage.service';

const CLERK_TIMEOUT_MS = 5_000;

export interface AccountDeletionPreview {
  ownedVehicles: number;
  ownedVehiclesWithGuests: number;
  guestMemberships: number;
}

export interface ClerkUserDeleter {
  deleteUser(userId: string): Promise<void>;
}

/** Implementación real: elimina la cuenta en Clerk. */
export class ClerkUserDeleterService implements ClerkUserDeleter {
  private client: ReturnType<typeof createClerkClient> | null = null;

  async deleteUser(userId: string): Promise<void> {
    if (!env.auth.secretKey) {
      throw new Error('CLERK_SECRET_KEY no está configurada.');
    }

    this.client ??= createClerkClient({ secretKey: env.auth.secretKey });
    await this.client.users.deleteUser(userId);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('Tiempo de espera agotado.')),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

export class AccountDeletionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clerk: ClerkUserDeleter,
    private readonly storage: StorageService,
  ) {}

  async preview(userId: string): Promise<AccountDeletionPreview> {
    const [row]: AccountDeletionPreview[] = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int
            FROM "user_vehicles"
           WHERE "user_id" = $1 AND "role" = 'OWNER') AS "ownedVehicles",
         (SELECT COUNT(DISTINCT owner."vehicle_id")::int
            FROM "user_vehicles" owner
           WHERE owner."user_id" = $1
             AND owner."role" = 'OWNER'
             AND EXISTS (
               SELECT 1
                 FROM "user_vehicles" guest
                WHERE guest."vehicle_id" = owner."vehicle_id"
                  AND guest."role" = 'GUEST'
             )) AS "ownedVehiclesWithGuests",
         (SELECT COUNT(*)::int
            FROM "user_vehicles"
           WHERE "user_id" = $1 AND "role" = 'GUEST') AS "guestMemberships"`,
      [userId],
    );

    return row;
  }

  async deleteAccount(userId: string): Promise<{ clerkDeleted: boolean }> {
    const photoUrls = await this.dataSource.transaction(async (manager) => {
      const owned: { photoUrl: string | null }[] = await manager.query(
        `SELECT vehicle."photo_url" AS "photoUrl"
           FROM "vehicles" vehicle
           JOIN "user_vehicles" membership
             ON membership."vehicle_id" = vehicle."id"
          WHERE membership."user_id" = $1
            AND membership."role" = 'OWNER'`,
        [userId],
      );

      // La cascada borra membresías, repuestos, mantenciones, citas,
      // recordatorios, notificaciones y solicitudes de esos vehículos.
      await manager.query(
        `DELETE FROM "vehicles"
          WHERE "id" IN (
            SELECT "vehicle_id" FROM "user_vehicles"
             WHERE "user_id" = $1 AND "role" = 'OWNER'
          )`,
        [userId],
      );

      // Las solicitudes que referencian al usuario tienen ON DELETE RESTRICT:
      // se borran antes que el usuario para no bloquear la eliminación.
      await manager.query(
        `DELETE FROM "sharing_requests"
          WHERE "sender_user_id" = $1 OR "receiver_user_id" = $1`,
        [userId],
      );

      await manager.query(
        `DELETE FROM "user_vehicles" WHERE "user_id" = $1`,
        [userId],
      );

      await manager.query(`DELETE FROM "users" WHERE "id" = $1`, [userId]);

      return owned
        .map(({ photoUrl }) => photoUrl)
        .filter((photoUrl): photoUrl is string => photoUrl !== null);
    });

    for (const photoUrl of photoUrls) {
      try {
        await this.storage.remove(photoUrl);
      } catch {
        warn('No se pudo borrar una foto de un vehículo eliminado.');
      }
    }

    return { clerkDeleted: await this.deleteFromClerk(userId) };
  }

  private async deleteFromClerk(userId: string): Promise<boolean> {
    try {
      await withTimeout(this.clerk.deleteUser(userId), CLERK_TIMEOUT_MS);
      return true;
    } catch {
      // Los datos locales ya no existen; sin ids ni datos personales.
      logError(
        'No se pudo eliminar la cuenta en Clerk; la eliminación local ya se completó.',
      );
      return false;
    }
  }
}
