import { createClerkClient } from '@clerk/backend';
import { Repository } from 'typeorm';
import { Clock } from '../common/clock';
import { env } from '../config/env';
import { User } from '../entities/User';

const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
const PROFILE_TIMEOUT_MS = 5_000;

export interface ProfileInfo {
  name: string | null;
  email: string | null;
  imageUrl: string | null;
}

export interface ProfileProvider {
  getProfile(userId: string): Promise<ProfileInfo>;
}

/** Implementación real: lee el perfil desde Clerk. */
export class ClerkProfileProvider implements ProfileProvider {
  private client: ReturnType<typeof createClerkClient> | null = null;

  async getProfile(userId: string): Promise<ProfileInfo> {
    if (!env.auth.secretKey) {
      throw new Error('CLERK_SECRET_KEY no está configurada.');
    }

    this.client ??= createClerkClient({ secretKey: env.auth.secretKey });
    const user = await this.client.users.getUser(userId);

    return {
      name: user.fullName,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      imageUrl: user.imageUrl || null,
    };
  }
}

interface UserSyncOptions {
  users: Repository<User>;
  provider: ProfileProvider;
  clock: Clock;
  timeoutMs?: number;
}

interface PgError {
  code?: string;
}

function normalizeName(value: string | null): string | null {
  const normalized = value?.normalize('NFC').trim().slice(0, 120) ?? '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeImageUrl(value: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized.slice(0, 500) : null;
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as PgError).code === '23505'
  );
}

/**
 * Mantiene la fila local del usuario de Clerk. Un fallo del proveedor nunca
 * bloquea la petición: queda el usuario mínimo y se reintenta más adelante.
 */
export class UserSyncService {
  private readonly users: Repository<User>;
  private readonly provider: ProfileProvider;
  private readonly clock: Clock;
  private readonly timeoutMs: number;
  private readonly inFlight = new Map<string, Promise<User>>();

  constructor({
    users,
    provider,
    clock,
    timeoutMs = PROFILE_TIMEOUT_MS,
  }: UserSyncOptions) {
    this.users = users;
    this.provider = provider;
    this.clock = clock;
    this.timeoutMs = timeoutMs;
  }

  async ensureLocalUser(clerkUserId: string): Promise<User> {
    const running = this.inFlight.get(clerkUserId);

    if (running) {
      return running;
    }

    const task = this.syncProfile(clerkUserId).finally(() =>
      this.inFlight.delete(clerkUserId),
    );
    this.inFlight.set(clerkUserId, task);

    return task;
  }

  private async syncProfile(clerkUserId: string): Promise<User> {
    const existing = await this.users.findOneBy({ id: clerkUserId });

    if (existing && this.isProfileFresh(existing.profileSyncedAt)) {
      return existing;
    }

    let profile: ProfileInfo;

    try {
      profile = await withTimeout(
        this.provider.getProfile(clerkUserId),
        this.timeoutMs,
      );
    } catch {
      console.warn(
        'No se pudo sincronizar el perfil de Clerk; se continúa con el usuario mínimo.',
      );

      if (existing) {
        return existing;
      }

      await this.users.query(
        `INSERT INTO "users" ("id") VALUES ($1) ON CONFLICT ("id") DO NOTHING`,
        [clerkUserId],
      );
      return this.users.findOneByOrFail({ id: clerkUserId });
    }

    return this.upsertProfile(clerkUserId, profile);
  }

  private isProfileFresh(profileSyncedAt: Date | null): boolean {
    if (!profileSyncedAt) {
      return false;
    }

    return (
      this.clock.now().getTime() - profileSyncedAt.getTime() < PROFILE_TTL_MS
    );
  }

  private async upsertProfile(
    clerkUserId: string,
    profile: ProfileInfo,
  ): Promise<User> {
    const data = {
      name: normalizeName(profile.name),
      email: normalizeEmail(profile.email),
      imageUrl: normalizeImageUrl(profile.imageUrl),
    };

    await this.writeProfile(clerkUserId, data, this.clock.now());

    return this.users.findOneByOrFail({ id: clerkUserId });
  }

  private async writeProfile(
    clerkUserId: string,
    data: ProfileInfo,
    syncedAt: Date,
  ): Promise<void> {
    try {
      await this.runUpsert(clerkUserId, data, syncedAt);
    } catch (error) {
      if (!isUniqueViolation(error) || data.email === null) {
        throw error;
      }

      // El correo ya pertenece a otro usuario local: se guarda sin correo.
      console.warn(
        'El correo del perfil ya pertenece a otro usuario; se guarda sin correo.',
      );
      await this.runUpsert(clerkUserId, { ...data, email: null }, syncedAt);
    }
  }

  private async runUpsert(
    clerkUserId: string,
    data: ProfileInfo,
    syncedAt: Date,
  ): Promise<void> {
    await this.users.query(
      `INSERT INTO "users" ("id", "name", "email", "image_url", "profile_synced_at")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("id") DO UPDATE SET
         "name" = EXCLUDED."name",
         "email" = EXCLUDED."email",
         "image_url" = EXCLUDED."image_url",
         "profile_synced_at" = EXCLUDED."profile_synced_at"`,
      [clerkUserId, data.name, data.email, data.imageUrl, syncedAt],
    );
  }
}
