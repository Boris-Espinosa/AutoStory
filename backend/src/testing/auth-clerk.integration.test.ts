import { clerkMiddleware, getAuth } from '@clerk/express';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DataSource } from 'typeorm';
import { createApp } from '../app';
import { Clock } from '../common/clock';
import { env } from '../config/env';
import { User } from '../entities/User';
import {
  ProfileInfo,
  ProfileProvider,
  UserSyncService,
} from '../users/user-sync.service';
import { createTestDataSource } from './test-data-source';

jest.mock('@clerk/express', () => ({
  clerkMiddleware: jest.fn(
    () =>
      (
        _req: unknown,
        _res: unknown,
        next: () => void,
      ): void => next(),
  ),
  getAuth: jest.fn(),
}));

const mockedGetAuth = getAuth as unknown as jest.Mock;
const mockedClerkMiddleware = clerkMiddleware as unknown as jest.Mock;

class FakeProfileProvider implements ProfileProvider {
  profile: ProfileInfo = { name: null, email: null, imageUrl: null };
  readonly calls: string[] = [];

  async getProfile(userId: string): Promise<ProfileInfo> {
    this.calls.push(userId);
    return this.profile;
  }
}

interface RegisteredRoute {
  method: string;
  path: string;
}

function joinPaths(base: string, segment: string): string {
  const joined = `${base}/${segment}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/+$/, '') : joined;
}

function extractMountPath(layer: any): string {
  const source: string = layer.regexp?.source ?? '';
  const match = source.match(/^\^\\\/(.*?)\\\/\?\(\?=\\\/\|\$\)$/);
  return match ? `/${match[1]}` : '';
}

function collectRoutes(app: ReturnType<typeof createApp>): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];

  const visit = (stack: any[], base: string): void => {
    for (const layer of stack) {
      if (layer.route) {
        const path = joinPaths(base, layer.route.path).replace(
          /:[^/]+/g,
          'x',
        );

        for (const method of Object.keys(layer.route.methods)) {
          if (method !== '_all') {
            routes.push({ method: method.toUpperCase(), path });
          }
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        visit(layer.handle.stack, joinPaths(base, extractMountPath(layer)));
      }
    }
  };

  visit((app as any)._router.stack, '');
  return routes;
}

let dataSource: DataSource;
let server: Server;
let baseUrl: string;
let provider: FakeProfileProvider;
let now: Date;
let clerkOptions: Record<string, unknown> | undefined;

const clock: Clock = { now: () => now };

async function api(
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, any>; headers: Headers }> {
  const response = await fetch(`${baseUrl}${path}`, { method, headers });
  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : {},
    headers: response.headers,
  };
}

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();

  now = new Date('2026-11-09T12:00:00.000Z');
  provider = new FakeProfileProvider();
  env.auth.mode = 'clerk';
  env.auth.publishableKey = 'pk_test_ejemplo';
  env.auth.secretKey = 'sk_test_ejemplo';
  env.auth.authorizedParties = ['http://localhost:8081'];

  const app = createApp(dataSource, clock, provider);
  clerkOptions = mockedClerkMiddleware.mock.calls[0]?.[0];

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await dataSource.destroy();
});

beforeEach(async () => {
  now = new Date('2026-11-09T12:00:00.000Z');
  provider.calls.length = 0;
  provider.profile = { name: null, email: null, imageUrl: null };
  mockedGetAuth.mockReturnValue({ userId: null });
  await dataSource.query(
    `TRUNCATE TABLE "notifications", "appointment_reminders", "appointments", "user_vehicles", "sharing_requests", "parts", "maintenances", "workshops", "vehicles", "users" CASCADE`,
  );
});

describe('autenticación con Clerk', () => {
  it('configura clerkMiddleware sin handshake y con las partes autorizadas', () => {
    expect(clerkOptions).toMatchObject({
      publishableKey: 'pk_test_ejemplo',
      secretKey: 'sk_test_ejemplo',
      authorizedParties: ['http://localhost:8081'],
      enableHandshake: false,
    });
  });

  it('responde 401 sin token', async () => {
    const response = await api('GET', '/vehicles');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'No autenticado' });
  });

  it('deja pasar un token válido y crea el usuario local', async () => {
    provider.profile = {
      name: 'Ana Pérez',
      email: 'ana@example.com',
      imageUrl: null,
    };
    mockedGetAuth.mockReturnValue({ userId: 'user_clerk_nuevo' });

    const response = await api('GET', '/me');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 'user_clerk_nuevo',
      name: 'Ana Pérez',
      email: 'ana@example.com',
    });

    const saved = await dataSource
      .getRepository(User)
      .findOneBy({ id: 'user_clerk_nuevo' });
    expect(saved).not.toBeNull();
    expect(provider.calls).toEqual(['user_clerk_nuevo']);
  });

  it('no consulta el perfil de un usuario existente y reciente', async () => {
    await dataSource
      .getRepository(User)
      .save({ id: 'user_reciente', name: 'Reciente', profileSyncedAt: now });
    mockedGetAuth.mockReturnValue({ userId: 'user_reciente' });

    const response = await api('GET', '/vehicles');

    expect(response.status).toBe(200);
    expect(provider.calls).toEqual([]);
  });

  it('ignora la cabecera x-user-id y no concede acceso', async () => {
    await dataSource.getRepository(User).save({ id: 'user-1', name: 'Local' });

    const response = await api('GET', '/vehicles', { 'x-user-id': 'user-1' });

    expect(response.status).toBe(401);
  });

  it('responde el preflight OPTIONS sin autenticar', async () => {
    const response = await api('OPTIONS', '/vehicles', {
      Origin: env.corsOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    });

    expect(response.status).toBe(204);
    expect(
      response.headers.get('access-control-allow-headers')?.toLowerCase(),
    ).toContain('authorization');
    expect(mockedGetAuth).not.toHaveBeenCalled();
  });

  it('responde 503 si ensureLocalUser falla de forma inesperada', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const ensureLocalUser = jest
      .spyOn(UserSyncService.prototype, 'ensureLocalUser')
      .mockRejectedValueOnce(new Error('detalle interno que no debe salir'));
    mockedGetAuth.mockReturnValue({ userId: 'user_falla' });

    try {
      const response = await api('GET', '/vehicles');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ message: 'Servicio no disponible' });
      expect(JSON.stringify(response.body)).not.toContain('detalle interno');
    } finally {
      ensureLocalUser.mockRestore();
      consoleError.mockRestore();
    }
  });

  it('exige autenticación en todas las rutas salvo /health y /uploads', async () => {
    const routes = collectRoutes(createApp(dataSource, clock, provider));

    expect(routes).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/health' },
        { method: 'GET', path: '/me' },
        { method: 'POST', path: '/vehicles' },
      ]),
    );

    for (const route of routes) {
      if (route.method === 'GET' && route.path === '/health') {
        continue;
      }

      const response = await api(route.method, route.path);
      expect({ route, status: response.status }).toEqual({
        route,
        status: 401,
      });
    }

    const health = await api('GET', '/health');
    expect(health.status).toBe(200);

    const uploads = await api('GET', '/uploads/no-existe.png');
    expect(uploads.status).not.toBe(401);
  });
});
